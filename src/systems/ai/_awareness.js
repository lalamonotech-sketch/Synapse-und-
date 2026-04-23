/**
 * SYNAPSE v99 — AI Awareness Stages
 *
 * Manages the 5 awareness stages (0–4) that drive AI escalation,
 * stage-gated bonuses, and UI glitch effects.
 */

import { G } from '../../state/gameState.js';
import { TUNING } from '../../state/tuning.js';
import { getLang } from '../../state/settings.js';
import { aiState } from '../../state/aiShared.js';
import { getActiveBridgeCount } from '../../layers/bridge/index.js';
import { showToast } from '../../ui/hud/index.js';
import { spawnShock } from '../../layers/network/index.js';

// ── Stage advance check ───────────────────────────────────────────────────

export function checkAwarenessStage() {
  if (G.runWon) return;
  const s = aiState.awarenessStage;
  const activeBr = (aiState._cachedActiveBr !== undefined)
    ? aiState._cachedActiveBr
    : getActiveBridgeCount();
  aiState._cachedActiveBr = undefined;

  const combined = Object.values(aiState.profileScores).reduce((a, b) => a + b, 0);
  let next = s;

  const lastAdvance = aiState.lastAwarenessAdvance || 0;
  if (Date.now() - lastAdvance < 45000 && s > 0) return;

  if (s < 1 && G.tris.size >= 1 && activeBr >= 1) next = 1;
  if (next >= 1 && s < 2 && G.l3CapturedClusters >= 1 && aiState.syncHits >= 2 && aiState.trainingRuns >= 2) next = 2;
  if (next >= 2 && s < 3 && (G.spineLength >= 3 || G.fusedPairs.size >= 1) && G.l3CapturedClusters >= 2) next = 3;
  if (next >= 3 && s < 4 && (G.backboneActive || (combined >= 240 && G.l3CapturedClusters >= 4))) next = 4;

  if (next !== s) {
    aiState.awarenessStage = next;
    aiState.lastAwarenessAdvance = Date.now();
    aiState.trainingHistory.push({ stage: next, profile: aiState.dominantProfile, ts: Date.now() });
    _onAwarenessAdvance(next);
  }
}

function _onAwarenessAdvance(stage) {
  const lang = getLang();
  const stageNames = {
    de: ['', 'Mustererkennung', 'Prädiktiv', 'Selbstoptimierend', 'Emergent'],
    en: ['', 'Pattern Recognition', 'Predictive', 'Self-Optimizing', 'Emergent'],
  };
  const subtitles = {
    de: ['', 'Erste Strukturmuster erkannt · Profil formt sich', 'Vorhersagemodell aktiv · Sync-Fenster antizipiert', 'Netz optimiert sich selbst · Topologie konsolidiert', '★ Emergentes Verhalten · Identität vollständig'],
    en: ['', 'First structural patterns detected · Profile emerging', 'Prediction model active · Sync windows anticipated', 'Network self-optimizing · Topology consolidating', '★ Emergent behavior · Identity complete'],
  };
  const name = stageNames[lang][stage] || stage;
  showToast(
    `BEWUSSTSEIN · STUFE ${stage + 1}`,
    `${name.toUpperCase()} — ${subtitles[lang][stage]}`,
    4800
  );
  spawnShock([0x66ffcc, 0x66ffcc, 0x4488ff, 0xffcc44, 0xff6622][stage] || 0x66ffcc);
  applyStageEffects(stage);
}

export function applyStageEffects(stage) {
  if (stage >= 1) G.trainCd = 8500;
  if (stage >= 2) {
    G.l3SyncWindowDur = TUNING.syncWindowDuration + 0.8;
    aiState.stageUnlocks.predictive = true;
  }
  if (stage >= 3) {
    aiState.stageUnlocks.selfOpt = true;
    G.trainCost = 6;
    _triggerUIGlitch(stage - 2);
  }
  if (stage >= 4) {
    aiState.stageUnlocks.emergent = true;
    aiState.emergenceActive = true;
    _triggerUIGlitch(2);
  }
}

// ── UI Glitch Effect ──────────────────────────────────────────────────────

function _triggerUIGlitch(intensity) {
  const selectors = ['#control-dock', '#hud-topbar', '.ai-panel', '#agent-line'];
  const targets = selectors.map(s => document.querySelector(s)).filter(Boolean);
  if (targets.length === 0) return;
  const duration = Math.min(3, intensity) * 500;
  targets.forEach(el => el.classList.add('v96-ui-glitch'));
  setTimeout(() => targets.forEach(el => el.classList.remove('v96-ui-glitch')), duration);
}
