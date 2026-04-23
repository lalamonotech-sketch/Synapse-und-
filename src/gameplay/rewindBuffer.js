/**
 * SYNAPSE — Rewind Buffer
 *
 * Keeps a ring buffer of state snapshots over the last ~10 seconds
 * (one snapshot per second). Used by Boss-fight Rewind feature.
 *
 * Cost: each snapshot is the same JSON the save system produces — so
 * memory cost is bounded (~10× one save string, typically 30–80 KB).
 *
 * Usage:
 *   import { snapshotNow, rewind } from './rewindBuffer.js';
 *   snapshotNow();          // call from heartbeat tick
 *   rewind(10);             // restore state from 10s ago
 */

import { exportState } from '../state/saveSystem.js';
import { regTimer, clearTimer } from '../registries/timerRegistry.js';

const MAX_SECONDS = 10;
const TICK_MS = 1000;

const _ring = []; // entries: { t, snapshot }
let _started = false;

export function snapshotNow() {
  try {
    const snap = exportState();
    _ring.push({ t: Date.now(), snapshot: snap });
    while (_ring.length > _maxSeconds + 1) _ring.shift();
  } catch (e) {
    // Snapshot is best-effort; skip on failure
    console.warn('[rewindBuffer] snapshot failed:', e?.message || e);
  }
}

export function startRewindBuffer() {
  if (_started) return;
  _started = true;
  regTimer('rewindBufferTick', setInterval(snapshotNow, TICK_MS), 'interval');
}

export function stopRewindBuffer() {
  _started = false;
  clearTimer('rewindBufferTick');
  _ring.length = 0;
}

export function getRewindDepth() { return _ring.length; }

/**
 * Return a snapshot from `secondsAgo` seconds in the past (clamped).
 * Caller is responsible for applying it via the save-system restore path.
 */
export function peekRewind(secondsAgo = _maxSeconds) {
  if (!_ring.length) return null;
  const idx = Math.max(0, _ring.length - 1 - Math.floor(secondsAgo));
  return _ring[idx]?.snapshot || _ring[0].snapshot;
}

/**
 * Pop everything newer than `secondsAgo` so subsequent snapshots write fresh.
 */
export function consumeRewind(secondsAgo = _maxSeconds) {
  const snap = peekRewind(secondsAgo);
  _ring.length = 0;
  return snap;
}


// ── Configurable depth (Temporal Fold upgrade) ──────────────────────────

let _maxSeconds = MAX_SECONDS;

/**
 * Override the rewind buffer depth.
 * Called by the 'temporal_fold' draft upgrade to extend from 10s → 30s.
 * @param {number} seconds
 */
export function setRewindDepth(seconds) {
  _maxSeconds = Math.max(MAX_SECONDS, Math.min(60, seconds));
}

// Expose as window bridge so _draft.js apply() can call it
// (draft upgrade apply() runs in a context without direct ES imports)
window._setRewindDepth = setRewindDepth;

export function getMaxRewindDepth() { return _maxSeconds; }
