# BooruSlide

A web-based slideshow theater and collection browser inspired by [BooruSlideshow](https://github.com/BooruSlideshow/BooruSlideshow). Browse, filter, stream, preload, and download image, GIF, and video collections across multiple booru/media sources directly to a local gallery folder on disk.

## Features

### 1. Multi-Source Search & Tag Autocomplete
- **Multi-Source Aggregation**: Query one or multiple sources simultaneously:
  - **Safebooru** (no API key required)
  - **Gelbooru** (supports `user_id` + `api_key` via Settings or `.env`)
  - **Rule34.world** (images and MP4 videos)
- **Live Tag Autocomplete**: Real-time tag suggestions merged across active sources with post counts and category labels (`general`, `artist`, `copyright`, `character`, `metadata`).
- **Tag Negation & Blacklists**: Exclude tags inline (`scenery sky -night`) or via persistent blacklist rules in Settings.

### 2. Selectable Filters
- **Multi-Select Ratings**: Toggle any combination of `General`, `Sensitive`, `Questionable`, and `Explicit` (or `Select All`).
- **Multi-Select Media Types**: Toggle `Static Images`, `Animated GIF`, and `Video (WebM/MP4)` independently (or `Select All`).
- **Sort & Client Filters**: Sort by `Newest`, `Top Score`, `Updated`, or `Random`, plus client-side `Aspect Ratio` (`Landscape`, `Portrait`, `Square`) and `Min Score` filtering.

### 3. Slideshow Theater & Smart Preloading
- **Theater Viewport**: Full-viewport display with `Fit`, `Fill`, and `1:1` zoom modes, auto-hide HUD, fullscreen mode, and a scrollable thumbnail filmstrip.
- **Loading Progress & File Size**:
  - Images and GIFs display a real-time download progress bar, percentage, transferred/total bytes, and final file size in both the metadata scrim and **Post Inspector**.
  - Videos stream natively with HTTP Range (`206 Partial Content`) caching and autoplay without blocking loading overlays.
- **Load-Gated Countdown Timer**: Auto-advance countdown starts only *after* the active slide finishes loading so slower files are never skipped early.
- **Custom Intervals**: Choose preset intervals (`3s`, `5s`, `6s`, `8s`, `15s`, `30s`) or enter any custom duration (`1s`–`3600s`).
- **Ahead Slide Caching**: Background-prefetches upcoming slides (`0`, `2`, `3`, `5`, or `8` slides ahead) into an LRU in-memory `Blob` cache for instant forward navigation.

### 4. Local Gallery Folder & Offline Mode
- **Direct Disk Downloads**: Save individual slides (`D` or `S`) or batch-download selected items from the **Grid** view straight to `./gallery` (or a custom directory path).
- **Optional Browser Folder Sync**: Sync saved files directly to a chosen local directory via the File System Access API (`showDirectoryPicker`) in supported Chromium browsers.
- **Offline Local Slideshow**: Browse, filter by tag/filename, delete files, or launch a local slideshow directly from the **Local Gallery** view.

### 5. Tag Presets & Link Copying
- Launch built-in or user-saved tag + rating presets straight into **Slideshow** or **Grid** view.
- One-click **Copy Link** (`C` shortcut or action buttons in Slideshow, Post Inspector, and Grid cards) copies the direct media file URL to your clipboard.

## Keyboard Shortcuts (Slideshow View)

| Key | Action |
| --- | --- |
| `Space` | Play / Pause slideshow |
| `←` / `→` | Previous / Next slide |
| `D` or `S` | Save current file to local gallery folder |
| `C` | Copy direct media file link to clipboard |
| `I` | Toggle Post Inspector (metadata & clickable tags) |
| `H` | Hide / Show HUD controls |
| `F` | Toggle fullscreen |
| `1` / `2` / `3` | Switch `Fit` / `Fill` / `1:1` display mode |

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide Icons, Vite 8
- **Backend**: Node.js, Express 4 (multi-source API proxy, Range media streaming, disk gallery storage)
- **Testing**: Node.js built-in test runner (`node:test`) via `tsx`

## Getting Started

### Prerequisites
- Node.js 20+ and npm

### Installation & Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables (optional):
   Copy `.env.example` to `.env` to set server defaults:
   ```env
   PORT=3000
   GALLERY_DIR="./gallery"
   GELBOORU_USER_ID=""
   GELBOORU_API_KEY=""
   ```
   > Gelbooru credentials and the local gallery directory path can also be updated directly in the in-app **Settings** modal.

3. Start the development server:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000).

4. Build and run for production:
   ```bash
   npm run build
   npm start
   ```

## Scripts & Verification

| Command | Description |
| --- | --- |
| `npm run dev` | Start Express + Vite middleware dev server on port `3000` |
| `npm run build` | Build production frontend bundle into `dist/` |
| `npm start` | Serve production `dist/` assets and `/api/*` endpoints |
| `npm run lint` | Type-check the codebase with `tsc --noEmit` |

Run the unit test suite:
```bash
npx --yes tsx --test src/lib/booru.test.ts src/lib/mediaCache.test.ts
```

## Project Structure

```text
server.ts                     Express server, multi-source API proxy, Range media proxy, & disk gallery API
src/
  App.tsx                     Root state, search orchestration, presets, downloads, & clipboard handlers
  lib/
    booru.ts                  Board normalizers, query builders, filtering, & filename utilities
    mediaCache.ts             Streaming MediaBlobCache with LRU eviction & byte progress callbacks
    clipboard.ts              Clipboard helper with textarea fallback
    presets.ts                Built-in presets & localStorage settings persistence
    fsAccess.ts               Browser File System Access API helper
  components/
    TopBar.tsx                Primary navigation & Settings trigger
    TagFilterBar.tsx          Tag autocomplete, multi-select Sources/Ratings/Media popovers, & filters
    SlideshowStage.tsx        Theater stage, loading bar, video streaming, custom intervals, & inspector
    GridGallery.tsx           Contact sheet grid with batch selection, copy link, & download
    LocalGalleryView.tsx      Offline browser & slideshow launcher for locally saved files
    PresetsView.tsx           Built-in and custom tag collection presets
    SettingsModal.tsx         Credentials, gallery path, blacklist tags, & playback defaults
```

## Notes

- Downloaded files are stored in `./gallery` (or your configured `GALLERY_DIR`) with metadata tracked in `.gallery-index.json`. The `gallery/` directory is excluded from git via `.gitignore`.
- Media requests are proxied through `/api/proxy-media` for allowlisted hosts to bypass CORS/hotlink restrictions and support video byte-range seeking.
