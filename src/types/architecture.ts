export type AwsServiceType =
  | 'vpc'
  | 'subnet'
  | 'ec2'
  | 'lambda'
  | 'rds'
  | 'ebs'
  | 's3'
  | 'sqs'
  | 'elasticache'
  | 'cloudfront'
  | 'dynamodb';

export type ServiceCategory = 'Networking' | 'Compute' | 'Database' | 'Storage' | 'Integration & Edge';

export interface SecurityRule {
  id: string;
  direction: 'inbound' | 'outbound';
  protocol: 'TCP' | 'UDP' | 'ICMP' | 'ALL';
  portRange: string;
  sourceOrDest: string; // e.g., "0.0.0.0/0" or "sg-app-tier"
  description: string;
}

export interface SecurityGroup {
  id: string;
  name: string;
  vpcId?: string;
  description: string;
  rules: SecurityRule[];
}

export interface AwsNodeData extends Record<string, unknown> {
  label: string;
  serviceType: AwsServiceType;
  config: Record<string, any>;
  securityGroupIds: string[];
  notes?: string;
}

export interface AwsEdgeData extends Record<string, unknown> {
  protocol: string;
  port: string;
  label?: string;
}

/** One line of a transparent, region-aware AWS billing breakdown. */
export interface CostLineItem {
  label: string;
  amount: number;
}

export interface CostEstimate {
  monthly: number;
  lineItems: CostLineItem[];
}

export interface RdsEngineRates {
  /** USD per instance-hour, keyed by RDS instance class. */
  singleAz: Record<string, number>;
  multiAz: Record<string, number>;
  /** USD per GB-month of gp3 storage. */
  storage: { singleAz: number; multiAz: number };
}

/** Normalized On-Demand rates for one AWS region. All values are USD. */
export interface RegionRates {
  /** USD per instance-hour. */
  ec2: Record<string, number>;
  rds: { engines: Record<'postgresql' | 'mysql', RdsEngineRates> };
  /** gp3 storage USD per GB-month and per IOPS-month above the free 3,000 IOPS. */
  ebs: { gp3Gb: number; gp3Iops: number };
  /** `requests` is USD per 1M requests; `gbSeconds` is USD per GB-second. */
  lambda: { requests: number; gbSeconds: number };
  /** Storage is USD per GB-month; `putRequests` is USD per 1,000 requests. */
  s3: { standard: number; standardIa: number; putRequests: number };
  /** NAT Gateway USD per hour and USD per GB processed. */
  vpc: { natGatewayHourly: number; natGatewayDataGb: number };
  /** USD per node-hour, keyed by cache node type. */
  elasticache: Record<string, number>;
  /** `wru` / `rru` are USD per million request units; storage is USD per GB-month. */
  dynamodb: { wru: number; rru: number; storageGb: number };
  /** Data transfer is USD per GB; `requests` is USD per 1M HTTPS requests. */
  cloudfront: { dataTransferOutGb: number; requests: number };
}

export interface AwsPricesFile {
  syncedAt: string;
  source: string;
  regions: Record<string, RegionRates>;
}

export interface ServiceDefinition {
  type: AwsServiceType;
  name: string;
  shortName: string;
  category: ServiceCategory;
  color: string;
  isContainer?: boolean;
  supportsSecurityGroups?: boolean;
  defaultConfig: Record<string, any>;
  calculateMonthlyCost: (config: Record<string, any>, regionRates: RegionRates) => CostEstimate;
  getSpecSummary: (config: Record<string, any>) => string;
}
