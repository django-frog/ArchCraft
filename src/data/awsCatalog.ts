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

/** Availability zones available to subnets in each supported region. */
export const AWS_AVAILABILITY_ZONES: Record<string, string[]> = {
  'us-east-1': ['us-east-1a', 'us-east-1b', 'us-east-1c'],
  'us-west-2': ['us-west-2a', 'us-west-2b', 'us-west-2c'],
  'eu-west-1': ['eu-west-1a', 'eu-west-1b', 'eu-west-1c'],
  'eu-central-1': ['eu-central-1a', 'eu-central-1b', 'eu-central-1c'],
  'ap-south-1': ['ap-south-1a', 'ap-south-1b', 'ap-south-1c'],
  'ap-northeast-1': ['ap-northeast-1a', 'ap-northeast-1b', 'ap-northeast-1c'],
};

export function getAvailabilityZones(region: string): string[] {
  return AWS_AVAILABILITY_ZONES[region] ?? ['a', 'b', 'c'].map((suffix) => `${region}${suffix}`);
}

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
      mapPublicIpOnLaunch: true,
      routeTable: [
        { destination: '10.0.0.0/16', target: 'local' },
        { destination: '0.0.0.0/0', target: 'igw' },
      ],
    },
    calculateMonthlyCost: () => estimate([{ label: 'Subnet (no AWS charge)', amount: 0 }]),
    getSpecSummary: (cfg) =>
      `${cfg.tier} • ${cfg.cidr} (${cfg.az})${cfg.mapPublicIpOnLaunch ? ' • auto public IP' : ''}`,
  },

  igw: {
    type: 'igw',
    name: 'Internet Gateway',
    shortName: 'IGW',
    category: 'Networking',
    color: '#f472b6',
    defaultConfig: {},
    calculateMonthlyCost: () => estimate([{ label: 'Internet Gateway (no AWS charge)', amount: 0 }]),
    getSpecSummary: () => 'VPC attach point • no hourly charge',
  },

  alb: {
    type: 'alb',
    name: 'Application Load Balancer',
    shortName: 'ALB',
    category: 'Networking',
    color: '#fb7185',
    defaultConfig: {
      scheme: 'internet-facing',
      lcuEstimate: 2,
      dataProcessedGb: 100,
    },
    calculateMonthlyCost: (cfg, rates) => {
      const scheme = String(cfg.scheme || 'internet-facing');
      const lcuEstimate = Math.max(0, Number(cfg.lcuEstimate ?? 2));
      const dataProcessedGb = Math.max(0, Number(cfg.dataProcessedGb || 0));
      // AWS bills one processed-bytes LCU per GB per hour (Layer 7).
      const byteLcus = Math.ceil(dataProcessedGb / HOURS_PER_MONTH);
      const lcus = Math.max(lcuEstimate, byteLcus);
      const hourly = fallbackRate(rates.alb?.hourly, BUILTIN_REGION_RATES.alb.hourly);
      const lcuRate = fallbackRate(rates.alb?.lcuHourly, BUILTIN_REGION_RATES.alb.lcuHourly);
      return estimate([
        {
          label: `${scheme} ALB (${HOURS_PER_MONTH} hrs × ${rateLabel(hourly)}/hr)`,
          amount: HOURS_PER_MONTH * hourly,
        },
        {
          label: `ALB Capacity Units (${lcus} LCU × ${HOURS_PER_MONTH} hrs × ${rateLabel(lcuRate)}/LCU-hr; ${dataProcessedGb} GB/mo)`,
          amount: lcus * HOURS_PER_MONTH * lcuRate,
        },
      ]);
    },
    getSpecSummary: (cfg) =>
      `${cfg.scheme} • ${cfg.lcuEstimate || 0} LCU • ${cfg.dataProcessedGb || 0} GB/mo`,
  },

  vpce: {
    type: 'vpce',
    name: 'VPC Endpoint',
    shortName: 'VPCE',
    category: 'Networking',
    color: '#14b8a6',
    defaultConfig: {
      endpointType: 'Gateway (S3/DynamoDB)',
      targetService: 's3',
      azCount: 2,
      dataProcessedGb: 100,
    },
    calculateMonthlyCost: (cfg, rates) => {
      const endpointType = String(cfg.endpointType || 'Gateway (S3/DynamoDB)');
      if (!endpointType.startsWith('Interface')) {
        return estimate([{ label: `Gateway endpoint for ${cfg.targetService || 's3'} (no AWS charge)`, amount: 0 }]);
      }

      const azCount = Math.max(1, Number(cfg.azCount || 1));
      const gb = Math.max(0, Number(cfg.dataProcessedGb || 0));
      const hourly = fallbackRate(rates.vpce?.interfaceHourly, BUILTIN_REGION_RATES.vpce.interfaceHourly);
      const perGb = fallbackRate(rates.vpce?.interfaceDataGb, BUILTIN_REGION_RATES.vpce.interfaceDataGb);
      return estimate([
        {
          label: `PrivateLink interface (${azCount} AZ × ${HOURS_PER_MONTH} hrs × ${rateLabel(hourly)}/hr)`,
          amount: azCount * HOURS_PER_MONTH * hourly,
        },
        {
          label: `Endpoint data processed (${gb} GB × ${rateLabel(perGb)}/GB)`,
          amount: gb * perGb,
        },
      ]);
    },
    getSpecSummary: (cfg) => `${cfg.endpointType} • ${cfg.targetService}`,
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
      architecture: 'x86_64',
      purchasingOption: 'On-Demand',
      count: 2,
      os: 'Linux',
      rootVolumeGb: 30,
      internetEgressGb: 0,
    },
    calculateMonthlyCost: (cfg, rates) => {
      const instanceType = String(cfg.instanceType || 't3.medium');
      const architecture = String(cfg.architecture || 'x86_64');
      const purchasingOption = String(cfg.purchasingOption || 'On-Demand');
      const count = Math.max(0, Number(cfg.count || 1));
      const rootVolumeGb = Math.max(0, Number(cfg.rootVolumeGb ?? 30));
      const internetEgressGb = Math.max(0, Number(cfg.internetEgressGb || 0));
      const billableEgressGb = Math.max(0, internetEgressGb - 100);

      const baseRate = fallbackRate(
        rates.ec2?.[instanceType],
        BUILTIN_REGION_RATES.ec2[instanceType] ?? BUILTIN_REGION_RATES.ec2['t3.medium']
      );
      const computeRate = purchasingOption === '1-Yr Savings Plan (-28%)' ? baseRate * 0.72 : baseRate;
      const ebsRate = fallbackRate(rates.ebs?.gp3Gb, BUILTIN_REGION_RATES.ebs.gp3Gb);

      return estimate([
        {
          label: `${count}× ${instanceType} (${architecture}, ${cfg.os || 'Linux'}, ${purchasingOption}) × ${HOURS_PER_MONTH} hrs × ${rateLabel(computeRate)}/hr`,
          amount: count * HOURS_PER_MONTH * computeRate,
        },
        {
          label: `Root EBS gp3 (${count} × ${rootVolumeGb} GB × ${rateLabel(ebsRate)}/GB-mo)`,
          amount: count * rootVolumeGb * ebsRate,
        },
        {
          label: `Internet egress (${billableEgressGb} GB after 100 GB free × $0.0900/GB)`,
          amount: billableEgressGb * 0.09,
        },
      ]);
    },
    getSpecSummary: (cfg) => {
      const arch = String(cfg.architecture || 'x86_64') === 'arm64' ? 'arm64' : 'x86_64';
      const purchase = String(cfg.purchasingOption || 'On-Demand').startsWith('1-Yr') ? '1yr SP' : 'On-Demand';
      return `${cfg.count || 1}x ${cfg.instanceType} ${arch} (${purchase}) • ${cfg.rootVolumeGb ?? 30}GB root`;
    },
  },

  lambda: {
    type: 'lambda',
    name: 'AWS Lambda',
    shortName: 'Lambda',
    category: 'Compute',
    color: '#fb923c',
    supportsSecurityGroups: true,
    defaultConfig: {
      architecture: 'x86_64',
      memoryMb: 512,
      ephemeralStorageMb: 512,
      requestsMillions: 5,
      avgDurationMs: 120,
    },
    calculateMonthlyCost: (cfg, rates) => {
      const architecture = String(cfg.architecture || 'x86_64');
      const requests = Math.max(0, Number(cfg.requestsMillions || 0)) * 1_000_000;
      const billableRequests = Math.max(0, requests - 1_000_000);
      const memoryGb = Math.max(0.128, Number(cfg.memoryMb || 128) / 1024);
      const avgDurationSec = Math.max(0, Number(cfg.avgDurationMs || 0)) / 1000;
      const ephemeralStorageMb = Math.min(10240, Math.max(512, Number(cfg.ephemeralStorageMb ?? 512)));
      const extraEphemeralGb = Math.max(0, (ephemeralStorageMb - 512) / 1024);

      const gbSeconds = requests * avgDurationSec * memoryGb;
      const billableGbSeconds = Math.max(0, gbSeconds - 400_000);
      const ephemeralGbSeconds = requests * avgDurationSec * extraEphemeralGb;

      const requestRate = fallbackRate(rates.lambda?.requests, BUILTIN_REGION_RATES.lambda.requests);
      const baseDurationRate = fallbackRate(rates.lambda?.gbSeconds, BUILTIN_REGION_RATES.lambda.gbSeconds);
      const durationRate = architecture === 'arm64' ? baseDurationRate * 0.8 : baseDurationRate;
      const ephemeralRate = fallbackRate(
        rates.lambda?.ephemeralStorageGbSecond,
        BUILTIN_REGION_RATES.lambda.ephemeralStorageGbSecond ?? 0.0000000309
      );

      return estimate([
        {
          label: `Requests (${(billableRequests / 1_000_000).toFixed(2)}M after 1M free tier × ${rateLabel(requestRate)}/1M)`,
          amount: (billableRequests / 1_000_000) * requestRate,
        },
        {
          label: `Compute ${architecture === 'arm64' ? '(arm64, -20%) ' : ''}(${Math.round(billableGbSeconds).toLocaleString('en-US')} GB-s after 400K free GB-s × ${rateLabel(durationRate)}/GB-s)`,
          amount: billableGbSeconds * durationRate,
        },
        {
          label: `Ephemeral storage (${ephemeralStorageMb} MB, ${Math.round(ephemeralGbSeconds).toLocaleString('en-US')} GB-s extra × ${rateLabel(ephemeralRate)}/GB-s)`,
          amount: ephemeralGbSeconds * ephemeralRate,
        },
      ]);
    },
    getSpecSummary: (cfg) => {
      const arch = String(cfg.architecture || 'x86_64') === 'arm64' ? 'arm64' : 'x86_64';
      return `${cfg.memoryMb}MB ${arch} • ${cfg.ephemeralStorageMb ?? 512}MB eph • ${cfg.requestsMillions}M req/mo`;
    },
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
      deploymentOption: 'Single-AZ',
      storageType: 'gp3',
      storageGb: 100,
      backupRetentionGb: 100,
    },
    calculateMonthlyCost: (cfg, rates) => {
      const engine = String(cfg.engine || 'PostgreSQL').toLowerCase();
      const engineKey: 'postgresql' | 'mysql' =
        engine === 'mysql' || engine === 'mariadb' ? 'mysql' : 'postgresql';
      const legacyDeployment =
        cfg.deploymentOption ??
        (cfg.multiAz ? 'Multi-AZ DB Instance (2x)' : 'Single-AZ');
      const deploymentOption = String(legacyDeployment || 'Single-AZ');
      const deploymentMultiplier =
        deploymentOption === 'Multi-AZ DB Cluster (3x)' ? 3 : deploymentOption === 'Multi-AZ DB Instance (2x)' ? 2 : 1;
      const rateDeployment = deploymentMultiplier === 1 ? 'singleAz' : 'multiAz';
      const storageType = String(cfg.storageType || 'gp3');
      const instanceClass = String(cfg.instanceClass || 'db.t4g.medium');
      const storageGb = Math.max(0, Number(cfg.storageGb ?? 100));
      const backupRetentionGb = Math.max(0, Number(cfg.backupRetentionGb ?? storageGb));
      const billableBackupGb = Math.max(0, backupRetentionGb - storageGb);

      const defaults = BUILTIN_REGION_RATES.rds.engines[engineKey];
      const engineRates: RdsEngineRates = rates.rds?.engines?.[engineKey] ?? defaults;
      const baseInstanceRate = fallbackRate(
        engineRates[rateDeployment]?.[instanceClass] ?? engineRates.singleAz?.[instanceClass],
        defaults[rateDeployment][instanceClass] ?? defaults.singleAz[instanceClass] ?? defaults.singleAz['db.t4g.medium']
      );
      const instanceRate = deploymentMultiplier === 3 ? baseInstanceRate * 1.5 : baseInstanceRate;

      const baseStorageRate = fallbackRate(engineRates.storage?.singleAz, defaults.storage.singleAz);
      const storageRatePerGb =
        storageType === 'io2'
          ? 0.125 * deploymentMultiplier
          : baseStorageRate * deploymentMultiplier;

      return estimate([
        {
          label: `${instanceClass} ${deploymentOption} (${engineKey}) × ${HOURS_PER_MONTH} hrs × ${rateLabel(instanceRate)}/hr`,
          amount: instanceRate * HOURS_PER_MONTH,
        },
        {
          label: `${storageGb} GB ${storageType} storage (${deploymentOption}) × ${rateLabel(storageRatePerGb)}/GB-mo`,
          amount: storageGb * storageRatePerGb,
        },
        {
          label: `Backup storage (${billableBackupGb} GB above 100% of allocated × $0.0950/GB-mo)`,
          amount: billableBackupGb * 0.095,
        },
      ]);
    },
    getSpecSummary: (cfg) => {
      const deployment =
        cfg.deploymentOption ??
        (cfg.multiAz ? 'Multi-AZ DB Instance (2x)' : 'Single-AZ');
      return `${cfg.engine} • ${cfg.instanceClass} • ${deployment} • ${cfg.storageType || 'gp3'} ${cfg.storageGb ?? 0}GB`;
    },
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
      throughputMbps: 125,
    },
    calculateMonthlyCost: (cfg, rates) => {
      const volumeType = String(cfg.volumeType || 'gp3');
      const sizeGb = Math.max(0, Number(cfg.sizeGb || 0));
      const iops = Math.max(0, Number(cfg.iops ?? 3000));
      const throughputMbps = Math.max(0, Number(cfg.throughputMbps ?? 125));
      const extraIops = volumeType === 'gp3' ? Math.max(0, iops - 3000) : Math.max(0, iops);
      const extraThroughput = volumeType === 'gp3' ? Math.max(0, throughputMbps - 125) : 0;

      const gbRate = fallbackRate(rates.ebs?.gp3Gb, BUILTIN_REGION_RATES.ebs.gp3Gb);
      const iopsRate = fallbackRate(rates.ebs?.gp3Iops, BUILTIN_REGION_RATES.ebs.gp3Iops);
      const throughputRate = fallbackRate(
        rates.ebs?.gp3ThroughputMbps,
        BUILTIN_REGION_RATES.ebs.gp3ThroughputMbps ?? 0.04
      );

      return estimate([
        {
          label: `${volumeType} storage (${sizeGb} GB × ${rateLabel(gbRate)}/GB-mo)`,
          amount: sizeGb * gbRate,
        },
        {
          label: `Provisioned IOPS (${extraIops}${volumeType === 'gp3' ? ' above 3,000 free' : ''} × ${rateLabel(iopsRate)}/IOPS-mo)`,
          amount: extraIops * iopsRate,
        },
        {
          label: `Provisioned throughput (${extraThroughput} MB/s above 125 free × ${rateLabel(throughputRate)}/MBps-mo)`,
          amount: extraThroughput * throughputRate,
        },
      ]);
    },
    getSpecSummary: (cfg) =>
      `${String(cfg.volumeType || 'gp3').toUpperCase()} • ${cfg.sizeGb || 0} GB • ${cfg.iops ?? 3000} IOPS • ${cfg.throughputMbps ?? 125} MB/s`,
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
      getRequestsThousands: 500,
      internetEgressGb: 0,
    },
    calculateMonthlyCost: (cfg, rates) => {
      const storageClass = String(cfg.storageClass || 'Standard');
      const isIa = storageClass === 'Standard-IA';
      const storageRate = fallbackRate(
        isIa ? rates.s3?.standardIa : rates.s3?.standard,
        isIa ? BUILTIN_REGION_RATES.s3.standardIa : BUILTIN_REGION_RATES.s3.standard
      );
      const putRequestRate = fallbackRate(rates.s3?.putRequests, BUILTIN_REGION_RATES.s3.putRequests);
      const getRequestRate = fallbackRate(
        rates.s3?.getRequests,
        BUILTIN_REGION_RATES.s3.getRequests ?? 0.0004
      );
      const storageGb = Math.max(0, Number(cfg.storageGb || 0));
      const putThousands = Math.max(0, Number(cfg.putRequestsThousands || 0));
      const getThousands = Math.max(0, Number(cfg.getRequestsThousands || 0));
      const internetEgressGb = Math.max(0, Number(cfg.internetEgressGb || 0));
      const billableEgressGb = Math.max(0, internetEgressGb - 100);
      return estimate([
        {
          label: `${storageClass} storage (${storageGb} GB × ${rateLabel(storageRate)}/GB-mo)`,
          amount: storageGb * storageRate,
        },
        {
          label: `PUT/COPY/POST requests (${putThousands}K × ${rateLabel(putRequestRate)}/1K)`,
          amount: putThousands * putRequestRate,
        },
        {
          label: `GET/SELECT requests (${getThousands}K × ${rateLabel(getRequestRate)}/1K)`,
          amount: getThousands * getRequestRate,
        },
        {
          label: `Internet egress (${billableEgressGb} GB after 100 GB free × $0.0900/GB)`,
          amount: billableEgressGb * 0.09,
        },
      ]);
    },
    getSpecSummary: (cfg) =>
      `${cfg.storageClass} • ${cfg.storageGb || 0} GB • ${cfg.getRequestsThousands || 0}K GET`,
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
