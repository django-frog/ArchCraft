import { useMemo } from 'react';
import { CircleDollarSign, Settings2, ShieldCheck, SlidersHorizontal, X } from 'lucide-react';
import { AWS_CATALOG } from '../data/awsCatalog';
import { getRegionRates } from '../data/pricingData';
import { useArchitectureLint } from '../hooks/useArchitectureLint';
import { useArchStore } from '../store/useArchStore';
import EdgeInspector from './inspector/EdgeInspector';
import NodeAdvisorSection from './inspector/NodeAdvisorSection';
import NodeConfigFields from './inspector/NodeConfigFields';

export default function InspectorPanel() {
  const selectedNodeId = useArchStore((s) => s.selectedNodeId);
  const selectedEdgeId = useArchStore((s) => s.selectedEdgeId);
  const nodes = useArchStore((s) => s.nodes);
  const edges = useArchStore((s) => s.edges);
  const region = useArchStore((s) => s.region);
  const prices = useArchStore((s) => s.prices);
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
  const rates = useMemo(() => getRegionRates(region, prices), [region, prices]);
  const estimate = useMemo(
    () => (node ? AWS_CATALOG[node.data.serviceType].calculateMonthlyCost(node.data.config, rates) : null),
    [node, rates]
  );

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
          <NodeConfigFields
            node={node}
            onUpdateConfig={updateNodeConfig}
            onUpdateLabel={updateNodeLabel}
          />

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
              {estimate?.lineItems.map((item, index) => (
                <div key={index} className="flex justify-between gap-3 text-slate-400">
                  <span className="min-w-0 truncate" title={item.label}>
                    {item.label}
                  </span>
                  <span className="shrink-0 font-mono">${item.amount.toFixed(2)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-emerald-500/20 pt-2 font-semibold text-emerald-300">
                <span>Monthly ({region})</span>
                <span className="font-mono">${(estimate?.monthly ?? 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-emerald-400/80">
                <span>Annual</span>
                <span className="font-mono">${((estimate?.monthly ?? 0) * 12).toFixed(2)}</span>
              </div>
            </div>
          </div>

          <NodeAdvisorSection findings={nodeFindings} />
        </div>
      )}

      {edge && <EdgeInspector edge={edge} nodes={nodes} onUpdate={updateEdgeData} />}
    </aside>
  );
}
