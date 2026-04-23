/**
 * SYNAPSE v99 — Meta Screens (orchestrator)
 *
 * Refactored from the v95 monolith into focused sub-modules:
 *
 *   _summary.js   — buildRunSummary, updateMetaWithRun, bars/grade helpers
 *   _winScreen.js — showWinScreen, showFailScreen DOM writes
 *   _history.js   — renderHistoryPanel, bossCodex, protocolCodex, trait list
 *   _runHistory.js— loadRunHistory / saveRunHistory (unchanged)
 *
 * This file keeps only the lightweight orchestration functions that other
 * systems import directly (finalizeRunVictory, finalizeRunFailed, tickMetaScreens…).
 */

import { G } from '../state/gameState.js';
import { safeRestart } from '../engine/dispose.js';
import { LS_SAVE } from '../state/saveSystem.js';
import { metaState, getTelemetryDefaults, resetMetaState, restoreMetaState } from '../state/metaState.js';
import { synSettings, getLang, saveSettings } from '../state/settings.js';
import { gameNodes, gameLinks } from '../layers/network/index.js';
import { getActiveBridgeCount } from '../layers/bridge/index.js';
import { aiState, AI_STAGE_NAMES } from '../state/aiShared.js';
import { loadAIMetaCached, saveAIMeta } from '../systems/ai/index.js';
import { bankAwakeningPoints, getRootServer } from '../systems/awakening.js';
import { computeResearchAP } from '../systems/research.js';
import { mountRootServerPanel, refreshRootServerPanel } from '../systems/rootServer.js';
import { mountGeneticMemoryOverlay, injectResearchSummary, updateAPBadge } from '../systems/epochReveal.js';
import { el } from '../util/dom.js';
import {
  LS_RUN_HISTORY, LS_RUN_HISTORY_BACKUP, MAX_HISTORY,
  escapeHtml, loadRunHistory, saveRunHistory,
} from './_runHistory.js';
import { buildRunSummary, updateMetaWithRun, fmtDuration, fmtNum } from './_summary.js';
import { showWinScreen, showFailScreen } from './_winScreen.js';
import { renderHistoryPanel } from './_history.js';

// Re-exports so existing import sites keep working
export { loadRunHistory, saveRunHistory };
export { renderHistoryPanel };
export { showWinScreen, showFailScreen };

// ── AP banking on run end ─────────────────────────────────────────────────

export function onRunEnd() {
  try {
    const researchBonus = computeResearchAP();
    const pts = bankAwakeningPoints({
      epochReached:        G?.awakening?.epochIndex || 0,
      runDurationSecs:     (Date.now() - (G?.runStart || Date.now())) / 1000,
      peakEnergy:          G?.peakEnergy || 0,
      megaProjectComplete: !!G?.megaProject?.complete,
      researchBonus,
    });
    if (pts > 0) {
      import('../ui/hud/index.js').then(({ showToast }) => showToast('◈ +' + pts + ' AWAKENING POINTS', '', 2500));
      try { updateAPBadge(); } catch (e) { console.warn('[Synapse] updateAPBadge (bank) failed:', e); }
      setTimeout(() => {
        const badge = document.getElementById('s4-ap-badge');
        if (badge) { badge.classList.add('ap-gained'); setTimeout(() => badge.classList.remove('ap-gained'), 600); }
      }, 1000);
    }
  } catch (_) {}
}

// ── History toggle ────────────────────────────────────────────────────────

let _historyToggleHasData = null;
let _historyToggleProminent = null;

export function updateHistoryToggle() {
  const toggle = el('history-toggle');
  if (!toggle) return;
  const hasData = loadRunHistory().length > 0;
  const prominent = hasData && (!G.autoOn || G.runWon);
  if (_historyToggleHasData === hasData && _historyToggleProminent === prominent) return;
  _historyToggleHasData = hasData;
  _historyToggleProminent = prominent;
  toggle.classList.toggle('has-data', hasData);
  toggle.classList.toggle('ht-prominent', prominent);
}

// ── Title-screen meta box ─────────────────────────────────────────────────

export function populateTitleMetaBox() {
  const meta = loadAIMetaCached();
  const box = el('title-meta-box');
  if (!box) return;
  const lang = getLang();
  const runs = meta.totalRuns || 0;
  const traits = (meta.unlockedTraits || []).length;
  const profile = meta.dominantOverall;
  const profileLabel = p => ({
    analyst: lang === 'de' ? 'Analyst' : 'Analyst',
    predator: lang === 'de' ? 'Prädator' : 'Predator',
    architect: lang === 'de' ? 'Architekt' : 'Architect',
    mnemonic: lang === 'de' ? 'Mnemoniker' : 'Mnemonic',
  }[p] || p);
  const parts = [
    `${lang === 'de' ? 'Runs' : 'Runs'}: ${runs}`,
    `Traits: ${traits}`,
    profile ? `${lang === 'de' ? 'Profil' : 'Profile'}: ${profileLabel(profile)}` : null,
  ].filter(Boolean);
  box.textContent = parts.join(' · ');
  // 1-K — Meta-Box Eingangsanimation: .vis setzen + Animation-Reset
  if (box.textContent && runs > 0) {
    box.style.display = 'flex';
    box.classList.remove('vis');
    void box.offsetWidth;
    box.classList.add('vis');
  }
  try { refreshRootServerPanel(); } catch (_) {}
}

// ── Telemetry tick ────────────────────────────────────────────────────────

export function tickMetaScreens(t, dt) {
  if (!metaState.telemetry) resetMetaState();
  if (!G.runWon && !G.paused) {
    metaState.telemetry.energySampleSum += G.energy || 0;
    metaState.telemetry.energySampleCount += 1;
    if (G.l3On)       metaState.telemetry.layerTimes.l3 += dt;
    else if (G.l2On)  metaState.telemetry.layerTimes.l2 += dt;
    else if (G.autoOn)metaState.telemetry.layerTimes.l1 += dt;
    else              metaState.telemetry.layerTimes.dormant += dt;
  }
}

// ── Boss window telemetry ─────────────────────────────────────────────────

export function recordBossWindowOpen() {
  if (!metaState.telemetry) resetMetaState();
  metaState.telemetry.bossWindowsOpened += 1;
}

export function recordBossWindowHit() {
  if (!metaState.telemetry) resetMetaState();
  metaState.telemetry.bossWindowsHit += 1;
}

export function recordChainComplete(chainLength = 1) {
  if (!metaState.telemetry) resetMetaState();
  metaState.telemetry.totalChains += Math.max(1, Number(chainLength) || 1);
}

// ── Telemetry helpers ─────────────────────────────────────────────────────

export function resetMetaTelemetry() { resetMetaState(); }
export function restoreMetaTelemetry(save) { restoreMetaState(save); }

// ── Victory finalization ──────────────────────────────────────────────────

export function finalizeRunVictory() {
  if (!metaState.telemetry) resetMetaState();
  if (metaState.telemetry.finalized) return;
  metaState.telemetry.finalized = true;

  // RC-1 fix: bank AP on victory (was missing)
  try { onRunEnd(); } catch (e) { console.warn('[Synapse] onRunEnd (victory) failed:', e); }

  const summary = buildRunSummary();
  const historyBefore = loadRunHistory();
  const entry = {
    ts: summary.ts, tier: summary.winTier, duration: summary.durationSec,
    profile: summary.profile, protocolId: summary.protocolId,
    bossId: summary.boss?.id || null, perfect: summary.perfect,
    metaTraits: { ...(summary.metaTraits || {}) }, condition: summary.condition,
  };
  saveRunHistory([...historyBefore, entry]);

  const { meta, newTraits } = updateMetaWithRun(summary);
  populateTitleMetaBox();
  renderHistoryPanel('recent');
  showWinScreen(summary, meta, newTraits);

  try { localStorage.removeItem('synapse_run'); } catch (_) {}
  try { localStorage.removeItem(LS_SAVE); } catch (_) {}
  try { injectResearchSummary(); } catch (e) { console.warn('[Synapse] injectResearchSummary failed:', e); }
  try { mountGeneticMemoryOverlay(); } catch (e) { console.warn('[Synapse] mountGeneticMemoryOverlay failed:', e); }
  try { updateAPBadge(); } catch (e) { console.warn('[Synapse] updateAPBadge failed:', e); }
}

// ── Failure finalization ──────────────────────────────────────────────────

export function finalizeRunFailed() {
  if (!metaState.telemetry) resetMetaState();
  if (metaState.telemetry.finalized) return;
  metaState.telemetry.finalized = true;

  let apEarned = 0;
  try {
    const researchBonus = computeResearchAP();
    apEarned = bankAwakeningPoints({
      epochReached:        G?.awakening?.epochIndex || 0,
      runDurationSecs:     (Date.now() - (G?.runStart || Date.now())) / 1000,
      peakEnergy:          G?.peakEnergy || 0,
      megaProjectComplete: false,
      researchBonus,
    });
    if (apEarned > 0) { try { updateAPBadge(); } catch (_) {} }
  } catch (_) {}

  const durationSec = Math.max(1, Math.round((Date.now() - (G?.runStart || Date.now())) / 1000));
  const researchCompleted = G?.research?.completed instanceof Set
    ? G.research.completed.size
    : Array.isArray(G?.research?.completed) ? G.research.completed.length : 0;

  try {
    const historyBefore = loadRunHistory();
    saveRunHistory([...historyBefore, { ts: Date.now(), tier: 0, duration: durationSec, profile: null, failed: true }]);
    populateTitleMetaBox();
  } catch (_) {}

  showFailScreen({
    durationSec, durationLabel: fmtDuration(durationSec),
    epochReached: G?.awakening?.epochIndex || 0, peakEnergy: G?.peakEnergy || 0,
    nodesPlaced: G?.nodeCount || 0, researchCompleted,
    triangles: G?.tris?.size || 0, apEarned,
  });

  try { localStorage.removeItem('synapse_run'); } catch (_) {}
}

// ── Init ──────────────────────────────────────────────────────────────────

export function initMetaScreens() {
  if (!metaState.telemetry) resetMetaState();
  populateTitleMetaBox();
  renderHistoryPanel('recent');
  updateHistoryToggle();
}

// v98: Root Server — mount on page load
document.addEventListener('DOMContentLoaded', () => {
  try { mountRootServerPanel(); } catch (e) { console.warn('[Synapse] mountRootServerPanel failed:', e); }
});
