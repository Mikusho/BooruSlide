import type { BooruPost } from './booru';

export interface FavoritePost extends BooruPost {
  favoritedAt: string;
}

const FAVORITES_KEY = 'booruslide_favorites_v1';

export function getPostKey(post: Pick<BooruPost, 'board' | 'id'>): string {
  return `${post.board}_${post.id}`;
}

export function isPostFavorited(
  favorites: FavoritePost[],
  post: Pick<BooruPost, 'board' | 'id'> | null | undefined
): boolean {
  if (!post) return false;
  const targetKey = getPostKey(post);
  return favorites.some((item) => getPostKey(item) === targetKey);
}

export function toggleFavoritePost(
  favorites: FavoritePost[],
  post: BooruPost,
  nowIso = new Date().toISOString()
): { next: FavoritePost[]; added: boolean } {
  const targetKey = getPostKey(post);
  const exists = favorites.some((item) => getPostKey(item) === targetKey);
  if (exists) {
    return {
      next: favorites.filter((item) => getPostKey(item) !== targetKey),
      added: false,
    };
  }
  const entry: FavoritePost = {
    ...post,
    favoritedAt: nowIso,
  };
  return {
    next: [entry, ...favorites],
    added: true,
  };
}

export function removeFavoritePost(
  favorites: FavoritePost[],
  post: Pick<BooruPost, 'board' | 'id'>
): FavoritePost[] {
  const targetKey = getPostKey(post);
  return favorites.filter((item) => getPostKey(item) !== targetKey);
}

export function filterFavoritePosts(
  favorites: FavoritePost[],
  query: string
): FavoritePost[] {
  const tokens = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return favorites;

  return favorites.filter((item) => {
    const haystack = [
      String(item.id),
      item.board,
      item.ext,
      item.mediaType,
      item.rating,
      ...item.tags,
    ]
      .join(' ')
      .toLowerCase();
    return tokens.every((tok) => haystack.includes(tok));
  });
}

export function loadFavorites(): FavoritePost[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is FavoritePost =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as FavoritePost).id === 'number' &&
        typeof (item as FavoritePost).board === 'string' &&
        typeof (item as FavoritePost).fileUrl === 'string' &&
        !(item as FavoritePost).fileUrl.startsWith('/api/')
    );
  } catch {
    return [];
  }
}

export function saveFavorites(favorites: FavoritePost[]): void {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  } catch {
    // Ignore storage quota issues
  }
}
