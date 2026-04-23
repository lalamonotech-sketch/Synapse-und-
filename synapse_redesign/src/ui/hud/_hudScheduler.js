/**
 * SYNAPSE v99 — UI HUD: Section-level dirty-bit scheduler
 *
 * Extracted from hud.js (was lines 838–929).
 * Coalesces HUD update requests into a single rAF flush per frame.
 *
 * Exports:
 *   refreshHUDSections(...sections)  – queue sections by name
 *   refreshHUDMask(mask)             – queue by bitmask
 *   shouldTickTopHUD(now)            – true when the top HUD needs continuous updates
 *   refreshTopHUD / refreshAIHUD / refreshL3HUD / refreshBossHUD / refreshAll
 *   updateHUD(...sections)           – synchronous flush (bypass rAF)
 *   getHUDPerfStats()                – telemetry counters
 */

import { G }          from '../../state/gameState.js';
import { bossState }  from '../../state/bossShared.js';
import { HUD_SECTION_MASK } from '../../platform/stateSignals.js';
import { updateAIHud }      from '../../systems/ai/index.js';
import { updateBossHUD }    from '../../systems/boss/index.js';
import { updateL3ClusterHUD } from '../../layers/meta/layer3.js';
// updateTopHUD resolved lazily (below) to avoid circular: hud.js ↔ _hudScheduler.js


// Lazy import to break the circular dependency hud.js ↔ _hudScheduler.js
// updateTopHUD is defined in hud.js which also re-exports from here.
// We resolve it at call-time (not at module init) so the module graph is a DAG.
let _updateTopHUDFn = null;
function _getUpdateTopHUD() {
  if (!_updateTopHUDFn) {
    // Dynamic require-style: import() would be async, so we use a side-channel instead.
    // hud.js registers itself here when it loads:
    _updateTopHUDFn = window.__hudUpdateTopHUD || (() => {});
  }
  return _updateTopHUDFn;
}

/** Called by hud.js on load to register the updateTopHUD function. */
export function registerUpdateTopHUD(fn) {
  _updateTopHUDFn = fn;
}

// ─── Dirty-bit state ──────────────────────────────────────────────────────
let _hudDirtyMask = 0;
let _hudRaf = null;
const _hudPerf = {
  queuedMasks:   0,
  rafFlushes:    0,
  directFlushes: 0,
  lastMask:      0,
  topFlushes:    0,
  aiFlushes:     0,
  l3Flushes:     0,
  bossFlushes:   0,
};

// ─── Internal helpers ─────────────────────────────────────────────────────

function _normalizeHudMask(sections) {
  if (!sections || sections.length === 0) return HUD_SECTION_MASK.all;
  let mask = 0;
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    if (!section) continue;
    if (typeof section === 'number')   { mask |= section; continue; }
    if (Array.isArray(section))        { mask |= _normalizeHudMask(section); continue; }
    mask |= HUD_SECTION_MASK[section] || 0;
  }
  return mask || HUD_SECTION_MASK.all;
}

function _flushHudMask(mask, source = 'direct') {
  _hudPerf.lastMask = mask;
  if (source === 'raf') _hudPerf.rafFlushes++;
  else                  _hudPerf.directFlushes++;
  if (mask & HUD_SECTION_MASK.top)                              { _hudPerf.topFlushes++;  _getUpdateTopHUD()(); }
  if (mask & HUD_SECTION_MASK.ai)                               { _hudPerf.aiFlushes++;   updateAIHud(); }
  if ((mask & HUD_SECTION_MASK.l3)   && G.l3On)                { _hudPerf.l3Flushes++;   updateL3ClusterHUD(); }
  if ((mask & HUD_SECTION_MASK.boss) && bossState.bossTriggered) { _hudPerf.bossFlushes++; updateBossHUD(); }
}

function _queueHudMask(mask) {
  if (!mask) return;
  _hudDirtyMask |= mask;
  _hudPerf.queuedMasks++;
  if (_hudRaf !== null) return;
  _hudRaf = requestAnimationFrame(() => {
    const maskNow = _hudDirtyMask || HUD_SECTION_MASK.all;
    _hudDirtyMask = 0;
    _hudRaf = null;
    _flushHudMask(maskNow, 'raf');
  });
}

// ─── Public API ───────────────────────────────────────────────────────────

export function refreshHUDSections(...sections) {
  _queueHudMask(_normalizeHudMask(sections));
}

export function refreshHUDMask(mask) {
  _queueHudMask(mask);
}

export function shouldTickTopHUD(now = Date.now()) {
  if (!G.autoOn) return false;
  if (Math.max(0, G.pulseCd - (now - G.pulseMs)) > 0) return true;
  if (Math.max(0, G.trainCd - (now - G.trainMs)) > 0) return true;
  if (G.l3On) {
    const clusters = G.l3Clusters || [];
    for (let i = 0; i < clusters.length; i++) {
      const cl = clusters[i];
      if (cl?.syncWindowOpen || cl?.syncReady) return true;
    }
  }
  return !!(G.backboneActive || bossState.bossTriggered);
}

export const refreshTopHUD  = () => refreshHUDSections('top');
export const refreshAIHUD   = () => refreshHUDSections('ai');
export const refreshL3HUD   = () => refreshHUDSections('l3');
export const refreshBossHUD = () => refreshHUDSections('boss');

export function refreshAll() {
  _queueHudMask(HUD_SECTION_MASK.all);
}

export function updateHUD(...sections) {
  _flushHudMask(_normalizeHudMask(sections), 'direct');
}

export function getHUDPerfStats() {
  return {
    ..._hudPerf,
    pendingMask:    _hudDirtyMask,
    hasQueuedFlush: _hudRaf !== null,
  };
}
