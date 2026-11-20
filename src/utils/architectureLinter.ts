import type { AppNode, AppEdge } from '../store/useArchStore';
import type { SecurityGroup } from '../types/architecture';

export type LintSeverity = 'critical' | 'warning' | 'info';
export type WellArchitectedPillar = 'Security' | 'Reliability' | 'Cost Optimization' | 'Performance';

export interface LintFinding {
  id: string;
  ruleId: string;
  severity: LintSeverity;
  pillar: WellArchitectedPillar;
  title: string;
  description: string;
  remediation: string;
  targetId: string;       // Node ID or Security Group ID
  targetName: string;
}

export function runArchitectureLinter(
  nodes: AppNode[],
  edges: AppEdge[],
  securityGroups: SecurityGroup[]
): LintFinding[] {
  const findings: LintFinding[] = [];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Helper: Resolve ancestor Subnet and VPC for any node
  const getAncestors = (node: AppNode) => {
    let subnet: AppNode | undefined;
    let vpc: AppNode | undefined;
    let curr: AppNode | undefined = node;
    while (curr?.parentId) {
      const parent = nodeMap.get(curr.parentId);
      if (!parent) break;
      if (parent.data.serviceType === 'subnet') subnet = parent;
      if (parent.data.serviceType === 'vpc') vpc = parent;
      curr = parent;
    }
    return { subnet, vpc };
  };

  // --- NODE-LEVEL RULES ---
  for (const node of nodes) {
    const { serviceType, label, config, securityGroupIds = [] } = node.data;
    const { subnet, vpc } = getAncestors(node);

    // RULE SEC-01: Stateful Data Stores in Public Subnets (Critical)
    if ((serviceType === 'rds' || serviceType === 'elasticache') && subnet?.data.config.tier === 'Public') {
      findings.push({
        id: `${node.id}-public-db`,
        ruleId: 'SEC-01',
        severity: 'critical',
        pillar: 'Security',
        title: `${serviceType.toUpperCase()} placed inside a Public Subnet`,
        description: `"${label}" is inside "${subnet.data.label}" (Public tier), exposing database endpoints to internet-routable CIDR space.`,
        remediation: 'Move this resource into a Private Subnet with no direct Internet Gateway route.',
        targetId: node.id,
        targetName: label,
      });
    }

    // RULE SEC-02: VPC-bound resource outside any VPC (Warning)
    if (['ec2', 'rds', 'elasticache'].includes(serviceType) && !vpc) {
      findings.push({
        id: `${node.id}-no-vpc`,
        ruleId: 'SEC-02',
        severity: 'warning',
        pillar: 'Security',
        title: `${serviceType.toUpperCase()} is not enclosed in a VPC`,
        description: `"${label}" sits outside a VPC boundary on the canvas, making network isolation ambiguous.`,
        remediation: 'Drag this resource inside a VPC and appropriate Public/Private Subnet.',
        targetId: node.id,
        targetName: label,
      });
    }

    // RULE SEC-03: Missing Security Group attachment on VPC compute/data (Warning)
    if (['ec2', 'rds', 'elasticache'].includes(serviceType) && securityGroupIds.length === 0) {
      findings.push({
        id: `${node.id}-no-sg`,
        ruleId: 'SEC-03',
        severity: 'warning',
        pillar: 'Security',
        title: 'No Security Group attached',
        description: `"${label}" has no explicit stateful firewall rules attached.`,
        remediation: 'Attach a least-privilege Security Group in the Inspector panel.',
        targetId: node.id,
        targetName: label,
      });
    }

    // RULE REL-01: Single-AZ RDS Database (Warning)
    if (serviceType === 'rds' && !config.multiAz) {
      findings.push({
        id: `${node.id}-single-az-rds`,
        ruleId: 'REL-01',
        severity: 'warning',
        pillar: 'Reliability',
        title: 'RDS Multi-AZ failover is disabled',
        description: `"${label}" runs in a single Availability Zone; an AZ outage or maintenance event will cause downtime.`,
        remediation: 'Enable Multi-AZ deployment for synchronous standby replication and automatic failover.',
        targetId: node.id,
        targetName: label,
      });
    }

    // RULE REL-02: Single-instance EC2 Single Point of Failure (Info)
    if (serviceType === 'ec2' && Number(config.count || 1) === 1) {
      findings.push({
        id: `${node.id}-single-ec2`,
        ruleId: 'REL-02',
        severity: 'info',
        pillar: 'Reliability',
        title: 'Single EC2 instance (SPOF)',
        description: `"${label}" has an instance count of 1, creating a single point of failure.`,
        remediation: 'Scale to at least 2 instances across multiple Availability Zones behind a load balancer.',
        targetId: node.id,
        targetName: label,
      });
    }

    // RULE REL-03: VPC with Private Subnet but 0 NAT Gateways (Info)
    if (serviceType === 'vpc' && Number(config.natGateways || 0) === 0) {
      const hasPrivateSubnet = nodes.some(
        (child) => child.parentId === node.id && child.data.serviceType === 'subnet' && child.data.config.tier === 'Private'
      );
      if (hasPrivateSubnet) {
        findings.push({
          id: `${node.id}-no-nat`,
          ruleId: 'REL-03',
          severity: 'info',
          pillar: 'Reliability',
          title: 'Private Subnet without NAT Gateway',
          description: `"${label}" contains a Private Subnet but has 0 NAT Gateways configured; private workloads cannot pull OS patches or reach external APIs unless VPC Endpoints are used.`,
          remediation: 'Add a NAT Gateway (or configure AWS PrivateLink/VPC Endpoints) for outbound private traffic.',
          targetId: node.id,
          targetName: label,
        });
      }
    }

    // RULE COST-01: Unencrypted / High-traffic CloudFront without WAF or Standard S3 large archive (Info)
    if (serviceType === 's3' && config.storageClass === 'Standard' && Number(config.storageGb || 0) >= 1000) {
      findings.push({
        id: `${node.id}-s3-tiering`,
        ruleId: 'COST-01',
        severity: 'info',
        pillar: 'Cost Optimization',
        title: 'Large S3 bucket on Standard tier',
        description: `"${label}" stores ${config.storageGb} GB on S3 Standard (~$${(config.storageGb * 0.023).toFixed(2)}/mo).`,
        remediation: 'Consider S3 Intelligent-Tiering or Standard-IA for infrequently accessed data to cut storage spend by up to 45%.',
        targetId: node.id,
        targetName: label,
      });
    }

    // RULE SEC-04: Unencrypted HTTP traffic on external/public edges (Warning)
    const incomingEdges = edges.filter((e) => e.target === node.id);
    for (const edge of incomingEdges) {
      const sourceNode = nodeMap.get(edge.source);
      const isExternalSource = !sourceNode || !getAncestors(sourceNode).vpc;
      if (isExternalSource && edge.data?.protocol === 'HTTP') {
        findings.push({
          id: `${edge.id}-cleartext-http`,
          ruleId: 'SEC-04',
          severity: 'warning',
          pillar: 'Security',
          title: 'Cleartext HTTP ingress from outside VPC',
          description: `Traffic from "${sourceNode?.data.label || 'External'}" to "${label}" uses unencrypted HTTP.`,
          remediation: 'Enforce TLS (HTTPS :443) for all external ingress connections.',
          targetId: node.id,
          targetName: label,
        });
      }
    }
  }

  // --- SECURITY GROUP RULES ---
  const SENSITIVE_PORTS = ['22', '3389', '5432', '3306', '6379', '27017', 'ALL'];
  for (const sg of securityGroups) {
    for (const rule of sg.rules) {
      if (
        rule.direction === 'inbound' &&
        (rule.sourceOrDest === '0.0.0.0/0' || rule.sourceOrDest === '::/0') &&
        (SENSITIVE_PORTS.includes(rule.portRange.trim()) || rule.protocol === 'ALL')
      ) {
        findings.push({
          id: `${sg.id}-${rule.id}-open-world`,
          ruleId: 'SEC-05',
          severity: 'critical',
          pillar: 'Security',
          title: `Overly permissive SG rule (${rule.protocol} :${rule.portRange} open to 0.0.0.0/0)`,
          description: `Security Group "${sg.name}" allows unrestricted internet ingress on port ${rule.portRange}.`,
          remediation: 'Restrict source CIDR to a specific Bastion/VPN IP or reference an upstream Security Group ID (e.g., sg-app-private).',
          targetId: sg.id,
          targetName: sg.name,
        });
      }
    }
  }

  // Sort: critical -> warning -> info
  const order: Record<LintSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return findings.sort((a, b) => order[a.severity] - order[b.severity]);
}
