import { memo } from 'react';
import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react';
import { Boxes, Globe, Layers2, MapPin, Route } from 'lucide-react';
import { AWS_CATALOG } from '../../data/awsCatalog';
import { useArchitectureLint } from '../../hooks/useArchitectureLint';
import { type AppNode, useArchStore } from '../../store/useArchStore';
import type { RouteTableEntry } from '../../types/architecture';
import FindingBadge from './FindingBadge';

const ContainerNode = memo(({ id, data, selected }: NodeProps<AppNode>) => {
  const selectNode = useArchStore((s) => s.setSelectedNode);
  const { findings } = useArchitectureLint();
  const nodeFindings = findings.filter((finding) => finding.targetId === id);

  const def = AWS_CATALOG[data.serviceType];

  const isVpc = data.serviceType === 'vpc';
  const tier = String(data.config.tier || 'Private');
  const isPublic = tier === 'Public';

  const routes: RouteTableEntry[] = Array.isArray(data.config.routeTable) ? data.config.routeTable : [];
  const defaultRoute = routes.find((route) => String(route?.destination ?? '').trim() === '0.0.0.0/0');
  const defaultRouteTarget = String(defaultRoute?.target ?? '');
  const defaultRouteLabel = defaultRoute
    ? `0.0.0.0/0 → ${defaultRouteTarget || '—'}`
    : 'no default route';

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
        minWidth={isVpc ? 420 : 320}
        minHeight={isVpc ? 320 : 240}
        isVisible={selected}
        color={accent}
        handleStyle={{
          width: 12,
          height: 12,
          borderRadius: 3,
          border: `2px solid ${accent}`,
          background: '#0f172a',
        }}
        lineStyle={{ borderColor: accent, borderWidth: 1.5 }}
      />

      <div className={`border-b border-white/5 px-3 py-2.5 ${headerBg}`}>
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
            style={{ backgroundColor: `${def.color}22`, color: def.color }}
          >
            {isVpc ? <Boxes size={15} /> : <Layers2 size={15} />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold leading-tight text-slate-100">{data.label}</div>
                <div className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-400">
                  {isVpc ? 'Virtual Private Cloud' : `${tier} Subnet`}
                </div>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {isVpc ? (
                <>
                  <span className="rounded-md border border-violet-400/30 bg-violet-500/15 px-1.5 py-0.5 font-mono text-[10px] text-violet-200">
                    CIDR {String(data.config.cidr || '—')}
                  </span>
                  <span className="flex items-center gap-1 rounded-md border border-violet-400/30 bg-violet-500/15 px-1.5 py-0.5 text-[10px] text-violet-200">
                    <Route size={10} /> {Number(data.config.natGateways || 0)} NAT GW
                  </span>
                </>
              ) : (
                <>
                  <span className="rounded-md border border-white/10 bg-slate-950/40 px-1.5 py-0.5 font-mono text-[10px] text-slate-200">
                    {String(data.config.cidr || '—')}
                  </span>
                  <span className="flex items-center gap-1 rounded-md border border-white/10 bg-slate-950/40 px-1.5 py-0.5 text-[10px] text-slate-200">
                    <MapPin size={10} /> {String(data.config.az || '—')}
                  </span>
                  {Boolean(data.config.mapPublicIpOnLaunch) && (
                    <span
                      className="flex items-center gap-1 rounded-md border border-cyan-400/25 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] text-cyan-200"
                      title="Map public IP on launch"
                    >
                      <Globe size={10} /> Auto public IP
                    </span>
                  )}
                  <span
                    className={`flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] ${
                      defaultRouteTarget === 'igw'
                        ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-200'
                        : defaultRouteTarget === 'nat-gw'
                          ? 'border-amber-400/30 bg-amber-500/10 text-amber-200'
                          : 'border-white/10 bg-slate-950/40 text-slate-200'
                    }`}
                    title="Primary default route"
                  >
                    <Route size={10} />
                    <span className="truncate">{defaultRouteLabel}</span>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <Handle
        id="container-top"
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-slate-900 !bg-slate-500 opacity-0"
      />
      <Handle
        id="container-bottom"
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !border-2 !border-slate-900 !bg-slate-500 opacity-0"
      />
    </div>
  );
});

ContainerNode.displayName = 'ContainerNode';

export default ContainerNode;
