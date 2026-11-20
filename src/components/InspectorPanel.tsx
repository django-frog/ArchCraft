import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  CircleCheck,
  CircleDollarSign,
  Info,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  X,
  type LucideIcon,
} from 'lucide-react';
import { AWS_CATALOG, AWS_REGIONS } from '../data/awsCatalog';
import { useArchitectureLint } from '../hooks/useArchitectureLint';
import { useArchStore } from '../store/useArchStore';
import type { AwsServiceType } from '../types/architecture';
import type { LintSeverity } from '../utils/architectureLinter';

type FieldType = 'text' | 'number' | 'select' | 'checkbox';

interface ConfigField {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  step?: number;
}

const CONFIG_FIELDS: Record<AwsServiceType, ConfigField[]> = {
  vpc: [
    { key: 'cidr', label: 'CIDR Block', type: 'text' },
    { key: 'natGateways', label: 'NAT Gateways', type: 'number', step: 1 },
    { key: 'dataProcessedGb', label: 'NAT Data Processed (GB)', type: 'number' },
  ],
  subnet: [
    { key: 'tier', label: 'Tier', type: 'select', options: ['Public', 'Private'] },
    { key: 'cidr', label: 'CIDR Block', type: 'text' },
    {
      key: 'az',
      label: 'Availability Zone',
      type: 'select',
      options: ['us-east-1a', 'us-east-1b', 'us-east-1c', 'us-west-2a', 'us-west-2b', 'eu-west-1a'],
    },
  ],
  cloudfront: [
    { key: 'dataTransferOutGb', label: 'Data Transfer Out (GB)', type: 'number' },
    { key: 'requestsMillions', label: 'HTTPS Requests (millions)', type: 'number' },
    { key: 'wafEnabled', label: 'Enable AWS WAF', type: 'checkbox' },
  ],
  ec2: [
    {
      key: 'instanceType',
      label: 'Instance Type',
      type: 'select',
      options: ['t3.micro', 't3.small', 't3.medium', 't3.large', 'm6i.large', 'm6i.xlarge', 'c6i.large'],
    },
    { key: 'count', label: 'Instance Count', type: 'number', step: 1 },
    { key: 'os', label: 'Operating System', type: 'select', options: ['Linux', 'Windows'] },
  ],
  lambda: [
    { key: 'memoryMb', label: 'Memory (MB)', type: 'number', step: 64 },
    { key: 'requestsMillions', label: 'Invocations (millions)', type: 'number' },
    { key: 'avgDurationMs', label: 'Avg Duration (ms)', type: 'number', step: 10 },
  ],
  rds: [
    { key: 'engine', label: 'Database Engine', type: 'select', options: ['PostgreSQL', 'MySQL', 'MariaDB'] },
    {
      key: 'instanceClass',
      label: 'Instance Class',
      type: 'select',
      options: ['db.t4g.micro', 'db.t4g.medium', 'db.m6i.large', 'db.r6g.large'],
    },
    { key: 'multiAz', label: 'Multi-AZ Deployment', type: 'checkbox' },
    { key: 'storageGb', label: 'Storage (GB)', type: 'number' },
  ],
  dynamodb: [
    { key: 'capacityMode', label: 'Capacity Mode', type: 'select', options: ['On-Demand', 'Provisioned'] },
    { key: 'readRequestsMillions', label: 'Read Requests (millions)', type: 'number' },
    { key: 'writeRequestsMillions', label: 'Write Requests (millions)', type: 'number' },
    { key: 'storageGb', label: 'Storage (GB)', type: 'number' },
  ],
  elasticache: [
    { key: 'engine', label: 'Engine', type: 'select', options: ['Valkey / Redis', 'Memcached'] },
    {
      key: 'nodeType',
      label: 'Node Type',
      type: 'select',
      options: ['cache.t4g.micro', 'cache.t4g.medium', 'cache.r6g.large'],
    },
    { key: 'numNodes', label: 'Number of Nodes', type: 'number', step: 1 },
  ],
  ebs: [
    { key: 'volumeType', label: 'Volume Type', type: 'select', options: ['gp3', 'io2', 'st1'] },
    { key: 'sizeGb', label: 'Volume Size (GB)', type: 'number' },
    { key: 'iops', label: 'Provisioned IOPS', type: 'number', step: 100 },
  ],
  s3: [
    { key: 'storageClass', label: 'Storage Class', type: 'select', options: ['Standard', 'Standard-IA'] },
    { key: 'storageGb', label: 'Stored Data (GB)', type: 'number' },
    { key: 'putRequestsThousands', label: 'PUT Requests (thousands)', type: 'number' },
  ],
  sqs: [
    { key: 'queueType', label: 'Queue Type', type: 'select', options: ['Standard', 'FIFO'] },
    { key: 'requestsMillions', label: 'Requests (millions)', type: 'number' },
  ],
};

const EDGE_PROTOCOLS = ['HTTPS', 'HTTP', 'TCP', 'UDP', 'S3 API', 'SQS'];

const SEVERITY_ICON: Record<LintSeverity, LucideIcon> = {
  critical: AlertOctagon,
  warning: AlertTriangle,
  info: Info,
};

const SEVERITY_STYLE: Record<LintSeverity, string> = {
  critical: 'border-red-500/40 bg-red-500/5 text-red-400',
  warning: 'border-amber-500/40 bg-amber-500/5 text-amber-400',
  info: 'border-sky-500/40 bg-sky-500/5 text-sky-400',
};

const fieldClass =
  'w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-500';

export default function InspectorPanel() {
  const selectedNodeId = useArchStore((s) => s.selectedNodeId);
  const selectedEdgeId = useArchStore((s) => s.selectedEdgeId);
  const nodes = useArchStore((s) => s.nodes);
  const edges = useArchStore((s) => s.edges);
  const region = useArchStore((s) => s.region);
  const securityGroups = useArchStore((s) => s.securityGroups);
  const updateNodeConfig = useArchStore((s) => s.updateNodeConfig);
  const updateNodeLabel = useArchStore((s) => s.updateNodeLabel);
  const toggleNodeSecurityGroup = useArchStore((s) => s.toggleNodeSecurityGroup);
  const updateEdgeData = useArchStore((s) => s.updateEdgeData);
  const setSelectedNode = useArchStore((s) => s.setSelectedNode);
  const setSelectedEdge = useArchStore((s) => s.setSelectedEdge);
  const { findings } = useArchitectureLint();

  const node = nodes.find((candidate) => candidate.id === selectedNodeId);
  const nodeFindings = node ? findings.filter((finding) => finding.targetId === node.id) : [];
  const edge = edges.find((candidate) => candidate.id === selectedEdgeId);
  const multiplier = AWS_REGIONS[region]?.multiplier ?? 1;

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-slate-800 bg-slate-950/90">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          <SlidersHorizontal size={13} /> Inspector
        </div>
        {(node || edge) && (
          <button
            type="button"
            onClick={() => {
              setSelectedNode(null);
              setSelectedEdge(null);
            }}
            className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
            aria-label="Clear selection"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {!node && !edge && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-800 bg-slate-900 text-slate-600">
            <Settings2 size={20} />
          </span>
          <p className="text-xs leading-relaxed text-slate-500">
            Select a node or connection on the canvas to edit its configuration.
          </p>
        </div>
      )}

      {node && (
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Display Name
            </label>
            <input
              className={fieldClass}
              value={node.data.label}
              onChange={(event) => updateNodeLabel(node.id, event.target.value)}
            />
            <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-500">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: AWS_CATALOG[node.data.serviceType].color }}
              />
              {AWS_CATALOG[node.data.serviceType].name}
              <span className="ml-auto font-mono">{node.id}</span>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              <Settings2 size={12} /> Configuration
            </div>
            <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
              {CONFIG_FIELDS[node.data.serviceType].map((field) => {
                const value = node.data.config[field.key];

                if (field.type === 'checkbox') {
                  return (
                    <label key={field.key} className="flex items-center justify-between gap-2 text-xs text-slate-300">
                      {field.label}
                      <input
                        type="checkbox"
                        checked={Boolean(value)}
                        onChange={(event) => updateNodeConfig(node.id, { [field.key]: event.target.checked })}
                        className="h-4 w-4 accent-sky-500"
                      />
                    </label>
                  );
                }

                if (field.type === 'select') {
                  return (
                    <label key={field.key} className="block">
                      <span className="mb-1 block text-[10px] text-slate-500">{field.label}</span>
                      <select
                        className={fieldClass}
                        value={String(value ?? '')}
                        onChange={(event) => updateNodeConfig(node.id, { [field.key]: event.target.value })}
                      >
                        {field.options?.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                }

                return (
                  <label key={field.key} className="block">
                    <span className="mb-1 block text-[10px] text-slate-500">{field.label}</span>
                    <input
                      className={fieldClass}
                      type={field.type === 'number' ? 'number' : 'text'}
                      step={field.step}
                      value={value ?? ''}
                      onChange={(event) =>
                        updateNodeConfig(node.id, {
                          [field.key]: field.type === 'number' ? Number(event.target.value) : event.target.value,
                        })
                      }
                    />
                  </label>
                );
              })}
            </div>
          </div>

          {AWS_CATALOG[node.data.serviceType].supportsSecurityGroups && (
            <div>
              <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                <ShieldCheck size={12} /> Security Groups
              </div>
              <div className="space-y-1.5 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                {securityGroups.map((sg) => {
                  const checked = (node.data.securityGroupIds || []).includes(sg.id);
                  return (
                    <label
                      key={sg.id}
                      className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 hover:bg-slate-800/60"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleNodeSecurityGroup(node.id, sg.id)}
                        className="mt-0.5 h-3.5 w-3.5 accent-sky-500"
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-mono text-[11px] text-slate-200">{sg.name}</span>
                        <span className="block truncate text-[9px] text-slate-500">{sg.description}</span>
                      </span>
                    </label>
                  );
                })}
                {securityGroups.length === 0 && (
                  <p className="text-[10px] text-slate-500">No security groups defined yet.</p>
                )}
              </div>
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              <CircleDollarSign size={12} /> Cost Breakdown
            </div>
            <div className="space-y-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-[11px]">
              <div className="flex justify-between text-slate-400">
                <span>Base (us-east-1)</span>
                <span className="font-mono">${AWS_CATALOG[node.data.serviceType].calculateMonthlyCost(node.data.config).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Region multiplier ({region})</span>
                <span className="font-mono">×{multiplier.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-emerald-500/20 pt-2 font-semibold text-emerald-300">
                <span>Monthly</span>
                <span className="font-mono">
                  ${(AWS_CATALOG[node.data.serviceType].calculateMonthlyCost(node.data.config) * multiplier).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-emerald-400/80">
                <span>Annual</span>
                <span className="font-mono">
                  ${(AWS_CATALOG[node.data.serviceType].calculateMonthlyCost(node.data.config) * multiplier * 12).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              <ShieldCheck size={12} /> Well-Architected Advisor
            </div>
            {nodeFindings.length === 0 ? (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-300">
                <CircleCheck size={13} /> No issues detected for this resource
              </div>
            ) : (
              <div className="space-y-2">
                {nodeFindings.map((finding) => {
                  const Icon = SEVERITY_ICON[finding.severity];
                  return (
                    <div
                      key={finding.id}
                      className={`rounded-lg border p-2.5 ${SEVERITY_STYLE[finding.severity]}`}
                    >
                      <div className="flex items-start gap-2">
                        <Icon size={13} className="mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <div className="font-mono text-[9px] font-bold tracking-wide opacity-80">
                            [{finding.ruleId}] · {finding.pillar}
                          </div>
                          <div className="mt-0.5 text-[11px] font-semibold">{finding.title}</div>
                          <p className="mt-1 text-[10px] leading-relaxed text-slate-400">{finding.description}</p>
                          <div className="mt-2 rounded border border-white/10 bg-black/20 px-2 py-1 text-[10px] leading-relaxed text-slate-300">
                            <span className="font-semibold text-emerald-300">Fix:</span> {finding.remediation}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {edge && (
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-[11px] text-slate-400">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              <Activity size={12} /> Connection
            </div>
            {nodes.find((candidate) => candidate.id === edge.source)?.data.label || edge.source}
            <span className="mx-2 text-sky-400">→</span>
            {nodes.find((candidate) => candidate.id === edge.target)?.data.label || edge.target}
          </div>

          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Protocol</span>
            <select
              className={fieldClass}
              value={edge.data?.protocol || 'TCP'}
              onChange={(event) => updateEdgeData(edge.id, { protocol: event.target.value })}
            >
              {EDGE_PROTOCOLS.map((protocol) => (
                <option key={protocol} value={protocol}>
                  {protocol}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Port</span>
            <input
              className={fieldClass}
              value={edge.data?.port || ''}
              placeholder="443"
              onChange={(event) => updateEdgeData(edge.id, { port: event.target.value })}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Edge Label
            </span>
            <input
              className={fieldClass}
              value={edge.data?.label || ''}
              placeholder="e.g. HTTPS :443"
              onChange={(event) => updateEdgeData(edge.id, { label: event.target.value })}
            />
          </label>

          <p className="text-[10px] leading-relaxed text-slate-500">
            Changes are reflected immediately in the exported Mermaid diagram and Markdown specification.
          </p>
        </div>
      )}
    </aside>
  );
}
