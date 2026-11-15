import { useMemo, useState } from 'react';
import { Download, FolderOpen, Play, Search, Trash2 } from 'lucide-react';
import { formatBytes } from '../lib/booru';
import type { LocalGalleryItem } from '../types/booru';

interface LocalGalleryViewProps {
  items: LocalGalleryItem[];
  directory: string;
  totalBytes: number;
  browserFolderName: string | null;
  onLaunchSlideshow: (items: LocalGalleryItem[], startIndex: number) => void;
  onDeleteItem: (filename: string) => Promise<void>;
  onOpenFolderSettings: () => void;
}

export function LocalGalleryView({
  items,
  directory,
  totalBytes,
  browserFolderName,
  onLaunchSlideshow,
  onDeleteItem,
  onOpenFolderSettings,
}: LocalGalleryViewProps) {
  const [filterText, setFilterText] = useState('');
  const [deletingName, setDeletingName] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    const terms = filterText
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (terms.length === 0) return items;
    return items.filter((item) => {
      const haystack = `${item.filename} ${item.tags.join(' ')} ${item.board} ${item.id}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [items, filterText]);

  const handleDelete = async (filename: string) => {
    setDeletingName(filename);
    try {
      await onDeleteItem(filename);
    } finally {
      setDeletingName(null);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#09090B]">
      <div className="max-w-[1600px] mx-auto p-4 lg:p-6 space-y-6">
        {/* Local Folder Header Bar */}
        <div className="p-4 rounded-lg bg-[#111114] border border-zinc-800 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-blue-400 shrink-0" />
              <h1 className="font-display text-lg font-semibold text-zinc-100">
                Local Gallery Folder
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
              <span className="font-mono text-zinc-300 truncate max-w-xl" title={directory}>
                {directory}
              </span>
              {browserFolderName && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-emerald-400">Synced browser folder: {browserFolderName}</span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {items.length} {items.length === 1 ? 'file' : 'files'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{formatBytes(totalBytes)}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {filteredItems.length > 0 && (
              <button
                type="button"
                onClick={() => onLaunchSlideshow(filteredItems, 0)}
                className="h-9 px-4 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-md inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Play Local Slideshow</span>
              </button>
            )}
            <button
              type="button"
              onClick={onOpenFolderSettings}
              className="h-9 px-3.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-medium rounded-md transition-colors whitespace-nowrap"
            >
              Configure Folder
            </button>
          </div>
        </div>

        {/* Search Local Tags */}
        {items.length > 0 && (
          <div className="relative max-w-md">
            <label htmlFor="local-gallery-search" className="sr-only">
              Filter saved local gallery images
            </label>
            <Search
              aria-hidden="true"
              className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            />
            <input
              id="local-gallery-search"
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Filter local gallery by tag or filename..."
              className="w-full h-9 pl-9 pr-3 bg-zinc-950 border border-zinc-800 rounded-md text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        )}

        {/* Empty State or Grid */}
        {items.length === 0 ? (
          <div className="py-20 text-center border border-dashed border-zinc-800 rounded-lg bg-[#111114]/50">
            <h2 className="font-display text-lg font-semibold text-zinc-200">
              Your local gallery folder is empty
            </h2>
            <p className="text-sm text-zinc-400 mt-1 max-w-md mx-auto">
              Save any slide (`D` or `S`) or batch-download selections from the Grid view to store full-resolution files directly in your local gallery folder.
            </p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-12 text-center text-sm text-zinc-400">
            No saved images match &ldquo;{filterText}&rdquo;.
          </div>
        ) : (
          <div
            data-testid="local-gallery-grid"
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3"
          >
            {filteredItems.map((item, idx) => (
              <article
                key={item.filename}
                className="group rounded-lg overflow-hidden bg-[#111114] border border-zinc-800 hover:border-zinc-700 transition-colors"
              >
                <div className="relative aspect-[4/3] bg-zinc-950 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => onLaunchSlideshow(filteredItems, idx)}
                    aria-label={`Open local file ${item.filename} in slideshow`}
                    className="w-full h-full block"
                  >
                    {item.mediaType === 'video' ? (
                      <video
                        src={item.url}
                        muted
                        playsInline
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <img
                        src={item.url}
                        alt={item.tags.slice(0, 6).join(', ') || item.filename}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                      />
                    )}
                  </button>

                  <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <a
                      href={item.url}
                      download={item.filename}
                      aria-label={`Download copy of ${item.filename}`}
                      className="w-7 h-7 rounded bg-black/80 border border-white/15 text-zinc-200 hover:text-white flex items-center justify-center"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                    <button
                      type="button"
                      disabled={deletingName === item.filename}
                      onClick={() => void handleDelete(item.filename)}
                      aria-label={`Delete ${item.filename} from local gallery`}
                      className="w-7 h-7 rounded bg-black/80 border border-white/15 text-zinc-300 hover:text-rose-400 flex items-center justify-center"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="px-2.5 py-2 space-y-0.5">
                  <p className="text-xs font-mono text-zinc-200 truncate" title={item.filename}>
                    {item.filename}
                  </p>
                  <p className="text-[11px] font-mono tabular-nums text-zinc-500">
                    {formatBytes(item.sizeBytes)}
                    {item.width > 0 ? ` · ${item.width}×${item.height}` : ''}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
