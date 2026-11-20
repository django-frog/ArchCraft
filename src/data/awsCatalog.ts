import type {
  AwsServiceType,
  CostEstimate,
  CostLineItem,
  RdsEngineRates,
  ServiceDefinition,
} from '../types/architecture';
import { BUILTIN_REGION_RATES } from './pricingData';

export const AWS_REGIONS: Record<string, { name: string }> = {
  'us-east-1': { name: 'US East (N. Virginia)' },
  'us-west-2': { name: 'US West (Oregon)' },
  'eu-west-1': { name: 'Europe (Ireland)' },
  'eu-central-1': { name: 'Europe (Frankfurt)' },
  'ap-south-1': { name: 'Asia Pacific (Mumbai)' },
  'ap-northeast-1': { name: 'Asia Pacific (Tokyo)' },
};

const HOURS_PER_MONTH = 730;

const estimate = (lineItems: CostLineItem[]): CostEstimate => ({
  lineItems,
  monthly: lineItems.reduce((sum, item) => sum + item.amount, 0),
});

const rateLabel = (rate: number): string => {
  if (rate >= 0.01) return `$${rate.toFixed(4)}`;
  if (rate >= 0.0001) return `$${rate.toFixed(6)}`;
  return `$${rate.toPrecision(3)}`;
};

const fallbackRate = (rate: number | undefined, fallback: number): number =>
  typeof rate === 'number' && Number.isFinite(rate) ? rate : fallback;

export const AWS_CATALOG: Record<AwsServiceType, ServiceDefinition> = {
  vpc: {
    type: 'vpc',
    name: 'Amazon VPC',
    shortName: 'VPC',
    category: 'Networking',
    color: '#8b5cf6',
    isContainer: true,
    defaultConfig: {
      cidr: '10.0.0.0/16',
      natGateways: 1,
      dataProcessedGb: 100,
    },
    calculateMonthlyCost: (cfg, rates) => {
      const gateways = Math.max(0, Number(cfg.natGateways || 0));
      const gb = Math.max(0, Number(cfg.dataProcessedGb || 0));
      const hourly = fallbackRate(rates.vpc?.natGatewayHourly, BUILTIN_REGION_RATES.vpc.natGatewayHourly);
      const perGb = fallbackRate(rates.vpc?.natGatewayDataGb, BUILTIN_REGION_RATES.vpc.natGatewayDataGb);
      return estimate([
        {
          label: `${gateways} NAT Gateway${gateways === 1 ? '' : 's'} × ${HOURS_PER_MONTH} hrs × ${rateLabel(hourly)}/hr`,
          amount: gateways * HOURS_PER_MONTH * hourly,
        },
        {
          label: `NAT data processed (${gateways} × ${gb} GB × ${rateLabel(perGb)}/GB)`,
          amount: gateways * gb * perGb,
        },
      ]);
    },
    getSpecSummary: (cfg) => `${cfg.cidr} • ${cfg.natGateways || 0} NAT GW`,
  },

  subnet: {
    type: 'subnet',
    name: 'VPC Subnet',
    shortName: 'Subnet',
    category: 'Networking',
    color: '#06b6d4',
    isContainer: true,
    defaultConfig: {
      tier: 'Public',
      cidr: '10.0.1.0/24',
      az: 'us-east-1a',
    },
    calculateMonthlyCost: () => estimate([{ label: 'Subnet (no AWS charge)', amount: 0 }]),
    getSpecSummary: (cfg) => `${cfg.tier} • ${cfg.cidr} (${cfg.az})`,
  },

  cloudfront: {
    type: 'cloudfront',
    name: 'Amazon CloudFront',
    shortName: 'CloudFront',
    category: 'Integration & Edge',
    color: '#a855f7',
    defaultConfig: {
      dataTransferOutGb: 500,
      requestsMillions: 10,
      wafEnabled: false,
    },
    calculateMonthlyCost: (cfg, rates) => {
      const gb = Math.max(0, Number(cfg.dataTransferOutGb || 0) - 1000); // 1 TB free tier
      const requests = Math.max(0, Number(cfg.requestsMillions || 0) - 10);
      const transferRate = fallbackRate(rates.cloudfront?.dataTransferOutGb, BUILTIN_REGION_RATES.cloudfront.dataTransferOutGb);
      const requestRate = fallbackRate(rates.cloudfront?.requests, BUILTIN_REGION_RATES.cloudfront.requests);
      return estimate([
        {
          label: `Data transfer out (${gb} GB after 1 TB free tier × ${rateLabel(transferRate)}/GB)`,
          amount: gb * transferRate,
        },
        {
          label: `HTTPS requests (${requests.toFixed(2)}M after 10M free tier × ${rateLabel(requestRate)}/1M)`,
          amount: requests * requestRate,
        },
        { label: 'AWS WAF (fixed estimate)', amount: cfg.wafEnabled ? 6 : 0 },
      ]);
    },
    getSpecSummary: (cfg) => `${cfg.dataTransferOutGb} GB out • ${cfg.requestsMillions}M req`,
  },

  ec2: {
    type: 'ec2',
    name: 'Amazon EC2',
    shortName: 'EC2',
    category: 'Compute',
    color: '#f97316',
    supportsSecurityGroups: true,
    defaultConfig: {
      instanceType: 't3.medium',
      count: 2,
      os: 'Linux',
    },
    calculateMonthlyCost: (cfg, rates) => {
      const instanceType = String(cfg.instanceType || 't3.medium');
      const count = Math.max(0, Number(cfg.count || 1));
      const rate = fallbackRate(
        rates.ec2?.[instanceType],
        BUILTIN_REGION_RATES.ec2[instanceType] ?? BUILTIN_REGION_RATES.ec2['t3.medium']
      );
      return estimate([
        {
          label: `${count}× ${instanceType} (Linux Shared) × ${HOURS_PER_MONTH} hrs × ${rateLabel(rate)}/hr`,
          amount: count * HOURS_PER_MONTH * rate,
        },
      ]);
    },
    getSpecSummary: (cfg) => `${cfg.count}x ${cfg.instanceType} (${cfg.os})`,
  },

  lambda: {
    type: 'lambda',
    name: 'AWS Lambda',
    shortName: 'Lambda',
    category: 'Compute',
    color: '#fb923c',
    supportsSecurityGroups: true,
    defaultConfig: {
      memoryMb: 512,
      requestsMillions: 5,
      avgDurationMs: 120,
    },
    calculateMonthlyCost: (cfg, rates) => {
      const requests = Math.max(0, Number(cfg.requestsMillions || 0)) * 1_000_000;
      const billableRequests = Math.max(0, requests - 1_000_000);
      const memoryGb = Math.max(0.128, Number(cfg.memoryMb || 128) / 1024);
      const gbSeconds = requests * (Number(cfg.avgDurationMs || 0) / 1000) * memoryGb;
      const billableGbSeconds = Math.max(0, gbSeconds - 400_000);
      const requestRate = fallbackRate(rates.lambda?.requests, BUILTIN_REGION_RATES.lambda.requests);
      const durationRate = fallbackRate(rates.lambda?.gbSeconds, BUILTIN_REGION_RATES.lambda.gbSeconds);
      return estimate([
        {
          label: `Requests (${(billableRequests / 1_000_000).toFixed(2)}M after 1M free tier × ${rateLabel(requestRate)}/1M)`,
          amount: (billableRequests / 1_000_000) * requestRate,
        },
        {
          label: `Compute (${Math.round(billableGbSeconds).toLocaleString('en-US')} GB-s after 400K free GB-s × ${rateLabel(durationRate)}/GB-s)`,
          amount: billableGbSeconds * durationRate,
        },
      ]);
    },
    getSpecSummary: (cfg) => `${cfg.memoryMb}MB • ${cfg.requestsMillions}M req/mo`,
  },

  rds: {
    type: 'rds',
    name: 'Amazon RDS',
    shortName: 'RDS',
    category: 'Database',
    color: '#3b82f6',
    supportsSecurityGroups: true,
    defaultConfig: {
      engine: 'PostgreSQL',
      instanceClass: 'db.t4g.medium',
      multiAz: true,
      storageGb: 100,
    },
    calculateMonthlyCost: (cfg, rates) => {
      const engine = String(cfg.engine || 'PostgreSQL').toLowerCase();
      const engineKey: 'postgresql' | 'mysql' =
        engine === 'mysql' || engine === 'mariadb' ? 'mysql' : 'postgresql';
      const deployment = cfg.multiAz ? 'multiAz' : 'singleAz';
      const instanceClass = String(cfg.instanceClass || 'db.t4g.medium');
      const defaults = BUILTIN_REGION_RATES.rds.engines[engineKey];
      const engineRates: RdsEngineRates = rates.rds?.engines?.[engineKey] ?? defaults;
      const instanceRate = fallbackRate(
        engineRates[deployment]?.[instanceClass],
        defaults[deployment][instanceClass] ?? defaults.singleAz['db.t4g.medium']
      );
      const storageRate = fallbackRate(engineRates.storage?.[deployment], defaults.storage[deployment]);
      const storageGb = Math.max(0, Number(cfg.storageGb || 20));

      return estimate([
        {
          label: `${instanceClass} ${deployment} (${engineKey}) × ${HOURS_PER_MONTH} hrs × ${rateLabel(instanceRate)}/hr`,
          amount: instanceRate * HOURS_PER_MONTH,
        },
        {
          label: `${storageGb} GB gp3 storage (${deployment}) × ${rateLabel(storageRate)}/GB-mo`,
          amount: storageGb * storageRate,
        },
      ]);
    },
    getSpecSummary: (cfg) =>
      `${cfg.engine} • ${cfg.instanceClass}${cfg.multiAz ? ' (Multi-AZ)' : ''} • ${cfg.storageGb}GB`,
  },

  dynamodb: {
    type: 'dynamodb',
    name: 'Amazon DynamoDB',
    shortName: 'DynamoDB',
    category: 'Database',
    color: '#2563eb',
    defaultConfig: {
      capacityMode: 'On-Demand',
      writeRequestsMillions: 5,
      readRequestsMillions: 25,
      storageGb: 25,
    },
    calculateMonthlyCost: (cfg, rates) => {
      const writes = Math.max(0, Number(cfg.writeRequestsMillions || 0));
      const reads = Math.max(0, Number(cfg.readRequestsMillions || 0));
      const storage = Math.max(0, Number(cfg.storageGb || 0) - 25); // first 25 GB free
      const wruRate = fallbackRate(rates.dynamodb?.wru, BUILTIN_REGION_RATES.dynamodb.wru);
      const rruRate = fallbackRate(rates.dynamodb?.rru, BUILTIN_REGION_RATES.dynamodb.rru);
      const storageRate = fallbackRate(rates.dynamodb?.storageGb, BUILTIN_REGION_RATES.dynamodb.storageGb);
      return estimate([
        {
          label: `Write request units (${writes.toFixed(2)}M × ${rateLabel(wruRate)}/1M)`,
          amount: writes * wruRate,
        },
        {
          label: `Read request units (${reads.toFixed(2)}M × ${rateLabel(rruRate)}/1M)`,
          amount: reads * rruRate,
        },
        {
          label: `Storage (${storage} GB after 25 GB free tier × ${rateLabel(storageRate)}/GB-mo)`,
          amount: storage * storageRate,
        },
      ]);
    },
    getSpecSummary: (cfg) => `${cfg.capacityMode} • ${cfg.readRequestsMillions}M RRU / ${cfg.writeRequestsMillions}M WRU`,
  },

  elasticache: {
    type: 'elasticache',
    name: 'Amazon ElastiCache',
    shortName: 'ElastiCache',
    category: 'Database',
    color: '#6366f1',
    supportsSecurityGroups: true,
    defaultConfig: {
      engine: 'Valkey / Redis',
      nodeType: 'cache.t4g.micro',
      numNodes: 2,
    },
    calculateMonthlyCost: (cfg, rates) => {
      const nodeType = String(cfg.nodeType || 'cache.t4g.micro');
      const nodes = Math.max(0, Number(cfg.numNodes || 1));
      const rate = fallbackRate(
        rates.elasticache?.[nodeType],
        BUILTIN_REGION_RATES.elasticache[nodeType] ?? BUILTIN_REGION_RATES.elasticache['cache.t4g.micro']
      );
      return estimate([
        {
          label: `${nodes}× ${nodeType} × ${HOURS_PER_MONTH} hrs × ${rateLabel(rate)}/hr`,
          amount: nodes * HOURS_PER_MONTH * rate,
        },
      ]);
    },
    getSpecSummary: (cfg) => `${cfg.engine} • ${cfg.numNodes}x ${cfg.nodeType}`,
  },

  ebs: {
    type: 'ebs',
    name: 'Amazon EBS',
    shortName: 'EBS',
    category: 'Storage',
    color: '#10b981',
    defaultConfig: {
      volumeType: 'gp3',
      sizeGb: 100,
      iops: 3000,
    },
    calculateMonthlyCost: (cfg, rates) => {
      const sizeGb = Math.max(0, Number(cfg.sizeGb || 0));
      const extraIops = Math.max(0, Number(cfg.iops || 3000) - 3000);
      const gbRate = fallbackRate(rates.ebs?.gp3Gb, BUILTIN_REGION_RATES.ebs.gp3Gb);
      const iopsRate = fallbackRate(rates.ebs?.gp3Iops, BUILTIN_REGION_RATES.ebs.gp3Iops);
      return estimate([
        {
          label: `gp3 storage (${sizeGb} GB × ${rateLabel(gbRate)}/GB-mo)`,
          amount: sizeGb * gbRate,
        },
        {
          label: `Provisioned IOPS (${extraIops} above 3,000 free × ${rateLabel(iopsRate)}/IOPS-mo)`,
          amount: extraIops * iopsRate,
        },
      ]);
    },
    getSpecSummary: (cfg) => `${cfg.volumeType.toUpperCase()} • ${cfg.sizeGb} GB (${cfg.iops} IOPS)`,
  },

  s3: {
    type: 's3',
    name: 'Amazon S3',
    shortName: 'S3',
    category: 'Storage',
    color: '#22c55e',
    defaultConfig: {
      storageClass: 'Standard',
      storageGb: 500,
      putRequestsThousands: 100,
    },
    calculateMonthlyCost: (cfg, rates) => {
      const storageClass = String(cfg.storageClass || 'Standard');
      const isIa = storageClass === 'Standard-IA';
      const storageRate = fallbackRate(
        isIa ? rates.s3?.standardIa : rates.s3?.standard,
        isIa ? BUILTIN_REGION_RATES.s3.standardIa : BUILTIN_REGION_RATES.s3.standard
      );
      const requestRate = fallbackRate(rates.s3?.putRequests, BUILTIN_REGION_RATES.s3.putRequests);
      const storageGb = Math.max(0, Number(cfg.storageGb || 0));
      const putThousands = Math.max(0, Number(cfg.putRequestsThousands || 0));
      return estimate([
        {
          label: `${storageClass} storage (${storageGb} GB × ${rateLabel(storageRate)}/GB-mo)`,
          amount: storageGb * storageRate,
        },
        {
          label: `PUT/COPY/POST requests (${putThousands}K × ${rateLabel(requestRate)}/1K)`,
          amount: putThousands * requestRate,
        },
      ]);
    },
    getSpecSummary: (cfg) => `${cfg.storageClass} • ${cfg.storageGb} GB`,
  },

  sqs: {
    type: 'sqs',
    name: 'Amazon SQS',
    shortName: 'SQS',
    category: 'Integration & Edge',
    color: '#ec4899',
    defaultConfig: {
      queueType: 'Standard',
      requestsMillions: 10,
    },
    calculateMonthlyCost: (cfg) => {
      const billable = Math.max(0, Number(cfg.requestsMillions || 0) - 1);
      const isFifo = cfg.queueType === 'FIFO';
      return estimate([
        {
          label: `${cfg.queueType} queue requests (${billable.toFixed(2)}M after 1M free tier × $${(isFifo ? 0.5 : 0.4).toFixed(2)}/1M)`,
          amount: billable * (isFifo ? 0.5 : 0.4),
        },
      ]);
    },
    getSpecSummary: (cfg) => `${cfg.queueType} Queue • ${cfg.requestsMillions}M req/mo`,
  },
};
