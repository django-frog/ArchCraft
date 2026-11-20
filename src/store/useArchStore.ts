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
  AwsPricesFile,
  AwsServiceType,
  SecurityGroup,
  SecurityRule,
} from '../types/architecture';
import { AWS_CATALOG } from '../data/awsCatalog';
import { getRegionRates, loadAwsPrices } from '../data/pricingData';
import { DEFAULT_SGS, THREE_TIER_TEMPLATE, SERVERLESS_EVENT_TEMPLATE } from '../data/starterTemplates';
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
  prices: AwsPricesFile | null;
  pricingStatus: 'loading' | 'ready' | 'fallback';

  initializePricing: () => Promise<void>;
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
      prices: null,
      pricingStatus: 'loading',

      initializePricing: async () => {
        if (get().pricingStatus !== 'loading') return;
        const prices = await loadAwsPrices();
        set({ prices, pricingStatus: prices ? 'ready' : 'fallback' });
      },

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
            nodes: SERVERLESS_EVENT_TEMPLATE.nodes,
            edges: SERVERLESS_EVENT_TEMPLATE.edges,
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
        selectedNodeId: state.selectedNodeId,
        selectedEdgeId: state.selectedEdgeId,
      }),
    }
  )
);
