import type { RouteTableEntry } from '../types/architecture';

/**
 * Zero-dependency IPv4 CIDR helpers for VPC/Subnet design.
 *
 * AWS reserves 5 addresses in every subnet: the network address, the
 * broadcast address, and the first three addresses after the network
 * address (VPC router, DNS, and future use). This module reports the
 * remaining, actually assignable address count.
 */

export interface CidrBlock {
  /** Canonical CIDR (host bits cleared), e.g. `10.0.1.0/24`. */
  cidr: string;
  prefix: number;
  networkAddress: string;
  broadcastAddress: string;
  /** Unsigned 32-bit representations, used for containment/overlap math. */
  networkValue: number;
  broadcastValue: number;
  totalAddresses: number;
  usableAwsIps: number;
}

export interface CidrParseResult {
  valid: boolean;
  error: string | null;
  block: CidrBlock | null;
}

export interface SubnetCidrRef {
  id: string;
  cidr: string;
  label?: string;
}

export interface SubnetOverlap {
  first: SubnetCidrRef;
  second: SubnetCidrRef;
  cidr: string;
}

const CIDR_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/;
const AWS_RESERVED_IPS = 5;

const ipToString = (value: number): string =>
  [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join('.');

/** Parses a CIDR without throwing. Host bits are normalized away. */
export function validateCidr(input: string): CidrParseResult {
  const value = typeof input === 'string' ? input.trim() : '';
  const match = CIDR_PATTERN.exec(value);

  if (!match) {
    return {
      valid: false,
      error: 'Enter a valid IPv4 CIDR block, e.g. 10.0.1.0/24.',
      block: null,
    };
  }

  const octets = [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])];
  if (octets.some((octet) => octet > 255)) {
    return { valid: false, error: 'IPv4 octets must be between 0 and 255.', block: null };
  }

  const prefix = Number(match[5]);
  if (prefix > 32) {
    return { valid: false, error: 'CIDR prefix must be between 0 and 32.', block: null };
  }

  const ipValue = ((octets[0] * 256 + octets[1]) * 256 + octets[2]) * 256 + octets[3];
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const networkValue = (ipValue & mask) >>> 0;
  const totalAddresses = 2 ** (32 - prefix);
  const broadcastValue = networkValue + totalAddresses - 1;
  const networkAddress = ipToString(networkValue);

  return {
    valid: true,
    error: null,
    block: {
      cidr: `${networkAddress}/${prefix}`,
      prefix,
      networkAddress,
      broadcastAddress: ipToString(broadcastValue),
      networkValue,
      broadcastValue,
      totalAddresses,
      usableAwsIps: Math.max(0, totalAddresses - AWS_RESERVED_IPS),
    },
  };
}

/** Convenience wrapper for callers that only need the parsed block. */
export function parseCidr(input: string): CidrBlock | null {
  return validateCidr(input).block;
}

export function isValidCidr(input: string): boolean {
  return parseCidr(input) !== null;
}

/** AWS-usable addresses (0 when the CIDR is invalid or too small). */
export function getUsableAwsIps(input: string): number {
  return parseCidr(input)?.usableAwsIps ?? 0;
}

export function formatUsableIpCount(input: string): string {
  const block = parseCidr(input);
  if (!block) return 'Invalid CIDR';
  return `${block.usableAwsIps.toLocaleString('en-US')} usable AWS IPs`;
}

/**
 * A subnet must be fully AND strictly inside its VPC: same or wider ranges
 * (including an identical CIDR) are not accepted.
 */
export function isSubnetContainedInVpc(subnetCidr: string, vpcCidr: string): boolean {
  const subnet = parseCidr(subnetCidr);
  const vpc = parseCidr(vpcCidr);
  if (!subnet || !vpc) return false;
  return (
    subnet.prefix > vpc.prefix &&
    subnet.networkValue >= vpc.networkValue &&
    subnet.broadcastValue <= vpc.broadcastValue
  );
}

export function cidrsOverlap(first: string, second: string): boolean {
  const a = parseCidr(first);
  const b = parseCidr(second);
  if (!a || !b) return false;
  return a.networkValue <= b.broadcastValue && b.networkValue <= a.broadcastValue;
}

/** Returns one finding per overlapping pair, in input order. */
export function findOverlappingSubnets(subnets: SubnetCidrRef[]): SubnetOverlap[] {
  const overlaps: SubnetOverlap[] = [];
  for (let i = 0; i < subnets.length; i += 1) {
    for (let j = i + 1; j < subnets.length; j += 1) {
      const first = subnets[i];
      const second = subnets[j];
      if (cidrsOverlap(first.cidr, second.cidr)) {
        overlaps.push({
          first,
          second,
          cidr: parseCidr(second.cidr)?.cidr ?? second.cidr,
        });
      }
    }
  }
  return overlaps;
}

/** Inline-friendly messages for the inspector. Empty array means valid. */
export function getSubnetCidrErrors(
  subnetCidr: string,
  vpcCidr: string | null,
  siblings: SubnetCidrRef[]
): string[] {
  const parsed = validateCidr(subnetCidr);
  if (!parsed.valid) return [parsed.error ?? 'Invalid CIDR.'];

  const errors: string[] = [];
  if (vpcCidr) {
    if (!isValidCidr(vpcCidr)) {
      errors.push(`Parent VPC CIDR "${vpcCidr}" is invalid.`);
    } else if (!isSubnetContainedInVpc(subnetCidr, vpcCidr)) {
      errors.push(`Subnet CIDR must be strictly inside the VPC CIDR ${vpcCidr}.`);
    }
  }

  for (const sibling of siblings) {
    if (cidrsOverlap(subnetCidr, sibling.cidr)) {
      errors.push(`Overlaps ${sibling.label || sibling.id} (${sibling.cidr}).`);
    }
  }
  return errors;
}

/** Route tables start with the VPC local route plus the tier's default route. */
export function createDefaultRouteTable(
  tier: 'Public' | 'Private',
  vpcCidr = '10.0.0.0/16'
): RouteTableEntry[] {
  return [
    { destination: vpcCidr || '10.0.0.0/16', target: 'local' },
    { destination: '0.0.0.0/0', target: tier === 'Public' ? 'igw' : 'nat-gw' },
  ];
}
