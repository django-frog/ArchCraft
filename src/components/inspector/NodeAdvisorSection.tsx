import {
  AlertOctagon,
  AlertTriangle,
  CircleCheck,
  Info,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import type { LintFinding, LintSeverity } from '../../utils/architectureLinter';

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

interface NodeAdvisorSectionProps {
  findings: LintFinding[];
}

export default function NodeAdvisorSection({ findings }: NodeAdvisorSectionProps) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        <ShieldCheck size={12} /> Well-Architected Advisor
      </div>
      {findings.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-300">
          <CircleCheck size={13} /> No issues detected for this resource
        </div>
      ) : (
        <div className="space-y-2">
          {findings.map((finding) => {
            const Icon = SEVERITY_ICON[finding.severity];
            return (
              <div key={finding.id} className={`rounded-lg border p-2.5 ${SEVERITY_STYLE[finding.severity]}`}>
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
  );
}
