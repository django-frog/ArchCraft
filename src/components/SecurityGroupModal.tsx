import { useState } from 'react';
import { Plus, ShieldCheck, Trash, X } from 'lucide-react';
import { useArchStore } from '../store/useArchStore';
import type { SecurityRule } from '../types/architecture';

const inputClass =
  'w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-500';

function RuleForm({ sgId }: { sgId: string }) {
  const addSecurityRule = useArchStore((s) => s.addSecurityRule);
  const [direction, setDirection] = useState<SecurityRule['direction']>('inbound');
  const [protocol, setProtocol] = useState<SecurityRule['protocol']>('TCP');
  const [portRange, setPortRange] = useState('443');
  const [sourceOrDest, setSourceOrDest] = useState('0.0.0.0/0');
  const [description, setDescription] = useState('');

  const submit = () => {
    if (!portRange.trim() || !sourceOrDest.trim()) return;
    addSecurityRule(sgId, { direction, protocol, portRange, sourceOrDest, description });
    setDescription('');
  };

  return (
    <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-slate-800 bg-slate-900/40 p-2 sm:grid-cols-5">
      <select className={inputClass} value={direction} onChange={(e) => setDirection(e.target.value as SecurityRule['direction'])}>
        <option value="inbound">Inbound</option>
        <option value="outbound">Outbound</option>
      </select>
      <select className={inputClass} value={protocol} onChange={(e) => setProtocol(e.target.value as SecurityRule['protocol'])}>
        <option value="TCP">TCP</option>
        <option value="UDP">UDP</option>
        <option value="ICMP">ICMP</option>
        <option value="ALL">ALL</option>
      </select>
      <input className={inputClass} value={portRange} placeholder="Ports" onChange={(e) => setPortRange(e.target.value)} />
      <input className={inputClass} value={sourceOrDest} placeholder="Source / Target" onChange={(e) => setSourceOrDest(e.target.value)} />
      <div className="flex gap-1 sm:col-span-1">
        <input
          className={`${inputClass} min-w-0`}
          value={description}
          placeholder="Description"
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
        <button
          type="button"
          onClick={submit}
          className="shrink-0 rounded-md bg-sky-600 px-2 text-xs font-medium text-white hover:bg-sky-500"
          aria-label="Add rule"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

export default function SecurityGroupModal({ onClose }: { onClose: () => void }) {
  const securityGroups = useArchStore((s) => s.securityGroups);
  const addSecurityGroup = useArchStore((s) => s.addSecurityGroup);
  const deleteSecurityGroup = useArchStore((s) => s.deleteSecurityGroup);
  const removeSecurityRule = useArchStore((s) => s.removeSecurityRule);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const createGroup = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    addSecurityGroup({
      name: trimmed,
      description: description.trim() || 'Custom security group',
      rules: [],
    });
    setName('');
    setDescription('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[86vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-sky-400" />
            <h2 className="text-sm font-semibold text-slate-100">Security Group Manager</h2>
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
              {securityGroups.length} groups
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Create Security Group</h3>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                className={inputClass}
                value={name}
                placeholder="sg-name"
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') createGroup();
                }}
              />
              <input
                className={inputClass}
                value={description}
                placeholder="Description"
                onChange={(event) => setDescription(event.target.value)}
              />
              <button
                type="button"
                onClick={createGroup}
                className="flex shrink-0 items-center justify-center gap-1 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
              >
                <Plus size={14} /> Create
              </button>
            </div>
          </div>

          {securityGroups.map((sg) => (
            <div key={sg.id} className="rounded-lg border border-slate-800 bg-slate-900/30">
              <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={13} className="shrink-0 text-sky-400" />
                    <span className="font-mono text-xs font-semibold text-slate-100">{sg.name}</span>
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-slate-400">
                      {sg.rules.length} rules
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[10px] text-slate-500">{sg.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => deleteSecurityGroup(sg.id)}
                  className="flex shrink-0 items-center gap-1 rounded-md border border-red-500/20 px-2 py-1 text-[10px] text-red-400 hover:bg-red-500/10"
                >
                  <Trash size={11} /> Delete
                </button>
              </div>

              <div className="px-3 py-2">
                {sg.rules.length > 0 ? (
                  <table className="w-full text-left text-[10px]">
                    <thead className="text-slate-500">
                      <tr>
                        <th className="pb-1 font-medium">Direction</th>
                        <th className="pb-1 font-medium">Protocol</th>
                        <th className="pb-1 font-medium">Ports</th>
                        <th className="pb-1 font-medium">Source / Target</th>
                        <th className="pb-1 font-medium">Description</th>
                        <th className="pb-1" />
                      </tr>
                    </thead>
                    <tbody className="text-slate-300">
                      {sg.rules.map((rule) => (
                        <tr key={rule.id} className="border-t border-slate-800/70">
                          <td className="py-1 pr-2">
                            <span
                              className={
                                rule.direction === 'inbound' ? 'text-emerald-400' : 'text-amber-400'
                              }
                            >
                              {rule.direction}
                            </span>
                          </td>
                          <td className="py-1 pr-2">{rule.protocol}</td>
                          <td className="py-1 pr-2 font-mono">{rule.portRange}</td>
                          <td className="py-1 pr-2 font-mono">{rule.sourceOrDest}</td>
                          <td className="py-1 pr-2 text-slate-500">{rule.description || '—'}</td>
                          <td className="py-1 text-right">
                            <button
                              type="button"
                              onClick={() => removeSecurityRule(sg.id, rule.id)}
                              className="rounded p-1 text-slate-600 hover:bg-red-500/10 hover:text-red-400"
                              aria-label="Remove rule"
                            >
                              <X size={12} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="py-1 text-[10px] text-slate-500">No rules defined.</p>
                )}

                <RuleForm sgId={sg.id} />
              </div>
            </div>
          ))}

          {securityGroups.length === 0 && (
            <p className="py-8 text-center text-xs text-slate-500">Create your first security group above.</p>
          )}
        </div>
      </div>
    </div>
  );
}
