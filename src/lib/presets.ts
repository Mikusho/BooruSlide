import type { SlideshowSettings, TagPreset } from '../types/booru';

export const DEFAULT_SETTINGS: SlideshowSettings = {
  board: 'safebooru',
  sources: ['safebooru'],
  gelbooruUserId: '',
  gelbooruApiKey: '',
  intervalSeconds: 6,
  autoPlay: false,
  loop: true,
  shuffle: false,
  fitMode: 'contain',
  preloadCount: 3,
  autoHideHud: false,
  blacklist: ['comic', '4koma', 'text_focus', 'monochrome_comic'],
  filenamePattern: 'id_tags',
  saveToBrowserFolder: false,
};

export const BUILTIN_PRESETS: TagPreset[] = [
  {
    id: 'preset-scenery',
    name: 'Atmospheric Scenery',
    tags: 'scenery no_humans sky clouds',
    rating: 'general',
    description: 'Wide-angle skies, cloudscapes, and environmental background art.',
    builtIn: true,
  },
  {
    id: 'preset-architecture',
    name: 'Urban & Architecture',
    tags: 'scenery architecture cityscape',
    rating: 'general',
    description: 'City streets, interiors, and structural perspective studies.',
    builtIn: true,
  },
  {
    id: 'preset-night',
    name: 'Nocturne & Starlight',
    tags: 'scenery night starry_sky',
    rating: 'general',
    description: 'Nighttime illumination, constellations, and moonlight compositions.',
    builtIn: true,
  },
  {
    id: 'preset-nature',
    name: 'Forest & Water',
    tags: 'scenery nature forest water',
    rating: 'general',
    description: 'Woodlands, lakes, waterfalls, and botanical landscapes.',
    builtIn: true,
  },
  {
    id: 'preset-traditional',
    name: 'Watercolor & Ink',
    tags: 'traditional_media watercolor scenery',
    rating: 'general',
    description: 'Hand-painted gouache, ink wash, and watercolor illustrations.',
    builtIn: true,
  },
  {
    id: 'preset-animated',
    name: 'Animated Loops',
    tags: 'animated scenery',
    rating: 'general',
    description: 'Subtle animated GIFs and short looping atmospheric clips.',
    builtIn: true,
  },
];

const SETTINGS_KEY = 'booruslide_settings_v1';
const PRESETS_KEY = 'booruslide_custom_presets_v1';

export function loadSettings(): SlideshowSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<SlideshowSettings>;
    const migratedSources =
      Array.isArray(parsed.sources) && parsed.sources.length > 0
        ? parsed.sources
        : parsed.board
          ? [parsed.board]
          : DEFAULT_SETTINGS.sources;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      sources: migratedSources,
      blacklist: Array.isArray(parsed.blacklist) ? parsed.blacklist : DEFAULT_SETTINGS.blacklist,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: SlideshowSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota issues
  }
}

export function loadCustomPresets(): TagPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as TagPreset[]) : [];
  } catch {
    return [];
  }
}

export function saveCustomPresets(presets: TagPreset[]): void {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  } catch {
    // Ignore storage quota issues
  }
}
