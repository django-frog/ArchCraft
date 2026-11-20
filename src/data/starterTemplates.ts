import type { AppNode, AppEdge } from '../store/useArchStore';
import type { SecurityGroup } from '../types/architecture';
import { AWS_CATALOG } from './awsCatalog';
import { createDefaultRouteTable } from '../utils/cidrValidator';

export interface StarterTemplate {
  nodes: AppNode[];
  edges: AppEdge[];
}

export const DEFAULT_SGS: SecurityGroup[] = [
  {
    id: 'sg-web-public',
    name: 'sg-web-public',
    description: 'Public ALB / Web tier ingress',
    rules: [
      { id: 'r1', direction: 'inbound', protocol: 'TCP', portRange: '443', sourceOrDest: '0.0.0.0/0', description: 'HTTPS from Internet' },
      { id: 'r2', direction: 'inbound', protocol: 'TCP', portRange: '80', sourceOrDest: '0.0.0.0/0', description: 'HTTP redirect' },
    ],
  },
  {
    id: 'sg-app-private',
    name: 'sg-app-private',
    description: 'Private application compute tier',
    rules: [
      { id: 'r3', direction: 'inbound', protocol: 'TCP', portRange: '8080', sourceOrDest: 'sg-web-public', description: 'App traffic from Web tier' },
    ],
  },
  {
    id: 'sg-db-isolated',
    name: 'sg-db-isolated',
    description: 'Isolated database & cache tier',
    rules: [
      { id: 'r4', direction: 'inbound', protocol: 'TCP', portRange: '5432', sourceOrDest: 'sg-app-private', description: 'PostgreSQL from App' },
      { id: 'r5', direction: 'inbound', protocol: 'TCP', portRange: '6379', sourceOrDest: 'sg-app-private', description: 'Redis/Valkey from App' },
    ],
  },
];

export const THREE_TIER_TEMPLATE: StarterTemplate = {
  nodes: [
    {
      id: 'cf-1',
      type: 'serviceNode',
      position: { x: 40, y: 180 },
      data: { label: 'Edge CDN', serviceType: 'cloudfront', config: { ...AWS_CATALOG.cloudfront.defaultConfig }, securityGroupIds: [] },
    },
    {
      id: 'vpc-main',
      type: 'containerNode',
      position: { x: 300, y: 40 },
      style: { width: 760, height: 520 },
      data: { label: 'Production VPC', serviceType: 'vpc', config: { cidr: '10.0.0.0/16', natGateways: 1, dataProcessedGb: 150 }, securityGroupIds: [] },
    },
    {
      id: 'sub-pub',
      type: 'containerNode',
      parentId: 'vpc-main',
      extent: 'parent',
      position: { x: 30, y: 70 },
      style: { width: 220, height: 410 },
      data: {
        label: 'Public Subnet',
        serviceType: 'subnet',
        config: {
          ...AWS_CATALOG.subnet.defaultConfig,
          cidr: '10.0.1.0/24',
          az: 'us-east-1a',
          mapPublicIpOnLaunch: true,
          routeTable: createDefaultRouteTable('Public', '10.0.0.0/16'),
        },
        securityGroupIds: [],
      },
    },
    {
      id: 'sub-priv',
      type: 'containerNode',
      parentId: 'vpc-main',
      extent: 'parent',
      position: { x: 280, y: 70 },
      style: { width: 450, height: 410 },
      data: {
        label: 'Private App & Data Subnet',
        serviceType: 'subnet',
        config: {
          ...AWS_CATALOG.subnet.defaultConfig,
          tier: 'Private',
          cidr: '10.0.2.0/24',
          az: 'us-east-1b',
          mapPublicIpOnLaunch: false,
          routeTable: createDefaultRouteTable('Private', '10.0.0.0/16'),
        },
        securityGroupIds: [],
      },
    },
    {
      id: 'igw-main',
      type: 'serviceNode',
      parentId: 'sub-pub',
      extent: 'parent',
      position: { x: 10, y: 205 },
      data: {
        label: 'Internet Gateway',
        serviceType: 'igw',
        config: { ...AWS_CATALOG.igw.defaultConfig },
        securityGroupIds: [],
      },
    },
    {
      id: 'ec2-web',
      type: 'serviceNode',
      parentId: 'sub-pub',
      extent: 'parent',
      position: { x: 20, y: 80 },
      data: { label: 'Web / Reverse Proxy', serviceType: 'ec2', config: { instanceType: 't3.small', count: 2, os: 'Linux' }, securityGroupIds: ['sg-web-public'] },
    },
    {
      id: 'ec2-app',
      type: 'serviceNode',
      parentId: 'sub-priv',
      extent: 'parent',
      position: { x: 25, y: 80 },
      data: { label: 'Core API Workers', serviceType: 'ec2', config: { instanceType: 't3.medium', count: 2, os: 'Linux' }, securityGroupIds: ['sg-app-private'] },
    },
    {
      id: 'cache-1',
      type: 'serviceNode',
      parentId: 'sub-priv',
      extent: 'parent',
      position: { x: 245, y: 65 },
      data: { label: 'Session & Query Cache', serviceType: 'elasticache', config: { ...AWS_CATALOG.elasticache.defaultConfig }, securityGroupIds: ['sg-db-isolated'] },
    },
    {
      id: 'rds-1',
      type: 'serviceNode',
      parentId: 'sub-priv',
      extent: 'parent',
      position: { x: 245, y: 235 },
      data: { label: 'Primary PostgreSQL', serviceType: 'rds', config: { ...AWS_CATALOG.rds.defaultConfig }, securityGroupIds: ['sg-db-isolated'] },
    },
    {
      id: 's3-1',
      type: 'serviceNode',
      position: { x: 1120, y: 200 },
      data: { label: 'Static Assets & Backups', serviceType: 's3', config: { ...AWS_CATALOG.s3.defaultConfig }, securityGroupIds: [] },
    },
  ],
  edges: [
    { id: 'e1', source: 'cf-1', target: 'ec2-web', type: 'smoothstep', animated: true, data: { protocol: 'HTTPS', port: '443', label: 'HTTPS :443' } },
    { id: 'e2', source: 'ec2-web', target: 'ec2-app', type: 'smoothstep', data: { protocol: 'HTTP', port: '8080', label: 'HTTP :8080' } },
    { id: 'e3', source: 'ec2-app', target: 'cache-1', type: 'smoothstep', data: { protocol: 'TCP', port: '6379', label: 'Redis :6379' } },
    { id: 'e4', source: 'ec2-app', target: 'rds-1', type: 'smoothstep', data: { protocol: 'TCP', port: '5432', label: 'TLS :5432' } },
    { id: 'e5', source: 'ec2-app', target: 's3-1', type: 'smoothstep', data: { protocol: 'HTTPS', port: '443', label: 'S3 API' } },
  ],
};

export const SERVERLESS_EVENT_TEMPLATE: StarterTemplate = {
  nodes: [
    { id: 'cf-s', type: 'serviceNode', position: { x: 60, y: 180 }, data: { label: 'API Edge CDN', serviceType: 'cloudfront', config: { ...AWS_CATALOG.cloudfront.defaultConfig }, securityGroupIds: [] } },
    { id: 'lmb-api', type: 'serviceNode', position: { x: 320, y: 180 }, data: { label: 'Ingest API Lambda', serviceType: 'lambda', config: { memoryMb: 512, requestsMillions: 15, avgDurationMs: 85 }, securityGroupIds: [] } },
    { id: 'sqs-1', type: 'serviceNode', position: { x: 580, y: 180 }, data: { label: 'Order Events Queue', serviceType: 'sqs', config: { queueType: 'Standard', requestsMillions: 15 }, securityGroupIds: [] } },
    { id: 'lmb-wrk', type: 'serviceNode', position: { x: 840, y: 180 }, data: { label: 'Async Processor', serviceType: 'lambda', config: { memoryMb: 1024, requestsMillions: 15, avgDurationMs: 220 }, securityGroupIds: [] } },
    { id: 'ddb-1', type: 'serviceNode', position: { x: 1100, y: 100 }, data: { label: 'Orders Table', serviceType: 'dynamodb', config: { ...AWS_CATALOG.dynamodb.defaultConfig }, securityGroupIds: [] } },
    { id: 's3-arch', type: 'serviceNode', position: { x: 1100, y: 270 }, data: { label: 'Event Archive', serviceType: 's3', config: { storageClass: 'Standard-IA', storageGb: 1000, putRequestsThousands: 500 }, securityGroupIds: [] } },
  ],
  edges: [
    { id: 'se1', source: 'cf-s', target: 'lmb-api', type: 'smoothstep', animated: true, data: { protocol: 'HTTPS', port: '443', label: 'HTTPS :443' } },
    { id: 'se2', source: 'lmb-api', target: 'sqs-1', type: 'smoothstep', data: { protocol: 'HTTPS', port: '443', label: 'SendMessage' } },
    { id: 'se3', source: 'sqs-1', target: 'lmb-wrk', type: 'smoothstep', data: { protocol: 'HTTPS', port: '443', label: 'Batch Trigger' } },
    { id: 'se4', source: 'lmb-wrk', target: 'ddb-1', type: 'smoothstep', data: { protocol: 'HTTPS', port: '443', label: 'PutItem' } },
    { id: 'se5', source: 'lmb-wrk', target: 's3-arch', type: 'smoothstep', data: { protocol: 'HTTPS', port: '443', label: 'PutObject' } },
  ],
};
