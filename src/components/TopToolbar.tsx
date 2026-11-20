import { useState } from 'react';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  CircleCheck,
  CircleDollarSign,
  FileText,
  Scan,
  Share2,
  ShieldCheck,
  Upload,
  Waypoints,
} from 'lucide-react';
import { AWS_REGIONS } from '../data/awsCatalog';
import { useArchitectureLint } from '../hooks/useArchitectureLint';
import { useArchStore } from '../store/useArchStore';
import ImportModal from './ImportModal';
import ShareModal from './ShareModal';

interface TopToolbarProps {
  onOpenSecurityGroups: () => void;
  onOpenExport: () => void;
  onOpenAdvisor: () => void;
  onToggleFocus: () => void;
}

export default function TopToolbar({ onOpenSecurityGroups, onOpenExport, onOpenAdvisor, onToggleFocus }: TopToolbarProps) {
  const projectName = useArchStore((s) => s.projectName);
  const setProjectName = useArchStore((s) => s.setProjectName);
  const region = useArchStore((s) => s.region);
  const setRegion = useArchStore((s) => s.setRegion);
  const monthlyCost = useArchStore((s) => s.getTotalMonthlyCost());
  const { counts, score } = useArchitectureLint();
  const [importOpen, setImportOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const healthStyle =
    counts.critical > 0
      ? 'border-red-500/40 bg-red-500/5 text-red-400'
      : counts.warning > 0
        ? 'border-amber-500/40 bg-amber-500/5 text-amber-400'
        : 'border-emerald-500/40 bg-emerald-500/5 text-emerald-400';
  const HealthIcon = counts.critical > 0 ? AlertOctagon : counts.warning > 0 ? AlertTriangle : CircleCheck;
  const healthLabel =
    counts.critical + counts.warning + counts.info === 0
      ? 'Healthy'
      : `${counts.critical} Critical • ${counts.warning} Warnings${counts.info > 0 ? ` • ${counts.info} Info` : ''}`;

  return (
    <>
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-800 bg-slate-950 px-4 py-2.5">
      <div className="flex items-center gap-2 text-sky-400">
        <Waypoints size={20} />
        <span className="text-sm font-bold tracking-tight text-slate-100">
          AWS <span className="text-sky-400">ArchCraft</span>
        </span>
      </div>

      <div className="h-6 w-px bg-slate-800" />

      <input
        value={projectName}
        onChange={(event) => setProjectName(event.target.value)}
        className="w-64 rounded-md border border-transparent bg-transparent px-2 py-1 text-xs font-medium text-slate-200 outline-none hover:border-slate-700 focus:border-sky-500 focus:bg-slate-900"
        aria-label="Project name"
      />

      <label className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-slate-500">
        Region
        <select
          value={region}
          onChange={(event) => setRegion(event.target.value)}
          className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs normal-case text-slate-200 outline-none focus:border-sky-500"
        >
          {Object.entries(AWS_REGIONS).map(([key, info]) => (
            <option key={key} value={key}>
              {info.name} ({key}) · ×{info.multiplier.toFixed(2)}
            </option>
          ))}
        </select>
      </label>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenAdvisor}
          className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-left transition-colors hover:brightness-125 ${healthStyle}`}
          title="Open Well-Architected Advisor"
        >
          <HealthIcon size={15} />
          <span className="leading-tight">
            <span className="block font-mono text-xs font-semibold">Score: {score}/100</span>
            <span className="block text-[9px] opacity-80">{healthLabel}</span>
          </span>
        </button>

        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5">
          <CircleDollarSign size={15} className="text-emerald-400" />
          <div className="leading-tight">
            <div className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-emerald-500/80">
              <Activity size={9} /> Estimated spend
            </div>
            <div className="flex items-baseline gap-2 font-mono text-xs font-semibold text-emerald-300">
              ${monthlyCost.toFixed(2)}<span className="text-[9px] font-normal text-emerald-500/70">/mo</span>
              <span className="text-[10px] font-normal text-slate-400">${(monthlyCost * 12).toFixed(2)}/yr</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onToggleFocus}
          className="flex items-center gap-1.5 rounded-md border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-xs text-violet-200 hover:border-violet-400/70 hover:bg-violet-500/20"
          title="Focus Mode: hide all panels for a clean screenshot (Esc to exit)"
        >
          <Scan size={14} /> Focus Mode
        </button>

        <button
          type="button"
          onClick={onOpenSecurityGroups}
          className="flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 hover:border-sky-500/60 hover:bg-slate-800"
        >
          <ShieldCheck size={14} /> Security Groups
        </button>

        <button
          type="button"
          onClick={() => setImportOpen(true)}
          className="flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 hover:border-sky-500/60 hover:bg-slate-800"
          title="Import a .archcraft.json project"
        >
          <Upload size={14} /> Import
        </button>

        <button
          type="button"
          onClick={() => setShareOpen(true)}
          className="flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 hover:border-sky-500/60 hover:bg-slate-800"
          title="Copy a zero-backend share link for this architecture"
        >
          <Share2 size={14} /> Share
        </button>

        <button
          type="button"
          onClick={onOpenExport}
          className="flex items-center gap-1.5 rounded-md bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-500"
          title="Quick save as .archcraft.json"
        >
          <FileText size={14} /> Export Spec
        </button>
      </div>
      </header>

      {importOpen && <ImportModal onClose={() => setImportOpen(false)} />}
      {shareOpen && <ShareModal onClose={() => setShareOpen(false)} />}
    </>
  );
}
