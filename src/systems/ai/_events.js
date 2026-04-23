/**
 * SYNAPSE v99 — AI Event Hooks & Agent Messages
 *
 * Lightweight wrappers that emit agent messages on game events.
 * Also contains the doTrainPulse() action logic.
 */

import { G } from '../../state/gameState.js';
import { getLang } from '../../state/settings.js';
import { aiState } from '../../state/aiShared.js';
import { gameplayFlags } from '../../state/gameplayFlags.js';
import { regTimer, clearTimer } from '../../registries/timerRegistry.js';
import { bLinks } from '../../layers/bridge/index.js';
import { gameNodes } from '../../layers/network/index.js';
import { SFX } from '../../audio/sfx.js';
import { showToast, updateAIHudPanel } from '../../ui/hud/index.js';
import { signalAIChanged } from '../../platform/stateSignals.js';
import { setNowAction } from '../../ui/actionFlow.js';
import { showTrainScorePopup } from '../../ui/actionFlow.js';
import { emitAgentMessage, showAgentMsg } from '../../meta/flow.js';
import { spawnShock } from '../../layers/network/index.js';
import { getEffectiveTrainCost } from '../../gameplay/balance.js';
import {
  aiState as _as,
  AI_STAGE_NAMES, AI_PROFILE_LABELS, AI_MOOD_LABELS, AI_PROFILE_COLORS,
} from '../../state/aiShared.js';
import {
  computeAIProfiles, applyProfileBonuses, getTrainingLevel, getRecentIntervalStats,
} from './_scoring.js';
import { applyTrainingImmunity } from './_combat.js';

let _prevTrainLevel = 0;

// ── HUD update ────────────────────────────────────────────────────────────

export function updateAIHud() {
  updateAIHudPanel({
    awarenessStage: aiState.awarenessStage,
    dominantProfile: aiState.dominantProfile,
    profileScores: aiState.profileScores,
    mood: aiState.agentMood,
    lang: getLang(),
    stageNames: AI_STAGE_NAMES,
    profileLabels: AI_PROFILE_LABELS,
    moodLabels: AI_MOOD_LABELS,
    profileColors: AI_PROFILE_COLORS,
    trainingLevel: aiState.dominantProfile ? getTrainingLevel(aiState.dominantProfile) : 0,
  });
}

// ── Training pulse ────────────────────────────────────────────────────────

export function doTrainPulse() {
  if (G.paused) return;
  const now = Date.now();
  const cd = G.trainCd - (now - G.trainMs);
  const lang = getLang();

  if (cd > 0) {
    showToast(lang === 'de' ? 'Training lädt' : 'Training charging', Math.ceil(cd / 1000) + 's', 900);
    return;
  }
  const trainCost = getEffectiveTrainCost();
  if (G.energy < trainCost) {
    showToast(
      lang === 'de' ? 'Zu wenig Energie' : 'Not enough energy',
      lang === 'de' ? `Training kostet ${trainCost}⬡ · aktuell ${Math.round(G.energy)}⬡` : `Training costs ${trainCost}⬡ · current ${Math.round(G.energy)}⬡`,
      1200
    );
    return;
  }
  if (!G.autoOn) {
    showToast(lang === 'de' ? 'Noch nicht bereit' : 'Not ready yet', lang === 'de' ? 'Erst Auto-Genesis aktivieren' : 'Activate Auto-Genesis first', 1200);
    return;
  }
  if (gameplayFlags.phantomNexusGhostCooldownEnd && now < gameplayFlags.phantomNexusGhostCooldownEnd) {
    const remaining = Math.ceil((gameplayFlags.phantomNexusGhostCooldownEnd - now) / 1000);
    showToast(
      lang === 'de' ? '◈ TRAINING GESPERRT' : '◈ TRAINING LOCKED',
      lang === 'de' ? remaining + 's · Phantom blockiert Training' : remaining + 's · Phantom blocking training',
      1200
    );
    return;
  }

  G.energy -= trainCost;
  G.trainMs = now;
  aiState.trainingRuns++;

  // Spam penalty
  const recent = aiState.recentTrains || (aiState.recentTrains = []);
  let write = 0;
  for (let i = 0; i < recent.length; i++) { if (now - recent[i] < 30000) recent[write++] = recent[i]; }
  recent.length = write;
  const spamCount = recent.length;
  const trainSpamPenalty = spamCount <= 2 ? 0 : spamCount === 3 ? 0.15 : spamCount === 4 ? 0.30 : 0.45;
  G.trainCd = spamCount >= 3 ? Math.min(20000, G.trainCd + Math.round((spamCount - 2) * 500)) : 10000;
  recent.push(now);

  // Compute scores
  let routingScore = 0;
  if (aiState.lastPulseTime > 0) {
    const gap = now - aiState.lastPulseTime;
    if (gap > 20000) routingScore = 0;
    else if (gap < 8000) routingScore = Math.round(Math.max(0, 25 - gap / 360));
    else routingScore = Math.max(0, 8 - Math.floor((gap - 8000) / 2000));
  }

  let timingScore = 0;
  const timingStats = getRecentIntervalStats(5, 3);
  if (timingStats) timingScore = Math.round(Math.max(0, 28 * (1 - timingStats.varPct * 1.5)));

  let activeBr = 0;
  for (const lk of bLinks) { if (lk.active) activeBr++; }
  const totalBr = bLinks.length;
  let stabilityScore = totalBr > 0 ? Math.round((activeBr / totalBr) * 30) : 0;
  stabilityScore += Math.min(10, G.tris.size * 3);

  let memoryScore = 0;
  memoryScore += Math.min(18, aiState.syncHits * 5);
  memoryScore += Math.min(12, aiState.burstEvents * 3);
  memoryScore += Math.min(10, aiState.memDischargeCount * 3);
  if (G.backboneActive) memoryScore += 10;
  else if (G.spineBonusActive) memoryScore += 5;

  routingScore = Math.min(100, routingScore);
  timingScore = Math.min(100, timingScore);
  stabilityScore = Math.min(100, stabilityScore);
  memoryScore = Math.min(100, memoryScore);

  const selfOptMult = (aiState.stageUnlocks?.selfOpt ? 1.12 : 1.0)
    * (aiState.metaTraits.rhythmic ? 1.06 : 1.0)
    * (1 - trainSpamPenalty);
  aiState.trainSpamPenalty = trainSpamPenalty;

  const ts = aiState.trainingScores;
  ts.routing   = Math.min(100, Math.round(ts.routing   * 0.7 + routingScore   * 0.3 * selfOptMult));
  ts.timing    = Math.min(100, Math.round(ts.timing    * 0.7 + timingScore    * 0.3 * selfOptMult));
  ts.stability = Math.min(100, Math.round(ts.stability * 0.7 + stabilityScore * 0.3 * selfOptMult));
  ts.memory    = Math.min(100, Math.round(ts.memory    * 0.7 + memoryScore    * 0.3 * selfOptMult));

  const totalRun = Math.round((routingScore + timingScore + stabilityScore + memoryScore) / 4);
  aiState.bestTrainScore = Math.max(aiState.bestTrainScore || 0, totalRun);
  aiState.lastScoreDelta = {
    routing:   Math.round(routingScore   * 0.3 * selfOptMult),
    timing:    Math.round(timingScore    * 0.3 * selfOptMult),
    stability: Math.round(stabilityScore * 0.3 * selfOptMult),
    memory:    Math.round(memoryScore    * 0.3 * selfOptMult),
  };

  computeAIProfiles();
  const dp = aiState.dominantProfile;
  const newTrainLevel = dp ? getTrainingLevel(dp) : 0;
  applyProfileBonuses();

  if (dp && newTrainLevel > _prevTrainLevel) {
    _prevTrainLevel = newTrainLevel;
    const breakMsgs = {
      de: ['Trainingsdurchbruch.', 'Neues Level erreicht.', 'Kapazität gestiegen.'],
      en: ['Training breakthrough.', 'New level reached.', 'Capacity increased.'],
    };
    const pool = breakMsgs[getLang()] || breakMsgs.de;
    clearTimer('aiTrainBreakthroughMsg');
    regTimer('aiTrainBreakthroughMsg', setTimeout(() => {
      showAgentMsg(pool[Math.floor(Math.random() * pool.length)], false, dp);
      clearTimer('aiTrainBreakthroughMsg');
    }, 600), 'timeout');
  } else if (dp) {
    _prevTrainLevel = newTrainLevel;
  }

  // Phantom echo bonus
  if (gameplayFlags.phantomNexusEchoBonus > 0) {
    G.energy += gameplayFlags.phantomNexusEchoBonus;
    if (gameplayFlags.phantomNexusEchoBonus >= 4) showToast('◈ PHANTOM ECHO', '+' + gameplayFlags.phantomNexusEchoBonus + '⬡', 900);
  }

  // Phantom penalty
  if (gameplayFlags.phantomNexusTrainPenaltyEnd && now < gameplayFlags.phantomNexusTrainPenaltyEnd) {
    const p = 0.85;
    ts.routing = Math.round(ts.routing * p); ts.timing = Math.round(ts.timing * p);
    ts.stability = Math.round(ts.stability * p); ts.memory = Math.round(ts.memory * p);
  }

  aiState.lastTrainTime = now;
  spawnShock(0x44ff88); spawnShock(0x22cc66);
  showTrainScorePopup(routingScore, timingScore, stabilityScore, memoryScore, totalRun);
  applyTrainingImmunity(now);
  computeAIProfiles();
  signalAIChanged();
}

// ── Pulse interval tracking ───────────────────────────────────────────────

export function recordPulseInterval(now = Date.now()) {
  if (aiState.lastPulseTime > 0) {
    const interval = now - aiState.lastPulseTime;
    aiState.pulseIntervals.push(interval);
    if (aiState.pulseIntervals.length > 8) aiState.pulseIntervals.shift();
  }
  aiState.lastPulseTime = now;
}

// ── Sync window tracking ──────────────────────────────────────────────────

export function agentOnSyncOpen() {
  emitAgentMessage('sync', true);
  setNowAction('sync', '⟳ SYNC-FENSTER — PULSE JETZT!', 'now-sync');
  SFX?.syncReady?.();
  aiState.syncWindowOpen = true;
}

export function agentOnSyncMissed() {
  if (!aiState.syncWindowOpen) return;
  aiState.syncWindowOpen = false;
  aiState.missedSyncs = (aiState.missedSyncs || 0) + 1;

  if (aiState.dominantProfile === 'mnemonic' && aiState.missedSyncs >= 2) {
    const lang = getLang();
    showAgentMsg(
      lang === 'de'
        ? `◈ Verzögerung antizipiert. Toleranz reduziert. [${aiState.missedSyncs}×]`
        : `◈ Delay anticipated. Tolerance reduced. [${aiState.missedSyncs}×]`,
      true, 'mnemonic'
    );
    if (G.l3SyncWindowDur !== undefined) {
      G.l3SyncWindowDur = Math.max(1.2, (G.l3SyncWindowDur || 2.0) - 0.15);
    }
  }
}

// ── Simple agent event wrappers ───────────────────────────────────────────
export function agentOnPulse()    { emitAgentMessage('pulse', false); }
export function agentOnWin()      { emitAgentMessage('win', true); }
export function agentOnBridge()   { emitAgentMessage('bridge', false); }
export function agentOnMemory()   { emitAgentMessage('memory', false); }
export function agentOnBackbone() { emitAgentMessage('backbone', true); }
export function agentOnSpine()    { emitAgentMessage('spine', false); }
export function agentOnFusion()   { emitAgentMessage('fusion', false); }
