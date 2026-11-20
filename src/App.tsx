import { useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { AlertOctagon, CircleCheck, ExternalLink, Minimize2, X } from 'lucide-react';
import AdvisorDrawer from './components/AdvisorDrawer';
import CanvasBoard from './components/CanvasBoard';
import ExportModal from './components/ExportModal';
import InspectorPanel from './components/InspectorPanel';
import SecurityGroupModal from './components/SecurityGroupModal';
import Sidebar from './components/Sidebar';
import TopToolbar from './components/TopToolbar';
import { useArchStore } from './store/useArchStore';
import { decodeProjectFromUrlHash } from './utils/projectSerializer';

interface HashBanner {
  kind: 'success' | 'error';
  message: string;
}

export default function App() {
  const importProject = useArchStore((s) => s.importProject);
  const [securityGroupsOpen, setSecurityGroupsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [hashBanner, setHashBanner] = useState<HashBanner | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [exitPillVisible, setExitPillVisible] = useState(true);

  // Load a shared architecture from the URL hash on mount and on later hash changes.
  useEffect(() => {
    const loadFromHash = () => {
      const result = decodeProjectFromUrlHash(window.location.hash);
      if (!result) return;

      if (result.valid && result.project) {
        importProject(result.project);
        // Strip the hash without reloading so subsequent local edits persist cleanly.
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        setHashBanner({
          kind: 'success',
          message: `Loaded shared architecture: ${result.project.metadata.projectName}`,
        });
      } else {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        setHashBanner({
          kind: 'error',
          message: result.error || 'Failed to load the shared architecture link.',
        });
      }
    };

    loadFromHash();
    window.addEventListener('hashchange', loadFromHash);
    return () => window.removeEventListener('hashchange', loadFromHash);
  }, [importProject]);

  // Auto-dismiss the brief success toast; error banners stay until dismissed.
  useEffect(() => {
    if (hashBanner?.kind !== 'success') return;
    const timer = window.setTimeout(() => setHashBanner(null), 4000);
    return () => window.clearTimeout(timer);
  }, [hashBanner]);

  // Escape always returns from the design-only view.
  useEffect(() => {
    if (!focusMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFocusMode(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusMode]);

  // The exit control fades out after inactivity so screenshots stay clean.
  useEffect(() => {
    if (!focusMode) return;
    let timer = window.setTimeout(() => setExitPillVisible(false), 2500);
    const reveal = () => {
      setExitPillVisible(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setExitPillVisible(false), 2500);
    };
    window.addEventListener('mousemove', reveal);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('mousemove', reveal);
    };
  }, [focusMode]);

  const enterFocusMode = () => {
    setSecurityGroupsOpen(false);
    setExportOpen(false);
    setAdvisorOpen(false);
    setHashBanner(null);
    setExitPillVisible(true);
    setFocusMode(true);
  };

  return (
    <ReactFlowProvider>
      <div className="flex h-full w-full flex-col overflow-hidden bg-[#090d16] text-slate-100">
        {!focusMode && (
          <TopToolbar
            onOpenSecurityGroups={() => setSecurityGroupsOpen(true)}
            onOpenExport={() => setExportOpen(true)}
            onOpenAdvisor={() => setAdvisorOpen(true)}
            onToggleFocus={enterFocusMode}
          />
        )}

        <div className="flex min-h-0 flex-1">
          {!focusMode && <Sidebar />}
          <main className="relative min-w-0 flex-1">
            <CanvasBoard focusMode={focusMode} />
          </main>
          {!focusMode && <InspectorPanel />}
        </div>

        {!focusMode && (
          <AdvisorDrawer
            isOpen={advisorOpen}
            onClose={() => setAdvisorOpen(false)}
            onOpenSecurityGroups={() => setSecurityGroupsOpen(true)}
          />
        )}
        {securityGroupsOpen && <SecurityGroupModal onClose={() => setSecurityGroupsOpen(false)} />}
        {exportOpen && <ExportModal onClose={() => setExportOpen(false)} />}

        {!focusMode && hashBanner && (
          <div
            className={`fixed left-1/2 top-3 z-[60] flex max-w-lg -translate-x-1/2 items-start gap-2 rounded-lg border px-3 py-2 text-[11px] shadow-xl backdrop-blur ${
              hashBanner.kind === 'success'
                ? 'border-emerald-500/40 bg-emerald-950/90 text-emerald-200'
                : 'border-red-500/40 bg-red-950/90 text-red-200'
            }`}
            role="status"
          >
            {hashBanner.kind === 'success' ? (
              <CircleCheck size={14} className="mt-0.5 shrink-0 text-emerald-400" />
            ) : (
              <AlertOctagon size={14} className="mt-0.5 shrink-0 text-red-400" />
            )}
            <span className="leading-relaxed">{hashBanner.message}</span>
            <button
              type="button"
              onClick={() => setHashBanner(null)}
              className="ml-1 shrink-0 rounded p-0.5 text-slate-400 hover:bg-white/10 hover:text-white"
              aria-label="Dismiss"
            >
              <X size={13} />
            </button>
          </div>
        )}

        {!focusMode && (
          <div className="fixed bottom-3 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-slate-700/70 bg-slate-950/75 px-3 py-1.5 text-[10px] text-slate-400 shadow-lg backdrop-blur">
            <span>
              Built by <span className="font-medium text-slate-200">Mohammad Hamdan</span>
            </span>
            <span className="text-slate-700">•</span>
            <a
              href="https://github.com/django-frog/ArchCraft"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 hover:underline"
            >
              GitHub <ExternalLink size={10} />
            </a>
            <span className="text-slate-700">•</span>
            <a
              href="https://www.linkedin.com/in/mohammad-hamdan-824963324/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 hover:underline"
            >
              LinkedIn <ExternalLink size={10} />
            </a>
          </div>
        )}

        {focusMode && (
          <button
            type="button"
            onClick={() => setFocusMode(false)}
            title="Exit Focus Mode (Esc)"
            className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full border border-slate-600/60 bg-slate-900/80 px-3 py-2 text-[11px] text-slate-300 shadow-xl backdrop-blur transition-all duration-300 hover:border-sky-500/60 hover:text-white ${
              exitPillVisible ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
            }`}
          >
            <Minimize2 size={13} />
            Exit Focus Mode
            <kbd className="rounded border border-slate-600 px-1 font-mono text-[9px]">Esc</kbd>
          </button>
        )}
      </div>
    </ReactFlowProvider>
  );
}
