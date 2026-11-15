import { useRef, useState } from 'react';
import { Check, CheckSquare, Copy, Download, Heart, Loader2, Play, Square } from 'lucide-react';
import { BOARD_LABELS } from '../lib/booru';
import type { BooruPost } from '../types/booru';

interface GridGalleryProps {
  posts: BooruPost[];
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onOpenSlide: (index: number) => void;
  onSavePost: (post: BooruPost) => Promise<void>;
  onCopyFileLink: (post: BooruPost) => Promise<boolean>;
  onToggleFavorite: (post: BooruPost) => void;
  onBatchSave: (posts: BooruPost[]) => Promise<void>;
  savingIds: Set<string>;
  savedKeys: Set<string>;
  favoriteKeys: Set<string>;
  selectedKeys: Set<string>;
  onToggleSelect: (key: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  isBatchSaving: boolean;
  getMediaSrc: (post: BooruPost, kind: 'full' | 'sample' | 'preview') => string;
}

export function GridGallery({
  posts,
  isLoading,
  hasMore,
  onLoadMore,
  onOpenSlide,
  onSavePost,
  onCopyFileLink,
  onToggleFavorite,
  onBatchSave,
  savingIds,
  savedKeys,
  favoriteKeys,
  selectedKeys,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  isBatchSaving,
  getMediaSrc,
}: GridGalleryProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const selectedPosts = posts.filter((p) => selectedKeys.has(`${p.board}_${p.id}`));

  const handleCopyClick = async (post: BooruPost, key: string) => {
    const ok = await onCopyFileLink(post);
    if (ok) {
      setCopiedKey(key);
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopiedKey(null), 1800);
    }
  };

  if (isLoading && posts.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[1600px] mx-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {Array.from({ length: 18 }).map((_, idx) => (
            <div key={idx} className="aspect-[4/3] rounded-lg bg-zinc-900 animate-pulse border border-zinc-800/70" />
          ))}
        </div>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <h2 className="font-display text-xl font-semibold text-zinc-100">No posts match your filters</h2>
        <p className="text-sm text-zinc-400 mt-1 max-w-md">
          Adjust your search tags, rating, or client filters above to load images into the contact sheet.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#09090B]">
      <div className="max-w-[1600px] mx-auto p-4 lg:p-6 space-y-4">
        {/* Batch Selection Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
          <div className="flex items-center gap-3 text-xs text-zinc-400">
            <span className="font-mono tabular-nums text-zinc-200">{posts.length} loaded</span>
            <span aria-hidden="true">·</span>
            <span>Click any image to launch slideshow</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={selectedKeys.size === posts.length ? onClearSelection : onSelectAll}
              className="h-8 px-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded text-xs font-medium text-zinc-200 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              {selectedKeys.size === posts.length ? (
                <CheckSquare className="w-3.5 h-3.5 text-blue-400" />
              ) : (
                <Square className="w-3.5 h-3.5" />
              )}
              <span>{selectedKeys.size === posts.length ? 'Deselect All' : 'Select All'}</span>
            </button>

            {selectedPosts.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={onClearSelection}
                  className="h-8 px-3 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-300 transition-colors"
                >
                  Clear ({selectedPosts.length})
                </button>
                <button
                  type="button"
                  disabled={isBatchSaving}
                  onClick={() => void onBatchSave(selectedPosts)}
                  className="h-8 px-3.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 rounded text-xs font-medium text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  {isBatchSaving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span>Download Selected ({selectedPosts.length})</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Contact Sheet Grid */}
        <div
          data-testid="grid-gallery"
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3"
        >
          {posts.map((post, idx) => {
            const key = `${post.board}_${post.id}`;
            const isSelected = selectedKeys.has(key);
            const isSaved = savedKeys.has(key);
            const isSaving = savingIds.has(key);
            const isFavorited = favoriteKeys.has(key);

            return (
              <article
                key={key}
                className={`group rounded-lg overflow-hidden bg-[#111114] border transition-colors ${
                  isSelected ? 'border-blue-500 ring-1 ring-blue-500' : 'border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div className="relative aspect-[4/3] bg-zinc-950 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => onOpenSlide(idx)}
                    aria-label={`Open post ${post.id} in slideshow`}
                    className="w-full h-full block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    <img
                      src={getMediaSrc(post, 'preview')}
                      alt={post.tags.slice(0, 6).join(', ') || `Post ${post.id}`}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                    />
                  </button>

                  {/* Top-left Select Checkbox */}
                  <button
                    type="button"
                    onClick={() => onToggleSelect(key)}
                    aria-label={`Select post ${post.id} for batch download`}
                    aria-pressed={isSelected}
                    className={`absolute top-2 left-2 w-7 h-7 rounded bg-black/70 border flex items-center justify-center transition-opacity ${
                      isSelected
                        ? 'opacity-100 border-blue-500 text-blue-400'
                        : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 border-white/20 text-zinc-200'
                    }`}
                  >
                    {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  </button>

                  {/* Top-right Favorite + Copy Link + Save buttons */}
                  <div className="absolute top-2 right-2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onToggleFavorite(post)}
                      aria-pressed={isFavorited}
                      aria-label={isFavorited ? `Remove post ${post.id} from favorites` : `Add post ${post.id} to favorites`}
                      title={isFavorited ? 'Remove from favorites' : 'Bookmark to favorites (no download)'}
                      className={`h-7 w-7 rounded inline-flex items-center justify-center border transition-opacity ${
                        isFavorited
                          ? 'opacity-100 bg-rose-950/90 border-rose-700/80 text-rose-300'
                          : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 bg-black/75 border-white/15 text-zinc-100 hover:bg-zinc-800'
                      }`}
                    >
                      <Heart className={`w-3 h-3 ${isFavorited ? 'fill-rose-400 text-rose-400' : ''}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCopyClick(post, key)}
                      aria-label={`Copy file link for post ${post.id}`}
                      title="Copy file link"
                      className={`h-7 w-7 rounded inline-flex items-center justify-center border transition-opacity ${
                        copiedKey === key
                          ? 'opacity-100 bg-emerald-950/90 border-emerald-700/80 text-emerald-300'
                          : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 bg-black/75 border-white/15 text-zinc-100 hover:bg-zinc-800'
                      }`}
                    >
                      {copiedKey === key ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    </button>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => void onSavePost(post)}
                      aria-label={isSaved ? `Post ${post.id} saved locally` : `Save post ${post.id} to local gallery`}
                      className={`h-7 px-2 rounded text-[11px] font-medium inline-flex items-center gap-1 border transition-opacity ${
                        isSaved
                          ? 'opacity-100 bg-emerald-950/90 border-emerald-700/80 text-emerald-300'
                          : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 bg-black/75 border-white/15 text-zinc-100 hover:bg-blue-600 hover:border-blue-500'
                      }`}
                    >
                      {isSaving ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : isSaved ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <Download className="w-3 h-3" />
                      )}
                      <span>{isSaved ? 'Saved' : 'Save'}</span>
                    </button>
                  </div>

                  {/* Hover Slideshow cue */}
                  <div className="pointer-events-none absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="h-6 px-2 rounded bg-black/75 text-[11px] text-zinc-200 inline-flex items-center gap-1">
                      <Play className="w-2.5 h-2.5 fill-current" />
                      <span>Slide</span>
                    </span>
                  </div>
                </div>

                {/* Zero-pill clean metadata footer */}
                <div className="px-2.5 py-2 space-y-0.5 text-[11px] text-zinc-400">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-zinc-200 font-medium truncate">{BOARD_LABELS[post.board]}</span>
                    <span className="font-mono text-zinc-400 shrink-0">{post.ext.toUpperCase()}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 font-mono tabular-nums text-zinc-500">
                    <span className="truncate">#{post.id}</span>
                    <span className="shrink-0">{post.width}×{post.height}</span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {/* Load More Pagination */}
        {hasMore && (
          <div className="pt-4 pb-8 flex justify-center">
            <button
              type="button"
              disabled={isLoading}
              onClick={onLoadMore}
              className="px-6 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-md text-sm font-medium text-zinc-100 transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Loading more posts...' : 'Load More Posts'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
