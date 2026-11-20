import { useMemo, useState } from 'react';
import {
  Boxes,
  Cpu,
  Database,
  HardDrive,
  Network,
  Plus,
  Search,
  Sparkles,
  Waypoints,
  type LucideIcon,
} from 'lucide-react';
import { AWS_CATALOG } from '../data/awsCatalog';
import { useArchStore } from '../store/useArchStore';
import type { AwsServiceType, ServiceCategory } from '../types/architecture';

const CATEGORY_ICONS: Record<ServiceCategory, LucideIcon> = {
  Networking: Network,
  Compute: Cpu,
  Database: Database,
  Storage: HardDrive,
  'Integration & Edge': Waypoints,
};

const CATEGORY_ORDER: ServiceCategory[] = [
  'Networking',
  'Compute',
  'Database',
  'Storage',
  'Integration & Edge',
];

const TEMPLATES: { key: 'three-tier' | 'serverless-event' | 'blank'; title: string; description: string }[] = [
  { key: 'three-tier', title: '3-Tier Web App', description: 'VPC, ALB tier, app workers, cache & RDS' },
  { key: 'serverless-event', title: 'Serverless API', description: 'CloudFront → Lambda → SQS → DynamoDB' },
  { key: 'blank', title: 'Blank Canvas', description: 'Start from an empty diagram' },
];

export default function Sidebar() {
  const [search, setSearch] = useState('');
  const addServiceNode = useArchStore((s) => s.addServiceNode);
  const loadTemplate = useArchStore((s) => s.loadTemplate);
  const nodeCount = useArchStore((s) => s.nodes.length);

  const grouped = useMemo(() => {
    const query = search.trim().toLowerCase();
    const result: Record<ServiceCategory, AwsServiceType[]> = {
      Networking: [],
      Compute: [],
      Database: [],
      Storage: [],
      'Integration & Edge': [],
    };

    (Object.keys(AWS_CATALOG) as AwsServiceType[]).forEach((type) => {
      const def = AWS_CATALOG[type];
      const haystack = `${def.name} ${def.shortName} ${def.category}`.toLowerCase();
      if (query && !haystack.includes(query)) return;
      result[def.category].push(type);
    });

    return result;
  }, [search]);

  const handleAdd = (type: AwsServiceType) => {
    const offset = (nodeCount % 6) * 30;
    addServiceNode(type, { x: 180 + offset, y: 140 + offset });
  };

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-950/90">
      <div className="border-b border-slate-800 p-3">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          <Boxes size={13} /> Service Palette
        </div>
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-2.5 text-slate-500" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search AWS services…"
            className="w-full rounded-lg border border-slate-700/70 bg-slate-900 py-2 pl-8 pr-2 text-xs text-slate-100 placeholder:text-slate-600 outline-none focus:border-sky-500"
          />
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
          Drag onto the canvas or click to add. Drop inside a container to auto-parent it.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {CATEGORY_ORDER.map((category) => {
          const services = grouped[category];
          if (services.length === 0) return null;
          const CategoryIcon = CATEGORY_ICONS[category];

          return (
            <section key={category} className="mb-5">
              <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <CategoryIcon size={11} /> {category}
              </div>
              <div className="space-y-1">
                {services.map((type) => {
                  const def = AWS_CATALOG[type];
                  return (
                    <button
                      key={type}
                      type="button"
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData('application/aws-service', type);
                        event.dataTransfer.effectAllowed = 'move';
                      }}
                      onClick={() => handleAdd(type)}
                      className="group flex w-full items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left transition-colors hover:border-slate-700 hover:bg-slate-800/60"
                    >
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[10px] font-bold"
                        style={{ backgroundColor: `${def.color}22`, color: def.color }}
                      >
                        {def.shortName.slice(0, 2)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11px] font-medium text-slate-200">{def.name}</span>
                        <span className="block truncate text-[9px] text-slate-500">
                          {def.isContainer ? 'Container' : def.category}
                        </span>
                      </span>
                      <Plus size={13} className="shrink-0 text-slate-600 group-hover:text-sky-400" />
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}

        {CATEGORY_ORDER.every((category) => grouped[category].length === 0) && (
          <p className="px-2 py-6 text-center text-xs text-slate-500">No services match “{search}”.</p>
        )}
      </div>

      <div className="border-t border-slate-800 p-3">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          <Sparkles size={13} /> Starter Templates
        </div>
        <div className="space-y-1.5">
          {TEMPLATES.map((template) => (
            <button
              key={template.key}
              type="button"
              onClick={() => loadTemplate(template.key)}
              className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-2.5 py-2 text-left transition-colors hover:border-sky-500/50 hover:bg-slate-800/70"
            >
              <span className="block text-[11px] font-semibold text-slate-200">{template.title}</span>
              <span className="block text-[9px] leading-snug text-slate-500">{template.description}</span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
