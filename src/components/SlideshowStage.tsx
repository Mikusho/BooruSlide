import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookmarkPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Film,
  ImageOff,
  Info,
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Plus,
  Repeat,
  Shuffle,
  Slash,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { BOARD_LABELS, formatBytes } from '../lib/booru';
import { sharedMediaCache, type MediaLoadProgress } from '../lib/mediaCache';
import type { BooruPost, SlideFitMode } from '../types/booru';

const PRESET_INTERVALS = [3, 5, 6, 8, 15, 30];

interface SlideshowStageProps {
  posts: BooruPost[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  intervalSeconds: number;
  onIntervalChange: (seconds: number) => void;
  loop: boolean;
  onToggleLoop: () => void;
  shuffle: boolean;
  onToggleShuffle: () => void;
  fitMode: SlideFitMode;
  onFitModeChange: (mode: SlideFitMode) => void;
  preloadCount: number;
  autoHideHud: boolean;
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onSavePost: (post: BooruPost) => Promise<void>;
  onCopyFileLink: (post: BooruPost) => Promise<boolean>;
  savingIds: Set<string>;
  savedKeys: Set<string>;
  onSearchTag: (tag: string) => void;
  onIncludeTag: (tag: string) => void;
  onBlacklistTag: (tag: string) => void;
  onSaveCurrentAsPreset: () => void;
  onEnrichPost?: (post: BooruPost) => void;
  getMediaSrc: (post: BooruPost, kind: 'full' | 'sample' | 'preview') => string;
  isOfflineLocalMode?: boolean;
}

export function SlideshowStage({
  posts,
  currentIndex,
  onIndexChange,
  isPlaying,
  onTogglePlay,
  intervalSeconds,
  onIntervalChange,
  loop,
  onToggleLoop,
  shuffle,
  onToggleShuffle,
  fitMode,
  onFitModeChange,
  preloadCount,
  autoHideHud,
  isLoading,
  hasMore,
  onLoadMore,
  onSavePost,
  onCopyFileLink,
  savingIds,
  savedKeys,
  onSearchTag,
  onIncludeTag,
  onBlacklistTag,
  onSaveCurrentAsPreset,
  onEnrichPost,
  getMediaSrc,
  isOfflineLocalMode = false,
}: SlideshowStageProps) {
  const [showInspector, setShowInspector] = useState(false);
  const [showFilmstrip, setShowFilmstrip] = useState(true);
  const [hudHidden, setHudHidden] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);

  // Media download + cache + load readiness state
  const [resolvedMediaSrc, setResolvedMediaSrc] = useState<string>('');
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const [loadProgress, setLoadProgress] = useState<MediaLoadProgress>({
    loadedBytes: 0,
    totalBytes: null,
    percent: null,
  });
  const [fileSizeBytes, setFileSizeBytes] = useState<number | null>(null);
  const [wasCacheHit, setWasCacheHit] = useState(false);
  const [, setCacheRevision] = useState(0);

  // Timer progress bar state (starts ONLY after mediaLoaded === true)
  const [progressPct, setProgressPct] = useState(0);

  // Custom interval editor state
  const isPresetInterval = PRESET_INTERVALS.includes(intervalSeconds);
  const [customMode, setCustomMode] = useState(!isPresetInterval);
  const [customInput, setCustomInput] = useState(String(intervalSeconds));

  const stageRootRef = useRef<HTMLDivElement>(null);
  const filmstripRef = useRef<HTMLDivElement>(null);
  const copyTimerRef = useRef<number | null>(null);

  const currentPost = posts[currentIndex] ?? null;
  const rawMediaUrl = useMemo(() => {
    if (!currentPost) return '';
    return getMediaSrc(currentPost, 'full');
  }, [currentPost, getMediaSrc]);

  useEffect(() => {
    setCustomInput(String(intervalSeconds));
    if (!PRESET_INTERVALS.includes(intervalSeconds)) {
      setCustomMode(true);
    }
  }, [intervalSeconds]);

  useEffect(() => {
    setCopiedLink(false);
  }, [currentPost?.board, currentPost?.id]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (showInspector && currentPost && currentPost.tags.length === 0 && onEnrichPost) {
      onEnrichPost(currentPost);
    }
  }, [showInspector, currentPost, onEnrichPost]);

  // Load active slide through MediaBlobCache (images/GIFs) or stream video with size probe
  useEffect(() => {
    let cancelled = false;

    if (!currentPost || !rawMediaUrl) {
      setResolvedMediaSrc('');
      setMediaLoaded(false);
      setMediaError(false);
      setFileSizeBytes(null);
      setProgressPct(0);
      return;
    }

    setProgressPct(0);
    setMediaError(false);

    if (currentPost.mediaType === 'video') {
      // Stream video directly via Range/HTTP cache without loading progress bar
      setResolvedMediaSrc(rawMediaUrl);
      setMediaLoaded(false);
      setWasCacheHit(false);
      setFileSizeBytes(null);
      setLoadProgress({ loadedBytes: 0, totalBytes: null, percent: null });
      return () => {
        cancelled = true;
      };
    }

    // Check instant blob cache hit first
    const cached = sharedMediaCache.get(rawMediaUrl);
    if (cached) {
      setResolvedMediaSrc(cached.objectUrl);
      setFileSizeBytes(cached.sizeBytes);
      setLoadProgress({
        loadedBytes: cached.sizeBytes,
        totalBytes: cached.sizeBytes,
        percent: 100,
      });
      setWasCacheHit(true);
      setMediaLoaded(true);
      return;
    }

    // Cache miss -> download with byte progress bar
    setResolvedMediaSrc('');
    setMediaLoaded(false);
    setWasCacheHit(false);
    setFileSizeBytes(null);
    setLoadProgress({ loadedBytes: 0, totalBytes: null, percent: 0 });

    sharedMediaCache
      .load(rawMediaUrl, {
        onProgress: (prog) => {
          if (cancelled) return;
          setLoadProgress(prog);
        },
      })
      .then((entry) => {
        if (cancelled) return;
        setResolvedMediaSrc(entry.objectUrl);
        setFileSizeBytes(entry.sizeBytes);
        setLoadProgress({
          loadedBytes: entry.sizeBytes,
          totalBytes: entry.sizeBytes,
          percent: 100,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setMediaError(true);
        setMediaLoaded(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentPost, rawMediaUrl]);

  // Cache N slides ahead in background so navigating forward is instant
  useEffect(() => {
    if (posts.length <= 1 || preloadCount <= 0 || !mediaLoaded) return;
    let cancelled = false;

    const prefetchAhead = async () => {
      for (let offset = 1; offset <= preloadCount; offset++) {
        if (cancelled) break;
        const idx = (currentIndex + offset) % posts.length;
        const candidate = posts[idx];
        if (!candidate || candidate.mediaType === 'video') continue;
        const candidateUrl = getMediaSrc(candidate, 'full');
        if (sharedMediaCache.has(candidateUrl)) continue;
        try {
          await sharedMediaCache.load(candidateUrl);
          if (!cancelled) {
            setCacheRevision((v) => v + 1);
          }
        } catch {
          // Ignore prefetch failure for background slides
        }
      }
    };

    void prefetchAhead();
    return () => {
      cancelled = true;
    };
  }, [currentIndex, posts, preloadCount, mediaLoaded, getMediaSrc]);

  // Auto-advance timer: ONLY runs after mediaLoaded === true!
  useEffect(() => {
    if (!isPlaying || !currentPost || !mediaLoaded || mediaError || posts.length <= 1) {
      setProgressPct(0);
      return;
    }
    const durationMs = Math.max(500, intervalSeconds * 1000);
    const startTime = performance.now();

    const tick = window.setInterval(() => {
      const elapsed = performance.now() - startTime;
      const pct = Math.min(100, (elapsed / durationMs) * 100);
      setProgressPct(pct);
      if (elapsed >= durationMs) {
        window.clearInterval(tick);
        if (shuffle) {
          let next = Math.floor(Math.random() * posts.length);
          if (next === currentIndex && posts.length > 1) {
            next = (currentIndex + 1) % posts.length;
          }
          onIndexChange(next);
        } else if (currentIndex + 1 < posts.length) {
          onIndexChange(currentIndex + 1);
        } else if (loop) {
          onIndexChange(0);
        } else {
          onTogglePlay();
        }
      }
    }, 80);

    return () => window.clearInterval(tick);
  }, [
    isPlaying,
    currentPost,
    mediaLoaded,
    mediaError,
    currentIndex,
    posts.length,
    intervalSeconds,
    loop,
    shuffle,
    onIndexChange,
    onTogglePlay,
  ]);

  // Auto-load next page when nearing the end of loaded slides
  useEffect(() => {
    if (!isOfflineLocalMode && hasMore && !isLoading && posts.length > 0 && currentIndex >= posts.length - 4) {
      onLoadMore();
    }
  }, [currentIndex, posts.length, hasMore, isLoading, isOfflineLocalMode, onLoadMore]);

  // Scroll active thumbnail into view in filmstrip
  useEffect(() => {
    if (!showFilmstrip || !filmstripRef.current) return;
    const activeThumb = filmstripRef.current.querySelector<HTMLElement>(`[data-thumb-index="${currentIndex}"]`);
    if (activeThumb) {
      activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [currentIndex, showFilmstrip]);

  // Fullscreen listener
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const goPrev = () => {
    if (posts.length === 0) return;
    if (currentIndex > 0) {
      onIndexChange(currentIndex - 1);
    } else if (loop) {
      onIndexChange(posts.length - 1);
    }
  };

  const goNext = () => {
    if (posts.length === 0) return;
    if (shuffle && posts.length > 1) {
      let next = Math.floor(Math.random() * posts.length);
      if (next === currentIndex) next = (currentIndex + 1) % posts.length;
      onIndexChange(next);
      return;
    }
    if (currentIndex + 1 < posts.length) {
      onIndexChange(currentIndex + 1);
    } else if (loop) {
      onIndexChange(0);
    }
  };

  const toggleFullscreen = async () => {
    if (!stageRootRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await stageRootRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore if fullscreen is blocked by iframe permissions
    }
  };

  const commitCustomInterval = (rawVal: string) => {
    const num = Number(rawVal);
    if (!Number.isFinite(num) || num < 1) {
      setCustomInput(String(intervalSeconds));
      return;
    }
    const clamped = Math.min(3600, Math.round(num * 10) / 10);
    onIntervalChange(clamped);
    setCustomInput(String(clamped));
  };

  const triggerCopyLink = async () => {
    if (!currentPost) return;
    const ok = await onCopyFileLink(currentPost);
    if (ok) {
      setCopiedLink(true);
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopiedLink(false), 1800);
    }
  };

  // Global keyboard shortcuts (ignored while typing in inputs/selects)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        onTogglePlay();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        setShowInspector((v) => !v);
      } else if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        setHudHidden((v) => !v);
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      } else if ((e.key === 'c' || e.key === 'C') && !e.ctrlKey && !e.metaKey && !e.altKey && currentPost) {
        e.preventDefault();
        void triggerCopyLink();
      } else if ((e.key === 'd' || e.key === 'D' || e.key === 's' || e.key === 'S') && currentPost && !isOfflineLocalMode) {
        e.preventDefault();
        void onSavePost(currentPost);
      } else if (e.key === '1') {
        onFitModeChange('contain');
      } else if (e.key === '2') {
        onFitModeChange('cover');
      } else if (e.key === '3') {
        onFitModeChange('actual');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const postKey = currentPost ? `${currentPost.board}_${currentPost.id}` : '';
  const isSaving = postKey ? savingIds.has(postKey) : false;
  const isSaved = postKey ? savedKeys.has(postKey) : false;

  const effectiveHudHidden = hudHidden || (autoHideHud && isPlaying);

  if (isLoading && posts.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#050505] p-8 text-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-4" />
        <p className="text-sm font-medium text-zinc-200">Fetching collection slides...</p>
        <p className="text-xs text-zinc-500 mt-1">Applying active tag filters and rating rules</p>
      </div>
    );
  }

  if (!currentPost) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#050505] p-8 text-center">
        <div className="max-w-md space-y-3">
          <h2 className="font-display text-xl font-semibold text-zinc-100">No matching slides found</h2>
          <p className="text-sm text-zinc-400">
            Try clearing restrictive tags, adjusting your rating or aspect filter, or reviewing your blacklisted tags.
          </p>
        </div>
      </div>
    );
  }

  const fitClass =
    fitMode === 'contain'
      ? 'max-w-full max-h-full w-auto h-auto object-contain'
      : fitMode === 'cover'
        ? 'w-full h-full object-cover'
        : 'max-w-none max-h-none w-auto h-auto';

  const isMediaDownloading = currentPost.mediaType !== 'video' && !mediaLoaded && !mediaError;
  const loadingBarPercent = loadProgress.percent;

  return (
    <div
      ref={stageRootRef}
      data-testid="slideshow-stage"
      className="flex-1 flex flex-col min-h-0 bg-[#050505] relative overflow-hidden select-none"
    >
      {/* Top 2px dual-purpose bar: File download progress while loading, then slide countdown timer */}
      <div className="h-0.5 w-full bg-zinc-900 shrink-0 z-20 overflow-hidden">
        {isMediaDownloading ? (
          <div
            data-testid="top-loading-bar"
            className={`h-full bg-sky-400 transition-[width] duration-100 ease-out ${
              loadingBarPercent === null ? 'animate-pulse w-2/3' : ''
            }`}
            style={loadingBarPercent !== null ? { width: `${loadingBarPercent}%` } : undefined}
          />
        ) : (
          <div
            data-testid="slide-timer-bar"
            className="h-full bg-blue-500 transition-[width] duration-75 ease-linear"
            style={{ width: `${progressPct}%` }}
          />
        )}
      </div>

      {/* Main Theater + Optional Right Inspector */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Media Viewport */}
        <div
          className={`flex-1 relative flex items-center justify-center min-w-0 min-h-0 ${
            fitMode === 'actual' ? 'overflow-auto' : 'overflow-hidden'
          }`}
        >
          {mediaError ? (
            <div className="flex flex-col items-center justify-center p-8 text-center border border-zinc-800 bg-zinc-950 rounded-xl max-w-md">
              <ImageOff className="w-8 h-8 text-zinc-500 mb-3" />
              <p className="text-sm font-medium text-zinc-200">Media asset failed to load</p>
              <p className="text-xs text-zinc-500 mt-1 font-mono">
                Post #{currentPost.id} · {currentPost.ext.toUpperCase()}
              </p>
              <button
                type="button"
                onClick={() => {
                  setMediaError(false);
                  setMediaLoaded(false);
                  if (currentPost.mediaType === 'video') {
                    setResolvedMediaSrc('');
                    window.setTimeout(() => setResolvedMediaSrc(rawMediaUrl), 0);
                    return;
                  }
                  sharedMediaCache
                    .load(rawMediaUrl, {
                      onProgress: setLoadProgress,
                    })
                    .then((entry) => {
                      setResolvedMediaSrc(entry.objectUrl);
                      setFileSizeBytes(entry.sizeBytes);
                    })
                    .catch(() => setMediaError(true));
                }}
                className="mt-4 px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-100 rounded-md transition-colors"
              >
                Retry Media
              </button>
            </div>
          ) : currentPost.mediaType === 'video' ? (
            resolvedMediaSrc && (
              <video
                key={resolvedMediaSrc}
                src={resolvedMediaSrc}
                preload="auto"
                controls
                autoPlay
                loop
                muted={isMuted}
                playsInline
                onLoadedData={() => setMediaLoaded(true)}
                onError={() => setMediaError(true)}
                className={fitClass}
              />
            )
          ) : (
            resolvedMediaSrc && (
              <img
                key={resolvedMediaSrc}
                src={resolvedMediaSrc}
                alt={currentPost.tags.slice(0, 8).join(', ') || `Post ${currentPost.id}`}
                referrerPolicy="no-referrer"
                onLoad={() => setMediaLoaded(true)}
                onError={() => setMediaError(true)}
                className={`${fitClass} transition-opacity duration-150 ${
                  mediaLoaded ? 'opacity-100' : 'opacity-0'
                }`}
              />
            )
          )}

          {/* Centered Loading Bar & File Size Card while slide downloads */}
          {isMediaDownloading && (
            <div
              role="status"
              aria-live="polite"
              data-testid="media-loading-overlay"
              className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 p-4"
            >
              <div className="w-full max-w-xs bg-[#111114]/95 border border-zinc-800 rounded-lg p-4 shadow-2xl space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-zinc-200">Loading image</span>
                  <span className="font-mono tabular-nums text-zinc-400">
                    {loadingBarPercent !== null ? `${loadingBarPercent}%` : 'Streaming...'}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden">
                  <div
                    className={`h-full bg-blue-500 transition-[width] duration-100 ease-out ${
                      loadingBarPercent === null ? 'animate-pulse w-1/2' : ''
                    }`}
                    style={loadingBarPercent !== null ? { width: `${loadingBarPercent}%` } : undefined}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-zinc-400">
                  <span>
                    {loadProgress.totalBytes
                      ? `${formatBytes(loadProgress.loadedBytes)} / ${formatBytes(loadProgress.totalBytes)}`
                      : loadProgress.loadedBytes > 0
                        ? formatBytes(loadProgress.loadedBytes)
                        : 'Connecting...'}
                  </span>
                  <span>
                    #{currentPost.id} · {currentPost.ext.toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Left / Right Navigation Hit Zones */}
          <button
            type="button"
            onClick={goPrev}
            aria-label="Previous slide"
            className={`absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/60 hover:bg-black/85 border border-white/10 text-zinc-200 hover:text-white flex items-center justify-center transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              effectiveHudHidden ? 'opacity-0 hover:opacity-100' : 'opacity-85 hover:opacity-100'
            }`}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={goNext}
            aria-label="Next slide"
            className={`absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/60 hover:bg-black/85 border border-white/10 text-zinc-200 hover:text-white flex items-center justify-center transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              effectiveHudHidden ? 'opacity-0 hover:opacity-100' : 'opacity-85 hover:opacity-100'
            }`}
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          {/* Top-left subtle metadata scrim with File Size */}
          {!effectiveHudHidden && (
            <div
              data-testid="slide-metadata-scrim"
              className="absolute top-3 left-3 px-3 py-1.5 rounded-md bg-black/65 backdrop-blur-sm border border-white/10 text-xs text-zinc-300 flex flex-wrap items-center gap-2 pointer-events-none"
            >
              <span className="font-mono tabular-nums text-zinc-100">
                #{currentPost.id}
              </span>
              <span aria-hidden="true" className="text-zinc-600">·</span>
              <span>{BOARD_LABELS[currentPost.board]}</span>
              <span aria-hidden="true" className="text-zinc-600">·</span>
              <span className="font-mono tabular-nums">
                {currentPost.width} × {currentPost.height}
              </span>
              {fileSizeBytes !== null && (
                <>
                  <span aria-hidden="true" className="text-zinc-600">·</span>
                  <span className="font-mono tabular-nums text-zinc-200">
                    {formatBytes(fileSizeBytes)}
                  </span>
                </>
              )}
              <span aria-hidden="true" className="text-zinc-600">·</span>
              <span className="uppercase">{currentPost.ext}</span>
              {wasCacheHit && (
                <>
                  <span aria-hidden="true" className="text-zinc-600">·</span>
                  <span className="text-emerald-400">Cached</span>
                </>
              )}
            </div>
          )}

          {/* HUD Toggle floating chip if hidden */}
          {effectiveHudHidden && (
            <button
              type="button"
              onClick={() => setHudHidden(false)}
              aria-label="Show slideshow controls"
              className="absolute bottom-3 right-3 px-3 py-1.5 rounded-md bg-black/70 border border-white/10 text-xs text-zinc-200 hover:text-white inline-flex items-center gap-1.5"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Show Controls (H)</span>
            </button>
          )}
        </div>

        {/* Collapsible Right Tag & Metadata Inspector */}
        {showInspector && (
          <aside
            aria-label="Slide tags and metadata"
            className="absolute inset-y-0 right-0 w-full max-w-xs md:static md:w-80 border-l border-zinc-800 bg-[#111114] flex flex-col min-h-0 shrink-0 z-30 shadow-2xl md:shadow-none"
          >
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-100">Post Inspector</h2>
              <button
                type="button"
                onClick={() => setShowInspector(false)}
                className="text-xs text-zinc-400 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {/* Unboxed Metadata Readout */}
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-zinc-300">
                  <span className="text-zinc-500">Post ID</span>
                  <span className="font-mono tabular-nums">#{currentPost.id}</span>
                </div>
                <div className="flex items-center justify-between text-zinc-300">
                  <span className="text-zinc-500">Resolution</span>
                  <span className="font-mono tabular-nums">
                    {currentPost.width} × {currentPost.height}
                  </span>
                </div>
                <div className="flex items-center justify-between text-zinc-300">
                  <span className="text-zinc-500">File Size</span>
                  <span className="font-mono tabular-nums">
                    {fileSizeBytes !== null
                      ? formatBytes(fileSizeBytes)
                      : currentPost.mediaType === 'video'
                        ? 'Streamed'
                        : 'Loading...'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-zinc-300">
                  <span className="text-zinc-500">Score</span>
                  <span className="font-mono tabular-nums">{currentPost.score}</span>
                </div>
                <div className="flex items-center justify-between text-zinc-300">
                  <span className="text-zinc-500">Rating</span>
                  <span className="capitalize">{currentPost.rating}</span>
                </div>
                <div className="flex items-center justify-between text-zinc-300">
                  <span className="text-zinc-500">Source Board</span>
                  <span>{BOARD_LABELS[currentPost.board]}</span>
                </div>
                {currentPost.source && (
                  <div className="pt-1 flex items-center justify-between gap-2">
                    <span className="text-zinc-500 shrink-0">Source</span>
                    <a
                      href={currentPost.source.startsWith('http') ? currentPost.source : undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-400 hover:text-blue-300 truncate inline-flex items-center gap-1"
                    >
                      <span className="truncate">{currentPost.source}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  </div>
                )}
              </div>

              {/* Action Links */}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-zinc-800/80">
                {!isOfflineLocalMode && (
                  <button
                    type="button"
                    onClick={() => void onSavePost(currentPost)}
                    disabled={isSaving}
                    className={`flex-1 py-2 px-3 rounded-md text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors ${
                      isSaved
                        ? 'bg-emerald-950/60 border border-emerald-700/60 text-emerald-300'
                        : 'bg-blue-600 hover:bg-blue-500 text-white'
                    }`}
                  >
                    {isSaving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : isSaved ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    <span>{isSaved ? 'Saved Locally' : 'Save to Gallery'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => void triggerCopyLink()}
                  className={`py-2 px-3 border rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${
                    copiedLink
                      ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                      : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-200'
                  }`}
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedLink ? 'Copied Link' : 'Copy File Link'}</span>
                </button>

                <button
                  type="button"
                  onClick={onSaveCurrentAsPreset}
                  className="py-2 px-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-md text-xs font-medium text-zinc-200 inline-flex items-center gap-1.5 transition-colors"
                >
                  <BookmarkPlus className="w-3.5 h-3.5" />
                  <span>Save Preset</span>
                </button>
              </div>

              {/* Clickable Tag List */}
              <div className="pt-2 border-t border-zinc-800/80">
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-xs font-semibold text-zinc-300">
                    Tags ({currentPost.tags.length})
                  </h3>
                  <span className="text-[11px] text-zinc-500">+ add · − block</span>
                </div>
                <ul className="space-y-1">
                  {currentPost.tags.map((tag) => (
                    <li
                      key={tag}
                      className="flex items-center justify-between gap-2 py-1 px-2 rounded hover:bg-zinc-900/90 group"
                    >
                      <button
                        type="button"
                        onClick={() => onSearchTag(tag)}
                        className="text-xs text-zinc-300 hover:text-blue-400 truncate text-left flex-1 transition-colors"
                        title={`Search for ${tag}`}
                      >
                        {tag}
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => onIncludeTag(tag)}
                          aria-label={`Include tag ${tag}`}
                          title={`Add ${tag} to current search`}
                          className="p-1 text-zinc-500 hover:text-emerald-400 rounded transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onBlacklistTag(tag)}
                          aria-label={`Blacklist tag ${tag}`}
                          title={`Add ${tag} to blacklist`}
                          className="p-1 text-zinc-500 hover:text-rose-400 rounded transition-colors"
                        >
                          <Slash className="w-3 h-3" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Bottom Playback Controls & Optional Filmstrip */}
      {!effectiveHudHidden && (
        <div className="border-t border-zinc-800 bg-[#111114] shrink-0 z-20">
          {/* Controls Dock */}
          <div className="px-3 sm:px-4 py-2 sm:py-2.5 flex flex-wrap items-center justify-between gap-2 sm:gap-3">
            {/* Left Transport Controls */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onTogglePlay}
                aria-label={isPlaying ? 'Pause slideshow' : 'Play slideshow'}
                className="h-9 px-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{isPlaying ? 'Pause' : 'Play'}</span>
              </button>

              <button
                type="button"
                onClick={goPrev}
                aria-label="Previous slide button"
                className="h-9 w-9 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 rounded-md inline-flex items-center justify-center transition-colors shrink-0"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={goNext}
                aria-label="Next slide button"
                className="h-9 w-9 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 rounded-md inline-flex items-center justify-center transition-colors shrink-0"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <span
                data-testid="slide-counter"
                className="ml-1.5 text-xs font-mono tabular-nums text-zinc-300 whitespace-nowrap"
              >
                {currentIndex + 1} / {posts.length}
              </span>
            </div>

            {/* Center Timing & Mode Controls */}
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="interval-select" className="text-xs text-zinc-400">
                Interval
              </label>
              <select
                id="interval-select"
                aria-label="Slide interval"
                value={customMode ? 'custom' : String(intervalSeconds)}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'custom') {
                    setCustomMode(true);
                  } else {
                    setCustomMode(false);
                    onIntervalChange(Number(val));
                  }
                }}
                className="h-8 px-2 bg-zinc-950 border border-zinc-800 rounded text-xs font-mono tabular-nums text-zinc-200 focus:outline-none focus:border-blue-500"
              >
                {PRESET_INTERVALS.map((sec) => (
                  <option key={sec} value={sec}>
                    {sec}s
                  </option>
                ))}
                <option value="custom">Custom</option>
              </select>

              {customMode && (
                <div className="inline-flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={3600}
                    step={0.5}
                    aria-label="Custom interval seconds"
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    onBlur={() => commitCustomInterval(customInput)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitCustomInterval(customInput);
                      }
                    }}
                    className="w-16 h-8 px-2 bg-zinc-950 border border-zinc-700 rounded text-xs font-mono tabular-nums text-zinc-100 focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-xs text-zinc-400 font-mono">s</span>
                </div>
              )}

              <button
                type="button"
                onClick={onToggleShuffle}
                aria-pressed={shuffle}
                aria-label="Toggle shuffle"
                className={`h-8 px-2.5 rounded border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                  shuffle
                    ? 'bg-zinc-800 border-zinc-600 text-white'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Shuffle className="w-3.5 h-3.5" />
                <span>Shuffle</span>
              </button>

              <button
                type="button"
                onClick={onToggleLoop}
                aria-pressed={loop}
                aria-label="Toggle loop"
                className={`h-8 px-2.5 rounded border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                  loop
                    ? 'bg-zinc-800 border-zinc-600 text-white'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Repeat className="w-3.5 h-3.5" />
                <span>Loop</span>
              </button>

              <div role="group" aria-label="Image fit mode" className="flex items-center bg-zinc-950 border border-zinc-800 rounded p-0.5">
                {(['contain', 'cover', 'actual'] as SlideFitMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onFitModeChange(mode)}
                    className={`px-2 py-1 text-xs rounded transition-colors whitespace-nowrap ${
                      fitMode === mode
                        ? 'bg-zinc-800 text-white font-medium'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {mode === 'contain' ? 'Fit' : mode === 'cover' ? 'Fill' : '1:1'}
                  </button>
                ))}
              </div>

              {currentPost.mediaType === 'video' && (
                <button
                  type="button"
                  onClick={() => setIsMuted((m) => !m)}
                  aria-label={isMuted ? 'Unmute video' : 'Mute video'}
                  className="h-8 px-2.5 rounded border border-zinc-800 bg-zinc-950 text-zinc-300 hover:text-white inline-flex items-center gap-1 text-xs"
                >
                  {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>

            {/* Right Gallery Save & View Controls */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => void triggerCopyLink()}
                aria-label="Copy file link source"
                title="Copy direct file link (C)"
                className={`h-9 px-3 rounded-md text-xs font-medium inline-flex items-center gap-1.5 border transition-colors whitespace-nowrap shrink-0 ${
                  copiedLink
                    ? 'bg-emerald-950/50 border-emerald-700/60 text-emerald-300'
                    : 'bg-zinc-950 hover:bg-zinc-900 border-zinc-800 text-zinc-200'
                }`}
              >
                {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Copied' : 'Copy Link'}</span>
              </button>

              {!isOfflineLocalMode && (
                <button
                  type="button"
                  onClick={() => void onSavePost(currentPost)}
                  disabled={isSaving}
                  className={`h-9 px-3.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 border transition-colors whitespace-nowrap shrink-0 ${
                    isSaved
                      ? 'bg-emerald-950/50 border-emerald-700/60 text-emerald-300'
                      : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-100'
                  }`}
                >
                  {isSaving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : isSaved ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span>{isSaved ? 'Saved' : 'Save to Gallery'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowInspector((v) => !v)}
                aria-pressed={showInspector}
                className={`h-9 px-3 rounded-md border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                  showInspector
                    ? 'bg-zinc-800 border-zinc-600 text-white'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:text-white'
                }`}
              >
                <Info className="w-3.5 h-3.5" />
                <span>Tags</span>
              </button>

              <button
                type="button"
                onClick={() => setShowFilmstrip((v) => !v)}
                aria-pressed={showFilmstrip}
                aria-label="Toggle filmstrip"
                className={`h-9 px-3 rounded-md border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                  showFilmstrip
                    ? 'bg-zinc-800 border-zinc-600 text-white'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:text-white'
                }`}
              >
                <Film className="w-3.5 h-3.5" />
                <span>Strip</span>
              </button>

              <button
                type="button"
                onClick={() => setHudHidden(true)}
                aria-label="Hide controls"
                title="Hide controls (H)"
                className="h-9 w-9 rounded-md border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white inline-flex items-center justify-center"
              >
                <EyeOff className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                title="Fullscreen (F)"
                className="h-9 w-9 rounded-md border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white inline-flex items-center justify-center"
              >
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Thumbnail Filmstrip */}
          {showFilmstrip && (
            <div
              ref={filmstripRef}
              className="h-20 border-t border-zinc-800/80 bg-[#09090B] px-4 py-2 flex items-center gap-2 overflow-x-auto"
            >
              {posts.map((post, idx) => {
                const isActive = idx === currentIndex;
                const key = `${post.board}_${post.id}`;
                const thumbSaved = savedKeys.has(key);
                const thumbCached = sharedMediaCache.has(getMediaSrc(post, 'full'));
                return (
                  <button
                    key={key}
                    type="button"
                    data-thumb-index={idx}
                    onClick={() => onIndexChange(idx)}
                    aria-label={`Jump to slide ${idx + 1}, post ${post.id}`}
                    className={`relative h-14 w-20 rounded overflow-hidden shrink-0 border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      isActive
                        ? 'border-blue-500 ring-1 ring-blue-500 opacity-100'
                        : 'border-zinc-800 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img
                      src={getMediaSrc(post, 'preview')}
                      alt={`Thumbnail ${post.id}`}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    {thumbCached && !isActive && (
                      <span
                        aria-hidden="true"
                        title="Preloaded in cache"
                        className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-sky-400"
                      />
                    )}
                    {thumbSaved && (
                      <span
                        aria-label="Saved locally"
                        className="absolute bottom-1 right-1 w-4 h-4 rounded-sm bg-emerald-600/90 text-white flex items-center justify-center"
                      >
                        <Check className="w-2.5 h-2.5" />
                      </span>
                    )}
                  </button>
                );
              })}

              {!isOfflineLocalMode && hasMore && (
                <button
                  type="button"
                  onClick={onLoadMore}
                  disabled={isLoading}
                  className="h-14 px-4 rounded border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-xs font-medium text-zinc-300 shrink-0 whitespace-nowrap"
                >
                  {isLoading ? 'Loading...' : 'Load More'}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
