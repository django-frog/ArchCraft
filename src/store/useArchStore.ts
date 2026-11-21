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
  type ReactFlowInstance,
} from '@xyflow/react';
import type {
  AwsNodeData,
  AwsEdgeData,
  CanvasViewport,
  AwsPricesFile,
  AwsServiceType,
  SecurityGroup,
  SecurityRule,
} from '../types/architecture';
import { AWS_CATALOG, getAvailabilityZones } from '../data/awsCatalog';
import { getRegionRates, loadAwsPrices } from '../data/pricingData';
import { DEFAULT_SGS, THREE_TIER_TEMPLATE, SERVERLESS_EVENT_TEMPLATE } from '../data/starterTemplates';
import type { ArchCraftProjectFile } from '../utils/projectSerializer';

export type AppNode = Node<AwsNodeData>;
export type AppEdge = Edge<AwsEdgeData>;

/** Realistic protocol/port defaults inferred from the service being connected to. */
export function getDefaultEdgeData(targetNode?: AppNode): AwsEdgeData {
  const config = targetNode?.data.config ?? {};

  let protocol = 'TCP';
  let port = '443';

  switch (targetNode?.data.serviceType) {
    case 'rds': {
      const engine = String(config.engine ?? '').trim().toLowerCase();
      if (/sql\s*server|mssql/.test(engine)) {
        port = '1433';
      } else if (engine.includes('mysql') || engine.includes('mariadb')) {
        port = '3306';
      } else {
        port = '5432';
      }
      break;
    }
    case 'elasticache':
      port = String(config.engine ?? '').toLowerCase().includes('memcached') ? '11211' : '6379';
      break;
    case 'ec2':
      protocol = 'HTTP';
      port = '8080';
      break;
    case 'alb':
    case 'cloudfront':
    case 'igw':
    case 's3':
    case 'sqs':
    case 'dynamodb':
    case 'lambda':
      protocol = 'HTTPS';
      port = '443';
      break;
    default:
      // Containers and other services have no well-known application port.
      protocol = 'TCP';
      port = '443';
  }

  return { protocol, port, label: `${protocol} :${port}` };
}

interface ArchState {
  projectName: string;
  region: string;
  nodes: AppNode[];
  edges: AppEdge[];
  securityGroups: SecurityGroup[];
  /** Last known canvas camera, restored when importing a project or shared link. */
  viewport?: CanvasViewport;
  /** Live React Flow instance registered by the canvas; never persisted. */
  reactFlowInstance: ReactFlowInstance<AppNode, AppEdge> | null;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  prices: AwsPricesFile | null;
  pricingStatus: 'loading' | 'ready' | 'fallback';

  initializePricing: () => Promise<void>;
  setProjectName: (name: string) => void;
  setRegion: (region: string) => void;
  setSelectedNode: (id: string | null) => void;
  setSelectedEdge: (id: string | null) => void;
  setViewport: (viewport: CanvasViewport) => void;
  setReactFlowInstance: (instance: ReactFlowInstance<AppNode, AppEdge> | null) => void;

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

export const useArchStore = create<ArchState>()(
  persist(
    (set, get) => ({
      projectName: 'Production 3-Tier AWS Architecture',
      region: 'us-east-1',
      nodes: THREE_TIER_TEMPLATE.nodes,
      edges: THREE_TIER_TEMPLATE.edges,
      securityGroups: DEFAULT_SGS,
      viewport: undefined,
      reactFlowInstance: null,
      selectedNodeId: null,
      selectedEdgeId: null,
      prices: null,
      pricingStatus: 'loading',

      initializePricing: async () => {
        if (get().pricingStatus !== 'loading') return;
        const prices = await loadAwsPrices();
        set({ prices, pricingStatus: prices ? 'ready' : 'fallback' });
      },

      setProjectName: (projectName) => set({ projectName }),
      setRegion: (region) =>
        set((state) => {
          const zones = getAvailabilityZones(region);
          // Keep subnet AZs in sync with the selected region, preserving the
          // AZ letter where possible (e.g. us-east-1b -> eu-west-1b).
          const nodes = state.nodes.map((node) => {
            if (node.data.serviceType !== 'subnet') return node;
            const az = String(node.data.config.az || '');
            if (zones.includes(az)) return node;
            const letter = az.match(/[a-z]$/)?.[0];
            const nextAz = letter
              ? (zones.find((zone) => zone.endsWith(letter)) ?? zones[0])
              : zones[0];
            return {
              ...node,
              data: { ...node.data, config: { ...node.data.config, az: nextAz } },
            };
          });
          return { region, nodes };
        }),
      setSelectedNode: (selectedNodeId) => set({ selectedNodeId, selectedEdgeId: null }),
      setSelectedEdge: (selectedEdgeId) => set({ selectedEdgeId, selectedNodeId: null }),
      setViewport: (viewport) => set({ viewport }),
      setReactFlowInstance: (reactFlowInstance) => set({ reactFlowInstance }),

      onNodesChange: (changes) => set({ nodes: changes.applyTo(get().nodes) }),
      onEdgesChange: (changes) => set({ edges: changes.applyTo(get().edges) }),
      onConnect: (connection: Connection) => {
        const targetNode = get().nodes.find((node) => node.id === connection.target);
        set({
          edges: addEdge(
            {
              ...connection,
              type: 'smoothstep',
              data: getDefaultEdgeData(targetNode),
            },
            get().edges
          ),
        });
      },

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
          ...(isVpc ? { style: { width: 900, height: 620 } } : {}),
          ...(isSubnet ? { style: { width: 360, height: 420 } } : {}),
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
            nodes: SERVERLESS_EVENT_TEMPLATE.nodes,
            edges: SERVERLESS_EVENT_TEMPLATE.edges,
            selectedNodeId: null,
            selectedEdgeId: null,
          });
        }
      },

      importProject: (project) => {
        const viewport = project.architecture.viewport;
        set({
          projectName: project.metadata.projectName,
          region: project.metadata.region,
          nodes: project.architecture.nodes,
          edges: project.architecture.edges,
          securityGroups: project.architecture.securityGroups,
          viewport,
          selectedNodeId: null,
          selectedEdgeId: null,
        });

        // Restore the camera after the imported nodes mount. Only fall back to
        // fitView when the source project did not carry an exact viewport.
        const reactFlowInstance = get().reactFlowInstance;
        if (!reactFlowInstance) return;
        requestAnimationFrame(() => {
          if (viewport) {
            void reactFlowInstance.setViewport(viewport);
          } else {
            void reactFlowInstance.fitView({ duration: 400, padding: 0.18 });
          }
        });
      },

      getTotalMonthlyCost: () => {
        const { nodes, region, prices } = get();
        const rates = getRegionRates(region, prices);
        return nodes.reduce((sum, node) => {
          const def = AWS_CATALOG[node.data.serviceType];
          return sum + def.calculateMonthlyCost(node.data.config, rates).monthly;
        }, 0);
      },
    }),
    {
      name: 'aws-archcraft-session-v1',
      storage: createJSONStorage(() => sessionStorage),
      // Pricing is reloaded from the synced file on every startup; never persist it.
      partialize: (state) => ({
        projectName: state.projectName,
        region: state.region,
        nodes: state.nodes,
        edges: state.edges,
        securityGroups: state.securityGroups,
        viewport: state.viewport,
        selectedNodeId: state.selectedNodeId,
        selectedEdgeId: state.selectedEdgeId,
      }),
    }
  )
);
