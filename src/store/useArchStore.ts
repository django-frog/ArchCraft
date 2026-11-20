import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  addEdge,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type Connection,
} from '@xyflow/react';
import type {
  AwsNodeData,
  AwsEdgeData,
  AwsServiceType,
  SecurityGroup,
  SecurityRule,
} from '../types/architecture';
import { AWS_CATALOG, AWS_REGIONS } from '../data/awsCatalog';
import type { ArchCraftProjectFile } from '../utils/projectSerializer';

export type AppNode = Node<AwsNodeData>;
export type AppEdge = Edge<AwsEdgeData>;

interface ArchState {
  projectName: string;
  region: string;
  nodes: AppNode[];
  edges: AppEdge[];
  securityGroups: SecurityGroup[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;

  setProjectName: (name: string) => void;
  setRegion: (region: string) => void;
  setSelectedNode: (id: string | null) => void;
  setSelectedEdge: (id: string | null) => void;

  onNodesChange: OnNodesChange<AppNode>;
  onEdgesChange: OnEdgesChange<AppEdge>;
  onConnect: OnConnect;

  addServiceNode: (serviceType: AwsServiceType, position?: { x: number; y: number }, parentId?: string) => void;
  updateNodeConfig: (nodeId: string, configPatch: Record<string, any>) => void;
  updateNodeLabel: (nodeId: string, label: string) => void;
  toggleNodeSecurityGroup: (nodeId: string, sgId: string) => void;
  setNodeParent: (nodeId: string, parentId: string | undefined, adjustedPos: { x: number; y: number }) => void;
  deleteSelected: () => void;

  updateEdgeData: (edgeId: string, dataPatch: Partial<AwsEdgeData>) => void;

  addSecurityGroup: (sg: Omit<SecurityGroup, 'id'>) => void;
  addSecurityRule: (sgId: string, rule: Omit<SecurityRule, 'id'>) => void;
  removeSecurityRule: (sgId: string, ruleId: string) => void;
  deleteSecurityGroup: (sgId: string) => void;

  loadTemplate: (templateKey: 'three-tier' | 'serverless-event' | 'blank') => void;
  importProject: (project: ArchCraftProjectFile) => void;
  getTotalMonthlyCost: () => number;
}

const DEFAULT_SGS: SecurityGroup[] = [
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

const THREE_TIER_TEMPLATE: { nodes: AppNode[]; edges: AppEdge[] } = {
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
      data: { label: 'Public Subnet', serviceType: 'subnet', config: { tier: 'Public', cidr: '10.0.1.0/24', az: 'us-east-1a' }, securityGroupIds: [] },
    },
    {
      id: 'sub-priv',
      type: 'containerNode',
      parentId: 'vpc-main',
      extent: 'parent',
      position: { x: 280, y: 70 },
      style: { width: 450, height: 410 },
      data: { label: 'Private App & Data Subnet', serviceType: 'subnet', config: { tier: 'Private', cidr: '10.0.2.0/24', az: 'us-east-1b' }, securityGroupIds: [] },
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

export const useArchStore = create<ArchState>()(
  persist(
    (set, get) => ({
      projectName: 'Production 3-Tier AWS Architecture',
      region: 'us-east-1',
      nodes: THREE_TIER_TEMPLATE.nodes,
      edges: THREE_TIER_TEMPLATE.edges,
      securityGroups: DEFAULT_SGS,
      selectedNodeId: null,
      selectedEdgeId: null,

      setProjectName: (projectName) => set({ projectName }),
      setRegion: (region) => set({ region }),
      setSelectedNode: (selectedNodeId) => set({ selectedNodeId, selectedEdgeId: null }),
      setSelectedEdge: (selectedEdgeId) => set({ selectedEdgeId, selectedNodeId: null }),

      onNodesChange: (changes) => set({ nodes: changes.applyTo(get().nodes) }),
      onEdgesChange: (changes) => set({ edges: changes.applyTo(get().edges) }),
      onConnect: (connection: Connection) =>
        set({
          edges: addEdge(
            {
              ...connection,
              type: 'smoothstep',
              data: { protocol: 'TCP', port: '443', label: 'TCP :443' },
            },
            get().edges
          ),
        }),

      addServiceNode: (serviceType, position = { x: 160, y: 160 }, parentId) => {
        const def = AWS_CATALOG[serviceType];
        const id = `${serviceType}-${Date.now().toString(36)}`;
        const isVpc = serviceType === 'vpc';
        const isSubnet = serviceType === 'subnet';

        const newNode: AppNode = {
          id,
          type: def.isContainer ? 'containerNode' : 'serviceNode',
          position,
          ...(parentId ? { parentId, extent: 'parent' as const } : {}),
          ...(isVpc ? { style: { width: 640, height: 440 } } : {}),
          ...(isSubnet ? { style: { width: 280, height: 320 } } : {}),
          data: {
            label: def.name,
            serviceType,
            config: { ...def.defaultConfig },
            securityGroupIds: [],
          },
        };

        set({ nodes: [...get().nodes, newNode], selectedNodeId: id, selectedEdgeId: null });
      },

      updateNodeConfig: (nodeId, configPatch) =>
        set({
          nodes: get().nodes.map((n) =>
            n.id === nodeId ? { ...n, data: { ...n.data, config: { ...n.data.config, ...configPatch } } } : n
          ),
        }),

      updateNodeLabel: (nodeId, label) =>
        set({
          nodes: get().nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, label } } : n)),
        }),

      toggleNodeSecurityGroup: (nodeId, sgId) =>
        set({
          nodes: get().nodes.map((n) => {
            if (n.id !== nodeId) return n;
            const current = n.data.securityGroupIds || [];
            const exists = current.includes(sgId);
            return {
              ...n,
              data: {
                ...n.data,
                securityGroupIds: exists ? current.filter((id) => id !== sgId) : [...current, sgId],
              },
            };
          }),
        }),

      setNodeParent: (nodeId, parentId, adjustedPos) => {
        // Guard against cycles (a container cannot become its own descendant).
        const visited = new Set<string>();
        let currentId: string | undefined = parentId;
        while (currentId && !visited.has(currentId)) {
          if (currentId === nodeId) return;
          visited.add(currentId);
          currentId = get().nodes.find((n) => n.id === currentId)?.parentId;
        }

        set({
          nodes: get().nodes.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  parentId,
                  extent: parentId ? ('parent' as const) : undefined,
                  position: adjustedPos,
                }
              : n
          ),
        });
      },

      deleteSelected: () => {
        const { selectedNodeId, selectedEdgeId, nodes, edges } = get();
        if (selectedNodeId) {
          // Remove the whole nested subtree so no orphaned parentId references remain.
          const removedIds = new Set<string>();
          const collectDescendants = (id: string) => {
            if (removedIds.has(id)) return;
            removedIds.add(id);
            for (const child of nodes) {
              if (child.parentId === id) collectDescendants(child.id);
            }
          };
          collectDescendants(selectedNodeId);

          set({
            nodes: nodes.filter((n) => !removedIds.has(n.id)),
            edges: edges.filter((e) => !removedIds.has(e.source) && !removedIds.has(e.target)),
            selectedNodeId: null,
            selectedEdgeId: null,
          });
        } else if (selectedEdgeId) {
          set({
            edges: edges.filter((e) => e.id !== selectedEdgeId),
            selectedEdgeId: null,
          });
        }
      },

      updateEdgeData: (edgeId, dataPatch) =>
        set({
          edges: get().edges.map((e) =>
            e.id === edgeId ? { ...e, data: { ...(e.data || { protocol: 'TCP', port: '443' }), ...dataPatch } } : e
          ),
        }),

      addSecurityGroup: (sg) =>
        set({
          securityGroups: [...get().securityGroups, { ...sg, id: `sg-${Date.now().toString(36)}` }],
        }),

      addSecurityRule: (sgId, rule) =>
        set({
          securityGroups: get().securityGroups.map((sg) =>
            sg.id === sgId
              ? { ...sg, rules: [...sg.rules, { ...rule, id: `rule-${Date.now().toString(36)}` }] }
              : sg
          ),
        }),

      removeSecurityRule: (sgId, ruleId) =>
        set({
          securityGroups: get().securityGroups.map((sg) =>
            sg.id === sgId ? { ...sg, rules: sg.rules.filter((r) => r.id !== ruleId) } : sg
          ),
        }),

      deleteSecurityGroup: (sgId) =>
        set({
          securityGroups: get().securityGroups.filter((sg) => sg.id !== sgId),
          nodes: get().nodes.map((n) => ({
            ...n,
            data: {
              ...n.data,
              securityGroupIds: (n.data.securityGroupIds || []).filter((id) => id !== sgId),
            },
          })),
        }),

      loadTemplate: (templateKey) => {
        if (templateKey === 'blank') {
          set({ nodes: [], edges: [], selectedNodeId: null, selectedEdgeId: null });
        } else if (templateKey === 'three-tier') {
          set({
            nodes: THREE_TIER_TEMPLATE.nodes,
            edges: THREE_TIER_TEMPLATE.edges,
            selectedNodeId: null,
            selectedEdgeId: null,
          });
        } else if (templateKey === 'serverless-event') {
          set({
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
            selectedNodeId: null,
            selectedEdgeId: null,
          });
        }
      },

      importProject: (project) =>
        set({
          projectName: project.metadata.projectName,
          region: project.metadata.region,
          nodes: project.architecture.nodes,
          edges: project.architecture.edges,
          securityGroups: project.architecture.securityGroups,
          selectedNodeId: null,
          selectedEdgeId: null,
        }),

      getTotalMonthlyCost: () => {
        const { nodes, region } = get();
        const mult = AWS_REGIONS[region]?.multiplier ?? 1.0;
        return nodes.reduce((sum, node) => {
          const def = AWS_CATALOG[node.data.serviceType];
          return sum + def.calculateMonthlyCost(node.data.config) * mult;
        }, 0);
      },
    }),
    {
      name: 'aws-archcraft-session-v1',
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
