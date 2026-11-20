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

export interface ServiceDefinition {
  type: AwsServiceType;
  name: string;
  shortName: string;
  category: ServiceCategory;
  color: string;
  isContainer?: boolean;
  supportsSecurityGroups?: boolean;
  defaultConfig: Record<string, any>;
  calculateMonthlyCost: (config: Record<string, any>) => number;
  getSpecSummary: (config: Record<string, any>) => string;
}
