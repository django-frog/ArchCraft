import { useMemo, useState } from 'react';
import { Braces, Check, Copy, Download, FileText, GitBranch, X } from 'lucide-react';
import { generateMarkdownSpec, generateMermaidDiagram } from '../utils/exportGenerator';
import { serializeProject } from '../utils/projectSerializer';
import { useArchStore } from '../store/useArchStore';

type ExportTab = 'project' | 'md' | 'mmd';

const TABS: { key: ExportTab; label: string; Icon: typeof Braces; badge?: string }[] = [
  { key: 'project', label: 'ArchCraft Project', Icon: Braces, badge: 'Lossless • Re-importable' },
  { key: 'md', label: 'Markdown Spec (.md)', Icon: FileText },
  { key: 'mmd', label: 'Mermaid Diagram (.mmd)', Icon: GitBranch },
];

export default function ExportModal({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<ExportTab>('project');
  const [copied, setCopied] = useState(false);
  const projectName = useArchStore((s) => s.projectName);
  const region = useArchStore((s) => s.region);
  const nodes = useArchStore((s) => s.nodes);
  const edges = useArchStore((s) => s.edges);
  const securityGroups = useArchStore((s) => s.securityGroups);
  const viewport = useArchStore((s) => s.viewport);
  const prices = useArchStore((s) => s.prices);

  const projectJson = useMemo(
    () =>
      JSON.stringify(
        serializeProject({ projectName, region, nodes, edges, securityGroups, viewport }),
        null,
        2
      ),
    [projectName, region, nodes, edges, securityGroups, viewport]
  );
  const markdown = useMemo(
    () => generateMarkdownSpec({ projectName, region, nodes, edges, securityGroups, prices }),
    [projectName, region, nodes, edges, securityGroups, prices]
  );
  const mermaid = useMemo(() => generateMermaidDiagram(nodes, edges), [nodes, edges]);

  const content = activeTab === 'project' ? projectJson : activeTab === 'md' ? markdown : mermaid;
  const slug =
    projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'aws-architecture';
  const fileName = activeTab === 'project' ? `${slug}.archcraft.json` : `${slug}.${activeTab}`;
  const mimeType =
    activeTab === 'project'
      ? 'application/json;charset=utf-8'
      : activeTab === 'md'
        ? 'text/markdown;charset=utf-8'
        : 'text/plain;charset=utf-8';

  const selectTab = (tab: ExportTab) => {
    setActiveTab(tab);
    setCopied(false);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-sky-400" />
            <h2 className="text-sm font-semibold text-slate-100">Export Architecture</h2>
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

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-3">
          <div className="flex flex-wrap gap-1 rounded-lg border border-slate-800 bg-slate-900 p-1">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => selectTab(tab.key)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeTab === tab.key ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <tab.Icon size={13} />
                {tab.label}
                {tab.badge && (
                  <span
                    className={`ml-1 rounded px-1.5 py-0.5 text-[9px] ${
                      activeTab === tab.key
                        ? 'bg-white/20 text-white'
                        : 'bg-emerald-500/10 text-emerald-400'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
            >
              {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              {copied ? 'Copied!' : activeTab === 'project' ? 'Copy JSON' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="flex items-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
            >
              <Download size={13} />
              {activeTab === 'project' ? 'Download .archcraft.json' : `Download ${activeTab.toUpperCase()}`}
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 p-5">
          <textarea
            readOnly
            value={content}
            spellCheck={false}
            className="h-full min-h-[320px] w-full resize-none rounded-lg border border-slate-800 bg-slate-900/60 p-3 font-mono text-[11px] leading-relaxed text-slate-300 outline-none focus:border-sky-500/60"
            aria-label={`${activeTab} export`}
          />
        </div>

        <div className="border-t border-slate-800 px-5 py-2 text-[10px] text-slate-500">
          {fileName} · generated from the current canvas state · {nodes.length} resources, {edges.length} connections
          {activeTab === 'project' && ' · re-importable with full topology, configs, and security groups'}
        </div>
      </div>
    </div>
  );
}
