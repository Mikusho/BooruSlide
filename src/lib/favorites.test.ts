import test from 'node:test';
import assert from 'node:assert/strict';
import type { BooruPost } from './booru';
import {
  filterFavoritePosts,
  getPostKey,
  isPostFavorited,
  removeFavoritePost,
  toggleFavoritePost,
  type FavoritePost,
} from './favorites';

const samplePost = (overrides: Partial<BooruPost> = {}): BooruPost => ({
  id: 101,
  board: 'safebooru',
  tags: ['scenery', 'sky', 'clouds'],
  fileUrl: 'https://safebooru.org/images/101/sky.jpg',
  sampleUrl: 'https://safebooru.org/samples/101/sky.jpg',
  previewUrl: 'https://safebooru.org/thumbnails/101/sky.jpg',
  width: 1920,
  height: 1080,
  rating: 'general',
  score: 42,
  owner: 'artist',
  source: 'https://example.com/101',
  hash: 'abc101',
  createdAt: '2026-01-01',
  mediaType: 'image',
  ext: 'jpg',
  ...overrides,
});

test('getPostKey and isPostFavorited identify board+id pairs cleanly', () => {
  const postA = samplePost({ id: 10, board: 'safebooru' });
  const postB = samplePost({ id: 10, board: 'gelbooru' });
  const list: FavoritePost[] = [{ ...postA, favoritedAt: '2026-01-02T00:00:00.000Z' }];

  assert.equal(getPostKey(postA), 'safebooru_10');
  assert.equal(isPostFavorited(list, postA), true);
  assert.equal(isPostFavorited(list, postB), false);
  assert.equal(isPostFavorited(list, null), false);
});

test('toggleFavoritePost adds new post at front and removes on second toggle', () => {
  const post1 = samplePost({ id: 1 });
  const post2 = samplePost({ id: 2, board: 'rule34world', mediaType: 'video', ext: 'mp4' });

  const step1 = toggleFavoritePost([], post1, '2026-01-01T00:00:00.000Z');
  assert.equal(step1.added, true);
  assert.equal(step1.next.length, 1);

  const step2 = toggleFavoritePost(step1.next, post2, '2026-01-02T00:00:00.000Z');
  assert.equal(step2.added, true);
  assert.deepEqual(
    step2.next.map((p) => p.id),
    [2, 1]
  );

  const step3 = toggleFavoritePost(step2.next, post1);
  assert.equal(step3.added, false);
  assert.deepEqual(
    step3.next.map((p) => p.id),
    [2]
  );
});

test('removeFavoritePost removes matching board+id only', () => {
  const favs: FavoritePost[] = [
    { ...samplePost({ id: 5, board: 'safebooru' }), favoritedAt: '2026-01-01T00:00:00.000Z' },
    { ...samplePost({ id: 5, board: 'gelbooru' }), favoritedAt: '2026-01-01T00:00:00.000Z' },
  ];

  const remaining = removeFavoritePost(favs, { id: 5, board: 'safebooru' });
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].board, 'gelbooru');
});

test('filterFavoritePosts matches tags, board, media type, and id', () => {
  const favs: FavoritePost[] = [
    { ...samplePost({ id: 11, board: 'safebooru', tags: ['sunset', 'ocean'], mediaType: 'image' }), favoritedAt: '2026-01-01T00:00:00.000Z' },
    { ...samplePost({ id: 22, board: 'rule34world', tags: ['animation', 'neon'], mediaType: 'video', ext: 'mp4' }), favoritedAt: '2026-01-02T00:00:00.000Z' },
  ];

  assert.equal(filterFavoritePosts(favs, '').length, 2);
  assert.deepEqual(
    filterFavoritePosts(favs, 'ocean sunset').map((p) => p.id),
    [11]
  );
  assert.deepEqual(
    filterFavoritePosts(favs, 'video rule34world').map((p) => p.id),
    [22]
  );
  assert.deepEqual(
    filterFavoritePosts(favs, '11').map((p) => p.id),
    [11]
  );
});
