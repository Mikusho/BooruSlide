import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import {
  ALL_MEDIA_TYPES,
  ALL_RATINGS,
  BOARD_LABELS,
  filterPostsClientSide,
  sanitizeFilename,
  type AspectFilter,
  type BooruBoard,
  type BooruPost,
  type LocalGalleryItem,
  type MediaFilter,
  type MediaType,
  type PostRating,
  type SingleRating,
  type SlideFitMode,
  type SlideshowSettings,
  type SortOrder,
  type TagPreset,
} from './lib/booru';
import { copyTextToClipboard, getCopyableFileUrl } from './lib/clipboard';
import { pickBrowserGalleryDirectory, writeMediaToBrowserDirectory } from './lib/fsAccess';
import {
  BUILTIN_PRESETS,
  loadCustomPresets,
  loadSettings,
  saveCustomPresets,
  saveSettings,
} from './lib/presets';
import type { AppView } from './types/booru';
import { TopBar } from './components/TopBar';
import { TagFilterBar } from './components/TagFilterBar';
import { SlideshowStage } from './components/SlideshowStage';
import { GridGallery } from './components/GridGallery';
import { LocalGalleryView } from './components/LocalGalleryView';
import { PresetsView } from './components/PresetsView';
import { SettingsModal } from './components/SettingsModal';

const PAGE_LIMIT = 40;

interface ToastMessage {
  id: number;
  text: string;
  tone: 'success' | 'error';
}

interface SourceWarning {
  board?: BooruBoard;
  code?: string;
  message: string;
}

export default function App() {
  const [settings, setSettings] = useState<SlideshowSettings>(() => loadSettings());
  const [customPresets, setCustomPresets] = useState<TagPreset[]>(() => loadCustomPresets());

  const [activeView, setActiveView] = useState<AppView>('slideshow');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Search & filter state
  const [queryTags, setQueryTags] = useState('scenery sky');
  const [ratings, setRatings] = useState<SingleRating[]>(() =>
    loadSettings().sources.includes('rule34world') ? [...ALL_RATINGS] : ['general']
  );
  const [sort, setSort] = useState<SortOrder>('newest');
  const [mediaTypes, setMediaTypes] = useState<MediaType[]>(() => [...ALL_MEDIA_TYPES]);
  const [aspectFilter, setAspectFilter] = useState<AspectFilter>('all');
  const [minScore, setMinScore] = useState(0);

  // Posts & pagination state
  const [rawPosts, setRawPosts] = useState<BooruPost[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [apiWarning, setApiWarning] = useState<SourceWarning | null>(null);

  // Slideshow state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Offline local slideshow override
  const [offlineLocalPosts, setOfflineLocalPosts] = useState<BooruPost[] | null>(null);

  // Grid selection
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [isBatchSaving, setIsBatchSaving] = useState(false);

  // Local gallery folder state
  const [localItems, setLocalItems] = useState<LocalGalleryItem[]>([]);
  const [galleryDirectory, setGalleryDirectory] = useState('./gallery');
  const [galleryTotalBytes, setGalleryTotalBytes] = useState(0);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [browserDirHandle, setBrowserDirHandle] = useState<FileSystemDirectoryHandle | null>(null);

  // Track enriched post IDs so we only fetch details once
  const enrichedIdsRef = useRef<Set<string>>(new Set());

  // Toast notifications
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((text: string, tone: 'success' | 'error' = 'success') => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast({ id: Date.now(), text, tone });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, 3200);
  }, []);

  const updateSettings = useCallback((next: SlideshowSettings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  const refreshLocalGallery = useCallback(async () => {
    try {
      const res = await fetch('/api/gallery/list');
      if (!res.ok) return;
      const data = (await res.json()) as {
        directory: string;
        items: LocalGalleryItem[];
        totalBytes: number;
      };
      setGalleryDirectory(data.directory);
      setLocalItems(data.items);
      setGalleryTotalBytes(data.totalBytes);
    } catch {
      // Ignore transient refresh failure
    }
  }, []);

  useEffect(() => {
    void refreshLocalGallery();
  }, [refreshLocalGallery]);

  const savedKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const item of localItems) {
      if (item.id > 0) {
        keys.add(`${item.board}_${item.id}`);
      }
    }
    return keys;
  }, [localItems]);

  // Fetch posts across one or multiple enabled sources
  const fetchPosts = useCallback(
    async (opts: {
      tags: string;
      sources: BooruBoard[];
      ratingsVal: SingleRating[];
      sortVal: SortOrder;
      mediaVal: MediaType[];
      pid: number;
      append: boolean;
    }) => {
      setIsLoading(true);
      setApiWarning(null);

      try {
        const ratingParam: PostRating =
          opts.ratingsVal.length === ALL_RATINGS.length
            ? 'all'
            : opts.ratingsVal.length === 1
              ? opts.ratingsVal[0]
              : 'all';
        const mediaFilterParam: MediaFilter =
          opts.mediaVal.length === 1 ? opts.mediaVal[0] : 'all';
        const params = new URLSearchParams({
          boards: opts.sources.join(','),
          raw_tags: opts.tags,
          blacklist: settings.blacklist.join(','),
          rating: ratingParam,
          ratings: opts.ratingsVal.join(','),
          sort: opts.sortVal,
          media_filter: mediaFilterParam,
          media_types: opts.mediaVal.join(','),
          pid: String(opts.pid),
          limit: String(PAGE_LIMIT),
        });

        if (opts.sources.includes('gelbooru') && settings.gelbooruUserId && settings.gelbooruApiKey) {
          params.set('user_id', settings.gelbooruUserId);
          params.set('api_key', settings.gelbooruApiKey);
        }

        const res = await fetch(`/api/booru/posts?${params.toString()}`);
        const data = (await res.json()) as {
          posts?: BooruPost[];
          error?: string;
          code?: string;
          warnings?: { board: BooruBoard; code: string; message: string }[];
        };

        if (!res.ok) {
          setApiWarning({
            board: data.warnings?.[0]?.board,
            code: data.code,
            message: data.error || `Request failed (HTTP ${res.status})`,
          });
          if (!opts.append) {
            setRawPosts([]);
          }
          setHasMore(false);
          return;
        }

        if (Array.isArray(data.warnings) && data.warnings.length > 0) {
          setApiWarning(data.warnings[0]);
        }

        const incoming = Array.isArray(data.posts) ? data.posts : [];
        if (opts.append) {
          setRawPosts((prev) => {
            const seen = new Set(prev.map((p) => `${p.board}_${p.id}`));
            const merged = [...prev];
            for (const post of incoming) {
              const key = `${post.board}_${post.id}`;
              if (!seen.has(key)) {
                seen.add(key);
                merged.push(post);
              }
            }
            return merged;
          });
        } else {
          setRawPosts(incoming);
          setCurrentIndex(0);
          setSelectedKeys(new Set());
        }
        setPageIndex(opts.pid);
        setHasMore(incoming.length >= Math.min(PAGE_LIMIT, 15));
      } catch (error) {
        setApiWarning({
          message: error instanceof Error ? error.message : 'Network error loading posts',
        });
      } finally {
        setIsLoading(false);
      }
    },
    [settings.blacklist, settings.gelbooruUserId, settings.gelbooruApiKey]
  );

  // Initial search on mount
  useEffect(() => {
    void fetchPosts({
      tags: queryTags,
      sources: settings.sources,
      ratingsVal: ratings,
      sortVal: sort,
      mediaVal: mediaTypes,
      pid: 0,
      append: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const triggerFreshSearch = useCallback(
    (overrides?: {
      tags?: string;
      sources?: BooruBoard[];
      ratingsVal?: SingleRating[];
      sortVal?: SortOrder;
      mediaVal?: MediaType[];
    }) => {
      setOfflineLocalPosts(null);
      void fetchPosts({
        tags: overrides?.tags ?? queryTags,
        sources: overrides?.sources ?? settings.sources,
        ratingsVal: overrides?.ratingsVal ?? ratings,
        sortVal: overrides?.sortVal ?? sort,
        mediaVal: overrides?.mediaVal ?? mediaTypes,
        pid: 0,
        append: false,
      });
    },
    [fetchPosts, queryTags, settings.sources, ratings, sort, mediaTypes]
  );

  const handleToggleSource = useCallback(
    (board: BooruBoard) => {
      const exists = settings.sources.includes(board);
      let nextSources: BooruBoard[];
      if (exists) {
        if (settings.sources.length <= 1) return;
        nextSources = settings.sources.filter((b) => b !== board);
      } else {
        nextSources = [...settings.sources, board];
      }

      let nextRatings = ratings;
      if (!exists && board === 'rule34world' && !ratings.includes('explicit')) {
        nextRatings = [...ratings, 'explicit'];
        setRatings(nextRatings);
        showToast('Added Explicit rating to show Rule34.world results.');
      }

      updateSettings({
        ...settings,
        board: nextSources[0],
        sources: nextSources,
      });
      triggerFreshSearch({ sources: nextSources, ratingsVal: nextRatings });
    },
    [settings, ratings, updateSettings, triggerFreshSearch, showToast]
  );

  const handleToggleRating = useCallback(
    (target: SingleRating) => {
      const exists = ratings.includes(target);
      let nextRatings: SingleRating[];
      if (exists) {
        if (ratings.length <= 1) return;
        nextRatings = ratings.filter((r) => r !== target);
      } else {
        nextRatings = ALL_RATINGS.filter((r) => r === target || ratings.includes(r));
      }
      setRatings(nextRatings);
      triggerFreshSearch({ ratingsVal: nextRatings });
    },
    [ratings, triggerFreshSearch]
  );

  const handleSelectAllRatings = useCallback(() => {
    const nextRatings = [...ALL_RATINGS];
    setRatings(nextRatings);
    triggerFreshSearch({ ratingsVal: nextRatings });
  }, [triggerFreshSearch]);

  const handleToggleMediaType = useCallback(
    (target: MediaType) => {
      const exists = mediaTypes.includes(target);
      let nextMedia: MediaType[];
      if (exists) {
        if (mediaTypes.length <= 1) return;
        nextMedia = mediaTypes.filter((m) => m !== target);
      } else {
        nextMedia = ALL_MEDIA_TYPES.filter((m) => m === target || mediaTypes.includes(m));
      }
      setMediaTypes(nextMedia);
      triggerFreshSearch({ mediaVal: nextMedia });
    },
    [mediaTypes, triggerFreshSearch]
  );

  const handleSelectAllMediaTypes = useCallback(() => {
    const nextMedia = [...ALL_MEDIA_TYPES];
    setMediaTypes(nextMedia);
    triggerFreshSearch({ mediaVal: nextMedia });
  }, [triggerFreshSearch]);

  const handleEnrichPost = useCallback(async (post: BooruPost) => {
    if (post.board !== 'rule34world' || post.tags.length > 0) return;
    const key = `${post.board}_${post.id}`;
    if (enrichedIdsRef.current.has(key)) return;
    enrichedIdsRef.current.add(key);

    try {
      const res = await fetch(`/api/booru/post-detail?board=${post.board}&id=${post.id}`);
      if (!res.ok) return;
      const data = (await res.json()) as { post?: BooruPost };
      const detailed = data.post;
      if (!detailed || detailed.tags.length === 0) return;

      setRawPosts((prev) =>
        prev.map((item) =>
          item.board === post.board && item.id === post.id
            ? { ...item, tags: detailed.tags, score: detailed.score || item.score }
            : item
        )
      );
    } catch {
      // Ignore detail lookup failures
    }
  }, []);

  const handleLoadMore = useCallback(() => {
    if (isLoading || !hasMore) return;
    void fetchPosts({
      tags: queryTags,
      sources: settings.sources,
      ratingsVal: ratings,
      sortVal: sort,
      mediaVal: mediaTypes,
      pid: pageIndex + 1,
      append: true,
    });
  }, [fetchPosts, isLoading, hasMore, queryTags, settings.sources, ratings, sort, mediaTypes, pageIndex]);

  const filteredPosts = useMemo(() => {
    return filterPostsClientSide(rawPosts, {
      blacklist: settings.blacklist,
      mediaFilter: mediaTypes.length === 1 ? mediaTypes[0] : 'all',
      mediaTypes,
      aspectFilter,
      minScore,
      ratings,
    });
  }, [rawPosts, settings.blacklist, mediaTypes, aspectFilter, minScore, ratings]);

  useEffect(() => {
    const activeList = offlineLocalPosts ?? filteredPosts;
    if (currentIndex >= activeList.length && activeList.length > 0) {
      setCurrentIndex(activeList.length - 1);
    }
  }, [filteredPosts, offlineLocalPosts, currentIndex]);

  const getMediaSrc = useCallback((post: BooruPost, kind: 'full' | 'sample' | 'preview') => {
    const rawUrl =
      kind === 'preview' ? post.previewUrl : kind === 'sample' ? post.sampleUrl : post.fileUrl;
    if (rawUrl.startsWith('/api/')) {
      return rawUrl;
    }
    return `/api/proxy-media?url=${encodeURIComponent(rawUrl)}`;
  }, []);

  const handleSavePost = useCallback(
    async (post: BooruPost) => {
      const key = `${post.board}_${post.id}`;
      setSavingIds((prev) => new Set(prev).add(key));
      try {
        const res = await fetch('/api/gallery/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            post,
            filenamePattern: settings.filenamePattern,
          }),
        });
        const data = (await res.json()) as {
          item?: LocalGalleryItem;
          alreadyExists?: boolean;
          error?: string;
        };
        if (!res.ok || !data.item) {
          throw new Error(data.error || 'Failed to save image');
        }

        if (browserDirHandle) {
          const filename = sanitizeFilename(post, settings.filenamePattern);
          await writeMediaToBrowserDirectory(browserDirHandle, filename, data.item.url);
        }

        await refreshLocalGallery();
        showToast(
          data.alreadyExists
            ? `Already in gallery: ${data.item.filename}`
            : `Saved to local gallery: ${data.item.filename}`,
          'success'
        );
      } catch (error) {
        showToast(
          error instanceof Error ? error.message : 'Failed to save image to gallery',
          'error'
        );
      } finally {
        setSavingIds((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [settings.filenamePattern, browserDirHandle, refreshLocalGallery, showToast]
  );

  const handleCopyFileLink = useCallback(
    async (post: BooruPost): Promise<boolean> => {
      const url = getCopyableFileUrl(post.fileUrl);
      const ok = await copyTextToClipboard(url);
      if (ok) {
        showToast('Copied file link to clipboard');
      } else {
        showToast('Unable to access clipboard in this browser context', 'error');
      }
      return ok;
    },
    [showToast]
  );

  const handleBatchSave = useCallback(
    async (postsToSave: BooruPost[]) => {
      if (postsToSave.length === 0) return;
      setIsBatchSaving(true);
      let savedCount = 0;
      let failedCount = 0;

      for (const post of postsToSave) {
        try {
          const res = await fetch('/api/gallery/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              post,
              filenamePattern: settings.filenamePattern,
            }),
          });
          const data = (await res.json()) as { item?: LocalGalleryItem };
          if (!res.ok || !data.item) {
            failedCount++;
            continue;
          }
          if (browserDirHandle) {
            const filename = sanitizeFilename(post, settings.filenamePattern);
            await writeMediaToBrowserDirectory(browserDirHandle, filename, data.item.url);
          }
          savedCount++;
        } catch {
          failedCount++;
        }
      }

      await refreshLocalGallery();
      setIsBatchSaving(false);
      setSelectedKeys(new Set());

      if (failedCount === 0) {
        showToast(`Saved ${savedCount} image${savedCount === 1 ? '' : 's'} to local gallery folder.`);
      } else {
        showToast(
          `Saved ${savedCount} files; ${failedCount} failed to download.`,
          savedCount > 0 ? 'success' : 'error'
        );
      }
    },
    [settings.filenamePattern, browserDirHandle, refreshLocalGallery, showToast]
  );

  const handleDeleteLocalItem = useCallback(
    async (filename: string) => {
      const res = await fetch(`/api/gallery/file/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        showToast('Failed to remove file from local gallery.', 'error');
        return;
      }
      await refreshLocalGallery();
      showToast(`Removed ${filename} from local gallery.`);
    },
    [refreshLocalGallery, showToast]
  );

  const handleLaunchLocalSlideshow = useCallback((items: LocalGalleryItem[], startIndex: number) => {
    const mapped: BooruPost[] = items.map((item, idx) => ({
      id: item.id || idx + 1,
      board: item.board,
      tags: item.tags,
      fileUrl: item.url,
      sampleUrl: item.url,
      previewUrl: item.url,
      width: item.width || 1200,
      height: item.height || 800,
      rating: item.rating,
      score: item.score,
      owner: 'local',
      source: item.source,
      hash: item.filename,
      createdAt: item.savedAt,
      mediaType: item.mediaType,
      ext: item.ext,
    }));
    setOfflineLocalPosts(mapped);
    setCurrentIndex(startIndex);
    setActiveView('slideshow');
  }, []);

  const handleConnectBrowserFolder = useCallback(async () => {
    try {
      const handle = await pickBrowserGalleryDirectory();
      setBrowserDirHandle(handle);
      showToast(`Connected local browser folder: ${handle.name}`);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Unable to connect browser folder.',
        'error'
      );
    }
  }, [showToast]);

  const handleChangeGalleryDirectory = useCallback(
    async (dir: string) => {
      const res = await fetch('/api/gallery/folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: dir }),
      });
      const data = (await res.json()) as {
        directory?: string;
        error?: string;
      };
      if (!res.ok || !data.directory) {
        throw new Error(data.error || 'Failed to update folder path');
      }
      setGalleryDirectory(data.directory);
      await refreshLocalGallery();
    },
    [refreshLocalGallery]
  );

  const allPresets = useMemo(() => [...customPresets, ...BUILTIN_PRESETS], [customPresets]);

  const handleCreatePreset = useCallback(
    (preset: Omit<TagPreset, 'id'>) => {
      const created: TagPreset = {
        ...preset,
        id: `custom-${Date.now()}`,
      };
      const next = [created, ...customPresets];
      setCustomPresets(next);
      saveCustomPresets(next);
      showToast(`Saved preset "${created.name}"`);
    },
    [customPresets, showToast]
  );

  const handleDeletePreset = useCallback(
    (id: string) => {
      const next = customPresets.filter((p) => p.id !== id);
      setCustomPresets(next);
      saveCustomPresets(next);
    },
    [customPresets]
  );

  const singleOrAllRating: PostRating =
    ratings.length === ALL_RATINGS.length
      ? 'all'
      : ratings.length === 1
        ? ratings[0]
        : 'all';

  const handleRunPreset = useCallback(
    (preset: TagPreset, targetView: 'slideshow' | 'grid') => {
      const nextRatings: SingleRating[] =
        preset.rating === 'all' ? [...ALL_RATINGS] : [preset.rating];
      setQueryTags(preset.tags);
      setRatings(nextRatings);
      setActiveView(targetView);
      triggerFreshSearch({ tags: preset.tags, ratingsVal: nextRatings });
    },
    [triggerFreshSearch]
  );

  const handleSaveCurrentAsPreset = useCallback(() => {
    const cleanTags = queryTags.trim() || 'all_posts';
    const label = cleanTags
      .split(/\s+/)
      .slice(0, 3)
      .join(' ');
    handleCreatePreset({
      name: label,
      tags: cleanTags,
      rating: singleOrAllRating,
      description: `Saved from ${settings.sources.map((s) => BOARD_LABELS[s]).join(' + ')}`,
    });
  }, [queryTags, singleOrAllRating, settings.sources, handleCreatePreset]);

  const activeSlides = offlineLocalPosts ?? filteredPosts;
  const isOfflineLocalMode = offlineLocalPosts !== null;

  return (
    <div className="h-screen w-screen flex flex-col bg-[#09090B] text-[#F4F4F5] overflow-hidden">
      <TopBar
        activeView={activeView}
        onNavigate={(view) => {
          setActiveView(view);
          if (view !== 'slideshow') {
            setIsPlaying(false);
          }
        }}
        localCount={localItems.length}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Search & Tag Filter Bar shown on Slideshow (when live) and Grid views */}
      {(activeView === 'grid' || (activeView === 'slideshow' && !isOfflineLocalMode)) && (
        <TagFilterBar
          queryTags={queryTags}
          onQueryTagsChange={setQueryTags}
          onSubmitSearch={(override) => triggerFreshSearch({ tags: override ?? queryTags })}
          sources={settings.sources}
          onToggleSource={handleToggleSource}
          ratings={ratings}
          onToggleRating={handleToggleRating}
          onSelectAllRatings={handleSelectAllRatings}
          mediaTypes={mediaTypes}
          onToggleMediaType={handleToggleMediaType}
          onSelectAllMediaTypes={handleSelectAllMediaTypes}
          sort={sort}
          onSortChange={(nextSort) => {
            setSort(nextSort);
            triggerFreshSearch({ sortVal: nextSort });
          }}
          aspectFilter={aspectFilter}
          onAspectFilterChange={setAspectFilter}
          minScore={minScore}
          onMinScoreChange={setMinScore}
          blacklistCount={settings.blacklist.length}
          onOpenBlacklistSettings={() => setIsSettingsOpen(true)}
          gelbooruUserId={settings.gelbooruUserId}
          gelbooruApiKey={settings.gelbooruApiKey}
          isLoading={isLoading}
        />
      )}

      {/* Offline Local Slideshow Banner */}
      {activeView === 'slideshow' && isOfflineLocalMode && (
        <div className="px-4 lg:px-6 py-2 bg-[#111114] border-b border-zinc-800 flex items-center justify-between gap-4 text-xs shrink-0">
          <span className="text-zinc-300">
            Playing from <strong className="font-semibold text-white">Local Gallery Folder</strong> ({offlineLocalPosts.length} files)
          </span>
          <button
            type="button"
            onClick={() => {
              setOfflineLocalPosts(null);
              setCurrentIndex(0);
            }}
            className="text-blue-400 hover:text-blue-300 font-medium"
          >
            Return to Live Search Slideshow
          </button>
        </div>
      )}

      {/* Upstream API Warning / Error Banner */}
      {apiWarning && (activeView === 'slideshow' || activeView === 'grid') && !isOfflineLocalMode && (
        <div
          role="alert"
          className="px-4 lg:px-6 py-3 bg-rose-950/40 border-b border-rose-900/70 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0"
        >
          <div className="flex items-center gap-2 text-rose-200">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{apiWarning.message}</span>
          </div>
          <div className="flex items-center gap-2">
            {apiWarning.code === 'GELBOORU_AUTH_REQUIRED' && (
              <>
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(true)}
                  className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white font-medium rounded"
                >
                  Enter Gelbooru Credentials
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const remaining = settings.sources.filter((s) => s !== 'gelbooru');
                    const nextSources: BooruBoard[] = remaining.length > 0 ? remaining : ['safebooru'];
                    updateSettings({ ...settings, board: nextSources[0], sources: nextSources });
                    triggerFreshSearch({ sources: nextSources });
                  }}
                  className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-medium rounded"
                >
                  {settings.sources.length > 1 ? 'Disable Gelbooru' : 'Use Safebooru (No Key)'}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setApiWarning(null)}
              aria-label="Dismiss error"
              className="p-1 text-rose-300 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Main Active View */}
      <main className="flex-1 flex flex-col min-h-0">
        {activeView === 'slideshow' && (
          <SlideshowStage
            posts={activeSlides}
            currentIndex={currentIndex}
            onIndexChange={setCurrentIndex}
            isPlaying={isPlaying}
            onTogglePlay={() => setIsPlaying((p) => !p)}
            intervalSeconds={settings.intervalSeconds}
            onIntervalChange={(intervalSeconds) =>
              updateSettings({ ...settings, intervalSeconds })
            }
            loop={settings.loop}
            onToggleLoop={() => updateSettings({ ...settings, loop: !settings.loop })}
            shuffle={settings.shuffle}
            onToggleShuffle={() => updateSettings({ ...settings, shuffle: !settings.shuffle })}
            fitMode={settings.fitMode}
            onFitModeChange={(fitMode: SlideFitMode) =>
              updateSettings({ ...settings, fitMode })
            }
            preloadCount={settings.preloadCount}
            autoHideHud={settings.autoHideHud}
            isLoading={isLoading}
            hasMore={hasMore}
            onLoadMore={handleLoadMore}
            onSavePost={handleSavePost}
            onCopyFileLink={handleCopyFileLink}
            savingIds={savingIds}
            savedKeys={savedKeys}
            onSearchTag={(tag) => {
              setOfflineLocalPosts(null);
              setQueryTags(tag);
              triggerFreshSearch({ tags: tag });
            }}
            onIncludeTag={(tag) => {
              const tokens = queryTags.split(/\s+/).filter(Boolean);
              if (!tokens.includes(tag)) {
                const updated = [...tokens, tag].join(' ');
                setQueryTags(updated);
                triggerFreshSearch({ tags: updated });
              }
            }}
            onBlacklistTag={(tag) => {
              const clean = tag.toLowerCase();
              if (!settings.blacklist.includes(clean)) {
                updateSettings({
                  ...settings,
                  blacklist: [...settings.blacklist, clean],
                });
                showToast(`Added "${clean}" to tag blacklist`);
              }
            }}
            onSaveCurrentAsPreset={handleSaveCurrentAsPreset}
            onEnrichPost={handleEnrichPost}
            getMediaSrc={getMediaSrc}
            isOfflineLocalMode={isOfflineLocalMode}
          />
        )}

        {activeView === 'grid' && (
          <GridGallery
            posts={filteredPosts}
            isLoading={isLoading}
            hasMore={hasMore}
            onLoadMore={handleLoadMore}
            onOpenSlide={(idx) => {
              setOfflineLocalPosts(null);
              setCurrentIndex(idx);
              setActiveView('slideshow');
            }}
            onSavePost={handleSavePost}
            onCopyFileLink={handleCopyFileLink}
            onBatchSave={handleBatchSave}
            savingIds={savingIds}
            savedKeys={savedKeys}
            selectedKeys={selectedKeys}
            onToggleSelect={(key) => {
              setSelectedKeys((prev) => {
                const next = new Set(prev);
                if (next.has(key)) next.delete(key);
                else next.add(key);
                return next;
              });
            }}
            onSelectAll={() => {
              setSelectedKeys(new Set(filteredPosts.map((p) => `${p.board}_${p.id}`)));
            }}
            onClearSelection={() => setSelectedKeys(new Set())}
            isBatchSaving={isBatchSaving}
            getMediaSrc={getMediaSrc}
          />
        )}

        {activeView === 'local' && (
          <LocalGalleryView
            items={localItems}
            directory={galleryDirectory}
            totalBytes={galleryTotalBytes}
            browserFolderName={browserDirHandle?.name ?? null}
            onLaunchSlideshow={handleLaunchLocalSlideshow}
            onDeleteItem={handleDeleteLocalItem}
            onOpenFolderSettings={() => setIsSettingsOpen(true)}
          />
        )}

        {activeView === 'presets' && (
          <PresetsView
            presets={allPresets}
            currentTags={queryTags}
            currentRating={singleOrAllRating}
            onRunPreset={handleRunPreset}
            onCreatePreset={handleCreatePreset}
            onDeletePreset={handleDeletePreset}
          />
        )}
      </main>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={updateSettings}
        galleryDirectory={galleryDirectory}
        onChangeGalleryDirectory={handleChangeGalleryDirectory}
        browserFolderName={browserDirHandle?.name ?? null}
        onConnectBrowserFolder={handleConnectBrowserFolder}
        onDisconnectBrowserFolder={() => setBrowserDirHandle(null)}
      />

      {/* Toast Feedback */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-lg border shadow-xl text-xs font-medium flex items-center gap-2 ${
            toast.tone === 'error'
              ? 'bg-rose-950/95 border-rose-800 text-rose-100'
              : 'bg-zinc-900/95 border-zinc-700 text-zinc-100'
          }`}
        >
          {toast.tone === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  );
}
