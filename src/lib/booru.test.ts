import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRule34WorldSearchBody,
  buildSearchTags,
  computeNextSlideIndex,
  filterPostsClientSide,
  mergeMultiSourcePosts,
  normalizePostsResponse,
  parseRule34WorldTags,
  parseTagSuggestions,
  sanitizeFilename,
} from './booru';

test('normalizePostsResponse handles Safebooru array format', () => {
  const sample = [
    {
      id: 7313802,
      directory: 3929,
      image: '4a0c446d54d982c3c2c04ec7a1940df7cc317c57.jpg',
      width: 2048,
      height: 1092,
      tags: 'scenery sky clouds&amp;sun',
      score: 42,
      rating: 'general',
      hash: '04df6680ca',
      owner: 'curator',
      change: 1700000000,
    },
  ];
  const { posts, count } = normalizePostsResponse(sample, 'safebooru');
  assert.equal(count, 1);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].id, 7313802);
  assert.equal(posts[0].mediaType, 'image');
  assert.equal(posts[0].rating, 'general');
  assert.deepEqual(posts[0].tags, ['scenery', 'sky', 'clouds&sun']);
  assert.ok(posts[0].fileUrl.includes('safebooru.org/images/3929/'));
});

test('normalizePostsResponse handles Gelbooru v0.2.5 object wrapper and video detection', () => {
  const payload = {
    '@attributes': { count: 150 },
    post: [
      {
        id: 9001,
        file_url: 'https://img3.gelbooru.com/images/aa/bb/test_clip.webm',
        sample_url: 'https://img3.gelbooru.com/samples/aa/bb/sample.jpg',
        preview_url: 'https://img3.gelbooru.com/thumbnails/aa/bb/thumb.jpg',
        width: 1280,
        height: 720,
        tags: 'animated landscape',
        score: 99,
        rating: 'sensitive',
        md5: 'abcdef123456',
      },
    ],
  };

  const { posts, count } = normalizePostsResponse(payload, 'gelbooru');
  assert.equal(count, 150);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].mediaType, 'video');
  assert.equal(posts[0].ext, 'webm');
  assert.equal(posts[0].rating, 'sensitive');
});

test('normalizePostsResponse handles Rule34.world image and video payloads', () => {
  const payload = {
    items: [
      {
        id: 1437520,
        posted: '2026-11-15T13:41:26Z',
        likes: 32,
        type: 0,
        width: 2385,
        height: 2160,
        files: { '10': [2], '12': [2], '13': [2] },
      },
      {
        id: 352200,
        posted: '2022-07-24T07:11:13Z',
        likes: 2853,
        type: 1,
        width: 1918,
        height: 1080,
        files: { '12': [2], '13': [2], '101': [2] },
      },
    ],
  };

  const { posts } = normalizePostsResponse(payload, 'rule34world');
  assert.equal(posts.length, 2);
  assert.equal(posts[0].board, 'rule34world');
  assert.equal(posts[0].mediaType, 'image');
  assert.equal(posts[0].fileUrl, 'https://rule34storage.b-cdn.net/posts/1437/1437520/1437520.pic.jpg');
  assert.equal(posts[0].previewUrl, 'https://rule34storage.b-cdn.net/posts/1437/1437520/1437520.pic256.jpg');
  assert.equal(posts[1].mediaType, 'video');
  assert.equal(posts[1].fileUrl, 'https://rule34storage.b-cdn.net/posts/352/352200/352200.mov720.mp4');
  assert.equal(posts[1].score, 2853);
});

test('buildRule34WorldSearchBody maps tags, blacklist, sort, and media type', () => {
  const body = buildRule34WorldSearchBody({
    tags: 'blue_sky -comic',
    blacklist: ['ai_generated', 'blue_sky'],
    sort: 'score',
    mediaFilter: 'video',
    pid: 2,
    limit: 40,
  });

  assert.deepEqual(body, {
    skip: 80,
    take: 40,
    includeTags: ['blue sky'],
    excludeTags: ['comic', 'ai generated'],
    sortBy: 1,
    type: 1,
  });
});

test('parseRule34WorldTags normalizes multi-word tags and skips system tags', () => {
  const tags = parseRule34WorldTags([
    { id: -10, value: '(sys) gray', count: 5000, type: 16 },
    { id: 1, value: 'zenless zone zero', count: 33511, type: 2 },
    { id: 2, value: 'maplestar', count: 195, type: 8 },
  ]);
  assert.equal(tags.length, 2);
  assert.equal(tags[0].name, 'zenless_zone_zero');
  assert.equal(tags[0].category, 'copyright');
  assert.equal(tags[1].category, 'artist');
});

test('mergeMultiSourcePosts interleaves buckets and sorts by score when requested', () => {
  const safe = normalizePostsResponse(
    [{ id: 1, file_url: 'https://safebooru.org/images/1/a.jpg', width: 100, height: 100, score: 10, rating: 'general' }],
    'safebooru'
  ).posts;
  const r34 = normalizePostsResponse(
    { items: [{ id: 2, type: 0, width: 100, height: 100, likes: 90, files: { '10': [2] } }] },
    'rule34world'
  ).posts;

  const interleaved = mergeMultiSourcePosts([safe, r34], 'newest');
  assert.deepEqual(
    interleaved.map((p) => `${p.board}:${p.id}`),
    ['safebooru:1', 'rule34world:2']
  );

  const byScore = mergeMultiSourcePosts([safe, r34], 'score');
  assert.deepEqual(
    byScore.map((p) => `${p.board}:${p.id}`),
    ['rule34world:2', 'safebooru:1']
  );
});

test('buildSearchTags appends rating, sort, and non-conflicting blacklist tags', () => {
  const query = buildSearchTags({
    tags: 'scenery night_sky',
    blacklist: ['comic', 'scenery', '-ai_generated'],
    rating: 'general',
    sort: 'score',
    mediaFilter: 'all',
    board: 'gelbooru',
  });

  assert.equal(query, 'scenery night_sky rating:general sort:score:desc -comic -ai_generated');
});

test('buildSearchTags handles multi-select ratings cleanly', () => {
  const twoRatings = buildSearchTags({
    tags: 'scenery',
    blacklist: [],
    rating: 'all',
    ratings: ['general', 'sensitive'],
    sort: 'newest',
    mediaFilter: 'all',
    board: 'safebooru',
  });
  assert.equal(twoRatings, 'scenery -rating:questionable -rating:explicit');

  const allRatings = buildSearchTags({
    tags: 'scenery',
    blacklist: [],
    rating: 'all',
    ratings: ['general', 'sensitive', 'questionable', 'explicit'],
    sort: 'newest',
    mediaFilter: 'all',
    board: 'safebooru',
  });
  assert.equal(allRatings, 'scenery');
});

test('filterPostsClientSide filters by aspect ratio, media type, minScore, and blacklist', () => {
  const { posts } = normalizePostsResponse(
    [
      {
        id: 1,
        file_url: 'https://safebooru.org/images/1/a.jpg',
        width: 1920,
        height: 1080,
        tags: 'scenery mountain',
        score: 25,
        rating: 'general',
      },
      {
        id: 2,
        file_url: 'https://safebooru.org/images/1/b.jpg',
        width: 800,
        height: 1400,
        tags: 'scenery comic',
        score: 50,
        rating: 'general',
      },
      {
        id: 3,
        file_url: 'https://safebooru.org/images/1/c.gif',
        width: 1000,
        height: 1000,
        tags: 'scenery',
        score: 10,
        rating: 'general',
      },
    ],
    'safebooru'
  );

  const landscapeOnly = filterPostsClientSide(posts, {
    blacklist: ['comic'],
    mediaFilter: 'all',
    aspectFilter: 'landscape',
    minScore: 15,
  });
  assert.deepEqual(
    landscapeOnly.map((p) => p.id),
    [1]
  );

  const gifsOnly = filterPostsClientSide(posts, {
    blacklist: [],
    mediaFilter: 'gif',
    aspectFilter: 'all',
    minScore: 0,
  });
  assert.deepEqual(
    gifsOnly.map((p) => p.id),
    [3]
  );

  const imageAndGif = filterPostsClientSide(posts, {
    blacklist: [],
    mediaFilter: 'all',
    mediaTypes: ['image', 'gif'],
    aspectFilter: 'all',
    minScore: 0,
  });
  assert.deepEqual(
    imageAndGif.map((p) => p.id),
    [1, 2, 3]
  );

  const onlyImages = filterPostsClientSide(posts, {
    blacklist: [],
    mediaFilter: 'all',
    mediaTypes: ['image'],
    aspectFilter: 'all',
    minScore: 0,
  });
  assert.deepEqual(
    onlyImages.map((p) => p.id),
    [1, 2]
  );

  const r34Both = buildRule34WorldSearchBody({
    tags: '',
    blacklist: [],
    sort: 'newest',
    mediaFilter: 'all',
    mediaTypes: ['image', 'video'],
    pid: 0,
    limit: 20,
  });
  assert.equal(r34Both.type, undefined);

  const r34VideoOnly = buildRule34WorldSearchBody({
    tags: '',
    blacklist: [],
    sort: 'newest',
    mediaFilter: 'all',
    mediaTypes: ['video'],
    pid: 0,
    limit: 20,
  });
  assert.equal(r34VideoOnly.type, 1);
});

test('parseTagSuggestions handles XML tag index responses sorted by count', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <tags type="array">
      <tag type="0" count="120" name="scenery_print" id="1"/>
      <tag type="1" count="5000" name="artist_name" id="2"/>
      <tag type="0" count="66167" name="scenery" id="3"/>
    </tags>`;

  const tags = parseTagSuggestions(xml);
  assert.equal(tags.length, 3);
  assert.equal(tags[0].name, 'scenery');
  assert.equal(tags[0].count, 66167);
  assert.equal(tags[1].category, 'artist');
});

test('sanitizeFilename produces deterministic filesystem-safe names', () => {
  const name = sanitizeFilename(
    {
      id: 4242,
      board: 'rule34world',
      tags: ['scenery', 'blue/sky', 'clouds', 'water', 'extra'],
      hash: '9988776655443322',
      ext: 'MP4',
    },
    'id_tags'
  );
  assert.equal(name, 'rule34world_4242_scenery_blue_sky_clouds_water.mp4');
});

test('computeNextSlideIndex wraps cleanly and avoids repeating current slide in shuffle', () => {
  assert.equal(computeNextSlideIndex(4, 5, 'next', { loop: true, shuffle: false }), 0);
  assert.equal(computeNextSlideIndex(0, 5, 'prev', { loop: true, shuffle: false }), 4);
  assert.equal(computeNextSlideIndex(4, 5, 'next', { loop: false, shuffle: false }), 4);
  assert.equal(computeNextSlideIndex(2, 5, 'next', { loop: true, shuffle: true, randomSeed: 0.45 }), 3);
});
