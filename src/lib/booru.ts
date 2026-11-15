export type BooruBoard = 'gelbooru' | 'safebooru' | 'rule34world';

export const ALL_BOARDS: BooruBoard[] = ['safebooru', 'gelbooru', 'rule34world'];

export const BOARD_LABELS: Record<BooruBoard, string> = {
  safebooru: 'Safebooru',
  gelbooru: 'Gelbooru',
  rule34world: 'Rule34.world',
};

export type PostRating = 'all' | 'general' | 'sensitive' | 'questionable' | 'explicit';

export type SingleRating = Exclude<PostRating, 'all'>;

export const ALL_RATINGS: SingleRating[] = ['general', 'sensitive', 'questionable', 'explicit'];

export const RATING_LABELS: Record<SingleRating, string> = {
  general: 'General',
  sensitive: 'Sensitive',
  questionable: 'Questionable',
  explicit: 'Explicit',
};

export type MediaType = 'image' | 'gif' | 'video';

export const ALL_MEDIA_TYPES: MediaType[] = ['image', 'gif', 'video'];

export const MEDIA_LABELS: Record<MediaType, string> = {
  image: 'Static Images',
  gif: 'Animated GIF',
  video: 'Video (WebM/MP4)',
};

export type MediaFilter = 'all' | 'image' | 'gif' | 'video';

export type AspectFilter = 'all' | 'landscape' | 'portrait' | 'square';

export type SortOrder = 'newest' | 'score' | 'updated' | 'random';

export type SlideFitMode = 'contain' | 'cover' | 'actual';

export type FilenamePattern = 'id_tags' | 'board_id' | 'id_hash';

export interface BooruPost {
  id: number;
  board: BooruBoard;
  tags: string[];
  fileUrl: string;
  sampleUrl: string;
  previewUrl: string;
  width: number;
  height: number;
  rating: Exclude<PostRating, 'all'>;
  score: number;
  owner: string;
  source: string;
  hash: string;
  createdAt: string;
  mediaType: MediaType;
  ext: string;
}

export interface TagSuggestion {
  name: string;
  count: number;
  category: 'general' | 'artist' | 'copyright' | 'character' | 'metadata';
  source?: BooruBoard;
}

export interface SearchQueryOptions {
  tags: string;
  blacklist: string[];
  rating: PostRating;
  ratings?: SingleRating[];
  sort: SortOrder;
  mediaFilter: MediaFilter;
  mediaTypes?: MediaType[];
  board: BooruBoard;
}

export interface ClientFilterOptions {
  blacklist: string[];
  mediaFilter: MediaFilter;
  mediaTypes?: MediaType[];
  aspectFilter: AspectFilter;
  minScore: number;
  rating?: PostRating;
  ratings?: SingleRating[];
}

export interface LocalGalleryItem {
  filename: string;
  id: number;
  board: BooruBoard;
  tags: string[];
  width: number;
  height: number;
  rating: Exclude<PostRating, 'all'>;
  score: number;
  source: string;
  mediaType: MediaType;
  ext: string;
  sizeBytes: number;
  savedAt: string;
  url: string;
}

export interface TagPreset {
  id: string;
  name: string;
  tags: string;
  rating: PostRating;
  description: string;
  builtIn?: boolean;
}

export interface SlideshowSettings {
  board: BooruBoard;
  sources: BooruBoard[];
  gelbooruUserId: string;
  gelbooruApiKey: string;
  intervalSeconds: number;
  autoPlay: boolean;
  loop: boolean;
  shuffle: boolean;
  fitMode: SlideFitMode;
  preloadCount: number;
  autoHideHud: boolean;
  blacklist: string[];
  filenamePattern: FilenamePattern;
  saveToBrowserFolder: boolean;
}

const VALID_RATINGS = new Set(['general', 'sensitive', 'questionable', 'explicit']);

export function normalizeRating(rawRating: unknown): Exclude<PostRating, 'all'> {
  const val = String(rawRating ?? 'general').toLowerCase().trim();
  if (val === 'g' || val === 'safe' || val === 's') {
    return val === 's' ? 'sensitive' : 'general';
  }
  if (val === 'q') return 'questionable';
  if (val === 'e') return 'explicit';
  if (VALID_RATINGS.has(val)) {
    return val as Exclude<PostRating, 'all'>;
  }
  return 'general';
}

export function detectMediaType(url: string): { mediaType: MediaType; ext: string } {
  const clean = url.split('?')[0].split('#')[0];
  const lastDot = clean.lastIndexOf('.');
  const ext = lastDot !== -1 ? clean.slice(lastDot + 1).toLowerCase() : 'jpg';
  if (ext === 'gif') {
    return { mediaType: 'gif', ext };
  }
  if (ext === 'webm' || ext === 'mp4') {
    return { mediaType: 'video', ext };
  }
  return { mediaType: 'image', ext: ext || 'jpg' };
}

export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'");
}

function buildSafebooruAssetUrl(
  directory: unknown,
  image: unknown,
  kind: 'images' | 'samples' | 'thumbnails'
): string {
  const dir = String(directory ?? '').trim();
  const img = String(image ?? '').trim();
  if (!dir || !img) return '';
  if (kind === 'thumbnails') {
    const base = img.replace(/\.[^.]+$/, '.jpg');
    return `https://safebooru.org/thumbnails/${dir}/thumbnail_${base}`;
  }
  if (kind === 'samples') {
    const base = img.replace(/\.[^.]+$/, '.jpg');
    return `https://safebooru.org/samples/${dir}/sample_${base}`;
  }
  return `https://safebooru.org/images/${dir}/${img}`;
}

export function normalizeGelbooruPost(raw: Record<string, unknown>, board: BooruBoard): BooruPost | null {
  const id = Number(raw.id);
  if (!Number.isFinite(id) || id <= 0) return null;

  let fileUrl = typeof raw.file_url === 'string' ? raw.file_url : '';
  let sampleUrl = typeof raw.sample_url === 'string' ? raw.sample_url : '';
  let previewUrl = typeof raw.preview_url === 'string' ? raw.preview_url : '';

  if (board === 'safebooru') {
    if (!fileUrl) fileUrl = buildSafebooruAssetUrl(raw.directory, raw.image, 'images');
    if (!sampleUrl) sampleUrl = buildSafebooruAssetUrl(raw.directory, raw.image, 'samples');
    if (!previewUrl) previewUrl = buildSafebooruAssetUrl(raw.directory, raw.image, 'thumbnails');
  }

  if (!fileUrl && sampleUrl) fileUrl = sampleUrl;
  if (!fileUrl && previewUrl) fileUrl = previewUrl;
  if (!fileUrl) return null;

  if (!sampleUrl) sampleUrl = fileUrl;
  if (!previewUrl) previewUrl = sampleUrl;

  const rawTags = typeof raw.tags === 'string' ? decodeHtmlEntities(raw.tags) : '';
  const tags = rawTags
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const { mediaType, ext } = detectMediaType(fileUrl);

  const width = Math.max(1, Number(raw.width) || 1000);
  const height = Math.max(1, Number(raw.height) || 1000);
  const score = Number(raw.score) || 0;
  const hash = typeof raw.hash === 'string' ? raw.hash : typeof raw.md5 === 'string' ? raw.md5 : String(id);
  const owner = typeof raw.owner === 'string' ? raw.owner : 'unknown';
  const source = typeof raw.source === 'string' ? decodeHtmlEntities(raw.source) : '';
  const createdAt =
    typeof raw.created_at === 'string'
      ? raw.created_at
      : typeof raw.change === 'number'
        ? new Date(raw.change * 1000).toISOString()
        : new Date().toISOString();

  return {
    id,
    board,
    tags,
    fileUrl,
    sampleUrl,
    previewUrl,
    width,
    height,
    rating: normalizeRating(raw.rating),
    score,
    owner,
    source,
    hash,
    createdAt,
    mediaType,
    ext,
  };
}

export function normalizePostsResponse(payload: unknown, board: BooruBoard): { posts: BooruPost[]; count: number } {
  if (board === 'rule34world') {
    return normalizeRule34WorldResponse(payload);
  }

  let rawPosts: unknown[] = [];
  let totalCount = 0;

  if (Array.isArray(payload)) {
    rawPosts = payload;
    totalCount = payload.length;
  } else if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.post)) {
      rawPosts = obj.post;
    } else if (obj.post && typeof obj.post === 'object') {
      rawPosts = [obj.post];
    }
    const attrs = obj['@attributes'] as Record<string, unknown> | undefined;
    if (attrs && typeof attrs.count !== 'undefined') {
      totalCount = Number(attrs.count) || rawPosts.length;
    } else {
      totalCount = rawPosts.length;
    }
  }

  const posts: BooruPost[] = [];
  for (const item of rawPosts) {
    if (item && typeof item === 'object') {
      const normalized = normalizeGelbooruPost(item as Record<string, unknown>, board);
      if (normalized) posts.push(normalized);
    }
  }

  return { posts, count: totalCount };
}

export function normalizeRule34WorldPost(raw: Record<string, unknown>): BooruPost | null {
  const id = Number(raw.id);
  if (!Number.isFinite(id) || id <= 0) return null;

  const folder = Math.floor(id / 1000);
  const base = `https://rule34storage.b-cdn.net/posts/${folder}/${id}/${id}`;
  const files = (raw.files && typeof raw.files === 'object' ? raw.files : {}) as Record<string, unknown>;
  const hasFileKey = (k: string) => Object.prototype.hasOwnProperty.call(files, k);

  const isVideo = Number(raw.type) === 1 || hasFileKey('100') || hasFileKey('101') || hasFileKey('102');

  let fileUrl = '';
  let sampleUrl = '';
  let previewUrl = '';

  if (hasFileKey('13')) previewUrl = `${base}.pic256.jpg`;
  else if (hasFileKey('12')) previewUrl = `${base}.picpreview.jpg`;
  else if (hasFileKey('31')) previewUrl = `${base}.pic256avif.avif`;
  else previewUrl = `${base}.pic256.jpg`;

  if (isVideo) {
    if (hasFileKey('100')) fileUrl = `${base}.mov.mp4`;
    else if (hasFileKey('101')) fileUrl = `${base}.mov720.mp4`;
    else if (hasFileKey('102')) fileUrl = `${base}.mov480.mp4`;
    else fileUrl = `${base}.mov.mp4`;

    sampleUrl = hasFileKey('12') ? `${base}.picpreview.jpg` : previewUrl;
  } else {
    if (hasFileKey('10')) fileUrl = `${base}.pic.jpg`;
    else if (hasFileKey('11')) fileUrl = `${base}.pic.jpg`;
    else if (hasFileKey('30')) fileUrl = `${base}.picavif.avif`;
    else fileUrl = `${base}.pic.jpg`;

    sampleUrl = hasFileKey('12') ? `${base}.picpreview.jpg` : fileUrl;
  }

  const rawTags = Array.isArray(raw.tags) ? raw.tags : [];
  const tags: string[] = [];
  for (const tagItem of rawTags) {
    if (tagItem && typeof tagItem === 'object') {
      const val = (tagItem as Record<string, unknown>).value;
      if (typeof val === 'string' && val.trim() && !val.startsWith('(sys)')) {
        tags.push(val.trim().replace(/\s+/g, '_'));
      }
    } else if (typeof tagItem === 'string' && tagItem.trim()) {
      tags.push(tagItem.trim());
    }
  }

  const { mediaType, ext } = detectMediaType(fileUrl);
  const width = Math.max(1, Number(raw.width) || 1000);
  const height = Math.max(1, Number(raw.height) || 1000);
  const score = Number(raw.likes) || 0;
  const createdAt =
    typeof raw.posted === 'string'
      ? raw.posted
      : typeof raw.created === 'string'
        ? raw.created
        : new Date().toISOString();

  return {
    id,
    board: 'rule34world',
    tags,
    fileUrl,
    sampleUrl,
    previewUrl,
    width,
    height,
    rating: 'explicit',
    score,
    owner: 'rule34.world',
    source: `https://rule34.world/post/${id}`,
    hash: `r34w_${id}`,
    createdAt,
    mediaType,
    ext,
  };
}

export function normalizeRule34WorldResponse(payload: unknown): { posts: BooruPost[]; count: number } {
  if (!payload || typeof payload !== 'object') {
    return { posts: [], count: 0 };
  }
  const obj = payload as Record<string, unknown>;
  const items = Array.isArray(obj.items) ? obj.items : [];
  const posts: BooruPost[] = [];
  for (const item of items) {
    if (item && typeof item === 'object') {
      const normalized = normalizeRule34WorldPost(item as Record<string, unknown>);
      if (normalized) posts.push(normalized);
    }
  }
  return { posts, count: posts.length };
}

export function buildRule34WorldSearchBody(options: {
  tags: string;
  blacklist: string[];
  sort: SortOrder;
  mediaFilter: MediaFilter;
  mediaTypes?: MediaType[];
  pid: number;
  limit: number;
}): Record<string, unknown> {
  const tokens = options.tags
    .trim()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !t.toLowerCase().startsWith('rating:') && !t.toLowerCase().startsWith('sort:'));

  const includeTags: string[] = [];
  const excludeTags: string[] = [];

  for (const token of tokens) {
    if (token.startsWith('-') && token.length > 1) {
      excludeTags.push(token.slice(1).replace(/_/g, ' '));
    } else if (!token.startsWith('-')) {
      includeTags.push(token.replace(/_/g, ' '));
    }
  }

  const positiveSet = new Set(includeTags.map((t) => t.toLowerCase()));
  const excludeSet = new Set(excludeTags.map((t) => t.toLowerCase()));

  for (const blocked of options.blacklist) {
    const clean = blocked.trim().replace(/^-+/, '').replace(/_/g, ' ').toLowerCase();
    if (!clean || positiveSet.has(clean) || excludeSet.has(clean)) continue;
    excludeSet.add(clean);
    excludeTags.push(clean);
  }

  const body: Record<string, unknown> = {
    skip: Math.max(0, options.pid) * options.limit,
    take: options.limit,
  };

  if (includeTags.length > 0) body.includeTags = includeTags;
  if (excludeTags.length > 0) body.excludeTags = excludeTags;

  if (options.sort === 'score') {
    body.sortBy = 1;
  } else if (options.sort === 'updated') {
    body.sortBy = 2;
  }

  if (options.mediaTypes && options.mediaTypes.length > 0) {
    const hasVideo = options.mediaTypes.includes('video');
    const hasImageOrGif =
      options.mediaTypes.includes('image') || options.mediaTypes.includes('gif');
    if (hasImageOrGif && !hasVideo) {
      body.type = 0;
    } else if (hasVideo && !hasImageOrGif) {
      body.type = 1;
    }
  } else if (options.mediaFilter === 'image') {
    body.type = 0;
  } else if (options.mediaFilter === 'video') {
    body.type = 1;
  }

  return body;
}

export function buildSearchTags(options: SearchQueryOptions): string {
  const userTokens = options.tags
    .trim()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const positiveUserTags = new Set(
    userTokens.filter((t) => !t.startsWith('-')).map((t) => t.toLowerCase())
  );

  const tokens: string[] = [...userTokens];

  const hasExplicitRatingTag = userTokens.some(
    (t) => t.toLowerCase().startsWith('rating:') || t.toLowerCase().startsWith('-rating:')
  );
  if (!hasExplicitRatingTag) {
    if (options.ratings && options.ratings.length > 0) {
      const selected = new Set(options.ratings);
      if (selected.size === 1) {
        const only = Array.from(selected)[0];
        tokens.push(`rating:${only}`);
      } else if (selected.size < ALL_RATINGS.length) {
        for (const r of ALL_RATINGS) {
          if (!selected.has(r)) {
            tokens.push(`-rating:${r}`);
          }
        }
      }
    } else if (options.rating !== 'all') {
      tokens.push(`rating:${options.rating}`);
    }
  }

  const hasSortTag = userTokens.some((t) => t.toLowerCase().startsWith('sort:'));
  if (!hasSortTag) {
    if (options.sort === 'score') {
      tokens.push('sort:score:desc');
    } else if (options.sort === 'updated') {
      tokens.push('sort:updated:desc');
    } else if (options.sort === 'random') {
      tokens.push('sort:random');
    }
  }

  if (options.mediaTypes && options.mediaTypes.length > 0) {
    if (options.mediaTypes.length === 1) {
      const onlyMedia = options.mediaTypes[0];
      if (onlyMedia === 'gif' && !positiveUserTags.has('animated_gif')) {
        tokens.push('animated_gif');
      } else if (onlyMedia === 'video' && !positiveUserTags.has('video')) {
        tokens.push('video');
      }
    }
  } else if (options.mediaFilter === 'gif' && !positiveUserTags.has('animated_gif')) {
    tokens.push('animated_gif');
  } else if (options.mediaFilter === 'video' && !positiveUserTags.has('video')) {
    tokens.push('video');
  }

  const existingNegations = new Set(
    tokens.filter((t) => t.startsWith('-')).map((t) => t.slice(1).toLowerCase())
  );
  for (const rawBlocked of options.blacklist) {
    const clean = rawBlocked.trim().replace(/^-+/, '').toLowerCase();
    if (!clean) continue;
    if (positiveUserTags.has(clean)) continue;
    if (existingNegations.has(clean)) continue;
    existingNegations.add(clean);
    tokens.push(`-${clean}`);
  }

  return tokens.join(' ').trim();
}

export function filterPostsClientSide(posts: BooruPost[], filters: ClientFilterOptions): BooruPost[] {
  const blockedSet = new Set(
    filters.blacklist.map((t) => t.trim().replace(/^-+/, '').toLowerCase()).filter(Boolean)
  );

  return posts.filter((post) => {
    if (filters.ratings && filters.ratings.length > 0) {
      if (!filters.ratings.includes(post.rating)) return false;
    } else if (filters.rating && filters.rating !== 'all' && post.rating !== filters.rating) {
      return false;
    }

    if (post.score < filters.minScore) return false;

    if (filters.mediaTypes && filters.mediaTypes.length > 0) {
      if (!filters.mediaTypes.includes(post.mediaType)) {
        return false;
      }
    } else if (filters.mediaFilter !== 'all' && post.mediaType !== filters.mediaFilter) {
      return false;
    }

    if (filters.aspectFilter !== 'all') {
      const ratio = post.width / post.height;
      if (filters.aspectFilter === 'landscape' && ratio <= 1.05) return false;
      if (filters.aspectFilter === 'portrait' && ratio >= 0.95) return false;
      if (filters.aspectFilter === 'square' && (ratio < 0.85 || ratio > 1.15)) return false;
    }

    if (blockedSet.size > 0) {
      for (const tag of post.tags) {
        const normalizedTag = tag.toLowerCase();
        if (blockedSet.has(normalizedTag) || blockedSet.has(normalizedTag.replace(/\s+/g, '_'))) {
          return false;
        }
      }
    }

    return true;
  });
}

export function mergeMultiSourcePosts(
  buckets: BooruPost[][],
  sort: SortOrder
): BooruPost[] {
  const nonEmpty = buckets.filter((b) => b.length > 0);
  if (nonEmpty.length === 0) return [];
  if (nonEmpty.length === 1) return nonEmpty[0];

  const seen = new Set<string>();
  const combined: BooruPost[] = [];

  if (sort === 'score') {
    for (const bucket of nonEmpty) {
      for (const post of bucket) {
        const key = `${post.board}_${post.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          combined.push(post);
        }
      }
    }
    combined.sort((a, b) => b.score - a.score);
    return combined;
  }

  if (sort === 'newest' || sort === 'updated') {
    // Interleave cleanly while favoring fresher timestamps when timestamps differ significantly
    const maxLen = Math.max(...nonEmpty.map((b) => b.length));
    for (let i = 0; i < maxLen; i++) {
      for (const bucket of nonEmpty) {
        const post = bucket[i];
        if (!post) continue;
        const key = `${post.board}_${post.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          combined.push(post);
        }
      }
    }
    return combined;
  }

  // Random interleave
  for (const bucket of nonEmpty) {
    for (const post of bucket) {
      const key = `${post.board}_${post.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        combined.push(post);
      }
    }
  }
  return combined;
}

function mapTagCategory(typeCode: number): TagSuggestion['category'] {
  switch (typeCode) {
    case 1:
      return 'artist';
    case 3:
      return 'copyright';
    case 4:
      return 'character';
    case 5:
      return 'metadata';
    default:
      return 'general';
  }
}

function mapRule34WorldTagCategory(typeCode: number): TagSuggestion['category'] {
  switch (typeCode) {
    case 2:
      return 'copyright';
    case 4:
      return 'character';
    case 8:
      return 'artist';
    case 16:
    case 32:
      return 'metadata';
    default:
      return 'general';
  }
}

export function parseRule34WorldTags(payload: unknown): TagSuggestion[] {
  if (!Array.isArray(payload)) return [];
  const results: TagSuggestion[] = [];
  for (const entry of payload) {
    if (!entry || typeof entry !== 'object') continue;
    const rec = entry as Record<string, unknown>;
    const rawVal = typeof rec.value === 'string' ? rec.value.trim() : '';
    if (!rawVal || rawVal.startsWith('(sys)')) continue;
    results.push({
      name: rawVal.replace(/\s+/g, '_'),
      count: Number(rec.count) || 0,
      category: mapRule34WorldTagCategory(Number(rec.type) || 1),
      source: 'rule34world',
    });
  }
  return results.sort((a, b) => b.count - a.count);
}

export function parseTagSuggestions(rawBody: string, source?: BooruBoard): TagSuggestion[] {
  const trimmed = rawBody.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (source === 'rule34world') {
        return parseRule34WorldTags(parsed);
      }
      let list: unknown[] = [];
      if (Array.isArray(parsed)) {
        list = parsed;
      } else if (parsed && typeof parsed === 'object') {
        const obj = parsed as Record<string, unknown>;
        if (Array.isArray(obj.tag)) list = obj.tag;
        else if (obj.tag && typeof obj.tag === 'object') list = [obj.tag];
      }
      const suggestions: TagSuggestion[] = [];
      for (const item of list) {
        if (!item || typeof item !== 'object') continue;
        const rec = item as Record<string, unknown>;
        const name = typeof rec.name === 'string' ? decodeHtmlEntities(rec.name) : '';
        if (!name) continue;
        suggestions.push({
          name,
          count: Number(rec.count) || 0,
          category: mapTagCategory(Number(rec.type) || 0),
          source,
        });
      }
      return suggestions.sort((a, b) => b.count - a.count);
    } catch {
      return [];
    }
  }

  const suggestions: TagSuggestion[] = [];
  const tagRegex = /<tag\b([^>]*?)\/?>/gi;
  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(trimmed)) !== null) {
    const attrs = match[1];
    const nameMatch = /\bname="([^"]+)"/i.exec(attrs);
    const countMatch = /\bcount="(\d+)"/i.exec(attrs);
    const typeMatch = /\btype="(\d+)"/i.exec(attrs);
    if (!nameMatch) continue;
    suggestions.push({
      name: decodeHtmlEntities(nameMatch[1]),
      count: countMatch ? Number(countMatch[1]) : 0,
      category: mapTagCategory(typeMatch ? Number(typeMatch[1]) : 0),
      source,
    });
  }
  return suggestions.sort((a, b) => b.count - a.count);
}

export function sanitizeFilename(
  post: Pick<BooruPost, 'id' | 'board' | 'tags' | 'hash' | 'ext'>,
  pattern: FilenamePattern = 'id_tags'
): string {
  const safeExt = (post.ext || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
  if (pattern === 'board_id') {
    return `${post.board}_${post.id}.${safeExt}`;
  }
  if (pattern === 'id_hash') {
    const shortHash = (post.hash || String(post.id)).replace(/[^a-z0-9]/gi, '').slice(0, 12);
    return `${post.id}_${shortHash}.${safeExt}`;
  }
  const tagSlug = post.tags
    .slice(0, 4)
    .map((t) => t.replace(/[^a-z0-9_-]/gi, '_'))
    .filter(Boolean)
    .join('_')
    .slice(0, 64);

  return tagSlug ? `${post.board}_${post.id}_${tagSlug}.${safeExt}` : `${post.board}_${post.id}.${safeExt}`;
}

export function computeNextSlideIndex(
  currentIndex: number,
  total: number,
  direction: 'next' | 'prev',
  options: { loop: boolean; shuffle: boolean; randomSeed?: number }
): number {
  if (total <= 0) return 0;
  if (total === 1) return 0;

  if (options.shuffle && direction === 'next') {
    const rand = typeof options.randomSeed === 'number' ? options.randomSeed : Math.random();
    let candidate = Math.floor(rand * total) % total;
    if (candidate === currentIndex) {
      candidate = (currentIndex + 1) % total;
    }
    return candidate;
  }

  if (direction === 'next') {
    if (currentIndex + 1 >= total) {
      return options.loop ? 0 : total - 1;
    }
    return currentIndex + 1;
  }

  if (currentIndex - 1 < 0) {
    return options.loop ? total - 1 : 0;
  }
  return currentIndex - 1;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let idx = 0;
  let value = bytes;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx++;
  }
  return `${value >= 10 || idx === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[idx]}`;
}
