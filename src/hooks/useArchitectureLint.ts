import { useMemo } from 'react';
import { useArchStore } from '../store/useArchStore';
import {
  runArchitectureLinter,
  type LintFinding,
  type LintSeverity,
} from '../utils/architectureLinter';

export interface ArchitectureLintSummary {
  findings: LintFinding[];
  counts: Record<LintSeverity, number>;
  score: number;
}

export function useArchitectureLint(): ArchitectureLintSummary {
  const nodes = useArchStore((s) => s.nodes);
  const edges = useArchStore((s) => s.edges);
  const securityGroups = useArchStore((s) => s.securityGroups);

  const findings = useMemo(
    () => runArchitectureLinter(nodes, edges, securityGroups),
    [nodes, edges, securityGroups]
  );

  return useMemo(() => {
    const counts: Record<LintSeverity, number> = { critical: 0, warning: 0, info: 0 };
    for (const finding of findings) counts[finding.severity] += 1;

    const score = Math.max(
      0,
      Math.min(100, 100 - counts.critical * 20 - counts.warning * 8 - counts.info * 2)
    );

    return { findings, counts, score };
  }, [findings]);
}
