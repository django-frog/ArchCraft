import { useEffect } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ChevronRight,
  CircleCheck,
  Gauge,
  Info,
  ShieldAlert,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useReactFlow } from '@xyflow/react';
import { useArchitectureLint } from '../hooks/useArchitectureLint';
import { type AppEdge, type AppNode, useArchStore } from '../store/useArchStore';
import type { LintFinding, LintSeverity, WellArchitectedPillar } from '../utils/architectureLinter';

const PILLARS: WellArchitectedPillar[] = [
  'Security',
  'Reliability',
  'Cost Optimization',
  'Performance',
];

const SEVERITY_ICON: Record<LintSeverity, LucideIcon> = {
  critical: AlertOctagon,
  warning: AlertTriangle,
  info: Info,
};

const SEVERITY_PILL: Record<LintSeverity, string> = {
  critical: 'border-red-500/40 bg-red-500/10 text-red-400',
  warning: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
  info: 'border-sky-500/40 bg-sky-500/10 text-sky-400',
};

const SEVERITY_CARD: Record<LintSeverity, string> = {
  critical: 'border-red-500/30 bg-red-500/5 hover:border-red-400/60',
  warning: 'border-amber-500/30 bg-amber-500/5 hover:border-amber-400/60',
  info: 'border-sky-500/30 bg-sky-500/5 hover:border-sky-400/60',
};

interface AdvisorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSecurityGroups: () => void;
}

export default function AdvisorDrawer({ isOpen, onClose, onOpenSecurityGroups }: AdvisorDrawerProps) {
  const { findings, counts, score } = useArchitectureLint();
  const nodes = useArchStore((s) => s.nodes);
  const securityGroups = useArchStore((s) => s.securityGroups);
  const setSelectedNode = useArchStore((s) => s.setSelectedNode);
  const reactFlow = useReactFlow<AppNode, AppEdge>();

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const handleFindingClick = (finding: LintFinding) => {
    const node = nodes.find((candidate) => candidate.id === finding.targetId);
    if (node) {
      setSelectedNode(finding.targetId);
      void reactFlow.fitView({ nodes: [{ id: finding.targetId }], duration: 400, padding: 0.4 });
      onClose();
      return;
    }

    if (securityGroups.some((group) => group.id === finding.targetId)) {
      onOpenSecurityGroups();
      onClose();
    }
  };

  const scoreColor = counts.critical > 0 ? 'text-red-400' : counts.warning > 0 ? 'text-amber-400' : 'text-emerald-400';

  return (
    <div className={`fixed inset-0 z-40 ${isOpen ? '' : 'pointer-events-none'}`} aria-hidden={!isOpen}>
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-[1px] transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />

      <aside
        className={`absolute right-0 top-0 flex h-full w-[420px] max-w-full flex-col border-l border-slate-800 bg-slate-950 shadow-2xl transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-start justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldAlert size={16} className="text-sky-400" />
              <h2 className="text-sm font-semibold text-slate-100">Well-Architected Advisor</h2>
            </div>
            <p className="mt-1 text-[10px] text-slate-500">Live review of the current canvas</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
            aria-label="Close advisor"
          >
            <X size={16} />
          </button>
        </div>

        <div className="border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-4">
            <div className={`flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full border-2 ${scoreColor} border-current bg-slate-900`}>
              <span className="font-mono text-xl font-bold leading-none">{score}</span>
              <span className="text-[8px] uppercase tracking-wide opacity-70">score</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <Gauge size={12} /> Architecture Health
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] ${SEVERITY_PILL.critical}`}>
                  {counts.critical} Critical
                </span>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] ${SEVERITY_PILL.warning}`}>
                  {counts.warning} Warnings
                </span>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] ${SEVERITY_PILL.info}`}>
                  {counts.info} Info
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          {findings.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-10 text-center">
              <CircleCheck size={24} className="text-emerald-400" />
              <p className="text-xs font-medium text-emerald-300">All checks passed</p>
              <p className="text-[10px] text-slate-500">No Well-Architected issues detected.</p>
            </div>
          )}

          {PILLARS.map((pillar) => {
            const pillarFindings = findings.filter((finding) => finding.pillar === pillar);
            if (pillarFindings.length === 0) return null;

            return (
              <section key={pillar}>
                <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {pillar}
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-slate-400">
                    {pillarFindings.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {pillarFindings.map((finding) => {
                    const Icon = SEVERITY_ICON[finding.severity];
                    return (
                      <button
                        key={finding.id}
                        type="button"
                        onClick={() => handleFindingClick(finding)}
                        className={`w-full rounded-lg border p-3 text-left transition-colors ${SEVERITY_CARD[finding.severity]}`}
                      >
                        <div className="flex items-start gap-2">
                          <Icon size={14} className={`mt-0.5 shrink-0 ${SEVERITY_PILL[finding.severity].split(' ').at(-1)}`} />
                          <div className="min-w-0 flex-1">
                            <div className="font-mono text-[9px] font-bold text-slate-500">{finding.ruleId}</div>
                            <div className="mt-0.5 text-[11px] font-semibold text-slate-100">{finding.title}</div>
                            <p className="mt-1 text-[10px] leading-relaxed text-slate-400">{finding.description}</p>
                            <div className="mt-2 rounded border border-white/10 bg-black/20 px-2 py-1 text-[10px] leading-relaxed text-slate-300">
                              <span className="font-semibold text-emerald-300">Fix:</span> {finding.remediation}
                            </div>
                            <div className="mt-2 flex items-center gap-1 text-[9px] text-slate-500">
                              {securityGroups.some((group) => group.id === finding.targetId)
                                ? 'Edit security group'
                                : 'Focus resource'}
                              <ChevronRight size={10} />
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
