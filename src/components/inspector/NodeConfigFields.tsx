import { Settings2 } from 'lucide-react';
import { AWS_CATALOG } from '../../data/awsCatalog';
import type { AppNode } from '../../store/useArchStore';
import type { AwsServiceType } from '../../types/architecture';

type FieldType = 'text' | 'number' | 'select' | 'checkbox';

interface ConfigField {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  step?: number;
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
    {
      key: 'az',
      label: 'Availability Zone',
      type: 'select',
      options: ['us-east-1a', 'us-east-1b', 'us-east-1c', 'us-west-2a', 'us-west-2b', 'eu-west-1a'],
    },
  ],
  cloudfront: [
    { key: 'dataTransferOutGb', label: 'Data Transfer Out (GB)', type: 'number' },
    { key: 'requestsMillions', label: 'HTTPS Requests (millions)', type: 'number' },
    { key: 'wafEnabled', label: 'Enable AWS WAF', type: 'checkbox' },
  ],
  ec2: [
    {
      key: 'instanceType',
      label: 'Instance Type',
      type: 'select',
      options: ['t3.micro', 't3.small', 't3.medium', 't3.large', 'm6i.large', 'm6i.xlarge', 'c6i.large'],
    },
    { key: 'count', label: 'Instance Count', type: 'number', step: 1 },
    { key: 'os', label: 'Operating System', type: 'select', options: ['Linux', 'Windows'] },
  ],
  lambda: [
    { key: 'memoryMb', label: 'Memory (MB)', type: 'number', step: 64 },
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
    { key: 'multiAz', label: 'Multi-AZ Deployment', type: 'checkbox' },
    { key: 'storageGb', label: 'Storage (GB)', type: 'number' },
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
  ],
  s3: [
    { key: 'storageClass', label: 'Storage Class', type: 'select', options: ['Standard', 'Standard-IA'] },
    { key: 'storageGb', label: 'Stored Data (GB)', type: 'number' },
    { key: 'putRequestsThousands', label: 'PUT Requests (thousands)', type: 'number' },
  ],
  sqs: [
    { key: 'queueType', label: 'Queue Type', type: 'select', options: ['Standard', 'FIFO'] },
    { key: 'requestsMillions', label: 'Requests (millions)', type: 'number' },
  ],
};

const fieldClass =
  'w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-500';

interface NodeConfigFieldsProps {
  node: AppNode;
  onUpdateConfig: (nodeId: string, configPatch: Record<string, any>) => void;
  onUpdateLabel: (nodeId: string, label: string) => void;
}

export default function NodeConfigFields({ node, onUpdateConfig, onUpdateLabel }: NodeConfigFieldsProps) {
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
            style={{ backgroundColor: AWS_CATALOG[node.data.serviceType].color }}
          />
          {AWS_CATALOG[node.data.serviceType].name}
          <span className="ml-auto font-mono">{node.id}</span>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          <Settings2 size={12} /> Configuration
        </div>
        <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
          {CONFIG_FIELDS[node.data.serviceType].map((field) => {
            const value = node.data.config[field.key];

            if (field.type === 'checkbox') {
              return (
                <label key={field.key} className="flex items-center justify-between gap-2 text-xs text-slate-300">
                  {field.label}
                  <input
                    type="checkbox"
                    checked={Boolean(value)}
                    onChange={(event) => onUpdateConfig(node.id, { [field.key]: event.target.checked })}
                    className="h-4 w-4 accent-sky-500"
                  />
                </label>
              );
            }

            if (field.type === 'select') {
              return (
                <label key={field.key} className="block">
                  <span className="mb-1 block text-[10px] text-slate-500">{field.label}</span>
                  <select
                    className={fieldClass}
                    value={String(value ?? '')}
                    onChange={(event) => onUpdateConfig(node.id, { [field.key]: event.target.value })}
                  >
                    {field.options?.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              );
            }

            return (
              <label key={field.key} className="block">
                <span className="mb-1 block text-[10px] text-slate-500">{field.label}</span>
                <input
                  className={fieldClass}
                  type={field.type === 'number' ? 'number' : 'text'}
                  step={field.step}
                  value={value ?? ''}
                  onChange={(event) =>
                    onUpdateConfig(node.id, {
                      [field.key]: field.type === 'number' ? Number(event.target.value) : event.target.value,
                    })
                  }
                />
              </label>
            );
          })}
        </div>
      </div>
    </>
  );
}
