import { AlertOctagon, AlertTriangle, Info, type LucideIcon } from 'lucide-react';
import type { LintFinding, LintSeverity } from '../../utils/architectureLinter';

const SEVERITY_ICON: Record<LintSeverity, LucideIcon> = {
  critical: AlertOctagon,
  warning: AlertTriangle,
  info: Info,
};

const SEVERITY_CLASS: Record<LintSeverity, string> = {
  critical:
    'border-red-400/80 bg-red-950/90 text-red-100 shadow-[0_0_0_1px_rgba(248,113,113,0.25),0_6px_14px_rgba(127,29,29,0.45)]',
  warning:
    'border-amber-400/80 bg-amber-950/90 text-amber-100 shadow-[0_0_0_1px_rgba(251,191,36,0.2),0_6px_14px_rgba(120,53,15,0.4)]',
  info:
    'border-sky-400/80 bg-sky-950/90 text-sky-100 shadow-[0_0_0_1px_rgba(56,189,248,0.2),0_6px_14px_rgba(12,74,110,0.4)]',
};

const SEVERITY_LABEL: Record<LintSeverity, string> = {
  critical: 'Critical',
  warning: 'Warning',
  info: 'Info',
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
      title={findings.map((finding) => `[${finding.severity.toUpperCase()} ${finding.ruleId}] ${finding.title}`).join('\n')}
      className={`pointer-events-auto absolute right-2 top-2 z-30 flex h-7 min-w-7 items-center justify-center gap-1 rounded-lg border px-1.5 text-[11px] font-bold backdrop-blur-sm ${SEVERITY_CLASS[severity]}`}
      aria-label={`${findings.length} ${SEVERITY_LABEL[severity].toLowerCase()} finding${findings.length === 1 ? '' : 's'}`}
    >
      <Icon size={13} className="shrink-0" />
      <span className="leading-none tabular-nums">{findings.length}</span>
    </div>
  );
}
