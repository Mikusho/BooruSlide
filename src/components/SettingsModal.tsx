import React, { useState } from 'react';
import { FolderOpen, Plus, X } from 'lucide-react';
import { isBrowserFolderPickerSupported } from '../lib/fsAccess';
import type { FilenamePattern, SlideFitMode, SlideshowSettings } from '../types/booru';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: SlideshowSettings;
  onUpdateSettings: (next: SlideshowSettings) => void;
  galleryDirectory: string;
  onChangeGalleryDirectory: (dir: string) => Promise<void>;
  browserFolderName: string | null;
  onConnectBrowserFolder: () => Promise<void>;
  onDisconnectBrowserFolder: () => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  galleryDirectory,
  onChangeGalleryDirectory,
  browserFolderName,
  onConnectBrowserFolder,
  onDisconnectBrowserFolder,
}: SettingsModalProps) {
  const [newBlacklistTag, setNewBlacklistTag] = useState('');
  const [dirInput, setDirInput] = useState(galleryDirectory);
  const [dirStatus, setDirStatus] = useState<string>('');
  const [isApplyingDir, setIsApplyingDir] = useState(false);

  if (!isOpen) return null;

  const browserPickerSupported = isBrowserFolderPickerSupported();

  const handleAddBlacklistTag = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newBlacklistTag.trim().replace(/^-+/, '').toLowerCase();
    if (!cleaned) return;
    if (!settings.blacklist.includes(cleaned)) {
      onUpdateSettings({
        ...settings,
        blacklist: [...settings.blacklist, cleaned],
      });
    }
    setNewBlacklistTag('');
  };

  const handleRemoveBlacklistTag = (tag: string) => {
    onUpdateSettings({
      ...settings,
      blacklist: settings.blacklist.filter((t) => t !== tag),
    });
  };

  const handleApplyDir = async () => {
    if (!dirInput.trim()) return;
    setIsApplyingDir(true);
    setDirStatus('');
    try {
      await onChangeGalleryDirectory(dirInput.trim());
      setDirStatus('Local gallery folder updated.');
    } catch (err) {
      setDirStatus(err instanceof Error ? err.message : 'Unable to update directory.');
    } finally {
      setIsApplyingDir(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="w-full max-w-2xl max-h-[90vh] bg-[#111114] border border-zinc-800 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <h2 id="settings-modal-title" className="font-display text-lg font-semibold text-zinc-100">
            Slideshow &amp; Gallery Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="p-1.5 text-zinc-400 hover:text-white rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Gelbooru API Credentials */}
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Gelbooru API Credentials</h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Gelbooru requires a free account&apos;s <span className="font-mono text-zinc-300">user_id</span> and{' '}
                <span className="font-mono text-zinc-300">api_key</span> (found in Gelbooru My Account → Options → API Access Credentials). Safebooru works without credentials.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="gelbooru-user-id" className="block text-xs text-zinc-400 mb-1">
                  Gelbooru User ID
                </label>
                <input
                  id="gelbooru-user-id"
                  type="text"
                  value={settings.gelbooruUserId}
                  onChange={(e) =>
                    onUpdateSettings({ ...settings, gelbooruUserId: e.target.value })
                  }
                  placeholder="e.g. 1234567"
                  className="w-full h-9 px-3 bg-zinc-950 border border-zinc-800 rounded text-sm font-mono text-zinc-100 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label htmlFor="gelbooru-api-key" className="block text-xs text-zinc-400 mb-1">
                  Gelbooru API Key
                </label>
                <input
                  id="gelbooru-api-key"
                  type="password"
                  value={settings.gelbooruApiKey}
                  onChange={(e) =>
                    onUpdateSettings({ ...settings, gelbooruApiKey: e.target.value })
                  }
                  placeholder="64-character hex API key"
                  className="w-full h-9 px-3 bg-zinc-950 border border-zinc-800 rounded text-sm font-mono text-zinc-100 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </section>

          {/* Local Gallery Folder Configuration */}
          <section className="pt-5 border-t border-zinc-800/80 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Local Gallery Folder</h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Downloaded images are saved directly to this local folder on disk for offline browsing and collection management.
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[220px]">
                <label htmlFor="gallery-dir-input" className="block text-xs text-zinc-400 mb-1">
                  Server Gallery Directory Path
                </label>
                <input
                  id="gallery-dir-input"
                  type="text"
                  value={dirInput}
                  onChange={(e) => setDirInput(e.target.value)}
                  className="w-full h-9 px-3 bg-zinc-950 border border-zinc-800 rounded text-sm font-mono text-zinc-100 focus:outline-none focus:border-blue-500"
                />
              </div>
              <button
                type="button"
                disabled={isApplyingDir}
                onClick={() => void handleApplyDir()}
                className="h-9 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-medium rounded transition-colors"
              >
                {isApplyingDir ? 'Applying...' : 'Apply Path'}
              </button>
            </div>
            {dirStatus && <p className="text-xs text-zinc-300">{dirStatus}</p>}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label htmlFor="filename-pattern" className="block text-xs text-zinc-400 mb-1">
                  Saved Filename Format
                </label>
                <select
                  id="filename-pattern"
                  value={settings.filenamePattern}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      filenamePattern: e.target.value as FilenamePattern,
                    })
                  }
                  className="w-full h-9 px-3 bg-zinc-950 border border-zinc-800 rounded text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
                >
                  <option value="id_tags">board_id_tags.ext</option>
                  <option value="board_id">board_id.ext</option>
                  <option value="id_hash">id_hash.ext</option>
                </select>
              </div>

              <div className="flex flex-col justify-end">
                {browserPickerSupported ? (
                  browserFolderName ? (
                    <div className="h-9 px-3 bg-emerald-950/40 border border-emerald-800/60 rounded flex items-center justify-between text-xs">
                      <span className="text-emerald-300 truncate">
                        Browser folder: {browserFolderName}
                      </span>
                      <button
                        type="button"
                        onClick={onDisconnectBrowserFolder}
                        className="text-zinc-400 hover:text-white ml-2 shrink-0"
                      >
                        Disconnect
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void onConnectBrowserFolder()}
                      className="h-9 px-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded text-xs font-medium text-zinc-200 inline-flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>Also Sync to Browser Folder...</span>
                    </button>
                  )
                ) : (
                  <p className="text-[11px] text-zinc-500 leading-snug">
                    Files save directly to the local server gallery folder above.
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Blacklist Tags */}
          <section className="pt-5 border-t border-zinc-800/80 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Blacklisted Tags</h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Posts containing these tags are excluded from queries and client results unless explicitly searched.
              </p>
            </div>

            <form onSubmit={handleAddBlacklistTag} className="flex items-center gap-2">
              <label htmlFor="blacklist-add-input" className="sr-only">
                Add tag to blacklist
              </label>
              <input
                id="blacklist-add-input"
                type="text"
                value={newBlacklistTag}
                onChange={(e) => setNewBlacklistTag(e.target.value)}
                placeholder="Add tag to exclude (e.g. ai_generated)"
                className="flex-1 h-9 px-3 bg-zinc-950 border border-zinc-800 rounded text-sm font-mono text-zinc-100 focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                className="h-9 px-3.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-medium rounded inline-flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </form>

            {settings.blacklist.length === 0 ? (
              <p className="text-xs text-zinc-500">No blacklisted tags configured.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {settings.blacklist.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleRemoveBlacklistTag(tag)}
                    aria-label={`Remove ${tag} from blacklist`}
                    className="px-2.5 py-1 bg-zinc-950 border border-zinc-800 hover:border-rose-700/70 rounded text-xs font-mono text-zinc-300 hover:text-rose-300 inline-flex items-center gap-1.5 transition-colors"
                  >
                    <span>-{tag}</span>
                    <X className="w-3 h-3" />
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Playback Preferences */}
          <section className="pt-5 border-t border-zinc-800/80 space-y-3">
            <h3 className="text-sm font-semibold text-zinc-100">Playback Defaults</h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label htmlFor="settings-fit" className="block text-xs text-zinc-400 mb-1">
                  Default Fit Mode
                </label>
                <select
                  id="settings-fit"
                  value={settings.fitMode}
                  onChange={(e) =>
                    onUpdateSettings({ ...settings, fitMode: e.target.value as SlideFitMode })
                  }
                  className="w-full h-9 px-3 bg-zinc-950 border border-zinc-800 rounded text-sm text-zinc-100"
                >
                  <option value="contain">Fit to Screen</option>
                  <option value="cover">Fill Viewport</option>
                  <option value="actual">1:1 Original</option>
                </select>
              </div>

              <div>
                <label htmlFor="settings-interval" className="block text-xs text-zinc-400 mb-1">
                  Slide Interval (sec)
                </label>
                <input
                  id="settings-interval"
                  type="number"
                  min={1}
                  max={3600}
                  step={0.5}
                  value={settings.intervalSeconds}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (Number.isFinite(val) && val >= 1) {
                      onUpdateSettings({ ...settings, intervalSeconds: Math.min(3600, val) });
                    }
                  }}
                  className="w-full h-9 px-3 bg-zinc-950 border border-zinc-800 rounded text-sm font-mono tabular-nums text-zinc-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label htmlFor="settings-preload" className="block text-xs text-zinc-400 mb-1">
                  Cache Ahead Slides
                </label>
                <select
                  id="settings-preload"
                  value={settings.preloadCount}
                  onChange={(e) =>
                    onUpdateSettings({ ...settings, preloadCount: Number(e.target.value) })
                  }
                  className="w-full h-9 px-3 bg-zinc-950 border border-zinc-800 rounded text-sm font-mono tabular-nums text-zinc-100"
                >
                  <option value={0}>0 slides</option>
                  <option value={2}>2 slides</option>
                  <option value={3}>3 slides</option>
                  <option value={5}>5 slides</option>
                  <option value={8}>8 slides</option>
                </select>
              </div>

              <div className="flex items-end pb-1.5">
                <label className="inline-flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.autoHideHud}
                    onChange={(e) =>
                      onUpdateSettings({ ...settings, autoHideHud: e.target.checked })
                    }
                    className="rounded border-zinc-700 bg-zinc-950 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Auto-hide HUD</span>
                </label>
              </div>
            </div>
          </section>
        </div>

        <div className="px-6 py-3.5 border-t border-zinc-800 bg-[#09090B] flex items-center justify-between shrink-0">
          <span className="text-xs text-zinc-500">
            Hotkeys: Space Play/Pause · ←/→ Navigate · D Save · C Copy Link · I Tags · H Hide HUD · F Fullscreen
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-md transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
