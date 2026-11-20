import type { AppNode, AppEdge } from '../store/useArchStore';
import type { RouteTableEntry, SecurityGroup } from '../types/architecture';
import { findOverlappingSubnets, isSubnetContainedInVpc, parseCidr } from './cidrValidator';

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

  const getSubnetRoutes = (subnet: AppNode): RouteTableEntry[] =>
    Array.isArray(subnet.data.config.routeTable) ? subnet.data.config.routeTable : [];

  const hasDefaultRouteTo = (routes: RouteTableEntry[], target: string): boolean =>
    routes.some(
      (route) =>
        String(route?.destination ?? '').trim() === '0.0.0.0/0' &&
        String(route?.target ?? '').trim() === target
    );

  const getVpcSubnets = (vpcId: string): AppNode[] =>
    nodes.filter((node) => node.data.serviceType === 'subnet' && getAncestors(node).vpc?.id === vpcId);

  const hasIgwInVpc = (vpcId: string): boolean =>
    nodes.some((node) => node.data.serviceType === 'igw' && getAncestors(node).vpc?.id === vpcId);

  const hasGatewayEndpoint = (vpcId: string, targets: string[]): boolean =>
    nodes.some(
      (node) =>
        node.data.serviceType === 'vpce' &&
        getAncestors(node).vpc?.id === vpcId &&
        String(node.data.config.endpointType || '').startsWith('Gateway') &&
        targets.includes(String(node.data.config.targetService || ''))
    );

  // --- NET-01: overlapping sibling subnets (emitted once per pair) ---
  const subnetsByVpc = new Map<string, AppNode[]>();
  for (const node of nodes) {
    if (node.data.serviceType !== 'subnet') continue;
    const vpc = getAncestors(node).vpc;
    if (!vpc) continue;
    subnetsByVpc.set(vpc.id, [...(subnetsByVpc.get(vpc.id) ?? []), node]);
  }
  for (const [vpcId, subnets] of subnetsByVpc) {
    const vpc = nodeMap.get(vpcId);
    const overlaps = findOverlappingSubnets(
      subnets.map((subnet) => ({
        id: subnet.id,
        cidr: String(subnet.data.config.cidr || ''),
        label: subnet.data.label,
      }))
    );
    for (const overlap of overlaps) {
      findings.push({
        id: `${overlap.second.id}-cidr-overlap-${overlap.first.id}`,
        ruleId: 'NET-01',
        severity: 'critical',
        pillar: 'Reliability',
        title: 'Overlapping Subnet CIDRs in the same VPC',
        description: `"${overlap.second.label || overlap.second.id}" (${overlap.second.cidr}) overlaps "${overlap.first.label || overlap.first.id}" (${overlap.first.cidr}) inside VPC "${vpc?.data.label || vpcId}".`,
        remediation: 'Assign non-overlapping CIDR blocks that are each strictly contained in the VPC CIDR (e.g. 10.0.1.0/24 and 10.0.2.0/24).',
        targetId: overlap.second.id,
        targetName: overlap.second.label || overlap.second.id,
      });
    }
  }

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

    // RULE NET-01: Invalid / non-contained Subnet CIDR (Critical)
    if (serviceType === 'subnet') {
      const cidr = String(config.cidr || '');
      const vpcCidr = vpc ? String(vpc.data.config.cidr || '') : '';
      const routes = getSubnetRoutes(node);

      let title = '';
      let description = '';
      if (!parseCidr(cidr)) {
        title = 'Invalid Subnet CIDR block';
        description = `"${label}" has an invalid CIDR "${cidr || '(empty)'}"; expected an IPv4 block such as 10.0.1.0/24.`;
      } else if (!vpc) {
        title = 'Subnet is not attached to a VPC';
        description = `"${label}" has no parent VPC, so its CIDR cannot be validated against a VPC range.`;
      } else if (!isSubnetContainedInVpc(cidr, vpcCidr)) {
        title = 'Subnet CIDR falls outside its VPC';
        description = `"${label}" uses ${cidr}, which is not strictly contained inside VPC "${vpc.data.label}" (${vpcCidr}).`;
      }
      if (title) {
        findings.push({
          id: `${node.id}-invalid-cidr`,
          ruleId: 'NET-01',
          severity: 'critical',
          pillar: 'Reliability',
          title,
          description,
          remediation: 'Use a smaller CIDR block fully inside the VPC range (for example 10.0.1.0/24 inside 10.0.0.0/16).',
          targetId: node.id,
          targetName: label,
        });
      }

      // RULE NET-02: IGW default route without an Internet Gateway in the VPC (Critical)
      if (hasDefaultRouteTo(routes, 'igw') && (!vpc || !hasIgwInVpc(vpc.id))) {
        findings.push({
          id: `${node.id}-igw-route-without-igw`,
          ruleId: 'NET-02',
          severity: 'critical',
          pillar: 'Reliability',
          title: 'Default route targets a missing Internet Gateway',
          description: `"${label}" routes 0.0.0.0/0 to an Internet Gateway, but ${vpc ? `VPC "${vpc.data.label}" has no igw node` : 'it has no parent VPC'}.`,
          remediation: 'Add an Internet Gateway node inside the VPC and attach it, or change the default route to a NAT Gateway.',
          targetId: node.id,
          targetName: label,
        });
      }

      // RULE FIN-01: Paid NAT used for S3/DynamoDB without a free Gateway Endpoint (Info)
      if (
        config.tier === 'Private' &&
        hasDefaultRouteTo(routes, 'nat-gw') &&
        vpc &&
        Number(vpc.data.config.natGateways || 0) > 0 &&
        !hasGatewayEndpoint(vpc.id, ['s3', 'dynamodb'])
      ) {
        findings.push({
          id: `${node.id}-nat-without-gateway-endpoint`,
          ruleId: 'FIN-01',
          severity: 'info',
          pillar: 'Cost Optimization',
          title: 'S3/DynamoDB traffic billed through NAT Gateway',
          description: `"${label}" sends 0.0.0.0/0 traffic through a paid NAT Gateway, but VPC "${vpc.data.label}" has no free Gateway VPC Endpoint for S3 or DynamoDB.`,
          remediation: 'Add a Gateway (S3/DynamoDB) VPC Endpoint to the VPC so regional AWS API traffic bypasses NAT and its data-processing charges.',
          targetId: node.id,
          targetName: label,
        });
      }
    }

    // RULE NET-03: Internet-facing ALB placement / HA across AZs (Warning)
    if (serviceType === 'alb' && config.scheme === 'internet-facing') {
      const problems: string[] = [];
      if (!subnet || !hasDefaultRouteTo(getSubnetRoutes(subnet), 'igw')) {
        problems.push('it is not placed in a Subnet with a 0.0.0.0/0 → igw route');
      }
      if (!vpc) {
        problems.push('it is not enclosed in a VPC');
      } else {
        if (!hasIgwInVpc(vpc.id)) problems.push('its VPC has no Internet Gateway node');
        const azs = new Set(
          getVpcSubnets(vpc.id)
            .map((candidate) => String(candidate.data.config.az || '').trim())
            .filter(Boolean)
        );
        if (azs.size < 2) {
          problems.push(`its VPC has only ${azs.size} Availability Zone${azs.size === 1 ? '' : 's'} with subnets`);
        }
      }

      if (problems.length > 0) {
        findings.push({
          id: `${node.id}-alb-not-ha`,
          ruleId: 'NET-03',
          severity: 'warning',
          pillar: 'Reliability',
          title: 'Internet-facing ALB is not highly available',
          description: `"${label}" cannot serve internet traffic with high availability: ${problems.join('; ')}.`,
          remediation: 'Place the ALB in Public Subnets with an IGW route spanning at least two Availability Zones in the same VPC.',
          targetId: node.id,
          targetName: label,
        });
      }
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
