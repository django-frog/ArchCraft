#!/usr/bin/env node
/**
 * Zero-backend AWS On-Demand price synchronizer.
 *
 * Streams the public, unauthenticated AWS Bulk Price List offer files and
 * derives the exact USD rates used by ArchCraft. No API keys, no npm deps.
 *
 *   npm run sync-prices
 *
 * Optional environment variables:
 *   AWS_PRICING_TIMEOUT_MS   Override every per-endpoint timeout (useful on slow links).
 *   AWS_PRICING_CONCURRENCY  Parallel fetches (default 6).
 *   AWS_PRICING_OFFER_DIR    Read cached offer files instead of HTTP. Files must be
 *                            named <ServiceCode>-<Region>.json (or -global.json).
 *                            Missing files keep the built-in fallback rates.
 *
 * Any endpoint that fails or times out keeps the safe us-east-1 fallback for
 * that service/region, so a partial network outage never breaks the app.
 */

import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REGIONS = [
  'us-east-1',
  'us-west-2',
  'eu-west-1',
  'eu-central-1',
  'ap-south-1',
  'ap-northeast-1',
];

const OFFER_BASE = 'https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws';
const OUTPUT_FILE = fileURLToPath(new URL('../public/pricing/aws-prices.json', import.meta.url));
const SOURCE = 'AWS Price List Bulk API';
const CONCURRENCY = Number(process.env.AWS_PRICING_CONCURRENCY || 6);
const TIMEOUT_OVERRIDE = Number(process.env.AWS_PRICING_TIMEOUT_MS || 0);
const OFFER_DIR = process.env.AWS_PRICING_OFFER_DIR
  ? path.resolve(process.env.AWS_PRICING_OFFER_DIR)
  : null;

const DEFAULT_TIMEOUTS = {
  AmazonEC2: 300_000,
  AmazonRDS: 180_000,
  AmazonElastiCache: 180_000,
  AmazonS3: 90_000,
  AWSLambda: 90_000,
  AmazonDynamoDB: 60_000,
  AmazonVPC: 60_000,
  AmazonCloudFront: 60_000,
};

const EC2_INSTANCE_TYPES = [
  't3.micro',
  't3.small',
  't3.medium',
  't3.large',
  't4g.medium',
  'm6i.large',
  'm6i.xlarge',
  'c6i.large',
];
const RDS_INSTANCE_CLASSES = ['db.t4g.micro', 'db.t4g.medium', 'db.m6i.large', 'db.r6g.large'];
const CACHE_NODE_TYPES = ['cache.t4g.micro', 'cache.t4g.medium', 'cache.r6g.large'];

/** Safe us-east-1 defaults. Used verbatim for any region/service that cannot be fetched. */
const FALLBACK_REGION = {
  ec2: {
    't3.micro': 0.0104,
    't3.small': 0.0208,
    't3.medium': 0.0416,
    't3.large': 0.0832,
    't4g.medium': 0.00832,
    'm6i.large': 0.096,
    'm6i.xlarge': 0.192,
    'c6i.large': 0.085,
  },
  rds: {
    engines: {
      postgresql: {
        singleAz: {
          'db.t4g.micro': 0.016,
          'db.t4g.medium': 0.065,
          'db.m6i.large': 0.178,
          'db.r6g.large': 0.26,
        },
        multiAz: {
          'db.t4g.micro': 0.032,
          'db.t4g.medium': 0.13,
          'db.m6i.large': 0.356,
          'db.r6g.large': 0.52,
        },
        storage: { singleAz: 0.115, multiAz: 0.23 },
      },
      mysql: {
        singleAz: {
          'db.t4g.micro': 0.016,
          'db.t4g.medium': 0.065,
          'db.m6i.large': 0.178,
          'db.r6g.large': 0.26,
        },
        multiAz: {
          'db.t4g.micro': 0.032,
          'db.t4g.medium': 0.13,
          'db.m6i.large': 0.356,
          'db.r6g.large': 0.52,
        },
        storage: { singleAz: 0.115, multiAz: 0.23 },
      },
    },
  },
  ebs: { gp3Gb: 0.08, gp3Iops: 0.005 },
  lambda: { requests: 0.2, gbSeconds: 0.0000166667 },
  s3: { standard: 0.023, standardIa: 0.0125, putRequests: 0.005 },
  vpc: { natGatewayHourly: 0.045, natGatewayDataGb: 0.045 },
  elasticache: {
    'cache.t4g.micro': 0.016,
    'cache.t4g.medium': 0.068,
    'cache.r6g.large': 0.252,
  },
  dynamodb: { wru: 0.625, rru: 0.125, storageGb: 0.25 },
  cloudfront: { dataTransferOutGb: 0.085, requests: 1.0 },
};

const clone = (value) => JSON.parse(JSON.stringify(value));
const round = (value, digits = 10) => Number(value.toFixed(digits));
const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

function mergeInto(target, source) {
  if (!isPlainObject(source)) return target;
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || value === null) continue;
    if (isPlainObject(value) && isPlainObject(target[key])) mergeInto(target[key], value);
    else target[key] = value;
  }
  return target;
}

/**
 * Streaming scanner for the offer-index JSON shape. AWS EC2 offer files are
 * ~480 MB per region, so we retain only the handful of product/term entries we
 * care about instead of buffering and JSON.parse-ing the whole document.
 */
class OfferScanner {
  constructor(onEntry) {
    this.onEntry = onEntry;
    this.buffer = '';
    this.depth = 0;
    this.inString = false;
    this.escaped = false;
    this.keys = [];
    this.section = null;
    this.entryStart = -1;
    this.entryDepth = -1;
    this.entryKey = null;
  }

  push(text) {
    this.buffer += text;
    let i = 0;

    while (i < this.buffer.length) {
      const char = this.buffer[i];

      if (this.inString) {
        if (this.escaped) this.escaped = false;
        else if (char === '\\') this.escaped = true;
        else if (char === '"') this.inString = false;
        i++;
        continue;
      }

      if (char === '"') {
        let j = i + 1;
        let escaped = false;
        while (j < this.buffer.length) {
          const current = this.buffer[j];
          if (escaped) {
            escaped = false;
          } else if (current === '\\') {
            escaped = true;
          } else if (current === '"') {
            break;
          }
          j++;
        }
        if (j >= this.buffer.length) break; // incomplete string: wait for the next chunk

        const raw = this.buffer.slice(i, j + 1);
        let value;
        try {
          value = JSON.parse(raw);
        } catch {
          value = raw.slice(1, -1);
        }
        let after = j + 1;
        while (after < this.buffer.length && /\s/.test(this.buffer[after])) after++;
        if (this.buffer[after] === ':') this.keys[this.depth - 1] = value;
        i = j + 1;
        continue;
      }

      if (char === '{' || char === '[') {
        const parentKey = this.keys[this.depth - 1];
        if (this.depth === 1 && parentKey === 'products') this.section = 'products';
        else if (this.depth === 1 && parentKey === 'terms') this.section = 'terms';
        else if (this.depth === 2 && this.section === 'terms' && parentKey === 'OnDemand') {
          this.section = 'onDemand';
        }

        if (this.entryStart < 0) {
          if (this.section === 'products' && this.depth === 2) {
            this.entryStart = i;
            this.entryDepth = 3;
            this.entryKey = parentKey;
          } else if (this.section === 'onDemand' && this.depth === 3) {
            this.entryStart = i;
            this.entryDepth = 4;
            this.entryKey = parentKey;
          }
        }
        this.depth++;
        i++;
        continue;
      }

      if (char === '}' || char === ']') {
        if (this.entryStart >= 0 && this.depth === this.entryDepth) {
          const raw = this.buffer.slice(this.entryStart, i + 1);
          let entry;
          try {
            entry = JSON.parse(raw);
          } catch {
            entry = null;
          }
          if (entry) this.onEntry(this.section === 'products' ? 'product' : 'term', this.entryKey, entry);

          this.buffer = this.buffer.slice(i + 1);
          i = 0;
          this.depth--;
          this.keys.length = Math.max(0, this.depth);
          this.entryStart = -1;
          this.entryDepth = -1;
          this.entryKey = null;
          continue;
        }
        this.depth--;
        this.keys.length = Math.max(0, this.depth);
        i++;
        continue;
      }

      i++;
    }

    if (this.entryStart >= 0) {
      // Retain the partial entry from its opening brace. The parent containers
      // before it are dropped, so rewind depth to just before that brace — it
      // will be counted again when the next chunk is scanned.
      this.depth = this.entryDepth - 1;
      this.keys.length = Math.max(0, this.depth);
      this.buffer = this.buffer.slice(this.entryStart);
      this.entryStart = -1;
      this.entryDepth = -1;
      this.entryKey = null;
    } else if (i > 0) {
      this.buffer = this.buffer.slice(i);
    }
  }
}

function dimensionsOf(term) {
  const dimensions = [];
  // Offer file shape: terms.OnDemand[sku][rateCode] -> priceDimensions.
  const offerTerms = term?.OnDemand ? term.OnDemand : term || {};
  for (const offerTerm of Object.values(offerTerms)) {
    for (const dimension of Object.values(offerTerm?.priceDimensions || {})) {
      const price = Number(dimension.pricePerUnit?.USD);
      if (!Number.isFinite(price)) continue;
      dimensions.push({
        unit: dimension.unit || '',
        description: dimension.description || '',
        beginRange: dimension.beginRange || '0',
        price,
      });
    }
  }
  return dimensions;
}

const firstHourly = (dims) =>
  dims.find((d) => /^(Hrs|hr|Hour|Hours)$/i.test(d.unit))?.price ??
  dims.find((d) => /hour/i.test(d.description))?.price;
const positive = (dims, predicate) => dims.find((d) => d.price > 0 && predicate(d))?.price;

function keepFirst(target, key, price) {
  if (target[key] === undefined && Number.isFinite(price)) target[key] = price;
}

// ---- Per-service product filters / rate extractors ---------------------------------

const services = {
  AmazonEC2: {
    timeout: 300_000,
    filter: (product) => {
      const attrs = product.attributes || {};
      const usage = attrs.usagetype || '';
      return (
        (product.productFamily === 'Compute Instance' && EC2_INSTANCE_TYPES.includes(attrs.instanceType)) ||
        (product.productFamily === 'Storage' && /gp3/i.test(`${attrs.volumeApiName || ''} ${attrs.volumeType || ''}`)) ||
        /NatGateway/i.test(usage)
      );
    },
    extract: (product, dims, out) => {
      const attrs = product.attributes || {};
      const usage = attrs.usagetype || '';

      if (
        product.productFamily === 'Compute Instance' &&
        EC2_INSTANCE_TYPES.includes(attrs.instanceType) &&
        attrs.operatingSystem === 'Linux' &&
        attrs.tenancy === 'Shared' &&
        attrs.preInstalledSw === 'NA' &&
        attrs.capacitystatus === 'Used'
      ) {
        keepFirst(out.ec2, attrs.instanceType, firstHourly(dims));
      }
      if (/gp3/i.test(`${attrs.volumeApiName || ''} ${attrs.volumeType || ''}`)) {
        keepFirst(out.ebs, 'gp3Gb', positive(dims, (d) => /^GB-Mo$/i.test(d.unit)));
        keepFirst(out.ebs, 'gp3Iops', positive(dims, (d) => /IOPS/i.test(d.unit) || /IOPS/i.test(d.description)));
      }
      if (/NatGateway-Hours/i.test(usage)) keepFirst(out.vpc, 'natGatewayHourly', firstHourly(dims));
      if (/NatGateway-Bytes/i.test(usage)) {
        keepFirst(out.vpc, 'natGatewayDataGb', positive(dims, (d) => /^GB$/i.test(d.unit) || /per GB/i.test(d.description)));
      }
    },
    isComplete: (out) =>
      EC2_INSTANCE_TYPES.every((type) => out.ec2[type] !== undefined) &&
      out.ebs.gp3Gb !== undefined &&
      out.ebs.gp3Iops !== undefined &&
      out.vpc.natGatewayHourly !== undefined &&
      out.vpc.natGatewayDataGb !== undefined,
  },

  AmazonRDS: {
    timeout: 180_000,
    filter: (product) => {
      const attrs = product.attributes || {};
      return (
        (product.productFamily === 'Database Instance' && RDS_INSTANCE_CLASSES.includes(attrs.instanceType)) ||
        (product.productFamily === 'Database Storage' &&
          /gp3|general purpose/i.test(`${attrs.volumeApiName || ''} ${attrs.volumeType || ''}`))
      );
    },
    extract: (product, dims, out) => {
      const attrs = product.attributes || {};
      const engine = (attrs.databaseEngine || '').toLowerCase();
      const engineKey = engine === 'mysql' || engine === 'mariadb' ? 'mysql' : engine === 'postgresql' ? 'postgresql' : null;
      if (!engineKey) return;
      const deployment = /multi/i.test(attrs.deploymentOption || '') ? 'multiAz' : 'singleAz';
      if (product.productFamily === 'Database Instance' && RDS_INSTANCE_CLASSES.includes(attrs.instanceType)) {
        keepFirst(out.rds.engines[engineKey][deployment], attrs.instanceType, firstHourly(dims));
      }
      if (product.productFamily === 'Database Storage') {
        keepFirst(out.rds.engines[engineKey].storage, deployment, positive(dims, (d) => /^GB-Mo$/i.test(d.unit)));
      }
    },
    isComplete: (out) =>
      ['postgresql', 'mysql'].every((engine) => {
        const rates = out.rds.engines[engine];
        return (
          RDS_INSTANCE_CLASSES.every((type) => rates.singleAz[type] !== undefined) &&
          RDS_INSTANCE_CLASSES.every((type) => rates.multiAz[type] !== undefined) &&
          rates.storage.singleAz !== undefined &&
          rates.storage.multiAz !== undefined
        );
      }),
  },

  AWSLambda: {
    timeout: 90_000,
    filter: (product) => {
      const attrs = product.attributes || {};
      return (
        product.productFamily === 'Serverless' &&
        ['AWS-Lambda-Requests', 'AWS-Lambda-Duration'].includes(attrs.group || '')
      );
    },
    extract: (product, dims, out) => {
      const attrs = product.attributes || {};
      if (attrs.group === 'AWS-Lambda-Requests' && attrs.usagetype === 'Request') {
        const price = dims.find((d) => /^Requests?$/i.test(d.unit))?.price;
        keepFirst(out.lambda, 'requests', price === undefined ? undefined : round(price * 1_000_000));
      }
      if (attrs.group === 'AWS-Lambda-Duration' && attrs.usagetype === 'Lambda-GB-Second') {
        keepFirst(
          out.lambda,
          'gbSeconds',
          positive(dims, (d) => /lambda-gb-second/i.test(d.unit)) ??
            positive(dims, (d) => /tier-1/i.test(d.description))
        );
      }
    },
    isComplete: (out) => out.lambda.requests !== undefined && out.lambda.gbSeconds !== undefined,
  },

  AmazonS3: {
    timeout: 90_000,
    filter: (product) =>
      ['TimedStorage-ByteHrs', 'TimedStorage-SIA-ByteHrs', 'Requests-Tier1'].includes(
        product.attributes?.usagetype || ''
      ),
    extract: (product, dims, out) => {
      const usage = product.attributes?.usagetype || '';
      if (usage === 'TimedStorage-ByteHrs') keepFirst(out.s3, 'standard', positive(dims, (d) => /^GB-Mo$/i.test(d.unit)));
      if (usage === 'TimedStorage-SIA-ByteHrs') {
        keepFirst(out.s3, 'standardIa', positive(dims, (d) => /^GB-Mo$/i.test(d.unit)));
      }
      if (usage === 'Requests-Tier1') {
        const price = dims.find((d) => /^Requests?$/i.test(d.unit))?.price;
        keepFirst(out.s3, 'putRequests', price === undefined ? undefined : round(price * 1_000));
      }
    },
    isComplete: (out) =>
      out.s3.standard !== undefined && out.s3.standardIa !== undefined && out.s3.putRequests !== undefined,
  },

  AmazonVPC: {
    timeout: 60_000,
    filter: (product) => /NatGateway/i.test(product.attributes?.usagetype || ''),
    extract: (product, dims, out) => {
      const usage = product.attributes?.usagetype || '';
      if (/NatGateway-Hours/i.test(usage)) keepFirst(out.vpc, 'natGatewayHourly', firstHourly(dims));
      if (/NatGateway-Bytes/i.test(usage)) {
        keepFirst(out.vpc, 'natGatewayDataGb', positive(dims, (d) => /^GB$|GigaBytes/i.test(d.unit)));
      }
    },
  },

  AmazonElastiCache: {
    timeout: 180_000,
    filter: (product) =>
      product.productFamily === 'Cache Instance' && CACHE_NODE_TYPES.includes(product.attributes?.instanceType),
    extract: (product, dims, out) => {
      const nodeType = product.attributes?.instanceType;
      if (!CACHE_NODE_TYPES.includes(nodeType)) return;
      const price = positive(dims, (d) => /^(Hrs|hr|Hour|Hours)$/i.test(d.unit));
      if (!Number.isFinite(price)) return;
      if (out.elasticache[nodeType] === undefined || price < out.elasticache[nodeType]) {
        out.elasticache[nodeType] = price;
      }
    },
    isComplete: (out) => CACHE_NODE_TYPES.every((type) => out.elasticache[type] !== undefined),
  },

  AmazonDynamoDB: {
    timeout: 60_000,
    filter: (product) =>
      ['WriteRequestUnits', 'ReadRequestUnits', 'TimedStorage-ByteHrs'].includes(
        product.attributes?.usagetype || ''
      ) && !/IA-|Repl/.test(product.attributes?.usagetype || ''),
    extract: (product, dims, out) => {
      const usage = product.attributes?.usagetype || '';
      if (usage === 'WriteRequestUnits') {
        const price = dims.find((d) => /WriteRequestUnits/i.test(d.unit))?.price;
        keepFirst(out.dynamodb, 'wru', price === undefined ? undefined : round(price * 1_000_000));
      }
      if (usage === 'ReadRequestUnits') {
        const price = dims.find((d) => /ReadRequestUnits/i.test(d.unit))?.price;
        keepFirst(out.dynamodb, 'rru', price === undefined ? undefined : round(price * 1_000_000));
      }
      if (usage === 'TimedStorage-ByteHrs') {
        keepFirst(out.dynamodb, 'storageGb', positive(dims, (d) => /^GB-Mo$/i.test(d.unit)));
      }
    },
    isComplete: (out) =>
      out.dynamodb.wru !== undefined && out.dynamodb.rru !== undefined && out.dynamodb.storageGb !== undefined,
  },

  // CloudFront is a global edge service: the regional offer files only carry
  // Origin Shield/Lambda@Edge SKUs, so its real rates live in the global offer.
  AmazonCloudFront: {
    timeout: 60_000,
    global: true,
    filter: (product) =>
      ['US-DataTransfer-Out-Bytes', 'US-Requests-Tier2-HTTPS'].includes(product.attributes?.usagetype || ''),
    extract: (product, dims, out) => {
      const usage = product.attributes?.usagetype || '';
      if (usage === 'US-DataTransfer-Out-Bytes') {
        keepFirst(
          out.cloudfront,
          'dataTransferOutGb',
          positive(dims, (d) => /^GB$/i.test(d.unit) && d.beginRange === '0')
        );
      }
      if (usage === 'US-Requests-Tier2-HTTPS') {
        const price = dims.find((d) => /^Requests?$/i.test(d.unit))?.price;
        keepFirst(out.cloudfront, 'requests', price === undefined ? undefined : round(price * 1_000_000));
      }
    },
    isComplete: (out) =>
      out.cloudfront.dataTransferOutGb !== undefined && out.cloudfront.requests !== undefined,
  },
};

/** Empty nested shape each extractor writes into. */
const SERVICE_SHAPES = {
  AmazonEC2: { ec2: {}, ebs: {}, vpc: {} },
  AmazonRDS: {
    rds: {
      engines: {
        postgresql: { singleAz: {}, multiAz: {}, storage: {} },
        mysql: { singleAz: {}, multiAz: {}, storage: {} },
      },
    },
  },
  AWSLambda: { lambda: {} },
  AmazonS3: { s3: {} },
  AmazonVPC: { vpc: {} },
  AmazonElastiCache: { elasticache: {} },
  AmazonDynamoDB: { dynamodb: {} },
  AmazonCloudFront: { cloudfront: {} },
};

function offerUrl(serviceCode, region) {
  const pathname = services[serviceCode].global
    ? `${OFFER_BASE}/${serviceCode}/current/index.json`
    : `${OFFER_BASE}/${serviceCode}/current/${region}/index.json`;
  return pathname;
}

function localOfferPath(serviceCode, region) {
  const suffix = services[serviceCode].global ? 'global' : region;
  return path.join(OFFER_DIR, `${serviceCode}-${suffix}.json`);
}

async function fetchServiceRates(serviceCode, region) {
  const service = services[serviceCode];
  const timeout = TIMEOUT_OVERRIDE > 0 ? TIMEOUT_OVERRIDE : service.timeout || DEFAULT_TIMEOUTS[serviceCode] || 60_000;
  const products = new Map();
  const scratch = clone(SERVICE_SHAPES[serviceCode]);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let stoppedEarly = false;

  const onEntry = (kind, key, entry) => {
    if (kind === 'product') {
      if (service.filter(entry)) products.set(key, entry);
      return;
    }
    const product = products.get(key);
    if (!product) return;
    service.extract(product, dimensionsOf(entry), scratch);
  };

  const scanner = new OfferScanner(onEntry);
  const complete = () => service.isComplete?.(scratch) ?? false;

  try {
    if (OFFER_DIR) {
      for await (const chunk of createReadStream(localOfferPath(serviceCode, region), { encoding: 'utf8' })) {
        scanner.push(chunk);
        if (complete()) {
          stoppedEarly = true;
          break;
        }
      }
    } else {
      const response = await fetch(offerUrl(serviceCode, region), { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!response.body) throw new Error('empty response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        scanner.push(decoder.decode(value, { stream: true }));
        if (complete()) {
          stoppedEarly = true;
          break;
        }
      }
    }
  } catch (error) {
    const reason = error?.name === 'AbortError' && !stoppedEarly ? `timeout after ${timeout}ms` : error?.message || 'error';
    console.warn(`  ! ${serviceCode} ${region}: ${reason} — keeping fallback rates`);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }

  return scratch;
}

async function runPool(items, limit, worker) {
  let next = 0;
  const runners = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
}

async function main() {
  const regionRates = Object.fromEntries(REGIONS.map((region) => [region, clone(FALLBACK_REGION)]));
  const jobs = [];
  for (const region of REGIONS) {
    for (const serviceCode of Object.keys(services)) {
      if (!services[serviceCode].global) jobs.push({ region, serviceCode });
    }
  }
  // Small offer files first so a slow link still captures as many real rates as
  // possible before the large EC2/RDS files consume the timeout window.
  jobs.sort((a, b) => services[a.serviceCode].timeout - services[b.serviceCode].timeout);

  console.log(`Syncing AWS On-Demand prices for ${REGIONS.length} regions (${jobs.length} regional offer files)...`);
  await runPool(jobs, CONCURRENCY, async ({ region, serviceCode }) => {
    const extracted = await fetchServiceRates(serviceCode, region);
    mergeInto(regionRates[region], extracted);
  });

  // CloudFront is global; one fetch supplies all regions.
  const cloudfront = await fetchServiceRates('AmazonCloudFront', REGIONS[0]);
  for (const region of REGIONS) mergeInto(regionRates[region], cloudfront);

  const payload = {
    syncedAt: new Date().toISOString(),
    source: SOURCE,
    regions: regionRates,
  };

  await mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await writeFile(OUTPUT_FILE, `${JSON.stringify(payload)}\n`, 'utf8');
  console.log(`Wrote ${path.relative(process.cwd(), OUTPUT_FILE)} at ${payload.syncedAt}`);
}

await main();
