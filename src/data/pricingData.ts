import type { AwsPricesFile, RegionRates } from '../types/architecture';

export const AWS_PRICING_SOURCE = 'AWS Price List Bulk API';

/**
 * Built-in us-east-1 rates used when public/pricing/aws-prices.json cannot be
 * loaded (offline, static host without the file, or a malformed response).
 * They mirror the fallback defaults in scripts/sync-aws-prices.mjs.
 */
export const BUILTIN_REGION_RATES: RegionRates = {
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
  ebs: { gp3Gb: 0.08, gp3Iops: 0.005, gp3ThroughputMbps: 0.04 },
  lambda: { requests: 0.2, gbSeconds: 0.0000166667, ephemeralStorageGbSecond: 0.0000000309 },
  s3: { standard: 0.023, standardIa: 0.0125, putRequests: 0.005, getRequests: 0.0004 },
  vpc: { natGatewayHourly: 0.045, natGatewayDataGb: 0.045 },
  alb: { hourly: 0.0225, lcuHourly: 0.008 },
  vpce: { interfaceHourly: 0.01, interfaceDataGb: 0.01 },
  elasticache: {
    'cache.t4g.micro': 0.016,
    'cache.t4g.medium': 0.068,
    'cache.r6g.large': 0.252,
  },
  dynamodb: { wru: 0.625, rru: 0.125, storageGb: 0.25 },
  cloudfront: { dataTransferOutGb: 0.085, requests: 1 },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function mergeRates<T>(base: T, override: unknown): T {
  if (!isRecord(override)) return base;
  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined || value === null) continue;
    result[key] = isRecord(value) && isRecord(result[key]) ? mergeRates(result[key], value) : value;
  }
  return result as T;
}

/** Returns complete rates for a region, filling any gaps from built-in defaults. */
export function getRegionRates(region: string, prices: AwsPricesFile | null): RegionRates {
  const stored = prices?.regions?.[region];
  return stored ? mergeRates(BUILTIN_REGION_RATES, stored) : BUILTIN_REGION_RATES;
}

const PRICING_URL = `${import.meta.env.BASE_URL}pricing/aws-prices.json`;

/**
 * Loads the weekly synced AWS price file at app startup. Never throws: callers
 * keep using built-in rates if the fetch fails or the payload is unusable.
 */
export async function loadAwsPrices(): Promise<AwsPricesFile | null> {
  try {
    const response = await fetch(PRICING_URL, { cache: 'no-cache' });
    if (!response.ok) return null;

    const payload: unknown = await response.json();
    if (!isRecord(payload) || typeof payload.syncedAt !== 'string' || !isRecord(payload.regions)) return null;

    const regions = Object.fromEntries(
      Object.entries(payload.regions).filter(([, rates]) => isRecord(rates))
    ) as Record<string, RegionRates>;

    return {
      syncedAt: payload.syncedAt,
      source: typeof payload.source === 'string' ? payload.source : AWS_PRICING_SOURCE,
      regions,
    };
  } catch {
    return null;
  }
}

/** Human-readable sync stamp for the toolbar, markdown export and inspector. */
export function formatSyncedAt(syncedAt?: string): string {
  if (!syncedAt) return 'offline defaults';
  const timestamp = Date.parse(syncedAt);
  if (Number.isNaN(timestamp)) return 'offline defaults';
  return `${new Date(timestamp).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}
