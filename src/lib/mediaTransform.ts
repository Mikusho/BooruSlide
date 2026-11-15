export interface MediaTransformState {
  zoom: number;
  panX: number;
  panY: number;
  rotation: number; // degrees, e.g. 0, 90, 180, -90
  flipH: boolean;
  flipV: boolean;
}

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 5;
export const ZOOM_STEP = 0.25;

export const DEFAULT_MEDIA_TRANSFORM: MediaTransformState = {
  zoom: 1,
  panX: 0,
  panY: 0,
  rotation: 0,
  flipH: false,
  flipV: false,
};

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
  return Math.round(clamped * 100) / 100;
}

export function stepZoom(currentZoom: number, direction: 'in' | 'out', step = ZOOM_STEP): number {
  const safeStep = Number.isFinite(step) && step > 0 ? step : ZOOM_STEP;
  const delta = direction === 'in' ? safeStep : -safeStep;
  return clampZoom(currentZoom + delta);
}

export function clampPan(
  pan: { x: number; y: number },
  zoom: number,
  maxOffset = 2000
): { x: number; y: number } {
  if (!Number.isFinite(zoom) || zoom <= 1) {
    return { x: 0, y: 0 };
  }
  const limit = Math.max(0, maxOffset * (zoom - 1));
  const x = Number.isFinite(pan.x) ? Math.min(limit, Math.max(-limit, pan.x)) : 0;
  const y = Number.isFinite(pan.y) ? Math.min(limit, Math.max(-limit, pan.y)) : 0;
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
}

export function isTransformModified(state: MediaTransformState): boolean {
  return (
    Math.abs(state.zoom - 1) > 0.001 ||
    Math.abs(state.panX) > 0.5 ||
    Math.abs(state.panY) > 0.5 ||
    ((state.rotation % 360) + 360) % 360 !== 0 ||
    state.flipH ||
    state.flipV
  );
}

export function buildMediaTransformStyle(state: MediaTransformState): string {
  const scaleX = state.zoom * (state.flipH ? -1 : 1);
  const scaleY = state.zoom * (state.flipV ? -1 : 1);
  return `translate3d(${state.panX}px, ${state.panY}px, 0) scale(${scaleX}, ${scaleY}) rotate(${state.rotation}deg)`;
}

export function formatMediaDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hrs > 0) {
    return `${hrs}:${pad(mins)}:${pad(secs)}`;
  }
  return `${mins}:${pad(secs)}`;
}
