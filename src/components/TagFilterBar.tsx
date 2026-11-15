import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Film, Layers, Search, Shield, SlidersHorizontal, X } from 'lucide-react';
import {
  ALL_BOARDS,
  ALL_MEDIA_TYPES,
  ALL_RATINGS,
  BOARD_LABELS,
  MEDIA_LABELS,
  RATING_LABELS,
} from '../lib/booru';
import type {
  AspectFilter,
  BooruBoard,
  MediaType,
  SingleRating,
  SortOrder,
  TagSuggestion,
} from '../types/booru';

interface TagFilterBarProps {
  queryTags: string;
  onQueryTagsChange: (val: string) => void;
  onSubmitSearch: (overrideTags?: string) => void;
  sources: BooruBoard[];
  onToggleSource: (board: BooruBoard) => void;
  ratings: SingleRating[];
  onToggleRating: (rating: SingleRating) => void;
  onSelectAllRatings: () => void;
  mediaTypes: MediaType[];
  onToggleMediaType: (media: MediaType) => void;
  onSelectAllMediaTypes: () => void;
  sort: SortOrder;
  onSortChange: (sort: SortOrder) => void;
  aspectFilter: AspectFilter;
  onAspectFilterChange: (aspect: AspectFilter) => void;
  minScore: number;
  onMinScoreChange: (score: number) => void;
  blacklistCount: number;
  onOpenBlacklistSettings: () => void;
  gelbooruUserId: string;
  gelbooruApiKey: string;
  isLoading: boolean;
}

const SOURCE_HINTS: Record<BooruBoard, string> = {
  safebooru: 'No key required · General',
  gelbooru: 'Requires free API key',
  rule34world: 'Images & MP4 · 18+',
};

export function TagFilterBar({
  queryTags,
  onQueryTagsChange,
  onSubmitSearch,
  sources,
  onToggleSource,
  ratings,
  onToggleRating,
  onSelectAllRatings,
  mediaTypes,
  onToggleMediaType,
  onSelectAllMediaTypes,
  sort,
  onSortChange,
  aspectFilter,
  onAspectFilterChange,
  minScore,
  onMinScoreChange,
  blacklistCount,
  onOpenBlacklistSettings,
  gelbooruUserId,
  gelbooruApiKey,
  isLoading,
}: TagFilterBarProps) {
  const [suggestions, setSuggestions] = useState<TagSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showSourcesMenu, setShowSourcesMenu] = useState(false);
  const [showRatingsMenu, setShowRatingsMenu] = useState(false);
  const [showMediaMenu, setShowMediaMenu] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const sourcesMenuRef = useRef<HTMLDivElement>(null);
  const ratingsMenuRef = useRef<HTMLDivElement>(null);
  const mediaMenuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const getActiveToken = (val: string) => {
    const parts = val.split(/\s+/);
    const last = parts[parts.length - 1] ?? '';
    return last.replace(/^-+/, '');
  };

  useEffect(() => {
    const token = getActiveToken(queryTags);
    if (token.length < 2 || token.includes(':')) {
      setSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          boards: sources.join(','),
          term: token,
        });
        if (sources.includes('gelbooru') && gelbooruUserId && gelbooruApiKey) {
          params.set('user_id', gelbooruUserId);
          params.set('api_key', gelbooruApiKey);
        }
        const res = await fetch(`/api/booru/tags?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { tags?: TagSuggestion[] };
        if (Array.isArray(data.tags)) {
          setSuggestions(data.tags);
          setHighlightedIdx(-1);
        }
      } catch {
        // Ignore aborted requests
      }
    }, 220);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [queryTags, sources, gelbooruUserId, gelbooruApiKey]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current && !containerRef.current.contains(target)) {
        setShowSuggestions(false);
      }
      if (sourcesMenuRef.current && !sourcesMenuRef.current.contains(target)) {
        setShowSourcesMenu(false);
      }
      if (ratingsMenuRef.current && !ratingsMenuRef.current.contains(target)) {
        setShowRatingsMenu(false);
      }
      if (mediaMenuRef.current && !mediaMenuRef.current.contains(target)) {
        setShowMediaMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const applySuggestion = (tagName: string) => {
    const trimmedRight = queryTags.replace(/\s+$/, '');
    const tokens = trimmedRight ? queryTags.split(/\s+/) : [];
    const lastToken = tokens[tokens.length - 1] ?? '';
    const isNegated = lastToken.startsWith('-');
    const nextToken = isNegated ? `-${tagName}` : tagName;

    if (tokens.length > 0) {
      tokens[tokens.length - 1] = nextToken;
    } else {
      tokens.push(nextToken);
    }

    const updated = `${tokens.join(' ')} `;
    onQueryTagsChange(updated);
    setShowSuggestions(false);
    setHighlightedIdx(-1);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIdx((prev) => (prev + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIdx((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && highlightedIdx >= 0)) {
        e.preventDefault();
        const chosen = suggestions[highlightedIdx >= 0 ? highlightedIdx : 0];
        if (chosen) applySuggestion(chosen.name);
        return;
      }
      if (e.key === 'Escape') {
        setShowSuggestions(false);
        return;
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      setShowSuggestions(false);
      onSubmitSearch();
    }
  };

  const hasAdvancedActive = aspectFilter !== 'all' || minScore > 0;

  const sourcesSummary =
    sources.length === 1
      ? BOARD_LABELS[sources[0]]
      : `${sources.length} Sources`;

  const ratingsSummary =
    ratings.length === ALL_RATINGS.length
      ? 'Rating: All'
      : ratings.length === 1
        ? `Rating: ${RATING_LABELS[ratings[0]]}`
        : `${ratings.length} Ratings`;

  const MEDIA_SHORT_LABELS: Record<MediaType, string> = {
    image: 'Images',
    gif: 'GIF',
    video: 'Video',
  };

  const mediaSummary =
    mediaTypes.length === ALL_MEDIA_TYPES.length
      ? 'Media: All'
      : mediaTypes.length === 1
        ? `Media: ${MEDIA_SHORT_LABELS[mediaTypes[0]]}`
        : `${mediaTypes.length} Media`;

  return (
    <section
      aria-label="Tag search and collection filters"
      className="border-b border-zinc-800/90 bg-[#111114] px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 shrink-0 z-20"
    >
      <div className="max-w-[1600px] mx-auto flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Tag Search with Autocomplete */}
          <div ref={containerRef} className="relative flex-1 min-w-[180px]">
            <label htmlFor="tag-search-input" className="sr-only">
              Search tags
            </label>
            <Search
              aria-hidden="true"
              className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            />
            <input
              ref={inputRef}
              id="tag-search-input"
              type="text"
              value={queryTags}
              onChange={(e) => {
                onQueryTagsChange(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onKeyDown={handleKeyDown}
              placeholder="Search tags (e.g. scenery sky -night)"
              autoComplete="off"
              className="w-full h-9 sm:h-10 pl-9 pr-9 bg-zinc-950 border border-zinc-800 rounded-md text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
            {queryTags && (
              <button
                type="button"
                aria-label="Clear search tags"
                onClick={() => {
                  onQueryTagsChange('');
                  onSubmitSearch('');
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200 p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {showSuggestions && suggestions.length > 0 && (
              <ul
                role="listbox"
                aria-label="Tag suggestions"
                className="absolute left-0 right-0 top-full mt-1 bg-[#141418] border border-zinc-700 rounded-md shadow-xl overflow-hidden z-50 max-h-64 overflow-y-auto"
              >
                {suggestions.map((tag, idx) => (
                  <li key={`${tag.source ?? 'all'}-${tag.name}`}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={idx === highlightedIdx}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        applySuggestion(tag.name);
                      }}
                      className={`w-full px-3 py-2 flex items-center justify-between text-left text-sm transition-colors ${
                        idx === highlightedIdx
                          ? 'bg-blue-600/20 text-white'
                          : 'text-zinc-200 hover:bg-zinc-800/80'
                      }`}
                    >
                      <span className="truncate font-medium">
                        {tag.name}
                        <span className="ml-2 text-xs text-zinc-500 font-normal">
                          {tag.category}
                          {sources.length > 1 && tag.source ? ` · ${BOARD_LABELS[tag.source]}` : ''}
                        </span>
                      </span>
                      <span className="text-xs font-mono tabular-nums text-zinc-400 shrink-0 ml-3">
                        {tag.count.toLocaleString()}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Multi-Source + Multi-Rating + Sort + Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Multi-Source Popover */}
            <div ref={sourcesMenuRef} className="relative">
              <button
                type="button"
                aria-expanded={showSourcesMenu}
                aria-label="Select web sources"
                onClick={() => {
                  setShowSourcesMenu((v) => !v);
                  setShowRatingsMenu(false);
                  setShowMediaMenu(false);
                }}
                className={`h-9 sm:h-10 px-3 border rounded-md text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                  showSourcesMenu || sources.length > 1
                    ? 'bg-zinc-900 border-zinc-600 text-white'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-200 hover:border-zinc-700'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span>{sourcesSummary}</span>
                <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              </button>

              {showSourcesMenu && (
                <div
                  role="group"
                  aria-label="Web image sources"
                  className="absolute right-0 md:left-0 top-full mt-1.5 w-64 bg-[#141418] border border-zinc-700 rounded-lg shadow-2xl p-2 z-50 space-y-1"
                >
                  <div className="px-2 py-1 flex items-center justify-between text-[11px] text-zinc-400">
                    <span className="font-medium text-zinc-300">Active Sources</span>
                    <span className="font-mono tabular-nums">{sources.length} / {ALL_BOARDS.length}</span>
                  </div>
                  {ALL_BOARDS.map((boardId) => {
                    const checked = sources.includes(boardId);
                    const isLastActive = checked && sources.length === 1;
                    return (
                      <button
                        key={boardId}
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        disabled={isLastActive}
                        onClick={() => onToggleSource(boardId)}
                        className={`w-full px-2.5 py-2 rounded-md text-left flex items-start gap-2.5 transition-colors ${
                          checked
                            ? 'bg-blue-600/15 text-white'
                            : 'text-zinc-300 hover:bg-zinc-800/80'
                        } ${isLastActive ? 'opacity-80 cursor-not-allowed' : ''}`}
                      >
                        <span
                          className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                            checked
                              ? 'bg-blue-600 border-blue-500 text-white'
                              : 'border-zinc-600 bg-zinc-950'
                          }`}
                        >
                          {checked && <Check className="w-3 h-3" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-medium leading-tight">
                            {BOARD_LABELS[boardId]}
                          </span>
                          <span className="block text-[11px] text-zinc-400 mt-0.5">
                            {SOURCE_HINTS[boardId]}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Multi-Select Rating Popover */}
            <div ref={ratingsMenuRef} className="relative">
              <button
                type="button"
                aria-expanded={showRatingsMenu}
                aria-label="Select content ratings"
                onClick={() => {
                  setShowRatingsMenu((v) => !v);
                  setShowSourcesMenu(false);
                  setShowMediaMenu(false);
                }}
                className={`h-9 sm:h-10 px-3 border rounded-md text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                  showRatingsMenu
                    ? 'bg-zinc-900 border-zinc-600 text-white'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-200 hover:border-zinc-700'
                }`}
              >
                <Shield className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                <span>{ratingsSummary}</span>
                <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              </button>

              {showRatingsMenu && (
                <div
                  role="group"
                  aria-label="Content ratings"
                  className="absolute right-0 md:left-0 top-full mt-1.5 w-56 bg-[#141418] border border-zinc-700 rounded-lg shadow-2xl p-2 z-50 space-y-1"
                >
                  <div className="px-2 py-1 flex items-center justify-between text-[11px] text-zinc-400">
                    <span className="font-medium text-zinc-300">Ratings</span>
                    <button
                      type="button"
                      onClick={onSelectAllRatings}
                      className="text-blue-400 hover:text-blue-300 font-medium"
                    >
                      Select All
                    </button>
                  </div>
                  {ALL_RATINGS.map((ratingId) => {
                    const checked = ratings.includes(ratingId);
                    const isLastActive = checked && ratings.length === 1;
                    return (
                      <button
                        key={ratingId}
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        disabled={isLastActive}
                        onClick={() => onToggleRating(ratingId)}
                        className={`w-full px-2.5 py-1.5 rounded-md text-left flex items-center gap-2.5 transition-colors ${
                          checked
                            ? 'bg-blue-600/15 text-white'
                            : 'text-zinc-300 hover:bg-zinc-800/80'
                        } ${isLastActive ? 'opacity-80 cursor-not-allowed' : ''}`}
                      >
                        <span
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                            checked
                              ? 'bg-blue-600 border-blue-500 text-white'
                              : 'border-zinc-600 bg-zinc-950'
                          }`}
                        >
                          {checked && <Check className="w-3 h-3" />}
                        </span>
                        <span className="text-xs font-medium">{RATING_LABELS[ratingId]}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Multi-Select Media Popover */}
            <div ref={mediaMenuRef} className="relative">
              <button
                type="button"
                aria-expanded={showMediaMenu}
                aria-label="Select media types"
                onClick={() => {
                  setShowMediaMenu((v) => !v);
                  setShowSourcesMenu(false);
                  setShowRatingsMenu(false);
                }}
                className={`h-9 sm:h-10 px-3 border rounded-md text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                  showMediaMenu || mediaTypes.length < ALL_MEDIA_TYPES.length
                    ? 'bg-zinc-900 border-zinc-600 text-white'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-200 hover:border-zinc-700'
                }`}
              >
                <Film className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                <span>{mediaSummary}</span>
                <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              </button>

              {showMediaMenu && (
                <div
                  role="group"
                  aria-label="Media types"
                  className="absolute right-0 md:left-0 top-full mt-1.5 w-56 bg-[#141418] border border-zinc-700 rounded-lg shadow-2xl p-2 z-50 space-y-1"
                >
                  <div className="px-2 py-1 flex items-center justify-between text-[11px] text-zinc-400">
                    <span className="font-medium text-zinc-300">Media</span>
                    <button
                      type="button"
                      onClick={onSelectAllMediaTypes}
                      className="text-blue-400 hover:text-blue-300 font-medium"
                    >
                      Select All
                    </button>
                  </div>
                  {ALL_MEDIA_TYPES.map((mediaId) => {
                    const checked = mediaTypes.includes(mediaId);
                    const isLastActive = checked && mediaTypes.length === 1;
                    return (
                      <button
                        key={mediaId}
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        disabled={isLastActive}
                        onClick={() => onToggleMediaType(mediaId)}
                        className={`w-full px-2.5 py-1.5 rounded-md text-left flex items-center gap-2.5 transition-colors ${
                          checked
                            ? 'bg-blue-600/15 text-white'
                            : 'text-zinc-300 hover:bg-zinc-800/80'
                        } ${isLastActive ? 'opacity-80 cursor-not-allowed' : ''}`}
                      >
                        <span
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                            checked
                              ? 'bg-blue-600 border-blue-500 text-white'
                              : 'border-zinc-600 bg-zinc-950'
                          }`}
                        >
                          {checked && <Check className="w-3 h-3" />}
                        </span>
                        <span className="text-xs font-medium">{MEDIA_LABELS[mediaId]}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="hidden md:flex items-center gap-2">
              <label htmlFor="sort-select" className="sr-only">
                Sort order
              </label>
              <select
                id="sort-select"
                aria-label="Sort order"
                value={sort}
                onChange={(e) => onSortChange(e.target.value as SortOrder)}
                className="h-10 px-3 bg-zinc-950 border border-zinc-800 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-blue-500"
              >
                <option value="newest">Sort: Newest</option>
                <option value="score">Sort: Top Score</option>
                <option value="updated">Sort: Updated</option>
                <option value="random">Sort: Random</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              aria-expanded={showAdvanced}
              className={`h-9 sm:h-10 px-3 border rounded-md text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                showAdvanced || hasAdvancedActive
                  ? 'bg-zinc-800 border-zinc-600 text-white'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:text-white'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Filters</span>
            </button>

            <button
              type="button"
              onClick={onOpenBlacklistSettings}
              className="hidden sm:inline-flex h-10 px-3 bg-zinc-950 border border-zinc-800 hover:border-zinc-700 rounded-md text-sm text-zinc-300 hover:text-white transition-colors whitespace-nowrap shrink-0 tabular-nums items-center"
            >
              Blacklist ({blacklistCount})
            </button>

            <button
              type="button"
              onClick={() => {
                setShowSuggestions(false);
                onSubmitSearch();
              }}
              disabled={isLoading}
              className="h-9 sm:h-10 px-4 sm:px-5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              {isLoading ? 'Loading...' : 'Search'}
            </button>
          </div>
        </div>

        {/* Collapsible Secondary Filter Strip */}
        {showAdvanced && (
          <div className="pt-2 border-t border-zinc-800/70 flex flex-wrap items-center gap-3 text-sm">
            <div className="flex md:hidden flex-wrap items-center gap-2 w-full">
              <select
                aria-label="Mobile sort order"
                value={sort}
                onChange={(e) => onSortChange(e.target.value as SortOrder)}
                className="h-8 px-2.5 bg-zinc-950 border border-zinc-800 rounded text-xs text-zinc-200"
              >
                <option value="newest">Sort: Newest</option>
                <option value="score">Sort: Top Score</option>
                <option value="updated">Sort: Updated</option>
                <option value="random">Sort: Random</option>
              </select>
              <button
                type="button"
                onClick={onOpenBlacklistSettings}
                className="h-8 px-2.5 bg-zinc-950 border border-zinc-800 rounded text-xs text-zinc-300 tabular-nums"
              >
                Blacklist ({blacklistCount})
              </button>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="aspect-filter" className="text-xs text-zinc-400 whitespace-nowrap">
                Aspect
              </label>
              <select
                id="aspect-filter"
                value={aspectFilter}
                onChange={(e) => onAspectFilterChange(e.target.value as AspectFilter)}
                className="h-8 px-2.5 bg-zinc-950 border border-zinc-800 rounded text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
              >
                <option value="all">Any Ratio</option>
                <option value="landscape">Landscape</option>
                <option value="portrait">Portrait</option>
                <option value="square">Square</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="min-score-input" className="text-xs text-zinc-400 whitespace-nowrap">
                Min Score
              </label>
              <input
                id="min-score-input"
                type="number"
                min={0}
                step={5}
                value={minScore}
                onChange={(e) => onMinScoreChange(Math.max(0, Number(e.target.value) || 0))}
                className="w-20 h-8 px-2.5 bg-zinc-950 border border-zinc-800 rounded text-xs font-mono tabular-nums text-zinc-200 focus:outline-none focus:border-blue-500"
              />
            </div>

            {hasAdvancedActive && (
              <button
                type="button"
                onClick={() => {
                  onAspectFilterChange('all');
                  onMinScoreChange(0);
                }}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors whitespace-nowrap"
              >
                Reset client filters
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
