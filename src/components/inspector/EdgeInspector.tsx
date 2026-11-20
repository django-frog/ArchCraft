import { Activity } from 'lucide-react';
import type { AppEdge, AppNode } from '../../store/useArchStore';
import type { AwsEdgeData } from '../../types/architecture';

const EDGE_PROTOCOLS = ['HTTPS', 'HTTP', 'TCP', 'UDP', 'S3 API', 'SQS'];

const fieldClass =
  'w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-500';

interface EdgeInspectorProps {
  edge: AppEdge;
  nodes: AppNode[];
  onUpdate: (edgeId: string, dataPatch: Partial<AwsEdgeData>) => void;
}

export default function EdgeInspector({ edge, nodes, onUpdate }: EdgeInspectorProps) {
  return (
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
          onChange={(event) => onUpdate(edge.id, { protocol: event.target.value })}
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
          onChange={(event) => onUpdate(edge.id, { port: event.target.value })}
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
          onChange={(event) => onUpdate(edge.id, { label: event.target.value })}
        />
      </label>

      <p className="text-[10px] leading-relaxed text-slate-500">
        Changes are reflected immediately in the exported Mermaid diagram and Markdown specification.
      </p>
    </div>
  );
}
