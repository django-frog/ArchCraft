import type { AwsServiceType, ServiceDefinition } from '../types/architecture';

export const AWS_REGIONS: Record<string, { name: string; multiplier: number }> = {
  'us-east-1': { name: 'US East (N. Virginia)', multiplier: 1.0 },
  'us-west-2': { name: 'US West (Oregon)', multiplier: 1.0 },
  'eu-west-1': { name: 'Europe (Ireland)', multiplier: 1.08 },
  'eu-central-1': { name: 'Europe (Frankfurt)', multiplier: 1.14 },
  'ap-south-1': { name: 'Asia Pacific (Mumbai)', multiplier: 1.06 },
  'ap-northeast-1': { name: 'Asia Pacific (Tokyo)', multiplier: 1.18 },
};

const EC2_RATES: Record<string, number> = {
  't3.micro': 0.0104,
  't3.small': 0.0208,
  't3.medium': 0.0416,
  't3.large': 0.0832,
  'm6i.large': 0.096,
  'm6i.xlarge': 0.192,
  'c6i.large': 0.085,
};

const RDS_RATES: Record<string, number> = {
  'db.t4g.micro': 0.016,
  'db.t4g.medium': 0.065,
  'db.m6i.large': 0.178,
  'db.r6g.large': 0.26,
};

const CACHE_RATES: Record<string, number> = {
  'cache.t4g.micro': 0.016,
  'cache.t4g.medium': 0.068,
  'cache.r6g.large': 0.252,
};

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
    calculateMonthlyCost: (cfg) => {
      const natCount = Number(cfg.natGateways || 0);
      const gb = Number(cfg.dataProcessedGb || 0);
      return natCount * (0.045 * 730) + natCount * gb * 0.045;
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
    calculateMonthlyCost: () => 0,
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
    calculateMonthlyCost: (cfg) => {
      const gb = Math.max(0, Number(cfg.dataTransferOutGb || 0) - 1000); // 1TB free tier
      const req = Math.max(0, Number(cfg.requestsMillions || 0) - 10);
      const waf = cfg.wafEnabled ? 5 + 1 : 0;
      return gb * 0.085 + req * 0.01 + waf;
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
    calculateMonthlyCost: (cfg) => {
      const rate = EC2_RATES[cfg.instanceType] ?? 0.0416;
      return rate * 730 * Number(cfg.count || 1);
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
    calculateMonthlyCost: (cfg) => {
      const reqs = Number(cfg.requestsMillions || 0) * 1_000_000;
      const billableReqs = Math.max(0, reqs - 1_000_000);
      const gbSeconds = reqs * (Number(cfg.avgDurationMs || 0) / 1000) * (Number(cfg.memoryMb || 128) / 1024);
      const billableGbSec = Math.max(0, gbSeconds - 400_000);
      return (billableReqs / 1_000_000) * 0.2 + billableGbSec * 0.0000166667;
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
    calculateMonthlyCost: (cfg) => {
      const rate = RDS_RATES[cfg.instanceClass] ?? 0.065;
      const mult = cfg.multiAz ? 2 : 1;
      const storageRate = cfg.multiAz ? 0.23 : 0.115;
      return rate * 730 * mult + Number(cfg.storageGb || 20) * storageRate;
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
    calculateMonthlyCost: (cfg) => {
      const billableStorage = Math.max(0, Number(cfg.storageGb || 0) - 25);
      const wruCost = Number(cfg.writeRequestsMillions || 0) * 0.625;
      const rruCost = Number(cfg.readRequestsMillions || 0) * 0.125;
      return billableStorage * 0.25 + wruCost + rruCost;
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
    calculateMonthlyCost: (cfg) => {
      const rate = CACHE_RATES[cfg.nodeType] ?? 0.016;
      return rate * 730 * Number(cfg.numNodes || 1);
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
    calculateMonthlyCost: (cfg) => {
      const base = Number(cfg.sizeGb || 0) * 0.08;
      const extraIops = Math.max(0, Number(cfg.iops || 3000) - 3000) * 0.005;
      return base + extraIops;
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
    calculateMonthlyCost: (cfg) => {
      const rate = cfg.storageClass === 'Standard-IA' ? 0.0125 : 0.023;
      return Number(cfg.storageGb || 0) * rate + (Number(cfg.putRequestsThousands || 0) / 1000) * 0.005;
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
      const rate = cfg.queueType === 'FIFO' ? 0.5 : 0.4;
      return billable * rate;
    },
    getSpecSummary: (cfg) => `${cfg.queueType} Queue • ${cfg.requestsMillions}M req/mo`,
  },
};
