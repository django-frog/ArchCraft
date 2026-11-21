import { useMemo, useState } from 'react';
import { AlertTriangle, Check, Copy, Link, X } from 'lucide-react';
import { useArchStore } from '../store/useArchStore';
import { encodeProjectToUrlHash } from '../utils/projectSerializer';

export default function ShareModal({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const projectName = useArchStore((s) => s.projectName);
  const region = useArchStore((s) => s.region);
  const nodes = useArchStore((s) => s.nodes);
  const edges = useArchStore((s) => s.edges);
  const securityGroups = useArchStore((s) => s.securityGroups);
  const viewport = useArchStore((s) => s.viewport);

  const share = useMemo(
    () => encodeProjectToUrlHash({ projectName, region, nodes, edges, securityGroups, viewport }),
    [projectName, region, nodes, edges, securityGroups, viewport]
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(share.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <div className="flex items-center gap-2">
            <Link size={16} className="text-sky-400" />
            <h2 className="text-sm font-semibold text-slate-100">Share Architecture Link</h2>
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

        <div className="space-y-4 p-5">
          <p className="text-[11px] leading-relaxed text-slate-400">
            This link contains the entire architecture — topology, configuration, and security groups — compressed
            into the URL. No backend or account is required.
          </p>

          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Shareable URL
            </label>
            <div className="flex gap-2">
              <input
                readOnly
                value={share.url}
                onFocus={(event) => event.currentTarget.select()}
                className="min-w-0 flex-1 rounded-md border border-slate-800 bg-slate-900/60 px-2 py-2 font-mono text-[10px] text-slate-300 outline-none focus:border-sky-500/60"
                aria-label="Shareable URL"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="flex shrink-0 items-center gap-1.5 rounded-md bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-500"
              >
                {copied ? <Check size={13} className="text-emerald-300" /> : <Copy size={13} />}
                {copied ? 'Copied!' : 'Copy Share Link'}
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 font-mono text-[10px] text-slate-400">
                {share.charLength.toLocaleString()} chars • Zero-backend link
              </span>
            </div>
          </div>

          {share.isLarge && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-300">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                Large diagram (&gt;8KB URL): some chat apps may truncate long links. Consider exporting
                .archcraft.json instead.
              </span>
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-slate-800 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
