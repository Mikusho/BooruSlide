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
  FlipHorizontal2,
  FlipVertical2,
  Heart,
  ImageOff,
  Info,
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Plus,
  Repeat,
  RotateCcw,
  RotateCw,
  Shuffle,
  SkipBack,
  SkipForward,
  Slash,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { BOARD_LABELS, formatBytes } from '../lib/booru';
import { sharedMediaCache, type MediaLoadProgress } from '../lib/mediaCache';
import {
  buildMediaTransformStyle,
  clampPan,
  DEFAULT_MEDIA_TRANSFORM,
  formatMediaDuration,
  isTransformModified,
  MAX_ZOOM,
  MIN_ZOOM,
  stepZoom,
  type MediaTransformState,
} from '../lib/mediaTransform';
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
  onToggleFavorite: (post: BooruPost) => void;
  savingIds: Set<string>;
  savedKeys: Set<string>;
  favoriteKeys: Set<string>;
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
  onToggleFavorite,
  savingIds,
  savedKeys,
  favoriteKeys,
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

  // Image/media transform (zoom, pan, rotate, flip) & video transport state
  const [transform, setTransform] = useState<MediaTransformState>(DEFAULT_MEDIA_TRANSFORM);
  const [isDraggingPan, setIsDraggingPan] = useState(false);
  const [videoPaused, setVideoPaused] = useState(false);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoRate, setVideoRate] = useState(1);
  const [videoVolume, setVideoVolume] = useState(0.8);

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
  const viewportRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const filmstripRef = useRef<HTMLDivElement>(null);
  const copyTimerRef = useRef<number | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

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
    setTransform(DEFAULT_MEDIA_TRANSFORM);
    setIsDraggingPan(false);
    setVideoPaused(false);
    setVideoCurrentTime(0);
    setVideoDuration(0);
    dragStateRef.current = null;
  }, [currentPost?.board, currentPost?.id]);

  useEffect(() => {
    setTransform(DEFAULT_MEDIA_TRANSFORM);
    setIsDraggingPan(false);
    dragStateRef.current = null;
  }, [fitMode]);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.playbackRate = videoRate;
    vid.volume = videoVolume;
  }, [videoRate, videoVolume, resolvedMediaSrc]);

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

  const zoomIn = () => {
    setTransform((prev) => ({
      ...prev,
      zoom: stepZoom(prev.zoom, 'in'),
    }));
  };

  const zoomOut = () => {
    setTransform((prev) => {
      const nextZoom = stepZoom(prev.zoom, 'out');
      const clamped = clampPan({ x: prev.panX, y: prev.panY }, nextZoom);
      return {
        ...prev,
        zoom: nextZoom,
        panX: clamped.x,
        panY: clamped.y,
      };
    });
  };

  const resetTransform = () => {
    setTransform(DEFAULT_MEDIA_TRANSFORM);
    setIsDraggingPan(false);
    dragStateRef.current = null;
  };

  const rotateBy = (degrees: number) => {
    setTransform((prev) => ({
      ...prev,
      rotation: prev.rotation + degrees,
    }));
  };

  const toggleFlipH = () => {
    setTransform((prev) => ({ ...prev, flipH: !prev.flipH }));
  };

  const toggleFlipV = () => {
    setTransform((prev) => ({ ...prev, flipV: !prev.flipV }));
  };

  const toggleDoubleClickZoom = () => {
    setTransform((prev) => {
      if (prev.zoom > 1.05) {
        return { ...prev, zoom: 1, panX: 0, panY: 0 };
      }
      return { ...prev, zoom: 2 };
    });
  };

  const toggleVideoPlay = () => {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) {
      void vid.play().catch(() => undefined);
      setVideoPaused(false);
    } else {
      vid.pause();
      setVideoPaused(true);
    }
  };

  const seekVideoBy = (deltaSeconds: number) => {
    const vid = videoRef.current;
    if (!vid) return;
    const maxTime = Number.isFinite(vid.duration) ? vid.duration : vid.currentTime + Math.max(0, deltaSeconds);
    const next = Math.min(maxTime, Math.max(0, vid.currentTime + deltaSeconds));
    vid.currentTime = next;
    setVideoCurrentTime(next);
  };

  // Mouse wheel zoom directly inside viewport (in 1:1 mode, require Ctrl/Meta so scrollbars work normally)
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || !currentPost) return;

    const handleWheel = (e: WheelEvent) => {
      if (fitMode === 'actual' && !e.ctrlKey && !e.metaKey) return;
      if (currentPost.mediaType === 'video' && !e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const direction = e.deltaY < 0 ? 'in' : 'out';
      setTransform((prev) => {
        const nextZoom = stepZoom(prev.zoom, direction, 0.15);
        const clamped = clampPan({ x: prev.panX, y: prev.panY }, nextZoom);
        return {
          ...prev,
          zoom: nextZoom,
          panX: clamped.x,
          panY: clamped.y,
        };
      });
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [currentPost, fitMode]);

  const handleViewportPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (transform.zoom <= 1 || e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('button, input, select, a, [data-testid="media-controls-bar"]')) return;
    if (currentPost?.mediaType === 'video') return;

    e.currentTarget.setPointerCapture(e.pointerId);
    dragStateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: transform.panX,
      originY: transform.panY,
    };
    setIsDraggingPan(true);
  };

  const handleViewportPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    setTransform((prev) => {
      const clamped = clampPan({ x: drag.originX + dx, y: drag.originY + dy }, prev.zoom);
      return { ...prev, panX: clamped.x, panY: clamped.y };
    });
  };

  const handleViewportPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragStateRef.current = null;
    setIsDraggingPan(false);
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
      } else if ((e.key === 'l' || e.key === 'L') && currentPost && !isOfflineLocalMode && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        onToggleFavorite(currentPost);
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        zoomIn();
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        zoomOut();
      } else if (e.key === '0') {
        e.preventDefault();
        resetTransform();
      } else if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        rotateBy(e.shiftKey ? -90 : 90);
      } else if ((e.key === 'm' || e.key === 'M') && currentPost?.mediaType === 'video') {
        e.preventDefault();
        setIsMuted((m) => !m);
      } else if ((e.key === 'k' || e.key === 'K') && currentPost?.mediaType === 'video') {
        e.preventDefault();
        toggleVideoPlay();
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
  const isFavorited = postKey ? favoriteKeys.has(postKey) : false;

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
  const transformModified = isTransformModified(transform);
  const mediaTransformCss = buildMediaTransformStyle(transform);
  const zoomPercent = Math.round(transform.zoom * 100);

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
          ref={viewportRef}
          onPointerDown={handleViewportPointerDown}
          onPointerMove={handleViewportPointerMove}
          onPointerUp={handleViewportPointerUp}
          onPointerCancel={handleViewportPointerUp}
          className={`flex-1 relative flex items-center justify-center min-w-0 min-h-0 ${
            fitMode === 'actual' ? 'overflow-auto' : 'overflow-hidden'
          } ${
            transform.zoom > 1 && currentPost.mediaType !== 'video'
              ? isDraggingPan
                ? 'cursor-grabbing'
                : 'cursor-grab'
              : ''
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
                ref={videoRef}
                key={resolvedMediaSrc}
                data-testid="stage-media-element"
                src={resolvedMediaSrc}
                preload="auto"
                controls
                autoPlay
                loop
                muted={isMuted}
                playsInline
                onLoadedData={() => setMediaLoaded(true)}
                onLoadedMetadata={(e) => {
                  setVideoDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0);
                  e.currentTarget.playbackRate = videoRate;
                  e.currentTarget.volume = videoVolume;
                }}
                onTimeUpdate={(e) => setVideoCurrentTime(e.currentTarget.currentTime)}
                onPlay={() => setVideoPaused(false)}
                onPause={() => setVideoPaused(true)}
                onError={() => setMediaError(true)}
                style={{
                  transform: mediaTransformCss,
                  transition: 'transform 120ms ease-out',
                }}
                className={fitClass}
              />
            )
          ) : (
            resolvedMediaSrc && (
              <img
                key={resolvedMediaSrc}
                data-testid="stage-media-element"
                src={resolvedMediaSrc}
                alt={currentPost.tags.slice(0, 8).join(', ') || `Post ${currentPost.id}`}
                referrerPolicy="no-referrer"
                draggable={false}
                onDoubleClick={toggleDoubleClickZoom}
                onLoad={() => setMediaLoaded(true)}
                onError={() => setMediaError(true)}
                style={{
                  transform: mediaTransformCss,
                  transition: isDraggingPan ? 'none' : 'transform 120ms ease-out, opacity 150ms ease',
                }}
                className={`${fitClass} ${mediaLoaded ? 'opacity-100' : 'opacity-0'}`}
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
            className={`absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/60 hover:bg-black/85 border border-white/10 text-zinc-200 hover:text-white flex items-center justify-center transition-opacity z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              effectiveHudHidden ? 'opacity-0 hover:opacity-100' : 'opacity-85 hover:opacity-100'
            }`}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={goNext}
            aria-label="Next slide"
            className={`absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/60 hover:bg-black/85 border border-white/10 text-zinc-200 hover:text-white flex items-center justify-center transition-opacity z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              effectiveHudHidden ? 'opacity-0 hover:opacity-100' : 'opacity-85 hover:opacity-100'
            }`}
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          {/* Top Scrim Row: Metadata on Left + Image/Media Controls on Right (flex-wrap prevents overlap) */}
          {!effectiveHudHidden && (
            <div className="absolute top-3 inset-x-3 flex flex-wrap items-start justify-between gap-2 pointer-events-none z-20">
              <div
                data-testid="slide-metadata-scrim"
                className="px-3 py-1.5 rounded-md bg-black/70 backdrop-blur-sm border border-white/10 text-xs text-zinc-300 flex flex-wrap items-center gap-2"
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

              {/* Image & Media Controls Toolbar */}
              <div
                data-testid="media-controls-bar"
                role="toolbar"
                aria-label="Image and media controls"
                className="pointer-events-auto max-w-full px-1.5 py-1 rounded-lg bg-black/75 backdrop-blur-sm border border-white/10 shadow-xl flex flex-wrap items-center gap-1 text-xs text-zinc-200"
              >
                {currentPost.mediaType === 'video' && (
                  <>
                    <button
                      type="button"
                      onClick={toggleVideoPlay}
                      aria-label={videoPaused ? 'Play video' : 'Pause video'}
                      title={videoPaused ? 'Play video (K)' : 'Pause video (K)'}
                      className="h-7 w-7 rounded hover:bg-white/10 inline-flex items-center justify-center text-zinc-200 hover:text-white transition-colors"
                    >
                      {videoPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => seekVideoBy(-5)}
                      aria-label="Skip back 5 seconds"
                      title="Back 5s"
                      className="h-7 px-1.5 rounded hover:bg-white/10 inline-flex items-center gap-0.5 text-[11px] font-mono text-zinc-300 hover:text-white transition-colors"
                    >
                      <SkipBack className="w-3 h-3" />
                      <span>5s</span>
                    </button>

                    <span
                      data-testid="video-time-readout"
                      className="px-1 font-mono tabular-nums text-[11px] text-zinc-300 whitespace-nowrap"
                    >
                      {formatMediaDuration(videoCurrentTime)} / {formatMediaDuration(videoDuration)}
                    </span>

                    <button
                      type="button"
                      onClick={() => seekVideoBy(5)}
                      aria-label="Skip forward 5 seconds"
                      title="Forward 5s"
                      className="h-7 px-1.5 rounded hover:bg-white/10 inline-flex items-center gap-0.5 text-[11px] font-mono text-zinc-300 hover:text-white transition-colors"
                    >
                      <span>5s</span>
                      <SkipForward className="w-3 h-3" />
                    </button>

                    <select
                      aria-label="Video playback speed"
                      title="Playback speed"
                      value={videoRate}
                      onChange={(e) => setVideoRate(Number(e.target.value))}
                      className="h-7 px-1.5 rounded bg-zinc-900/90 border border-white/10 text-[11px] font-mono tabular-nums text-zinc-200 focus:outline-none focus:border-blue-500"
                    >
                      <option value={0.5}>0.5x</option>
                      <option value={1}>1x</option>
                      <option value={1.25}>1.25x</option>
                      <option value={1.5}>1.5x</option>
                      <option value={2}>2x</option>
                    </select>

                    <div className="inline-flex items-center gap-1 px-1">
                      <button
                        type="button"
                        onClick={() => setIsMuted((m) => !m)}
                        aria-label={isMuted ? 'Unmute video' : 'Mute video'}
                        title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
                        className="h-7 w-7 rounded hover:bg-white/10 inline-flex items-center justify-center text-zinc-200 hover:text-white transition-colors"
                      >
                        {isMuted || videoVolume === 0 ? (
                          <VolumeX className="w-3.5 h-3.5" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        aria-label="Video volume"
                        value={isMuted ? 0 : videoVolume}
                        onChange={(e) => {
                          const nextVol = Number(e.target.value);
                          setVideoVolume(nextVol);
                          if (nextVol > 0 && isMuted) setIsMuted(false);
                          if (nextVol === 0 && !isMuted) setIsMuted(true);
                        }}
                        className="w-14 accent-blue-500 cursor-pointer"
                      />
                    </div>

                    <span aria-hidden="true" className="h-4 w-px bg-white/15 mx-0.5" />
                  </>
                )}

                <button
                  type="button"
                  onClick={zoomOut}
                  disabled={transform.zoom <= MIN_ZOOM}
                  aria-label="Zoom out"
                  title="Zoom out (-)"
                  className="h-7 w-7 rounded hover:bg-white/10 disabled:opacity-40 disabled:pointer-events-none inline-flex items-center justify-center text-zinc-200 hover:text-white transition-colors"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={resetTransform}
                  data-testid="zoom-level-badge"
                  aria-label={`Zoom ${zoomPercent} percent, click to reset`}
                  title="Click to reset zoom (0) · Double-click image to toggle 200%"
                  className="h-7 px-2 rounded hover:bg-white/10 font-mono tabular-nums text-[11px] text-zinc-100 min-w-[3.1rem] text-center transition-colors"
                >
                  {zoomPercent}%
                </button>

                <button
                  type="button"
                  onClick={zoomIn}
                  disabled={transform.zoom >= MAX_ZOOM}
                  aria-label="Zoom in"
                  title="Zoom in (+)"
                  className="h-7 w-7 rounded hover:bg-white/10 disabled:opacity-40 disabled:pointer-events-none inline-flex items-center justify-center text-zinc-200 hover:text-white transition-colors"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>

                <span aria-hidden="true" className="h-4 w-px bg-white/15 mx-0.5" />

                <button
                  type="button"
                  onClick={() => rotateBy(-90)}
                  aria-label="Rotate left 90 degrees"
                  title="Rotate -90° (Shift+R)"
                  className="h-7 w-7 rounded hover:bg-white/10 inline-flex items-center justify-center text-zinc-200 hover:text-white transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => rotateBy(90)}
                  aria-label="Rotate right 90 degrees"
                  title="Rotate +90° (R)"
                  className="h-7 w-7 rounded hover:bg-white/10 inline-flex items-center justify-center text-zinc-200 hover:text-white transition-colors"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={toggleFlipH}
                  aria-pressed={transform.flipH}
                  aria-label="Flip horizontal"
                  title="Flip horizontal"
                  className={`h-7 w-7 rounded inline-flex items-center justify-center transition-colors ${
                    transform.flipH
                      ? 'bg-blue-600/80 text-white'
                      : 'hover:bg-white/10 text-zinc-200 hover:text-white'
                  }`}
                >
                  <FlipHorizontal2 className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={toggleFlipV}
                  aria-pressed={transform.flipV}
                  aria-label="Flip vertical"
                  title="Flip vertical"
                  className={`h-7 w-7 rounded inline-flex items-center justify-center transition-colors ${
                    transform.flipV
                      ? 'bg-blue-600/80 text-white'
                      : 'hover:bg-white/10 text-zinc-200 hover:text-white'
                  }`}
                >
                  <FlipVertical2 className="w-3.5 h-3.5" />
                </button>

                {transformModified && (
                  <button
                    type="button"
                    onClick={resetTransform}
                    aria-label="Reset view"
                    title="Reset zoom, rotation, and flip (0)"
                    className="h-7 px-2 rounded bg-zinc-800/90 hover:bg-zinc-700 border border-white/15 text-[11px] font-medium text-zinc-100 transition-colors"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          )}

          {/* HUD Toggle floating chip if hidden */}
          {effectiveHudHidden && (
            <button
              type="button"
              onClick={() => setHudHidden(false)}
              aria-label="Show slideshow controls"
              className="absolute bottom-3 right-3 px-3 py-1.5 rounded-md bg-black/70 border border-white/10 text-xs text-zinc-200 hover:text-white inline-flex items-center gap-1.5 z-20"
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
                  <>
                    <button
                      type="button"
                      onClick={() => onToggleFavorite(currentPost)}
                      aria-pressed={isFavorited}
                      className={`py-2 px-3 border rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${
                        isFavorited
                          ? 'bg-rose-950/60 border-rose-700/60 text-rose-300'
                          : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-200'
                      }`}
                    >
                      <Heart className={`w-3.5 h-3.5 ${isFavorited ? 'fill-rose-400 text-rose-400' : ''}`} />
                      <span>{isFavorited ? 'Favorited' : 'Favorite'}</span>
                    </button>

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
                  </>
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
                <>
                  <button
                    type="button"
                    data-testid="favorite-toggle-btn"
                    onClick={() => onToggleFavorite(currentPost)}
                    aria-pressed={isFavorited}
                    aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                    title="Bookmark to Favorites without downloading (L)"
                    className={`h-9 px-3 rounded-md text-xs font-medium inline-flex items-center gap-1.5 border transition-colors whitespace-nowrap shrink-0 ${
                      isFavorited
                        ? 'bg-rose-950/50 border-rose-700/60 text-rose-300'
                        : 'bg-zinc-950 hover:bg-zinc-900 border-zinc-800 text-zinc-200'
                    }`}
                  >
                    <Heart className={`w-3.5 h-3.5 ${isFavorited ? 'fill-rose-400 text-rose-400' : ''}`} />
                    <span>{isFavorited ? 'Favorited' : 'Favorite'}</span>
                  </button>

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
                </>
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
                const thumbFavorited = favoriteKeys.has(key);
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
                    {thumbFavorited && (
                      <span
                        aria-label="Favorited"
                        className="absolute top-1 right-1 w-4 h-4 rounded-sm bg-rose-600/90 text-white flex items-center justify-center"
                      >
                        <Heart className="w-2.5 h-2.5 fill-current" />
                      </span>
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
