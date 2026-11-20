import { AlertOctagon, AlertTriangle, Info, type LucideIcon } from 'lucide-react';
import type { LintFinding, LintSeverity } from '../../utils/architectureLinter';

const SEVERITY_ICON: Record<LintSeverity, LucideIcon> = {
  critical: AlertOctagon,
  warning: AlertTriangle,
  info: Info,
};

const SEVERITY_CLASS: Record<LintSeverity, string> = {
  critical: 'border-red-500 bg-red-500/20 text-red-400 animate-pulse',
  warning: 'border-amber-500 bg-amber-500/20 text-amber-400',
  info: 'border-sky-500 bg-sky-500/20 text-sky-400',
};

export default function FindingBadge({ findings }: { findings: LintFinding[] }) {
  if (findings.length === 0) return null;

  const severity: LintSeverity = findings.some((finding) => finding.severity === 'critical')
    ? 'critical'
    : findings.some((finding) => finding.severity === 'warning')
      ? 'warning'
      : 'info';

  const Icon = SEVERITY_ICON[severity];

  return (
    <div
      title={findings.map((finding) => `[${finding.ruleId}] ${finding.title}`).join('\n')}
      className={`absolute -right-2 -top-2 z-20 flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-full border px-1 text-[10px] font-bold shadow-lg ${SEVERITY_CLASS[severity]}`}
    >
      <Icon size={12} />
      {findings.length}
    </div>
  );
}
