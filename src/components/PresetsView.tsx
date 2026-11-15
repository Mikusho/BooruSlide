import React, { useState } from 'react';
import { LayoutGrid, Play, Plus, Trash2 } from 'lucide-react';
import type { PostRating, TagPreset } from '../types/booru';

interface PresetsViewProps {
  presets: TagPreset[];
  currentTags: string;
  currentRating: PostRating;
  onRunPreset: (preset: TagPreset, targetView: 'slideshow' | 'grid') => void;
  onCreatePreset: (preset: Omit<TagPreset, 'id'>) => void;
  onDeletePreset: (id: string) => void;
}

export function PresetsView({
  presets,
  currentTags,
  currentRating,
  onRunPreset,
  onCreatePreset,
  onDeletePreset,
}: PresetsViewProps) {
  const [name, setName] = useState('');
  const [tags, setTags] = useState(currentTags);
  const [rating, setRating] = useState<PostRating>(currentRating);
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !tags.trim()) {
      setFormError('Preset name and at least one tag are required.');
      return;
    }
    setFormError('');
    onCreatePreset({
      name: name.trim(),
      tags: tags.trim(),
      rating,
      description: description.trim() || 'Custom saved tag collection',
    });
    setName('');
    setDescription('');
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#09090B]">
      <div className="max-w-5xl mx-auto p-4 lg:p-8 space-y-8">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-zinc-100">
            Tag Collection Presets
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Launch curated Gelbooru/Safebooru tag queries straight into the Slideshow Theater or save your own combinations.
          </p>
        </div>

        {/* Save New Preset Form */}
        <form
          onSubmit={handleSubmit}
          className="p-5 rounded-lg bg-[#111114] border border-zinc-800 space-y-4"
        >
          <h2 className="text-sm font-semibold text-zinc-100">Save Tag Preset</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label htmlFor="preset-name" className="block text-xs text-zinc-400 mb-1">
                Collection Name
              </label>
              <input
                id="preset-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Rainy Cityscapes"
                className="w-full h-9 px-3 bg-zinc-950 border border-zinc-800 rounded text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label htmlFor="preset-tags" className="block text-xs text-zinc-400 mb-1">
                Tags
              </label>
              <input
                id="preset-tags"
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="e.g. cityscape rain night"
                className="w-full h-9 px-3 bg-zinc-950 border border-zinc-800 rounded text-sm font-mono text-zinc-100 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label htmlFor="preset-rating" className="block text-xs text-zinc-400 mb-1">
                Rating
              </label>
              <select
                id="preset-rating"
                value={rating}
                onChange={(e) => setRating(e.target.value as PostRating)}
                className="w-full h-9 px-3 bg-zinc-950 border border-zinc-800 rounded text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
              >
                <option value="general">General</option>
                <option value="sensitive">Sensitive</option>
                <option value="questionable">Questionable</option>
                <option value="explicit">Explicit</option>
                <option value="all">All</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex-1 min-w-[240px]">
              <label htmlFor="preset-desc" className="block text-xs text-zinc-400 mb-1">
                Notes (optional)
              </label>
              <input
                id="preset-desc"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short note about this tag query"
                className="w-full h-9 px-3 bg-zinc-950 border border-zinc-800 rounded text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
              />
            </div>

            <button
              type="submit"
              className="h-9 px-4 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-md inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Save Preset</span>
            </button>
          </div>

          {formError && <p className="text-xs text-rose-400">{formError}</p>}
        </form>

        {/* Presets Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {presets.map((preset) => (
            <article
              key={preset.id}
              className="p-4 rounded-lg bg-[#111114] border border-zinc-800 flex flex-col justify-between gap-4"
            >
              <div className="space-y-1.5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-base font-semibold text-zinc-100">{preset.name}</h3>
                  {!preset.builtIn && (
                    <button
                      type="button"
                      onClick={() => onDeletePreset(preset.id)}
                      aria-label={`Delete preset ${preset.name}`}
                      className="text-zinc-500 hover:text-rose-400 p-1 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <p className="text-xs text-zinc-400">{preset.description}</p>
                <p className="text-xs font-mono text-zinc-300 pt-1">
                  {preset.tags} <span className="text-zinc-600">·</span>{' '}
                  <span className="capitalize text-zinc-400">rating:{preset.rating}</span>
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-zinc-800/80">
                <button
                  type="button"
                  onClick={() => onRunPreset(preset, 'slideshow')}
                  className="h-8 px-3.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded inline-flex items-center gap-1.5 transition-colors"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>Start Slideshow</span>
                </button>
                <button
                  type="button"
                  onClick={() => onRunPreset(preset, 'grid')}
                  className="h-8 px-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-medium rounded inline-flex items-center gap-1.5 transition-colors"
                >
                  <LayoutGrid className="w-3 h-3" />
                  <span>Browse Grid</span>
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
