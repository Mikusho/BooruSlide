export interface CachedMediaEntry {
  url: string;
  objectUrl: string;
  sizeBytes: number;
  contentType: string;
  loadedAt: number;
}

export interface MediaLoadProgress {
  loadedBytes: number;
  totalBytes: number | null;
  percent: number | null;
}

export type MediaFetchFn = (url: string, signal?: AbortSignal) => Promise<Response>;

export class MediaBlobCache {
  private readonly maxEntries: number;
  private readonly entries = new Map<string, CachedMediaEntry>();
  private readonly inFlight = new Map<
    string,
    {
      promise: Promise<CachedMediaEntry>;
      listeners: Set<(progress: MediaLoadProgress) => void>;
    }
  >();

  constructor(maxEntries = 24) {
    this.maxEntries = Math.max(2, maxEntries);
  }

  get(url: string): CachedMediaEntry | null {
    const existing = this.entries.get(url);
    if (!existing) return null;
    // Refresh LRU order
    this.entries.delete(url);
    this.entries.set(url, existing);
    return existing;
  }

  has(url: string): boolean {
    return this.entries.has(url);
  }

  size(): number {
    return this.entries.size;
  }

  private setEntry(url: string, entry: CachedMediaEntry): void {
    if (this.entries.has(url)) {
      const prev = this.entries.get(url)!;
      if (prev.objectUrl !== entry.objectUrl && prev.objectUrl.startsWith('blob:')) {
        URL.revokeObjectURL(prev.objectUrl);
      }
      this.entries.delete(url);
    }
    this.entries.set(url, entry);

    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (!oldestKey) break;
      const oldest = this.entries.get(oldestKey);
      this.entries.delete(oldestKey);
      if (oldest && oldest.objectUrl.startsWith('blob:')) {
        URL.revokeObjectURL(oldest.objectUrl);
      }
    }
  }

  async load(
    url: string,
    options?: {
      onProgress?: (progress: MediaLoadProgress) => void;
      fetchFn?: MediaFetchFn;
    }
  ): Promise<CachedMediaEntry> {
    const cached = this.get(url);
    if (cached) {
      options?.onProgress?.({
        loadedBytes: cached.sizeBytes,
        totalBytes: cached.sizeBytes,
        percent: 100,
      });
      return cached;
    }

    const existingJob = this.inFlight.get(url);
    if (existingJob) {
      if (options?.onProgress) {
        existingJob.listeners.add(options.onProgress);
      }
      try {
        return await existingJob.promise;
      } finally {
        if (options?.onProgress) {
          existingJob.listeners.delete(options.onProgress);
        }
      }
    }

    const listeners = new Set<(progress: MediaLoadProgress) => void>();
    if (options?.onProgress) {
      listeners.add(options.onProgress);
    }

    const fetchImpl: MediaFetchFn = options?.fetchFn ?? ((u, s) => fetch(u, { signal: s }));

    const notify = (progress: MediaLoadProgress) => {
      for (const listener of listeners) {
        listener(progress);
      }
    };

    const promise = (async (): Promise<CachedMediaEntry> => {
      const response = await fetchImpl(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      const rawLength = response.headers.get('content-length');
      const totalBytes = rawLength ? Number(rawLength) || null : null;

      if (!response.body) {
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const entry: CachedMediaEntry = {
          url,
          objectUrl,
          sizeBytes: blob.size,
          contentType: blob.type || contentType,
          loadedAt: Date.now(),
        };
        this.setEntry(url, entry);
        notify({ loadedBytes: blob.size, totalBytes: blob.size, percent: 100 });
        return entry;
      }

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let loadedBytes = 0;

      notify({
        loadedBytes: 0,
        totalBytes,
        percent: totalBytes ? 0 : null,
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          loadedBytes += value.byteLength;
          notify({
            loadedBytes,
            totalBytes,
            percent: totalBytes ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100)) : null,
          });
        }
      }

      const blobParts = chunks.map((chunk) => {
        const copy = new Uint8Array(chunk.byteLength);
        copy.set(chunk);
        return copy;
      });
      const blob = new Blob(blobParts, { type: contentType });
      const objectUrl = URL.createObjectURL(blob);
      const finalSize = blob.size || loadedBytes;
      const entry: CachedMediaEntry = {
        url,
        objectUrl,
        sizeBytes: finalSize,
        contentType,
        loadedAt: Date.now(),
      };
      this.setEntry(url, entry);
      notify({ loadedBytes: finalSize, totalBytes: finalSize, percent: 100 });
      return entry;
    })();

    this.inFlight.set(url, { promise, listeners });
    try {
      return await promise;
    } finally {
      this.inFlight.delete(url);
    }
  }

  clear(): void {
    for (const entry of this.entries.values()) {
      if (entry.objectUrl.startsWith('blob:')) {
        URL.revokeObjectURL(entry.objectUrl);
      }
    }
    this.entries.clear();
  }
}

export const sharedMediaCache = new MediaBlobCache(28);
