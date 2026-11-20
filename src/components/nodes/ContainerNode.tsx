import { memo } from 'react';
import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react';
import { Boxes, Globe, Layers2, MapPin, Route } from 'lucide-react';
import { AWS_CATALOG } from '../../data/awsCatalog';
import { useArchitectureLint } from '../../hooks/useArchitectureLint';
import { type AppNode, useArchStore } from '../../store/useArchStore';
import FindingBadge from './FindingBadge';

const ContainerNode = memo(({ id, data, selected }: NodeProps<AppNode>) => {
  const selectNode = useArchStore((s) => s.setSelectedNode);
  const { findings } = useArchitectureLint();
  const nodeFindings = findings.filter((finding) => finding.targetId === id);

  const def = AWS_CATALOG[data.serviceType];

  const isVpc = data.serviceType === 'vpc';
  const tier = String(data.config.tier || 'Private');
  const isPublic = tier === 'Public';

  const border = isVpc
    ? 'border-violet-500/70 border-dashed'
    : isPublic
      ? 'border-cyan-400/70'
      : 'border-amber-500/70';

  const headerBg = isVpc
    ? 'bg-violet-500/12'
    : isPublic
      ? 'bg-cyan-500/10'
      : 'bg-amber-500/10';

  const accent = isVpc ? '#a78bfa' : isPublic ? '#22d3ee' : '#fbbf24';
  const surface = isVpc
    ? 'rgba(76, 29, 149, 0.06)'
    : isPublic
      ? 'rgba(8, 145, 178, 0.05)'
      : 'rgba(180, 83, 9, 0.05)';

  return (
    <div
      className={`relative h-full w-full overflow-hidden rounded-xl border-2 ${border} ${
        selected ? 'ring-2 ring-sky-400/50 ring-offset-2 ring-offset-[#090d16]' : ''
      }`}
      style={{ backgroundColor: surface }}
      onDoubleClick={() => selectNode(id)}
    >
      <FindingBadge findings={nodeFindings} />

      <NodeResizer
        minWidth={200}
        minHeight={160}
        isVisible={selected}
        color={accent}
        handleStyle={{ width: 8, height: 8, borderRadius: 2, border: 'none', background: accent }}
        lineStyle={{ borderColor: accent }}
      />

      <div className={`flex items-start justify-between gap-2 border-b border-white/5 px-3 py-2 ${headerBg}`}>
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
            style={{ backgroundColor: `${def.color}22`, color: def.color }}
          >
            {isVpc ? <Boxes size={15} /> : <Layers2 size={15} />}
          </span>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-slate-100">{data.label}</div>
            <div className="truncate text-[10px] uppercase tracking-wider text-slate-400">
              {isVpc ? 'Virtual Private Cloud' : `${tier} Subnet`}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          {isVpc ? (
            <>
              <span className="rounded border border-violet-400/30 bg-violet-500/15 px-1.5 py-0.5 font-mono text-[10px] text-violet-200">
                {String(data.config.cidr || '—')}
              </span>
              <span className="flex items-center gap-1 rounded border border-violet-400/30 bg-violet-500/15 px-1.5 py-0.5 text-[10px] text-violet-200">
                <Route size={10} /> {Number(data.config.natGateways || 0)} NAT GW
              </span>
            </>
          ) : (
            <>
              <span className="rounded border border-white/10 bg-slate-900/50 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
                {String(data.config.cidr || '—')}
              </span>
              <span className="flex items-center gap-1 rounded border border-white/10 bg-slate-900/50 px-1.5 py-0.5 text-[10px] text-slate-300">
                <MapPin size={10} /> {String(data.config.az || '—')}
              </span>
              <span className="flex items-center gap-1 rounded px-1 py-0.5 text-[10px] text-slate-400">
                {isPublic ? <Globe size={10} /> : <Boxes size={10} />}
                {isPublic ? 'IGW' : 'Private'}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="px-3 py-2 text-[10px] text-slate-400">
        <span className="font-mono">{def.getSpecSummary(data.config)}</span>
      </div>

      <Handle
        id="container-top"
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !border !border-slate-900 !bg-slate-500 opacity-0"
      />
      <Handle
        id="container-bottom"
        type="source"
        position={Position.Bottom}
        className="!h-2 !w-2 !border !border-slate-900 !bg-slate-500 opacity-0"
      />
    </div>
  );
});

ContainerNode.displayName = 'ContainerNode';

export default ContainerNode;
