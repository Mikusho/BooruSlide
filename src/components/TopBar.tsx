import type { AppView } from '../types/booru';

interface TopBarProps {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  favoritesCount: number;
  localCount: number;
  onOpenSettings: () => void;
}

export function TopBar({ activeView, onNavigate, favoritesCount, localCount, onOpenSettings }: TopBarProps) {
  const navItems: { id: AppView; label: string }[] = [
    { id: 'slideshow', label: 'Slideshow' },
    { id: 'grid', label: 'Grid' },
    { id: 'favorites', label: favoritesCount > 0 ? `Favorites (${favoritesCount})` : 'Favorites' },
    { id: 'local', label: localCount > 0 ? `Local Gallery (${localCount})` : 'Local Gallery' },
    { id: 'presets', label: 'Presets' },
  ];

  return (
    <header className="h-12 sm:h-14 border-b border-zinc-800 bg-[#09090B]/95 backdrop-blur-sm px-3 sm:px-4 lg:px-6 flex items-center justify-between gap-3 sm:gap-8 shrink-0 z-30">
      {/* Zone 1: Single text element wordmark */}
      <button
        type="button"
        onClick={() => onNavigate('slideshow')}
        className="font-display text-base sm:text-lg font-semibold tracking-tight text-zinc-100 hover:text-white transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-sm"
      >
        BooruSlide
      </button>

      {/* Zone 2: Clean single-line navigation links */}
      <nav aria-label="Primary views" className="flex items-center gap-3 sm:gap-6 overflow-x-auto no-scrollbar min-w-0">
        {navItems.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative py-3 sm:py-4 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                isActive ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {item.label}
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Single primary action */}
      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={onOpenSettings}
          className="px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          Settings
        </button>
      </div>
    </header>
  );
}
