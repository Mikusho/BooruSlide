import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMediaTransformStyle,
  clampPan,
  clampZoom,
  DEFAULT_MEDIA_TRANSFORM,
  formatMediaDuration,
  isTransformModified,
  MAX_ZOOM,
  MIN_ZOOM,
  stepZoom,
} from './mediaTransform';

test('clampZoom bounds zoom levels cleanly', () => {
  assert.equal(clampZoom(0.05), MIN_ZOOM);
  assert.equal(clampZoom(99), MAX_ZOOM);
  assert.equal(clampZoom(1.5), 1.5);
  assert.equal(clampZoom(Number.NaN), 1);
});

test('stepZoom increments and decrements within bounds', () => {
  assert.equal(stepZoom(1, 'in'), 1.25);
  assert.equal(stepZoom(1, 'out'), 0.75);
  assert.equal(stepZoom(MAX_ZOOM, 'in'), MAX_ZOOM);
  assert.equal(stepZoom(MIN_ZOOM, 'out'), MIN_ZOOM);
});

test('clampPan centers when zoom <= 1 and clamps scaled offsets when zoomed in', () => {
  assert.deepEqual(clampPan({ x: 120, y: -80 }, 1), { x: 0, y: 0 });
  assert.deepEqual(clampPan({ x: 120, y: -80 }, 0.75), { x: 0, y: 0 });
  assert.deepEqual(clampPan({ x: 150, y: -120 }, 2, 500), { x: 150, y: -120 });
  assert.deepEqual(clampPan({ x: 9999, y: -9999 }, 2, 500), { x: 500, y: -500 });
});

test('isTransformModified detects zoom, pan, rotation, and flip changes', () => {
  assert.equal(isTransformModified(DEFAULT_MEDIA_TRANSFORM), false);
  assert.equal(isTransformModified({ ...DEFAULT_MEDIA_TRANSFORM, rotation: 360 }), false);
  assert.equal(isTransformModified({ ...DEFAULT_MEDIA_TRANSFORM, zoom: 1.25 }), true);
  assert.equal(isTransformModified({ ...DEFAULT_MEDIA_TRANSFORM, rotation: 90 }), true);
  assert.equal(isTransformModified({ ...DEFAULT_MEDIA_TRANSFORM, flipH: true }), true);
  assert.equal(isTransformModified({ ...DEFAULT_MEDIA_TRANSFORM, flipV: true }), true);
  assert.equal(isTransformModified({ ...DEFAULT_MEDIA_TRANSFORM, panX: 12 }), true);
});

test('buildMediaTransformStyle produces expected CSS transform string', () => {
  assert.equal(
    buildMediaTransformStyle(DEFAULT_MEDIA_TRANSFORM),
    'translate3d(0px, 0px, 0) scale(1, 1) rotate(0deg)'
  );
  assert.equal(
    buildMediaTransformStyle({
      zoom: 2,
      panX: 30,
      panY: -15,
      rotation: 90,
      flipH: true,
      flipV: false,
    }),
    'translate3d(30px, -15px, 0) scale(-2, 2) rotate(90deg)'
  );
});

test('formatMediaDuration formats seconds cleanly', () => {
  assert.equal(formatMediaDuration(-5), '0:00');
  assert.equal(formatMediaDuration(9), '0:09');
  assert.equal(formatMediaDuration(75.8), '1:15');
  assert.equal(formatMediaDuration(3665), '1:01:05');
});
