import type { AppNode, AppEdge } from '../store/useArchStore';
import type { SecurityGroup } from '../types/architecture';
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
}): ArchCraftProjectFile {
  const cleanNodes: AppNode[] = params.nodes.map((n) => ({
    id: n.id,
    type: n.type || (AWS_CATALOG[n.data.serviceType]?.isContainer ? 'containerNode' : 'serviceNode'),
    position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
    ...(n.parentId ? { parentId: n.parentId, extent: 'parent' as const } : {}),
    ...(n.style ? { style: { width: n.style.width, height: n.style.height } } : {}),
    data: {
      label: n.data.label,
      serviceType: n.data.serviceType,
      config: { ...n.data.config },
      securityGroupIds: [...(n.data.securityGroupIds || [])],
      ...(n.data.notes ? { notes: n.data.notes } : {}),
    },
  }));

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

  const sanitizedEdges: AppEdge[] = edges.filter(
    (e: AppEdge) => e.source && e.target && nodeIds.has(e.source) && nodeIds.has(e.target)
  );

  const region =
    parsed.metadata?.region && parsed.metadata.region in AWS_REGIONS ? parsed.metadata.region : 'us-east-1';

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
        nodes: sanitizedNodes,
        edges: sanitizedEdges,
        securityGroups: Array.isArray(securityGroups) ? securityGroups : [],
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
