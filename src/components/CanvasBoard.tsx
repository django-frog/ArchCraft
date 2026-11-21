import { useCallback, useEffect } from 'react';
import type { DragEvent } from 'react';
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  useUpdateNodeInternals,
  type IsValidConnection,
  type NodeTypes,
  type OnNodeDrag,
  type OnMoveEnd,
  type OnInit,
  type OnSelectionChangeFunc,
} from '@xyflow/react';
import { AWS_CATALOG } from '../data/awsCatalog';
import {
  type AppEdge,
  type AppNode,
  useArchStore,
} from '../store/useArchStore';
import type { AwsNodeData, AwsServiceType } from '../types/architecture';
import ContainerNode from './nodes/ContainerNode';
import ServiceNode from './nodes/ServiceNode';

const nodeTypes: NodeTypes = {
  containerNode: ContainerNode,
  serviceNode: ServiceNode,
};

interface Point {
  x: number;
  y: number;
}

interface Rect extends Point {
  width: number;
  height: number;
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

/** Absolute canvas rect, walking up the parent chain for nested nodes. */
function getNodeRect(node: AppNode, nodes: AppNode[]): Rect {
  let x = node.position.x;
  let y = node.position.y;
  let parentId = node.parentId;
  const visited = new Set<string>([node.id]);

  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = nodes.find((candidate) => candidate.id === parentId);
    if (!parent) break;
    x += parent.position.x;
    y += parent.position.y;
    parentId = parent.parentId;
  }

  return {
    x,
    y,
    width: node.measured?.width ?? toNumber(node.style?.width, 196),
    height: node.measured?.height ?? toNumber(node.style?.height, 96),
  };
}

function containsPoint(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function isDescendantOf(candidate: AppNode, ancestorId: string, nodes: AppNode[]): boolean {
  let parentId = candidate.parentId;
  const visited = new Set<string>();
  while (parentId && !visited.has(parentId)) {
    if (parentId === ancestorId) return true;
    visited.add(parentId);
    parentId = nodes.find((candidateNode) => candidateNode.id === parentId)?.parentId;
  }
  return false;
}

/** Only valid container parents for a given service type. */
function getAllowedParentTypes(serviceType: AwsServiceType): AwsServiceType[] {
  if (serviceType === 'vpc') return []; // VPCs are always top-level
  if (serviceType === 'subnet') return ['vpc']; // Subnets belong to a VPC
  return ['subnet', 'vpc']; // Resources prefer a Subnet, but may sit directly in a VPC
}

function rectIntersectionArea(a: Rect, b: Rect): number {
  const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return xOverlap * yOverlap;
}

/** Innermost eligible container under a canvas point (or overlapping rect), excluding a dragged subtree. */
function findContainer(
  point: Point,
  nodes: AppNode[],
  excludeId?: string,
  allowedTypes?: AwsServiceType[],
  nodeRect?: Rect
): AppNode | undefined {
  const candidates = nodes.filter((node) => {
    if (!AWS_CATALOG[node.data.serviceType]?.isContainer) return false;
    if (allowedTypes && !allowedTypes.includes(node.data.serviceType)) return false;
    if (excludeId && (node.id === excludeId || isDescendantOf(node, excludeId, nodes))) return false;
    const rect = getNodeRect(node, nodes);
    if (containsPoint(rect, point)) return true;
    if (nodeRect) {
      const overlap = rectIntersectionArea(rect, nodeRect);
      const nodeArea = Math.max(1, nodeRect.width * nodeRect.height);
      return overlap / nodeArea >= 0.35;
    }
    return false;
  });

  return candidates.sort((a, b) => {
    const aRect = getNodeRect(a, nodes);
    const bRect = getNodeRect(b, nodes);
    return aRect.width * aRect.height - bRect.width * bRect.height;
  })[0];
}

function CanvasBoardInner({
  focusMode,
  skipInitialFitView,
}: {
  focusMode: boolean;
  skipInitialFitView: boolean;
}) {
  const nodes = useArchStore((s) => s.nodes);
  const edges = useArchStore((s) => s.edges);
  const onNodesChange = useArchStore((s) => s.onNodesChange);
  const onEdgesChange = useArchStore((s) => s.onEdgesChange);
  const onConnect = useArchStore((s) => s.onConnect);
  const addServiceNode = useArchStore((s) => s.addServiceNode);
  const setNodeParent = useArchStore((s) => s.setNodeParent);
  const deleteSelected = useArchStore((s) => s.deleteSelected);
  const setViewport = useArchStore((s) => s.setViewport);
  const setReactFlowInstance = useArchStore((s) => s.setReactFlowInstance);

  const { screenToFlowPosition, fitView } = useReactFlow<AppNode, AppEdge>();
  const updateNodeInternals = useUpdateNodeInternals();

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const rawType = event.dataTransfer.getData('application/aws-service');
      if (!rawType || !(rawType in AWS_CATALOG)) return;

      const serviceType = rawType as AwsServiceType;
      const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const currentNodes = useArchStore.getState().nodes;
      const container = findContainer(point, currentNodes, undefined, getAllowedParentTypes(serviceType));
      const containerRect = container ? getNodeRect(container, currentNodes) : undefined;

      addServiceNode(
        serviceType,
        containerRect
          ? { x: point.x - containerRect.x - 24, y: point.y - containerRect.y - 24 }
          : { x: point.x - 98, y: point.y - 42 },
        container?.id
      );
    },
    [addServiceNode, screenToFlowPosition]
  );

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Connections represent traffic between services, never between the
  // VPC/Subnet background boxes that merely group them on the canvas.
  const isValidConnection: IsValidConnection<AppEdge> = useCallback((connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return false;
    const currentNodes = useArchStore.getState().nodes;
    const sourceNode = currentNodes.find((node) => node.id === connection.source);
    const targetNode = currentNodes.find((node) => node.id === connection.target);
    if (!sourceNode || !targetNode) return false;
    return (
      !AWS_CATALOG[sourceNode.data.serviceType]?.isContainer &&
      !AWS_CATALOG[targetNode.data.serviceType]?.isContainer
    );
  }, []);

  const handleNodeDragStop: OnNodeDrag<AppNode> = useCallback(
    (_event, node) => {
      const serviceType = node.data.serviceType;
      const allowedTypes = getAllowedParentTypes(serviceType);
      if (allowedTypes.length === 0) return; // e.g. a VPC stays top-level

      const currentNodes = useArchStore.getState().nodes;
      const dragged = currentNodes.find((candidate) => candidate.id === node.id);
      if (!dragged) return;

      const rect = getNodeRect(dragged, currentNodes);
      const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      const target = findContainer(center, currentNodes, dragged.id, allowedTypes, rect);

      if ((target?.id ?? undefined) === dragged.parentId) return;

      const affectedIds = [
        dragged.id,
        ...currentNodes.filter((candidate) => isDescendantOf(candidate, dragged.id, currentNodes)).map((candidate) => candidate.id),
      ];

      if (target) {
        const targetRect = getNodeRect(target, currentNodes);
        setNodeParent(dragged.id, target.id, {
          x: center.x - targetRect.x - rect.width / 2,
          y: center.y - targetRect.y - rect.height / 2,
        });
      } else {
        setNodeParent(dragged.id, undefined, { x: rect.x, y: rect.y });
      }

      requestAnimationFrame(() => updateNodeInternals(affectedIds));
    },
    [setNodeParent, updateNodeInternals]
  );

  const handleSelectionChange: OnSelectionChangeFunc<AppNode, AppEdge> = useCallback(({ nodes: selectedNodes, edges: selectedEdges }) => {
    const nodeId = selectedNodes[0]?.id ?? null;
    const edgeId = selectedEdges[0]?.id ?? null;
    const state = useArchStore.getState();
    if (state.selectedNodeId === nodeId && state.selectedEdgeId === edgeId) return;

    if (nodeId) state.setSelectedNode(nodeId);
    else if (edgeId) state.setSelectedEdge(edgeId);
    else {
      state.setSelectedNode(null);
      state.setSelectedEdge(null);
    }
  }, []);

  const handleInit: OnInit<AppNode, AppEdge> = useCallback(
    (instance) => {
      setReactFlowInstance(instance);
      // A shared link is imported from App's effect before React Flow reports
      // onInit, so apply that saved camera as soon as the instance is ready.
      const savedViewport = useArchStore.getState().viewport;
      if (skipInitialFitView && savedViewport) {
        void instance.setViewport(savedViewport);
      } else {
        setViewport(instance.getViewport());
      }
    },
    [setReactFlowInstance, setViewport, skipInitialFitView]
  );

  const handleMoveEnd: OnMoveEnd = useCallback(
    (_event, viewport) => {
      setViewport({ x: viewport.x, y: viewport.y, zoom: viewport.zoom });
    },
    [setViewport]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      deleteSelected();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deleteSelected]);

  // Entering focus mode: drop selection outlines and re-frame the diagram in the full-width canvas.
  useEffect(() => {
    if (!focusMode) return;
    useArchStore.getState().setSelectedNode(null);
    const frame = requestAnimationFrame(() => {
      void fitView({ duration: 400, padding: 0.12 });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusMode, fitView]);

  return (
    <ReactFlow<AppNode, AppEdge>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      isValidConnection={isValidConnection}
      onSelectionChange={handleSelectionChange}
      onInit={handleInit}
      onMoveEnd={handleMoveEnd}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onNodeDragStop={handleNodeDragStop}
      forceColorMode="dark"
      connectionMode={ConnectionMode.Loose}
      deleteKeyCode={null}
      fitView={!skipInitialFitView}
      fitViewOptions={{ padding: 0.18 }}
      minZoom={0.2}
      maxZoom={1.8}
      defaultEdgeOptions={{ type: 'smoothstep' }}
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#1e293b" />
      {!focusMode && (
        <>
          <Controls showInteractive={false} />
          <MiniMap
            pannable
            zoomable
            maskColor="rgba(9, 13, 22, 0.75)"
            nodeColor={(node) => AWS_CATALOG[(node.data as AwsNodeData).serviceType]?.color ?? '#475569'}
          />
        </>
      )}
    </ReactFlow>
  );
}

export default function CanvasBoard({
  focusMode = false,
  skipInitialFitView = false,
}: {
  focusMode?: boolean;
  skipInitialFitView?: boolean;
}) {
  return <CanvasBoardInner focusMode={focusMode} skipInitialFitView={skipInitialFitView} />;
}
