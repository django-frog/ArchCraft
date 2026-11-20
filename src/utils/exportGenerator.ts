import type { AppNode, AppEdge } from '../store/useArchStore';
import { AWS_CATALOG, AWS_REGIONS } from '../data/awsCatalog';
import { formatSyncedAt, getRegionRates } from '../data/pricingData';
import type { AwsPricesFile, SecurityGroup } from '../types/architecture';
import { runArchitectureLinter } from './architectureLinter';

const escapeCell = (value: string) => value.replace(/\|/g, '\\|').replace(/\n/g, ' ');

const sanitizeId = (id: string) => id.replace(/[^a-zA-Z0-9_]/g, '_');

export function generateMermaidDiagram(nodes: AppNode[], edges: AppEdge[]): string {
  const lines: string[] = ['flowchart LR'];

  const renderNodeLine = (node: AppNode, indent: string) => {
    const def = AWS_CATALOG[node.data.serviceType];
    const spec = def.getSpecSummary(node.data.config).replace(/"/g, "'");
    const sgs = node.data.securityGroupIds?.length ? `<br/>🛡️ ${node.data.securityGroupIds.join(', ')}` : '';
    lines.push(`${indent}${sanitizeId(node.id)}["<b>${node.data.label}</b><br/><i>${def.shortName}: ${spec}</i>${sgs}"]`);
  };

  const renderContainer = (container: AppNode, indent: string) => {
    const def = AWS_CATALOG[container.data.serviceType];
    const spec = def.getSpecSummary(container.data.config).replace(/"/g, "'");
    lines.push(`${indent}subgraph ${sanitizeId(container.id)}["${container.data.label} (${spec})"]`);
    lines.push(`${indent}  direction TB`);

    const children = nodes.filter((n) => n.parentId === container.id);
    for (const child of children) {
      if (AWS_CATALOG[child.data.serviceType].isContainer) {
        renderContainer(child, indent + '  ');
      } else {
        renderNodeLine(child, indent + '  ');
      }
    }
    lines.push(`${indent}end`);
  };

  const topLevelNodes = nodes.filter((n) => !n.parentId);
  for (const node of topLevelNodes) {
    if (AWS_CATALOG[node.data.serviceType].isContainer) {
      renderContainer(node, '  ');
    } else {
      renderNodeLine(node, '  ');
    }
  }

  lines.push('');
  for (const edge of edges) {
    const label = edge.data?.label || `${edge.data?.protocol || 'TCP'} :${edge.data?.port || '443'}`;
    lines.push(`  ${sanitizeId(edge.source)} -->|"${label}"| ${sanitizeId(edge.target)}`);
  }

  return lines.join('\n');
}

export function generateMarkdownSpec(params: {
  projectName: string;
  region: string;
  nodes: AppNode[];
  edges: AppEdge[];
  securityGroups: SecurityGroup[];
  prices: AwsPricesFile | null;
}): string {
  const { projectName, region, nodes, edges, securityGroups, prices } = params;
  const regionInfo = AWS_REGIONS[region] || { name: region };
  const rates = getRegionRates(region, prices);
  const mermaid = generateMermaidDiagram(nodes, edges);
  const findings = runArchitectureLinter(nodes, edges, securityGroups);
  const counts = findings.reduce(
    (acc, finding) => ({ ...acc, [finding.severity]: acc[finding.severity] + 1 }),
    { critical: 0, warning: 0, info: 0 }
  );
  const score = Math.max(0, Math.min(100, 100 - counts.critical * 20 - counts.warning * 8 - counts.info * 2));

  let totalMonthly = 0;
  const itemizedSections: string[] = [];
  const bomRows = nodes.map((node) => {
    const def = AWS_CATALOG[node.data.serviceType];
    const estimate = def.calculateMonthlyCost(node.data.config, rates);
    totalMonthly += estimate.monthly;
    const parent = nodes.find((p) => p.id === node.parentId);
    const placement = parent ? parent.data.label : 'Global / Edge';
    const sgs = node.data.securityGroupIds?.length ? node.data.securityGroupIds.join(', ') : '—';
    itemizedSections.push(
      [
        `#### ${node.data.label}`,
        ...estimate.lineItems.map((item) => `- ${escapeCell(item.label)} — $${item.amount.toFixed(2)}`),
        `- **Subtotal:** $${estimate.monthly.toFixed(2)}`,
      ].join('\n')
    );
    return `| **${node.data.label}** | ${def.shortName} | ${placement} | ${def.getSpecSummary(node.data.config)} | ${sgs} | $${estimate.monthly.toFixed(2)} |`;
  });

  const sgSections = securityGroups
    .map((sg) => {
      const ruleRows = sg.rules.map(
        (r) => `| ${r.direction.toUpperCase()} | ${r.protocol} | ${r.portRange} | \`${r.sourceOrDest}\` | ${r.description} |`
      );
      return [
        `### \`${sg.name}\` — ${sg.description}`,
        '| Direction | Protocol | Ports | Source / Target | Purpose |',
        '| :--- | :--- | :--- | :--- | :--- |',
        ...(ruleRows.length ? ruleRows : ['| — | — | — | — | No rules defined |']),
      ].join('\n');
    })
    .join('\n\n');

  return [
    `# ${projectName}`,
    '',
    `- **Target Region:** \`${region}\` (${regionInfo.name})`,
    `- **Estimated Monthly Cost:** **$${totalMonthly.toFixed(2)} / mo** ($${(totalMonthly * 12).toFixed(2)} / yr)`,
    `- **AWS Rates • Synced ${formatSyncedAt(prices?.syncedAt)}**`,
    `- **Generated:** ${new Date().toISOString().split('T')[0]}`,
    '',
    '## 1. Architecture Topology',
    '',
    '```mermaid',
    mermaid,
    '```',
    '',
    '## 2. Bill of Materials & Cost Estimate',
    '',
    '| Resource | Service | Placement | Configuration | Security Groups | Est. Monthly |',
    '| :--- | :--- | :--- | :--- | :--- | ---: |',
    ...bomRows,
    `| **TOTAL** | | | | | **$${totalMonthly.toFixed(2)}** |`,
    '',
    ...(itemizedSections.length
      ? ['### Itemized AWS Billing Breakdown', '', ...itemizedSections, '']
      : []),
    '## 3. Security Groups & Firewall Matrix',
    '',
    sgSections,
    '',
    '## 4. Well-Architected Linter & Security Review',
    '',
    `- **Architecture Health Score:** **${score}/100**`,
    '',
    ...(findings.length > 0
      ? [
          '| Severity | Rule | Pillar | Resource | Finding & Remediation |',
          '| :--- | :--- | :--- | :--- | :--- |',
          ...findings.map(
            (finding) =>
              `| ${finding.severity.toUpperCase()} | ${escapeCell(finding.ruleId)} | ${escapeCell(finding.pillar)} | ${escapeCell(finding.targetName)} | **${escapeCell(finding.title)}** — ${escapeCell(finding.description)} **Fix:** ${escapeCell(finding.remediation)} |`
          ),
        ]
      : ['All checks passed — no Well-Architected issues detected.']),
  ].join('\n');
}
