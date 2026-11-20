import { memo, useMemo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  Cloud,
  Database,
  Globe,
  HardDrive,
  Layers2,
  MessageSquare,
  Network,
  Plug,
  Server,
  Shield,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { AWS_CATALOG } from '../../data/awsCatalog';
import { getRegionRates } from '../../data/pricingData';
import { useArchitectureLint } from '../../hooks/useArchitectureLint';
import { type AppNode, useArchStore } from '../../store/useArchStore';
import type { AwsServiceType } from '../../types/architecture';
import FindingBadge from './FindingBadge';

const SERVICE_ICONS: Record<AwsServiceType, LucideIcon> = {
  vpc: Layers2,
  subnet: Layers2,
  igw: Globe,
  alb: Network,
  vpce: Plug,
  ec2: Server,
  lambda: Zap,
  rds: Database,
  ebs: HardDrive,
  s3: Cloud,
  sqs: MessageSquare,
  elasticache: Layers2,
  cloudfront: Cloud,
  dynamodb: Database,
};

const HANDLES = [
  { id: 'top', position: Position.Top },
  { id: 'right', position: Position.Right },
  { id: 'bottom', position: Position.Bottom },
  { id: 'left', position: Position.Left },
];

const ServiceNode = memo(({ id, data, selected }: NodeProps<AppNode>) => {
  const region = useArchStore((s) => s.region);
  const prices = useArchStore((s) => s.prices);
  const securityGroups = useArchStore((s) => s.securityGroups);
  const updateNodeLabel = useArchStore((s) => s.updateNodeLabel);
  const { findings } = useArchitectureLint();
  const nodeFindings = findings.filter((finding) => finding.targetId === id);

  const def = AWS_CATALOG[data.serviceType];
  const Icon = SERVICE_ICONS[data.serviceType];
  const rates = useMemo(() => getRegionRates(region, prices), [region, prices]);
  const monthlyCost = def.calculateMonthlyCost(data.config, rates).monthly;
  const attachedGroups = (data.securityGroupIds || [])
    .map((sgId) => securityGroups.find((sg) => sg.id === sgId)?.name || sgId)
    .slice(0, 3);

  return (
    <div
      className={`group relative w-[196px] rounded-xl border bg-slate-900/95 shadow-lg shadow-black/30 transition-colors ${
        selected
          ? 'border-sky-400 ring-2 ring-sky-400/40'
          : 'border-slate-700/80 hover:border-slate-500'
      }`}
    >
      <FindingBadge findings={nodeFindings} />

      {HANDLES.map((handle) => (
        <Handle
          key={handle.id}
          id={handle.id}
          type="source"
          position={handle.position}
          className="!h-3 !w-3 !rounded-full !border-2 !border-slate-950 !bg-slate-500 transition-all hover:!h-3.5 hover:!w-3.5 hover:!bg-sky-400"
        />
      ))}

      <div className="flex items-center gap-2 border-b border-white/5 px-2.5 py-2">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: `${def.color}25`, color: def.color }}
        >
          <Icon size={15} />
        </span>
        <input
          className="nodrag min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-[12px] font-semibold text-slate-100 outline-none hover:border-slate-700 focus:border-sky-500/70 focus:bg-slate-950"
          value={data.label}
          onChange={(event) => updateNodeLabel(id, event.target.value)}
          aria-label="Node label"
        />
        <span
          className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
          style={{ backgroundColor: `${def.color}1f`, color: def.color }}
        >
          {def.shortName}
        </span>
      </div>

      <div className="px-2.5 py-2">
        <div className="truncate font-mono text-[10px] text-slate-400" title={def.getSpecSummary(data.config)}>
          {def.getSpecSummary(data.config)}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1">
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
            ${monthlyCost.toFixed(2)}/mo
          </span>
          {attachedGroups.map((name) => (
            <span
              key={name}
              className="flex items-center gap-0.5 rounded-full border border-sky-500/25 bg-sky-500/10 px-1.5 py-0.5 text-[9px] text-sky-300"
              title={name}
            >
              <Shield size={9} /> {name.length > 14 ? `${name.slice(0, 13)}…` : name}
            </span>
          ))}
          {attachedGroups.length === 0 && def.supportsSecurityGroups && (
            <span className="text-[9px] text-slate-600">no SG attached</span>
          )}
        </div>
      </div>
    </div>
  );
});

ServiceNode.displayName = 'ServiceNode';

export default ServiceNode;
