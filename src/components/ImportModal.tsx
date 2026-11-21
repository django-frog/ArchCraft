import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { AlertOctagon, Braces, Upload, X } from 'lucide-react';
import { useArchStore } from '../store/useArchStore';
import { parseAndValidateProject } from '../utils/projectSerializer';

export default function ImportModal({ onClose }: { onClose: () => void }) {
  const importProject = useArchStore((s) => s.importProject);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [rawText, setRawText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const readFile = async (file?: File) => {
    if (!file) return;
    try {
      const text = await file.text();
      setRawText(text);
      setFileName(file.name);
      setError(null);
    } catch {
      setError('Could not read the selected file. Please try again.');
    }
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    void readFile(event.target.files?.[0]);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    void readFile(event.dataTransfer.files[0]);
  };

  const handleImport = () => {
    const result = parseAndValidateProject(rawText);
    if (!result.valid || !result.project) {
      setError(result.error || 'Unknown validation error.');
      return;
    }

    // importProject restores the saved viewport (or fits legacy files without one).
    importProject(result.project);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <div className="flex items-center gap-2">
            <Upload size={16} className="text-sky-400" />
            <h2 className="text-sm font-semibold text-slate-100">Import ArchCraft Project</h2>
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[9px] text-slate-400">
              .archcraft.json
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
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-7 text-center transition-colors ${
              isDragging
                ? 'border-sky-400 bg-sky-500/10'
                : 'border-slate-700 bg-slate-900/40 hover:border-slate-600'
            }`}
          >
            <Braces size={22} className="text-slate-500" />
            <p className="text-xs text-slate-300">
              {fileName ? (
                <span className="font-mono text-sky-300">{fileName}</span>
              ) : (
                'Drop a .archcraft.json file here'
              )}
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 hover:border-sky-500/60 hover:bg-slate-800"
            >
              Browse files
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.archcraft.json,application/json"
              onChange={handleInputChange}
              className="hidden"
            />
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Or paste raw JSON
            </label>
            <textarea
              value={rawText}
              onChange={(event) => {
                setRawText(event.target.value);
                setFileName(null);
                setError(null);
              }}
              spellCheck={false}
              placeholder='{ "$schema": "aws-archcraft-project", ... }'
              className="h-52 w-full resize-none rounded-lg border border-slate-800 bg-slate-900/60 p-3 font-mono text-[11px] leading-relaxed text-slate-300 outline-none placeholder:text-slate-600 focus:border-sky-500/60"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
              <AlertOctagon size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-800 px-5 py-3">
          <p className="text-[10px] text-slate-500">Import replaces the current canvas. Export first to keep a backup.</p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={!rawText.trim()}
              className="flex items-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
            >
              <Upload size={13} /> Import Project
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
