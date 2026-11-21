import type { AppNode, AppEdge } from '../store/useArchStore';
import type { CanvasViewport, SecurityGroup } from '../types/architecture';
import { AWS_CATALOG, AWS_REGIONS } from '../data/awsCatalog';
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';

export const ARCHCRAFT_SCHEMA_VERSION = '1.0.0';
const HASH_PREFIX = '#arch=';

export interface ArchCraftProjectFile {
  $schema: 'aws-archcraft-project';
  schemaVersion: string;
  exportedAt: string;
  metadata: {
    projectName: string;
    region: string;
  };
  architecture: {
    nodes: AppNode[];
    edges: AppEdge[];
    securityGroups: SecurityGroup[];
    /** Exact canvas framing captured when the project was exported/shared. */
    viewport?: CanvasViewport;
  };
}

export interface ImportValidationResult {
  valid: boolean;
  error?: string;
  project?: ArchCraftProjectFile;
}

/**
 * Serializes current Zustand state into a clean, lossless .archcraft.json payload.
 * Strips transient React Flow UI state (selected, dragging, measured) for clean diffs.
 */
export function serializeProject(params: {
  projectName: string;
  region: string;
  nodes: AppNode[];
  edges: AppEdge[];
  securityGroups: SecurityGroup[];
  viewport?: CanvasViewport;
}): ArchCraftProjectFile {
  const cleanNodes: AppNode[] = params.nodes.map((n) => {
    const isContainer = AWS_CATALOG[n.data.serviceType]?.isContainer;
    // React Flow writes resized container dimensions to `width`/`height` or `measured`;
    // older exports carried them only in `style`. Capture all sources so the box round-trips.
    const defaultW = n.data.serviceType === 'vpc' ? 900 : 360;
    const defaultH = n.data.serviceType === 'vpc' ? 620 : 420;
    const width = Math.round(Number(n.width ?? n.measured?.width ?? n.style?.width ?? defaultW));
    const height = Math.round(Number(n.height ?? n.measured?.height ?? n.style?.height ?? defaultH));

    return {
      id: n.id,
      type: n.type || (isContainer ? 'containerNode' : 'serviceNode'),
      position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
      ...(n.parentId ? { parentId: n.parentId, extent: 'parent' as const } : {}),
      ...(isContainer
        ? { width, height, style: { width, height } }
        : n.style
          ? { style: { width: n.style.width, height: n.style.height } }
          : {}),
      data: {
        label: n.data.label,
        serviceType: n.data.serviceType,
        config: { ...n.data.config },
        securityGroupIds: [...(n.data.securityGroupIds || [])],
        ...(n.data.notes ? { notes: n.data.notes } : {}),
      },
    };
  });

  const cleanEdges: AppEdge[] = params.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}),
    ...(e.targetHandle ? { targetHandle: e.targetHandle } : {}),
    type: e.type || 'smoothstep',
    ...(e.animated ? { animated: e.animated } : {}),
    data: {
      protocol: e.data?.protocol || 'TCP',
      port: e.data?.port || '443',
      label: e.data?.label || `${e.data?.protocol || 'TCP'} :${e.data?.port || '443'}`,
    },
  }));

  return {
    $schema: 'aws-archcraft-project',
    schemaVersion: ARCHCRAFT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    metadata: {
      projectName: params.projectName || 'Untitled AWS Architecture',
      region: params.region || 'us-east-1',
    },
    architecture: {
      nodes: cleanNodes,
      edges: cleanEdges,
      securityGroups: structuredClone(params.securityGroups),
      ...(params.viewport
        ? { viewport: { x: params.viewport.x, y: params.viewport.y, zoom: params.viewport.zoom } }
        : {}),
    },
  };
}

/**
 * Validates and normalizes an uploaded JSON string before loading into the canvas store.
 */
export function parseAndValidateProject(rawJson: string): ImportValidationResult {
  let parsed: any;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { valid: false, error: 'Invalid JSON syntax. Please upload a valid .archcraft.json file.' };
  }

  if (!parsed || parsed.$schema !== 'aws-archcraft-project' || !parsed.architecture) {
    return {
      valid: false,
      error: 'Unrecognized file format. Missing "$schema": "aws-archcraft-project" header.',
    };
  }

  const { nodes, edges, securityGroups } = parsed.architecture;

  if (!Array.isArray(nodes) || !Array.isArray(edges)) {
    return { valid: false, error: 'Corrupted project file: "nodes" and "edges" must be arrays.' };
  }

  // Validate every node's serviceType against AWS_CATALOG
  const nodeIds = new Set<string>();
  for (const node of nodes) {
    if (!node.id || !node.data?.serviceType || !(node.data.serviceType in AWS_CATALOG)) {
      return {
        valid: false,
        error: `Unsupported or missing AWS service type "${node.data?.serviceType}" on node "${node.id}".`,
      };
    }
    nodeIds.add(node.id);
  }

  // Filter out any dangling parentId or broken edges safely
  const sanitizedNodes: AppNode[] = nodes.map((n: AppNode) => {
    const hasValidParent = n.parentId && nodeIds.has(n.parentId);
    const def = AWS_CATALOG[n.data.serviceType];
    return {
      ...n,
      parentId: hasValidParent ? n.parentId : undefined,
      extent: hasValidParent ? ('parent' as const) : undefined,
      data: {
        ...n.data,
        config: { ...def.defaultConfig, ...(n.data.config || {}) },
        securityGroupIds: Array.isArray(n.data.securityGroupIds) ? n.data.securityGroupIds : [],
      },
    };
  });

  // React Flow renders parent nodes before children, so guarantee that ordering on import:
  // VPCs first, then Subnets, then service nodes; ties broken by nesting depth.
  const nodeById = new Map(sanitizedNodes.map((n) => [n.id, n]));
  const getDepth = (node: AppNode): number => {
    let depth = 0;
    let parentId = node.parentId;
    const visited = new Set<string>([node.id]);
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      depth += 1;
      parentId = nodeById.get(parentId)?.parentId;
    }
    return depth;
  };
  const containerRank = (node: AppNode): number => {
    if (node.data.serviceType === 'vpc') return 0;
    if (node.data.serviceType === 'subnet') return 1;
    return 2;
  };
  const orderedNodes = [...sanitizedNodes].sort((a, b) => {
    const byRank = containerRank(a) - containerRank(b);
    return byRank !== 0 ? byRank : getDepth(a) - getDepth(b);
  });

  const sanitizedEdges: AppEdge[] = edges.filter(
    (e: AppEdge) => e.source && e.target && nodeIds.has(e.source) && nodeIds.has(e.target)
  );

  const region =
    parsed.metadata?.region && parsed.metadata.region in AWS_REGIONS ? parsed.metadata.region : 'us-east-1';

  const rawViewport = parsed.architecture.viewport;
  const viewport: CanvasViewport | undefined =
    rawViewport &&
    Number.isFinite(Number(rawViewport.x)) &&
    Number.isFinite(Number(rawViewport.y)) &&
    Number.isFinite(Number(rawViewport.zoom)) &&
    Number(rawViewport.zoom) > 0
      ? { x: Number(rawViewport.x), y: Number(rawViewport.y), zoom: Number(rawViewport.zoom) }
      : undefined;

  return {
    valid: true,
    project: {
      $schema: 'aws-archcraft-project',
      schemaVersion: parsed.schemaVersion || ARCHCRAFT_SCHEMA_VERSION,
      exportedAt: parsed.exportedAt || new Date().toISOString(),
      metadata: {
        projectName: parsed.metadata?.projectName || 'Imported AWS Architecture',
        region,
      },
      architecture: {
        nodes: orderedNodes,
        edges: sanitizedEdges,
        securityGroups: Array.isArray(securityGroups) ? securityGroups : [],
        ...(viewport ? { viewport } : {}),
      },
    },
  };
}


/**
 * Compresses the serialized project into a URL-safe hash string (#arch=...).
 */
export function encodeProjectToUrlHash(params: {
  projectName: string;
  region: string;
  nodes: AppNode[];
  edges: AppEdge[];
  securityGroups: SecurityGroup[];
  viewport?: CanvasViewport;
}): { url: string; charLength: number; isLarge: boolean } {
  const payload = serializeProject(params);
  // Compact JSON (no whitespace) before LZ compression for maximum ratio
  const compressed = compressToEncodedURIComponent(JSON.stringify(payload));
  const baseUrl = `${window.location.origin}${window.location.pathname}${window.location.search}`;
  const fullUrl = `${baseUrl}${HASH_PREFIX}${compressed}`;

  return {
    url: fullUrl,
    charLength: fullUrl.length,
    // Warn if URL exceeds ~8,000 chars (some corporate proxies/chat apps truncate very long URLs)
    isLarge: fullUrl.length > 8000,
  };
}

/**
 * Checks window.location.hash for `#arch=...`, decompresses, and validates it.
 * Returns null if no `#arch=` hash is present.
 */
export function decodeProjectFromUrlHash(hash: string = window.location.hash): ImportValidationResult | null {
  if (!hash || !hash.startsWith(HASH_PREFIX)) {
    return null;
  }

  const encoded = hash.slice(HASH_PREFIX.length).trim();
  if (!encoded) {
    return { valid: false, error: 'Shared architecture URL is empty.' };
  }

  try {
    const decompressed = decompressFromEncodedURIComponent(encoded);
    if (!decompressed) {
      return { valid: false, error: 'Could not decompress shared architecture URL (link may be truncated).' };
    }
    return parseAndValidateProject(decompressed);
  } catch {
    return { valid: false, error: 'Failed to decode shared architecture link.' };
  }
}
