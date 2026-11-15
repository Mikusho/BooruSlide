import express from 'express';
import fs from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { Readable } from 'node:stream';
import dotenv from 'dotenv';
import {
  ALL_BOARDS,
  buildRule34WorldSearchBody,
  buildSearchTags,
  mergeMultiSourcePosts,
  normalizePostsResponse,
  normalizeRule34WorldPost,
  parseRule34WorldTags,
  parseTagSuggestions,
  sanitizeFilename,
  type BooruBoard,
  type BooruPost,
  type FilenamePattern,
  type LocalGalleryItem,
  type MediaFilter,
  type MediaType,
  type PostRating,
  type SingleRating,
  type SortOrder,
  type TagSuggestion,
} from './src/lib/booru.ts';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const USER_AGENT = 'BooruSlide/1.0 (+https://github.com/booruslideshow)';

let activeGalleryDir = path.resolve(process.env.GALLERY_DIR || path.join(process.cwd(), 'gallery'));

function isAllowedMediaUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'gelbooru.com' ||
      host.endsWith('.gelbooru.com') ||
      host === 'safebooru.org' ||
      host.endsWith('.safebooru.org') ||
      host === 'rule34.world' ||
      host.endsWith('.rule34.world') ||
      host === 'rule34storage.b-cdn.net'
    );
  } catch {
    return false;
  }
}

function getMediaReferer(parsedUrl: URL): string {
  const host = parsedUrl.hostname.toLowerCase();
  if (host.includes('safebooru.org')) return 'https://safebooru.org/';
  if (host.includes('rule34.world') || host.includes('rule34storage.b-cdn.net')) {
    return 'https://rule34.world/';
  }
  return 'https://gelbooru.com/';
}

function getBoardOrigin(board: BooruBoard): string {
  if (board === 'gelbooru') return 'https://gelbooru.com';
  if (board === 'rule34world') return 'https://rule34.world';
  return 'https://safebooru.org';
}

function parseBoardsParam(boardsParam: unknown, fallbackBoardParam: unknown): BooruBoard[] {
  const raw = String(boardsParam || fallbackBoardParam || 'safebooru')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is BooruBoard => (ALL_BOARDS as string[]).includes(s));
  const unique = Array.from(new Set(raw));
  return unique.length > 0 ? unique : ['safebooru'];
}

function getIndexFilePath(): string {
  return path.join(activeGalleryDir, '.gallery-index.json');
}

async function ensureGalleryDir(): Promise<void> {
  await fs.mkdir(activeGalleryDir, { recursive: true });
}

async function readGalleryIndex(): Promise<LocalGalleryItem[]> {
  await ensureGalleryDir();
  try {
    const raw = await fs.readFile(getIndexFilePath(), 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as LocalGalleryItem[]) : [];
  } catch {
    return [];
  }
}

async function writeGalleryIndex(items: LocalGalleryItem[]): Promise<void> {
  await ensureGalleryDir();
  await fs.writeFile(getIndexFilePath(), JSON.stringify(items, null, 2), 'utf8');
}

async function reconcileGalleryItems(): Promise<LocalGalleryItem[]> {
  await ensureGalleryDir();
  const indexed = await readGalleryIndex();
  const entries = await fs.readdir(activeGalleryDir, { withFileTypes: true });
  const diskFiles = new Map<string, number>();

  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith('.')) continue;
    const stat = await fs.stat(path.join(activeGalleryDir, entry.name));
    diskFiles.set(entry.name, stat.size);
  }

  const validIndexed: LocalGalleryItem[] = [];
  const seenFiles = new Set<string>();

  for (const item of indexed) {
    const size = diskFiles.get(item.filename);
    if (typeof size === 'number') {
      validIndexed.push({
        ...item,
        sizeBytes: size,
        url: `/api/gallery/file/${encodeURIComponent(item.filename)}`,
      });
      seenFiles.add(item.filename);
    }
  }

  for (const [filename, sizeBytes] of diskFiles.entries()) {
    if (seenFiles.has(filename)) continue;
    const ext = path.extname(filename).replace('.', '').toLowerCase();
    if (!['jpg', 'jpeg', 'png', 'gif', 'webp', 'webm', 'mp4', 'avif'].includes(ext)) continue;
    const mediaType = ext === 'gif' ? 'gif' : ext === 'webm' || ext === 'mp4' ? 'video' : 'image';
    validIndexed.push({
      filename,
      id: 0,
      board: 'safebooru',
      tags: ['local_file'],
      width: 0,
      height: 0,
      rating: 'general',
      score: 0,
      source: '',
      mediaType,
      ext,
      sizeBytes,
      savedAt: new Date().toISOString(),
      url: `/api/gallery/file/${encodeURIComponent(filename)}`,
    });
  }

  validIndexed.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  return validIndexed;
}

function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.avif':
      return 'image/avif';
    case '.webm':
      return 'video/webm';
    case '.mp4':
      return 'video/mp4';
    default:
      return 'image/jpeg';
  }
}

interface SourceFetchOutcome {
  board: BooruBoard;
  posts: BooruPost[];
  count: number;
  warning?: { board: BooruBoard; code: string; message: string };
}

async function fetchSingleBoardPosts(params: {
  board: BooruBoard;
  rawTags: string;
  blacklist: string[];
  rating: PostRating;
  ratings?: SingleRating[];
  sort: SortOrder;
  mediaFilter: MediaFilter;
  mediaTypes?: MediaType[];
  pid: number;
  limit: number;
  userId: string;
  apiKey: string;
}): Promise<SourceFetchOutcome> {
  const { board, rawTags, blacklist, rating, ratings, sort, mediaFilter, mediaTypes, pid, limit, userId, apiKey } = params;

  if (board === 'rule34world') {
    const body = buildRule34WorldSearchBody({
      tags: rawTags,
      blacklist,
      sort,
      mediaFilter,
      mediaTypes,
      pid,
      limit,
    });

    const upstream = await fetch('https://rule34.world/api/v2/post/search/root', {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!upstream.ok) {
      return {
        board,
        posts: [],
        count: 0,
        warning: {
          board,
          code: 'UPSTREAM_ERROR',
          message: `Rule34.world API returned HTTP ${upstream.status}`,
        },
      };
    }

    const payload = (await upstream.json()) as unknown;
    const normalized = normalizePostsResponse(payload, 'rule34world');
    return { board, posts: normalized.posts, count: normalized.count };
  }

  // Gelbooru / Safebooru DAPI
  const compiledTags = buildSearchTags({
    tags: rawTags,
    blacklist,
    rating,
    ratings,
    sort,
    mediaFilter,
    mediaTypes,
    board,
  });

  const origin = getBoardOrigin(board);
  const url = new URL('/index.php', origin);
  url.searchParams.set('page', 'dapi');
  url.searchParams.set('s', 'post');
  url.searchParams.set('q', 'index');
  url.searchParams.set('json', '1');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('pid', String(pid));
  if (compiledTags) {
    url.searchParams.set('tags', compiledTags);
  }
  if (board === 'gelbooru' && userId && apiKey) {
    url.searchParams.set('user_id', userId);
    url.searchParams.set('api_key', apiKey);
  }

  const upstream = await fetch(url.toString(), {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json, text/plain, */*',
    },
  });

  if (upstream.status === 401 || upstream.status === 403) {
    return {
      board,
      posts: [],
      count: 0,
      warning: {
        board,
        code: 'GELBOORU_AUTH_REQUIRED',
        message:
          board === 'gelbooru'
            ? 'Gelbooru API requires your free user_id and api_key. Enter them in Settings or disable Gelbooru in Sources.'
            : `Upstream ${board} rejected the request (HTTP ${upstream.status}).`,
      },
    };
  }

  if (!upstream.ok) {
    return {
      board,
      posts: [],
      count: 0,
      warning: {
        board,
        code: 'UPSTREAM_ERROR',
        message: `Upstream ${board} API returned HTTP ${upstream.status}`,
      },
    };
  }

  const text = await upstream.text();
  if (!text.trim()) {
    return { board, posts: [], count: 0 };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return {
      board,
      posts: [],
      count: 0,
      warning: {
        board,
        code: 'INVALID_UPSTREAM_RESPONSE',
        message: `Unexpected non-JSON response from ${board}.`,
      },
    };
  }

  const normalized = normalizePostsResponse(payload, board);
  return { board, posts: normalized.posts, count: normalized.count };
}

async function fetchRule34WorldPostDetail(id: number): Promise<BooruPost | null> {
  const upstream = await fetch(`https://rule34.world/api/v2/post/${id}`, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
  });
  if (!upstream.ok) return null;
  const payload = (await upstream.json()) as Record<string, unknown>;
  return normalizeRule34WorldPost(payload);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, galleryDir: activeGalleryDir });
  });

  // Search posts across one or multiple enabled web sources
  app.get('/api/booru/posts', async (req, res) => {
    try {
      const boards = parseBoardsParam(req.query.boards, req.query.board);
      const rawTags = String(req.query.raw_tags ?? req.query.tags ?? '').trim();
      const blacklist = String(req.query.blacklist || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const rating = (String(req.query.rating || 'general').toLowerCase() as PostRating) || 'general';
      const validRatings = new Set<SingleRating>(['general', 'sensitive', 'questionable', 'explicit']);
      const parsedRatings = String(req.query.ratings || '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter((s): s is SingleRating => validRatings.has(s as SingleRating));
      const ratings = parsedRatings.length > 0 ? Array.from(new Set(parsedRatings)) : undefined;
      const sort = (String(req.query.sort || 'newest').toLowerCase() as SortOrder) || 'newest';
      const mediaFilter = (String(req.query.media_filter || 'all').toLowerCase() as MediaFilter) || 'all';
      const validMediaTypes = new Set<MediaType>(['image', 'gif', 'video']);
      const parsedMediaTypes = String(req.query.media_types || '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter((s): s is MediaType => validMediaTypes.has(s as MediaType));
      const mediaTypes = parsedMediaTypes.length > 0 ? Array.from(new Set(parsedMediaTypes)) : undefined;
      const pid = Math.max(0, Number(req.query.pid) || 0);
      const totalLimit = Math.min(100, Math.max(1, Number(req.query.limit) || 40));
      const perBoardLimit = Math.max(10, Math.ceil(totalLimit / boards.length));

      const userId = String(req.query.user_id || process.env.GELBOORU_USER_ID || '').trim();
      const apiKey = String(req.query.api_key || process.env.GELBOORU_API_KEY || '').trim();

      const outcomes = await Promise.all(
        boards.map((board) =>
          fetchSingleBoardPosts({
            board,
            rawTags,
            blacklist,
            rating,
            ratings,
            sort,
            mediaFilter,
            mediaTypes,
            pid,
            limit: boards.length === 1 ? totalLimit : perBoardLimit,
            userId,
            apiKey,
          }).catch((err): SourceFetchOutcome => ({
            board,
            posts: [],
            count: 0,
            warning: {
              board,
              code: 'PROXY_FAILED',
              message: err instanceof Error ? err.message : `Failed to fetch ${board}`,
            },
          }))
        )
      );

      const warnings = outcomes.map((o) => o.warning).filter((w): w is NonNullable<typeof w> => Boolean(w));
      const mergedPosts = mergeMultiSourcePosts(
        outcomes.map((o) => o.posts),
        sort
      );
      const totalCount = outcomes.reduce((sum, o) => sum + o.count, 0);

      // If every single selected source failed with warnings and produced 0 posts, return clean error status
      if (mergedPosts.length === 0 && warnings.length === boards.length) {
        const primary = warnings[0];
        const status = primary.code === 'GELBOORU_AUTH_REQUIRED' ? 401 : 502;
        res.status(status).json({
          code: primary.code,
          error: primary.message,
          warnings,
          posts: [],
          count: 0,
          boards,
        });
        return;
      }

      res.json({
        posts: mergedPosts,
        count: totalCount,
        boards,
        warnings,
      });
    } catch (error) {
      res.status(500).json({
        code: 'PROXY_FAILED',
        error: error instanceof Error ? error.message : 'Failed to fetch posts from sources',
      });
    }
  });

  // Fetch full post detail (e.g. tags for Rule34.world posts)
  app.get('/api/booru/post-detail', async (req, res) => {
    try {
      const board = String(req.query.board || '').toLowerCase() as BooruBoard;
      const id = Number(req.query.id);
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: 'Valid post id is required' });
        return;
      }

      if (board === 'rule34world') {
        const post = await fetchRule34WorldPostDetail(id);
        if (!post) {
          res.status(404).json({ error: 'Post not found on rule34.world' });
          return;
        }
        res.json({ post });
        return;
      }

      res.status(400).json({ error: 'Post detail lookup is only needed for rule34world' });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to load post details',
      });
    }
  });

  // Tag autocomplete across one or multiple active sources
  app.get('/api/booru/tags', async (req, res) => {
    try {
      const boards = parseBoardsParam(req.query.boards, req.query.board);
      const term = String(req.query.term || '').trim().toLowerCase();
      if (!term) {
        res.json({ tags: [] });
        return;
      }

      const userId = String(req.query.user_id || process.env.GELBOORU_USER_ID || '').trim();
      const apiKey = String(req.query.api_key || process.env.GELBOORU_API_KEY || '').trim();

      const tagBuckets = await Promise.all(
        boards.map(async (board): Promise<TagSuggestion[]> => {
          try {
            if (board === 'rule34world') {
              const r34Term = term.replace(/_/g, ' ');
              const upstream = await fetch(
                `https://rule34.world/api/v2/tag/search/${encodeURIComponent(r34Term)}`,
                { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } }
              );
              if (!upstream.ok) return [];
              const json = (await upstream.json()) as unknown;
              return parseRule34WorldTags(json).slice(0, 10);
            }

            const origin = getBoardOrigin(board);
            const url = new URL('/index.php', origin);
            url.searchParams.set('page', 'dapi');
            url.searchParams.set('s', 'tag');
            url.searchParams.set('q', 'index');
            url.searchParams.set('limit', '10');
            url.searchParams.set('orderby', 'count');
            url.searchParams.set('name_pattern', `${term}%`);
            if (board === 'gelbooru') {
              url.searchParams.set('json', '1');
              if (userId && apiKey) {
                url.searchParams.set('user_id', userId);
                url.searchParams.set('api_key', apiKey);
              }
            }

            const upstream = await fetch(url.toString(), {
              headers: { 'User-Agent': USER_AGENT },
            });
            if (!upstream.ok) return [];
            const body = await upstream.text();
            return parseTagSuggestions(body, board).slice(0, 10);
          } catch {
            return [];
          }
        })
      );

      // Merge and deduplicate suggestions across sources by tag name
      const byName = new Map<string, TagSuggestion>();
      for (const bucket of tagBuckets) {
        for (const item of bucket) {
          const existing = byName.get(item.name);
          if (!existing || item.count > existing.count) {
            byName.set(item.name, item);
          }
        }
      }

      const merged = Array.from(byName.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 14);
      res.json({ tags: merged });
    } catch {
      res.json({ tags: [] });
    }
  });

  // Allowlisted media proxy to bypass hotlink / CORS restrictions cleanly
  app.get('/api/proxy-media', async (req, res) => {
    const targetUrl = String(req.query.url || '');
    if (!isAllowedMediaUrl(targetUrl)) {
      res.status(400).json({ error: 'Disallowed media URL' });
      return;
    }

    try {
      const parsed = new URL(targetUrl);
      const referer = getMediaReferer(parsed);

      const headers: Record<string, string> = {
        'User-Agent': USER_AGENT,
        Referer: referer,
      };
      if (req.headers.range) {
        headers.Range = req.headers.range;
      }

      const upstream = await fetch(targetUrl, { headers });
      if (!upstream.ok && upstream.status !== 206) {
        res.status(upstream.status).end();
        return;
      }

      res.status(upstream.status);
      const contentType = upstream.headers.get('content-type');
      const contentLength = upstream.headers.get('content-length');
      const contentRange = upstream.headers.get('content-range');
      const acceptRanges = upstream.headers.get('accept-ranges');

      if (contentType) res.setHeader('Content-Type', contentType);
      if (contentLength) res.setHeader('Content-Length', contentLength);
      if (contentRange) res.setHeader('Content-Range', contentRange);
      if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);
      res.setHeader('Cache-Control', 'public, max-age=86400');

      if (!upstream.body) {
        res.end();
        return;
      }

      const nodeStream = Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]);
      nodeStream.on('error', () => {
        if (!res.headersSent) res.status(502);
        res.end();
      });
      nodeStream.pipe(res);
    } catch (error) {
      if (!res.headersSent) {
        res.status(502).json({
          error: error instanceof Error ? error.message : 'Failed to stream media',
        });
      }
    }
  });

  // Local Gallery Folder endpoints
  app.get('/api/gallery/info', async (_req, res) => {
    try {
      const items = await reconcileGalleryItems();
      const totalBytes = items.reduce((sum, item) => sum + item.sizeBytes, 0);
      res.json({
        directory: activeGalleryDir,
        itemCount: items.length,
        totalBytes,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to inspect gallery folder' });
    }
  });

  app.post('/api/gallery/folder', async (req, res) => {
    try {
      const requested = String(req.body?.directory || '').trim();
      if (!requested) {
        res.status(400).json({ error: 'Directory path is required' });
        return;
      }
      const resolved = path.resolve(requested);
      await fs.mkdir(resolved, { recursive: true });
      activeGalleryDir = resolved;
      const items = await reconcileGalleryItems();
      const totalBytes = items.reduce((sum, item) => sum + item.sizeBytes, 0);
      res.json({
        directory: activeGalleryDir,
        itemCount: items.length,
        totalBytes,
      });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Unable to use specified local gallery folder',
      });
    }
  });

  app.get('/api/gallery/list', async (_req, res) => {
    try {
      const items = await reconcileGalleryItems();
      const totalBytes = items.reduce((sum, item) => sum + item.sizeBytes, 0);
      res.json({
        directory: activeGalleryDir,
        items,
        totalBytes,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to list local gallery' });
    }
  });

  app.get('/api/gallery/file/:filename', async (req, res) => {
    try {
      const safeName = path.basename(String(req.params.filename || ''));
      if (!safeName || safeName.startsWith('.')) {
        res.status(400).json({ error: 'Invalid filename' });
        return;
      }
      const fullPath = path.join(activeGalleryDir, safeName);
      await fs.access(fullPath);
      res.setHeader('Content-Type', getMimeType(safeName));
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.sendFile(fullPath);
    } catch {
      res.status(404).json({ error: 'File not found in local gallery folder' });
    }
  });

  app.post('/api/gallery/save', async (req, res) => {
    try {
      let post = req.body?.post as BooruPost | undefined;
      const pattern = (req.body?.filenamePattern || 'id_tags') as FilenamePattern;

      if (!post || !post.fileUrl || !isAllowedMediaUrl(post.fileUrl)) {
        res.status(400).json({ error: 'Valid booru post with allowed media URL is required' });
        return;
      }

      // Enrich Rule34.world post with full tag list before saving if tags are empty
      if (post.board === 'rule34world' && post.tags.length === 0) {
        const detailed = await fetchRule34WorldPostDetail(post.id).catch(() => null);
        if (detailed) {
          post = { ...post, tags: detailed.tags, score: detailed.score || post.score };
        }
      }

      await ensureGalleryDir();
      const filename = sanitizeFilename(post, pattern);
      const targetPath = path.join(activeGalleryDir, filename);

      const existing = await readGalleryIndex();
      const alreadyIndexed = existing.find(
        (entry) => entry.filename === filename || (entry.id === post!.id && entry.board === post!.board)
      );

      let fileExistsOnDisk = false;
      try {
        await fs.access(targetPath);
        fileExistsOnDisk = true;
      } catch {
        fileExistsOnDisk = false;
      }

      if (alreadyIndexed && fileExistsOnDisk) {
        res.json({
          alreadyExists: true,
          directory: activeGalleryDir,
          item: {
            ...alreadyIndexed,
            url: `/api/gallery/file/${encodeURIComponent(alreadyIndexed.filename)}`,
          },
        });
        return;
      }

      const parsed = new URL(post.fileUrl);
      const referer = getMediaReferer(parsed);

      const upstream = await fetch(post.fileUrl, {
        headers: {
          'User-Agent': USER_AGENT,
          Referer: referer,
        },
      });

      if (!upstream.ok) {
        res.status(502).json({ error: `Failed to download source file (HTTP ${upstream.status})` });
        return;
      }

      const buffer = Buffer.from(await upstream.arrayBuffer());
      await fs.writeFile(targetPath, buffer);

      const item: LocalGalleryItem = {
        filename,
        id: post.id,
        board: post.board,
        tags: post.tags,
        width: post.width,
        height: post.height,
        rating: post.rating,
        score: post.score,
        source: post.source,
        mediaType: post.mediaType,
        ext: post.ext,
        sizeBytes: buffer.byteLength,
        savedAt: new Date().toISOString(),
        url: `/api/gallery/file/${encodeURIComponent(filename)}`,
      };

      const filtered = existing.filter(
        (entry) => !(entry.filename === filename || (entry.id === post!.id && entry.board === post!.board))
      );
      filtered.unshift(item);
      await writeGalleryIndex(filtered);

      res.json({
        alreadyExists: false,
        directory: activeGalleryDir,
        item,
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to save image to local gallery folder',
      });
    }
  });

  app.delete('/api/gallery/file/:filename', async (req, res) => {
    try {
      const safeName = path.basename(String(req.params.filename || ''));
      if (!safeName || safeName.startsWith('.')) {
        res.status(400).json({ error: 'Invalid filename' });
        return;
      }
      const fullPath = path.join(activeGalleryDir, safeName);
      await fs.unlink(fullPath).catch(() => undefined);
      const existing = await readGalleryIndex();
      const updated = existing.filter((entry) => entry.filename !== safeName);
      await writeGalleryIndex(updated);
      res.json({ ok: true, filename: safeName });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to delete local file' });
    }
  });

  const httpServer = createServer(app);

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`BooruSlide server listening on http://localhost:${PORT} (gallery: ${activeGalleryDir})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
