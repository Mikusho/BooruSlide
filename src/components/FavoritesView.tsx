import { useMemo, useRef, useState } from 'react';
import { Check, Copy, Download, Heart, Loader2, Play, Search, Trash2 } from 'lucide-react';
import { BOARD_LABELS } from '../lib/booru';
import { filterFavoritePosts, getPostKey, type FavoritePost } from '../lib/favorites';
import type { BooruPost } from '../types/booru';

interface FavoritesViewProps {
  items: FavoritePost[];
  onLaunchSlideshow: (items: FavoritePost[], startIndex: number) => void;
  onRemoveFavorite: (post: FavoritePost) => void;
  onClearFavorites: () => void;
  onSavePost: (post: BooruPost) => Promise<void>;
  onCopyFileLink: (post: BooruPost) => Promise<boolean>;
  savingIds: Set<string>;
  savedKeys: Set<string>;
  getMediaSrc: (post: BooruPost, kind: 'full' | 'sample' | 'preview') => string;
}

export function FavoritesView({
  items,
  onLaunchSlideshow,
  onRemoveFavorite,
  onClearFavorites,
  onSavePost,
  onCopyFileLink,
  savingIds,
  savedKeys,
  getMediaSrc,
}: FavoritesViewProps) {
  const [filterText, setFilterText] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  const filteredItems = useMemo(() => filterFavoritePosts(items, filterText), [items, filterText]);

  const handleCopyClick = async (post: FavoritePost, key: string) => {
    const ok = await onCopyFileLink(post);
    if (ok) {
      setCopiedKey(key);
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopiedKey(null), 1800);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#09090B]">
      <div className="max-w-[1600px] mx-auto p-4 lg:p-6 space-y-6">
        {/* Favorites Header Bar */}
        <div className="p-4 rounded-lg bg-[#111114] border border-zinc-800 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <Heart className="w-4 h-4 text-rose-400 fill-rose-400 shrink-0" />
              <h1 className="font-display text-lg font-semibold text-zinc-100">
                Favorites
              </h1>
            </div>
            <p className="text-xs text-zinc-400">
              Bookmarked posts streamed directly from source URLs — not downloaded to disk.{' '}
              <span className="font-mono tabular-nums text-zinc-300">
                {items.length} {items.length === 1 ? 'post' : 'posts'}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {filteredItems.length > 0 && (
              <button
                type="button"
                onClick={() => onLaunchSlideshow(filteredItems, 0)}
                className="h-9 px-4 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-md inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Play Favorites Slideshow</span>
              </button>
            )}
            {items.length > 0 && (
              <button
                type="button"
                onClick={onClearFavorites}
                className="h-9 px-3.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-rose-300 text-xs font-medium rounded-md transition-colors whitespace-nowrap"
              >
                Clear All
              </button>
            )}
          </div>
        </div>

        {/* Search Favorites */}
        {items.length > 0 && (
          <div className="relative max-w-md">
            <label htmlFor="favorites-search" className="sr-only">
              Filter favorites
            </label>
            <Search
              aria-hidden="true"
              className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            />
            <input
              id="favorites-search"
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Filter favorites by tag, source, type, or ID..."
              className="w-full h-9 pl-9 pr-3 bg-zinc-950 border border-zinc-800 rounded-md text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        )}

        {/* Empty State or Grid */}
        {items.length === 0 ? (
          <div className="py-20 text-center border border-dashed border-zinc-800 rounded-lg bg-[#111114]/50">
            <h2 className="font-display text-lg font-semibold text-zinc-200">
              No favorites bookmarked yet
            </h2>
            <p className="text-sm text-zinc-400 mt-1 max-w-md mx-auto">
              Click the Favorite button in the slideshow control panel (or press <kbd className="px-1.5 py-0.5 bg-zinc-900 border border-zinc-700 rounded text-xs font-mono">L</kbd>) to bookmark posts here without downloading files to your local gallery.
            </p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-12 text-center text-sm text-zinc-400">
            No favorites match &ldquo;{filterText}&rdquo;.
          </div>
        ) : (
          <div
            data-testid="favorites-grid"
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3"
          >
            {filteredItems.map((post, idx) => {
              const key = getPostKey(post);
              const isSaved = savedKeys.has(key);
              const isSaving = savingIds.has(key);

              return (
                <article
                  key={key}
                  className="group rounded-lg overflow-hidden bg-[#111114] border border-zinc-800 hover:border-zinc-700 transition-colors"
                >
                  <div className="relative aspect-[4/3] bg-zinc-950 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => onLaunchSlideshow(filteredItems, idx)}
                      aria-label={`Open favorite post ${post.id} in slideshow`}
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

                    <div className="absolute top-2 right-2 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void handleCopyClick(post, key)}
                        aria-label={`Copy file link for favorite post ${post.id}`}
                        title="Copy file link"
                        className={`h-7 w-7 rounded inline-flex items-center justify-center border transition-opacity ${
                          copiedKey === key
                            ? 'opacity-100 bg-emerald-950/90 border-emerald-700/80 text-emerald-300'
                            : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 bg-black/80 border-white/15 text-zinc-100 hover:bg-zinc-800'
                        }`}
                      >
                        {copiedKey === key ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      </button>

                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => void onSavePost(post)}
                        aria-label={isSaved ? `Post ${post.id} saved locally` : `Download favorite post ${post.id} to local gallery`}
                        title={isSaved ? 'Saved to local gallery' : 'Download to local gallery'}
                        className={`h-7 w-7 rounded inline-flex items-center justify-center border transition-opacity ${
                          isSaved
                            ? 'opacity-100 bg-emerald-950/90 border-emerald-700/80 text-emerald-300'
                            : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 bg-black/80 border-white/15 text-zinc-100 hover:bg-blue-600 hover:border-blue-500'
                        }`}
                      >
                        {isSaving ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : isSaved ? (
                          <Check className="w-3 h-3" />
                        ) : (
                          <Download className="w-3 h-3" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => onRemoveFavorite(post)}
                        aria-label={`Remove post ${post.id} from favorites`}
                        title="Remove from favorites"
                        className="h-7 w-7 rounded bg-black/80 border border-white/15 text-zinc-300 hover:text-rose-400 flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

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
        )}
      </div>
    </div>
  );
}
