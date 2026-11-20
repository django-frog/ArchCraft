import { useMemo } from 'react';
import { Plus, Settings2, Trash2 } from 'lucide-react';
import { AWS_CATALOG, getAvailabilityZones } from '../../data/awsCatalog';
import { getRegionRates } from '../../data/pricingData';
import { useArchStore, type AppNode } from '../../store/useArchStore';
import type { AwsServiceType, RouteTableEntry } from '../../types/architecture';
import {
  createDefaultRouteTable,
  formatUsableIpCount,
  getSubnetCidrErrors,
  type SubnetCidrRef,
} from '../../utils/cidrValidator';

type FieldType = 'text' | 'number' | 'select' | 'checkbox' | 'routes' | 'range';

interface ConfigField {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  step?: number;
  min?: number;
  max?: number;
}

const CONFIG_FIELDS: Record<AwsServiceType, ConfigField[]> = {
  vpc: [
    { key: 'cidr', label: 'CIDR Block', type: 'text' },
    { key: 'natGateways', label: 'NAT Gateways', type: 'number', step: 1 },
    { key: 'dataProcessedGb', label: 'NAT Data Processed (GB)', type: 'number' },
  ],
  subnet: [
    { key: 'tier', label: 'Tier', type: 'select', options: ['Public', 'Private'] },
    { key: 'cidr', label: 'CIDR Block', type: 'text' },
    { key: 'az', label: 'Availability Zone', type: 'select' },
    { key: 'mapPublicIpOnLaunch', label: 'Map Public IP on Launch', type: 'checkbox' },
    { key: 'routeTable', label: 'Route Table', type: 'routes' },
  ],
  igw: [],
  alb: [
    { key: 'scheme', label: 'Scheme', type: 'select', options: ['internet-facing', 'internal'] },
    { key: 'lcuEstimate', label: 'LCU Estimate', type: 'number', step: 1 },
    { key: 'dataProcessedGb', label: 'Data Processed (GB/mo)', type: 'number' },
  ],
  vpce: [
    {
      key: 'endpointType',
      label: 'Endpoint Type',
      type: 'select',
      options: ['Gateway (S3/DynamoDB)', 'Interface (PrivateLink)'],
    },
    {
      key: 'targetService',
      label: 'Target Service',
      type: 'select',
      options: ['s3', 'dynamodb', 'sqs', 'secretsmanager'],
    },
    { key: 'azCount', label: 'Availability Zones (interfaces)', type: 'number', step: 1 },
    { key: 'dataProcessedGb', label: 'Data Processed (GB/mo, interface)', type: 'number' },
  ],
  cloudfront: [
    { key: 'dataTransferOutGb', label: 'Data Transfer Out (GB)', type: 'number' },
    { key: 'requestsMillions', label: 'HTTPS Requests (millions)', type: 'number' },
    { key: 'wafEnabled', label: 'Enable AWS WAF', type: 'checkbox' },
  ],
  ec2: [
    {
      key: 'architecture',
      label: 'Architecture',
      type: 'select',
      options: ['x86_64', 'arm64'],
    },
    {
      key: 'instanceType',
      label: 'Instance Type',
      type: 'select',
      options: [
        't3.micro',
        't3.small',
        't3.medium',
        't3.large',
        't4g.medium',
        'm6i.large',
        'm6i.xlarge',
        'c6i.large',
      ],
    },
    {
      key: 'purchasingOption',
      label: 'Purchasing Option',
      type: 'select',
      options: ['On-Demand', '1-Yr Savings Plan (-28%)'],
    },
    { key: 'count', label: 'Instance Count', type: 'number', step: 1 },
    { key: 'os', label: 'Operating System', type: 'select', options: ['Linux', 'Windows'] },
    { key: 'rootVolumeGb', label: 'Root EBS Volume (GB, gp3)', type: 'number', step: 1 },
    { key: 'internetEgressGb', label: 'Internet Egress (GB/mo)', type: 'number' },
  ],
  lambda: [
    {
      key: 'architecture',
      label: 'Architecture',
      type: 'select',
      options: ['x86_64', 'arm64'],
    },
    { key: 'memoryMb', label: 'Memory (MB)', type: 'number', step: 64 },
    { key: 'ephemeralStorageMb', label: 'Ephemeral Storage (MB)', type: 'number', step: 64, min: 512, max: 10240 },
    { key: 'requestsMillions', label: 'Invocations (millions)', type: 'number' },
    { key: 'avgDurationMs', label: 'Avg Duration (ms)', type: 'number', step: 10 },
  ],
  rds: [
    { key: 'engine', label: 'Database Engine', type: 'select', options: ['PostgreSQL', 'MySQL', 'MariaDB'] },
    {
      key: 'instanceClass',
      label: 'Instance Class',
      type: 'select',
      options: ['db.t4g.micro', 'db.t4g.medium', 'db.m6i.large', 'db.r6g.large'],
    },
    {
      key: 'deploymentOption',
      label: 'Deployment Option',
      type: 'select',
      options: ['Single-AZ', 'Multi-AZ DB Instance (2x)', 'Multi-AZ DB Cluster (3x)'],
    },
    { key: 'storageType', label: 'Storage Type', type: 'select', options: ['gp3', 'io2'] },
    { key: 'storageGb', label: 'Allocated Storage (GB)', type: 'number' },
    { key: 'backupRetentionGb', label: 'Backup Storage (GB)', type: 'number' },
  ],
  dynamodb: [
    { key: 'capacityMode', label: 'Capacity Mode', type: 'select', options: ['On-Demand', 'Provisioned'] },
    { key: 'readRequestsMillions', label: 'Read Requests (millions)', type: 'number' },
    { key: 'writeRequestsMillions', label: 'Write Requests (millions)', type: 'number' },
    { key: 'storageGb', label: 'Storage (GB)', type: 'number' },
  ],
  elasticache: [
    { key: 'engine', label: 'Engine', type: 'select', options: ['Valkey / Redis', 'Memcached'] },
    {
      key: 'nodeType',
      label: 'Node Type',
      type: 'select',
      options: ['cache.t4g.micro', 'cache.t4g.medium', 'cache.r6g.large'],
    },
    { key: 'numNodes', label: 'Number of Nodes', type: 'number', step: 1 },
  ],
  ebs: [
    { key: 'volumeType', label: 'Volume Type', type: 'select', options: ['gp3', 'io2', 'st1'] },
    { key: 'sizeGb', label: 'Volume Size (GB)', type: 'number' },
    { key: 'iops', label: 'Provisioned IOPS', type: 'number', step: 100 },
    { key: 'throughputMbps', label: 'Throughput (MB/s)', type: 'range', step: 1, min: 125, max: 1000 },
  ],
  s3: [
    { key: 'storageClass', label: 'Storage Class', type: 'select', options: ['Standard', 'Standard-IA'] },
    { key: 'storageGb', label: 'Stored Data (GB)', type: 'number' },
    { key: 'putRequestsThousands', label: 'PUT Requests (thousands)', type: 'number' },
    { key: 'getRequestsThousands', label: 'GET/SELECT Requests (thousands)', type: 'number' },
    { key: 'internetEgressGb', label: 'Internet Egress (GB/mo)', type: 'number' },
  ],
  sqs: [
    { key: 'queueType', label: 'Queue Type', type: 'select', options: ['Standard', 'FIFO'] },
    { key: 'requestsMillions', label: 'Requests (millions)', type: 'number' },
  ],
};

const fieldClass =
  'w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-500';
const ROUTE_TARGETS = ['local', 'igw', 'nat-gw', 'vpce'];

function findParentVpc(nodes: AppNode[], nodeId: string): AppNode | undefined {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let current = byId.get(nodeId);
  const visited = new Set<string>();

  while (current?.parentId && !visited.has(current.parentId)) {
    visited.add(current.parentId);
    const parent = byId.get(current.parentId);
    if (!parent) return undefined;
    if (parent.data.serviceType === 'vpc') return parent;
    current = parent;
  }
  return undefined;
}

function normalizeRoutes(value: unknown): RouteTableEntry[] {
  if (!Array.isArray(value)) return createDefaultRouteTable('Public');
  return value
    .filter((route): route is Record<string, unknown> => typeof route === 'object' && route !== null)
    .map((route) => ({
      destination: String(route.destination ?? ''),
      target: String(route.target ?? 'igw'),
    }));
}

interface RouteTableEditorProps {
  routes: RouteTableEntry[];
  onChange: (routes: RouteTableEntry[]) => void;
}

function RouteTableEditor({ routes, onChange }: RouteTableEditorProps) {
  const updateRoute = (index: number, patch: Partial<RouteTableEntry>) =>
    onChange(routes.map((route, i) => (i === index ? { ...route, ...patch } : route)));

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[10px] text-slate-500">
        <span>Route Table</span>
        <button
          type="button"
          className="flex items-center gap-1 rounded border border-slate-700 px-1.5 py-0.5 text-sky-300 hover:border-sky-500"
          onClick={() => onChange([...routes, { destination: '', target: 'igw' }])}
        >
          <Plus size={10} /> Add route
        </button>
      </div>
      <div className="space-y-1.5">
        {routes.map((route, index) => (
          <div key={index} className="grid grid-cols-[minmax(0,1fr)_6.5rem_auto] items-center gap-1.5">
            <input
              className={`${fieldClass} min-w-0`}
              value={route.destination}
              placeholder="0.0.0.0/0"
              aria-label={`Route ${index + 1} destination CIDR`}
              onChange={(event) => updateRoute(index, { destination: event.target.value })}
            />
            <select
              className={`${fieldClass} min-w-0`}
              value={route.target}
              aria-label={`Route ${index + 1} target`}
              onChange={(event) => updateRoute(index, { target: event.target.value })}
            >
              {ROUTE_TARGETS.map((target) => (
                <option key={target} value={target}>
                  {target}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="rounded border border-slate-700 p-1.5 text-slate-400 hover:border-red-500 hover:text-red-400"
              aria-label={`Remove route ${index + 1}`}
              onClick={() => onChange(routes.filter((_, i) => i !== index))}
            >
              <Trash2 size={11} />
            </button>
          </div>
        ))}
        {routes.length === 0 && <p className="text-[10px] text-slate-600">No routes configured.</p>}
      </div>
    </div>
  );
}

interface NodeConfigFieldsProps {
  node: AppNode;
  onUpdateConfig: (nodeId: string, configPatch: Record<string, any>) => void;
  onUpdateLabel: (nodeId: string, label: string) => void;
}

export default function NodeConfigFields({ node, onUpdateConfig, onUpdateLabel }: NodeConfigFieldsProps) {
  const region = useArchStore((s) => s.region);
  const prices = useArchStore((s) => s.prices);
  const nodes = useArchStore((s) => s.nodes);
  const rates = useMemo(() => getRegionRates(region, prices), [region, prices]);
  const estimate = useMemo(
    () => AWS_CATALOG[node.data.serviceType].calculateMonthlyCost(node.data.config, rates),
    [node, rates]
  );

  const serviceType = node.data.serviceType;
  const config = node.data.config;
  const isSubnet = serviceType === 'subnet';
  const parentVpc = useMemo(() => findParentVpc(nodes, node.id), [nodes, node.id]);
  const azOptions = useMemo(() => getAvailabilityZones(region), [region]);

  const subnetValidation = useMemo(() => {
    if (!isSubnet) return null;
    const cidr = String(config.cidr ?? '');
    const vpcCidr = parentVpc ? String(parentVpc.data.config.cidr ?? '') : null;
    const siblings: SubnetCidrRef[] = nodes
      .filter(
        (candidate) =>
          candidate.id !== node.id &&
          candidate.data.serviceType === 'subnet' &&
          findParentVpc(nodes, candidate.id)?.id === parentVpc?.id
      )
      .map((candidate) => ({
        id: candidate.id,
        cidr: String(candidate.data.config.cidr ?? ''),
        label: candidate.data.label,
      }));

    return {
      usable: formatUsableIpCount(cidr),
      errors: getSubnetCidrErrors(cidr, vpcCidr, siblings),
    };
  }, [nodes, node.id, config.cidr, parentVpc, isSubnet]);

  const updateField = (key: string, value: any) => {
    if (isSubnet && key === 'tier') {
      const tier = value === 'Public' ? 'Public' : 'Private';
      onUpdateConfig(node.id, {
        tier,
        mapPublicIpOnLaunch: tier === 'Public',
        routeTable: createDefaultRouteTable(
          tier,
          parentVpc ? String(parentVpc.data.config.cidr || '') : undefined
        ),
      });
      return;
    }
    onUpdateConfig(node.id, { [key]: value });
  };

  return (
    <>
      <div>
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Display Name
        </label>
        <input
          className={fieldClass}
          value={node.data.label}
          onChange={(event) => onUpdateLabel(node.id, event.target.value)}
        />
        <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-500">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: AWS_CATALOG[serviceType].color }}
          />
          {AWS_CATALOG[serviceType].name}
          <span className="ml-auto font-mono">{node.id}</span>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          <Settings2 size={12} /> Configuration
        </div>
        <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
          {CONFIG_FIELDS[serviceType].length === 0 && (
            <p className="text-[10px] leading-relaxed text-slate-500">
              No settings required. Drop this gateway inside a VPC to attach it.
            </p>
          )}
          {CONFIG_FIELDS[serviceType].map((field) => {
            if (
              serviceType === 'vpce' &&
              String(config.endpointType).startsWith('Gateway') &&
              (field.key === 'azCount' || field.key === 'dataProcessedGb')
            ) {
              return null;
            }

            let value = config[field.key];
            if (serviceType === 'rds' && field.key === 'deploymentOption' && value == null) {
              value = config.multiAz ? 'Multi-AZ DB Instance (2x)' : 'Single-AZ';
            }
            if (serviceType === 'ebs' && field.key === 'throughputMbps' && value == null) {
              value = 125;
            }

            if (field.type === 'routes') {
              return (
                <RouteTableEditor
                  key={field.key}
                  routes={normalizeRoutes(value)}
                  onChange={(routes) => onUpdateConfig(node.id, { routeTable: routes })}
                />
              );
            }

            if (field.type === 'checkbox') {
              return (
                <label key={field.key} className="flex items-center justify-between gap-2 text-xs text-slate-300">
                  {field.label}
                  <input
                    type="checkbox"
                    checked={Boolean(value)}
                    onChange={(event) => updateField(field.key, event.target.checked)}
                    className="h-4 w-4 accent-sky-500"
                  />
                </label>
              );
            }

            if (field.type === 'select') {
              const isAzField = isSubnet && field.key === 'az';
              const currentAz = String(value ?? '');
              const options = isAzField
                ? currentAz && !azOptions.includes(currentAz)
                  ? [currentAz, ...azOptions]
                  : azOptions
                : (field.options ?? []);

              return (
                <label key={field.key} className="block">
                  <span className="mb-1 block text-[10px] text-slate-500">{field.label}</span>
                  <select
                    className={fieldClass}
                    value={isAzField ? (currentAz || String(value ?? '')) : String(value ?? options[0] ?? '')}
                    onChange={(event) => updateField(field.key, event.target.value)}
                  >
                    {options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  {isAzField && currentAz && !azOptions.includes(currentAz) && (
                    <span className="mt-1 block text-[10px] text-amber-400">
                      AZ belongs to a different region than {region}.
                    </span>
                  )}
                </label>
              );
            }

            if (field.type === 'range') {
              const numericValue = Number(value ?? field.min ?? 0);
              return (
                <label key={field.key} className="block">
                  <span className="mb-1 flex items-center justify-between text-[10px] text-slate-500">
                    <span>{field.label}</span>
                    <span className="font-mono text-slate-300">{numericValue} MB/s</span>
                  </span>
                  <input
                    className="w-full accent-sky-500"
                    type="range"
                    min={field.min}
                    max={field.max}
                    step={field.step ?? 1}
                    value={numericValue}
                    onChange={(event) => updateField(field.key, Number(event.target.value))}
                  />
                  <div className="mt-0.5 flex justify-between text-[9px] text-slate-600">
                    <span>{field.min} (included)</span>
                    <span>{field.max}</span>
                  </div>
                </label>
              );
            }

            return (
              <div key={field.key}>
                <label className="block">
                  <span className="mb-1 block text-[10px] text-slate-500">{field.label}</span>
                  <input
                    className={fieldClass}
                    type={field.type === 'number' ? 'number' : 'text'}
                    step={field.step}
                    min={field.min}
                    max={field.max}
                    value={value ?? ''}
                    onChange={(event) =>
                      updateField(field.key, field.type === 'number' ? Number(event.target.value) : event.target.value)
                    }
                  />
                </label>
                {isSubnet && field.key === 'cidr' && subnetValidation && (
                  <div className="mt-1 text-[10px]">
                    <span className={subnetValidation.errors.length ? 'text-slate-400' : 'text-emerald-300/80'}>
                      {subnetValidation.usable}
                    </span>
                    {subnetValidation.errors.map((error) => (
                      <span key={error} className="mt-0.5 block text-red-400">
                        ⚠ {error}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          AWS Billing Breakdown ({region})
        </div>
        <div className="space-y-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-[11px]">
          {estimate.lineItems.map((item, index) => (
            <div key={index} className="flex items-start justify-between gap-3 text-slate-400">
              <span className="min-w-0 leading-snug" title={item.label}>
                {item.label}
              </span>
              <span className="shrink-0 font-mono text-emerald-300">${item.amount.toFixed(2)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-emerald-500/20 pt-2 font-semibold text-emerald-300">
            <span>Monthly total</span>
            <span className="font-mono">${estimate.monthly.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </>
  );
}
