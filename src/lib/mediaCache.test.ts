import test from 'node:test';
import assert from 'node:assert/strict';
import { MediaBlobCache } from './mediaCache';

function createMockStreamResponse(chunks: Uint8Array[], totalLength?: number): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
  const headers = new Headers({ 'content-type': 'image/jpeg' });
  if (typeof totalLength === 'number') {
    headers.set('content-length', String(totalLength));
  }
  return new Response(stream, { status: 200, headers });
}

test('MediaBlobCache tracks byte progress, caches result, and deduplicates concurrent loads', async () => {
  const cache = new MediaBlobCache(3);
  let fetchCalls = 0;
  const progressEvents: Array<number | null> = [];

  const mockFetch = async () => {
    fetchCalls++;
    return createMockStreamResponse([new Uint8Array(50), new Uint8Array(50)], 100);
  };

  const [a, b] = await Promise.all([
    cache.load('/api/proxy-media?url=test1', {
      fetchFn: mockFetch,
      onProgress: (p) => progressEvents.push(p.percent),
    }),
    cache.load('/api/proxy-media?url=test1', {
      fetchFn: mockFetch,
    }),
  ]);

  assert.equal(fetchCalls, 1);
  assert.equal(a.sizeBytes, 100);
  assert.equal(b.objectUrl, a.objectUrl);
  assert.ok(progressEvents.includes(50));
  assert.ok(progressEvents.includes(100));

  // Second call hits cache directly
  const c = await cache.load('/api/proxy-media?url=test1', { fetchFn: mockFetch });
  assert.equal(fetchCalls, 1);
  assert.equal(c.objectUrl, a.objectUrl);
  cache.clear();
});

test('MediaBlobCache evicts least-recently-used entry when exceeding capacity', async () => {
  const cache = new MediaBlobCache(2);
  const mockFetch = async () => createMockStreamResponse([new Uint8Array(10)], 10);

  await cache.load('/1', { fetchFn: mockFetch });
  await cache.load('/2', { fetchFn: mockFetch });
  // Access /1 so /2 becomes LRU
  assert.ok(cache.get('/1'));
  await cache.load('/3', { fetchFn: mockFetch });

  assert.equal(cache.size(), 2);
  assert.equal(cache.has('/1'), true);
  assert.equal(cache.has('/2'), false);
  assert.equal(cache.has('/3'), true);
  cache.clear();
});
