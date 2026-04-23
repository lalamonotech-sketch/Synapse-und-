/**
 * SYNAPSE v99 — AI Profile Scoring
 *
 * Computes profile scores (analyst/predator/architect/mnemonic),
 * dominant profile selection, meta-trait derivation, and profile bonuses.
 *
 * Called every ~2s from tickAI() via computeAIProfiles().
 */

import { G } from '../../state/gameState.js';
import { getLang } from '../../state/settings.js';
import {
  aiState,
  AI_PROFILE_LABELS,
  PROFILE_BONUS,
} from '../../state/aiShared.js';
import { gameNodes, gameLinks, linkVersion } from '../../layers/network/index.js';
import { getActiveBridgeCount } from '../../layers/bridge/index.js';
import { showAgentMsg } from '../../meta/flow.js';
import { signalAIChanged } from '../../platform/stateSignals.js';
import { checkAwarenessStage } from './_awareness.js';
import { _tickArchitectMirror } from './_combat.js';

// ── Link type count cache (invalidated by linkVersion) ────────────────────
let _linkCountCache = { key: -1, stable: 0, fragile: 0, resonance: 0, fast: 0, total: 0 };

export function getLinkTypeCounts() {
  if (linkVersion === _linkCountCache.key) return _linkCountCache;
  let stable = 0, fragile = 0, resonance = 0, fast = 0;
  for (const lk of gameLinks) {
    if      (lk.type === 'stable')    stable++;
    else if (lk.type === 'fragile')   fragile++;
    else if (lk.type === 'resonance') resonance++;
    else if (lk.type === 'fast')      fast++;
  }
  _linkCountCache = { key: linkVersion, stable, fragile, resonance, fast, total: gameLinks.length };
  return _linkCountCache;
}

// ── Internal helpers ──────────────────────────────────────────────────────

export function getRecentIntervalStats(limit, minCount = 1) {
  const arr = aiState.pulseIntervals;
  const len = arr.length;
  if (len < minCount) return null;
  const start = Math.max(0, len - limit);
  const count = len - start;
  if (count < minCount) return null;
  let sum = 0;
  for (let i = start; i < len; i++) sum += arr[i];
  const avg = count > 0 ? (sum / count) : 0;
  if (avg <= 0) return { avg: 0, varPct: 1, count };
  let dev = 0;
  for (let i = start; i < len; i++) dev += Math.abs(arr[i] - avg);
  return { avg, varPct: (dev / count) / avg, count };
}

function getCombinedProfileScore(scores) {
  return (scores.analyst || 0) + (scores.predator || 0) + (scores.architect || 0) + (scores.mnemonic || 0);
}

function pickDominantProfile(scores, explorative) {
  let bestKey = null, bestScore = -1, secondScore = -1;
  const keys = ['analyst', 'predator', 'architect', 'mnemonic'];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const score = scores[key] || 0;
    if (score > bestScore) { secondScore = bestScore; bestScore = score; bestKey = key; }
    else if (score > secondScore) { secondScore = score; }
  }
  const gap = bestScore - Math.max(0, secondScore);
  const gapThreshold = explorative ? 6 : 10;
  const qualifies = (bestScore >= 25 && gap >= gapThreshold) || (bestScore >= 40 && gap >= 5);
  return qualifies ? bestKey : null;
}

// ── Profile bonus application ─────────────────────────────────────────────

export function getTrainingLevel(profile) {
  const map = { analyst: 'routing', predator: 'timing', architect: 'stability', mnemonic: 'memory' };
  const score = aiState.trainingScores[map[profile] || 'routing'] || 0;
  return Math.min(5, Math.floor(score / 20));
}

export function applyProfileBonuses() {
  PROFILE_BONUS.analyst.warnPhaseBonus = 0;
  PROFILE_BONUS.analyst.bridgeStabBonus = 0;
  PROFILE_BONUS.predator.pulseCdReduction = 0;
  PROFILE_BONUS.predator.burstBonus = 0;
  PROFILE_BONUS.architect.spineBonusScale = 0;
  PROFILE_BONUS.architect.macroCouplingRange = 0;
  PROFILE_BONUS.architect.backboneBonus = 0;
  PROFILE_BONUS.mnemonic.memEfficiency = 0;
  PROFILE_BONUS.mnemonic.fusionBurst = 0;

  const dp = aiState.dominantProfile;
  if (!dp) return;
  const level = getTrainingLevel(dp);
  if (level === 0) return;

  const stageMult = aiState.stageUnlocks?.selfOpt ? 1.2 : 1.0;
  if (dp === 'analyst') {
    PROFILE_BONUS.analyst.warnPhaseBonus = level * 0.5 * stageMult;
    PROFILE_BONUS.analyst.bridgeStabBonus = Math.min(0.3, level * 0.04 * stageMult);
  }
  if (dp === 'predator') {
    PROFILE_BONUS.predator.pulseCdReduction = Math.min(0.38, level * 0.07 * stageMult);
    PROFILE_BONUS.predator.burstBonus = Math.round(level * 2 * stageMult);
  }
  if (dp === 'architect') {
    PROFILE_BONUS.architect.spineBonusScale = level * 0.06 * stageMult;
    PROFILE_BONUS.architect.macroCouplingRange = level * 0.08 * stageMult;
    PROFILE_BONUS.architect.backboneBonus = Math.round(level * 3 * stageMult);
  }
  if (dp === 'mnemonic') {
    PROFILE_BONUS.mnemonic.memEfficiency = Math.min(0.45, level * 0.08 * stageMult);
    PROFILE_BONUS.mnemonic.fusionBurst = Math.round(level * 4 * stageMult);
  }
}

// ── Main scoring pass ─────────────────────────────────────────────────────

export function computeAIProfiles() {
  if (G.runWon) return;

  const ps = aiState.profileScores;
  const elapsed = Math.max(1, (Date.now() - G.runStart) / 1000);
  const ltc = getLinkTypeCounts();
  const activeBr = getActiveBridgeCount();
  aiState._cachedActiveBr = activeBr;

  // Analyst
  let analyst = 0;
  if (ltc.total > 0) analyst += Math.min(28, (ltc.stable / ltc.total) * 38);
  analyst += Math.min(22, G.tris.size * 5);
  analyst += Math.min(20, activeBr * 4);
  analyst += Math.min(10, ltc.resonance * 2.5);
  if (ltc.total > 0) analyst -= Math.min(12, (ltc.fragile / ltc.total) * 18);
  const analystStats = getRecentIntervalStats(6, 3);
  if (analystStats) analyst += Math.max(0, 20 - analystStats.varPct * 25);
  ps.analyst = Math.max(0, Math.min(100, Math.round(analyst)));

  // Predator
  let predator = 0;
  predator += Math.min(36, aiState.syncHits * 12);
  predator += Math.min(24, G.l3CapturedClusters * 6);
  if (elapsed > 20 && G.pulseCount > 0) {
    const ppm = (G.pulseCount / elapsed) * 60;
    predator += Math.min(22, ppm * 3.5);
  }
  predator += Math.min(18, aiState.burstEvents * 4);
  ps.predator = Math.max(0, Math.min(100, Math.round(predator)));

  // Architect
  let architect = 0;
  architect += Math.min(36, G.spineLength * 9);
  if (G.backboneActive) architect += 22;
  architect += Math.min(24, G.l3ConnectedCores * 5);
  architect += Math.min(18, G.fusedPairs.size * 6);
  ps.architect = Math.max(0, Math.min(100, Math.round(architect)));

  // Mnemonic
  let mnemonic = 0;
  mnemonic += Math.min(32, G.memMaxOutput * 0.65);
  mnemonic += Math.min(28, aiState.memDischargeCount * 5);
  mnemonic += Math.min(22, G.fusedPairs.size * 8);
  let memNodeCount = 0;
  for (const n of gameNodes) { if (n.type === 'memory') memNodeCount++; }
  mnemonic += Math.min(18, memNodeCount * 4);
  ps.mnemonic = Math.max(0, Math.min(100, Math.round(mnemonic)));

  // Dominant profile
  const total = getCombinedProfileScore(ps);
  const prev = aiState.dominantProfile;
  aiState.dominantProfile = total >= 22 ? pickDominantProfile(ps, aiState.metaTraits.explorative) : null;

  // Meta-traits
  aiState.metaTraits.explorative = aiState.nodeTypesUsed.size >= 3;
  aiState.metaTraits.volatile = aiState.burstEvents >= 3;
  aiState.metaTraits.conservative = aiState.fragileLinksLost === 0 && ltc.fragile > 0;
  const rhythmicStats = getRecentIntervalStats(4, 4);
  if (rhythmicStats) aiState.metaTraits.rhythmic = rhythmicStats.varPct < 0.28;

  // Mood
  if (aiState.awarenessStage === 0) aiState.agentMood = 'dormant';
  else if (aiState.awarenessStage >= 4) aiState.agentMood = 'emergent';
  else {
    const moodMap = { analyst: 'focused', predator: 'aggressive', architect: 'expanding', mnemonic: 'deep' };
    aiState.agentMood = moodMap[aiState.dominantProfile] || 'observing';
  }

  if (aiState.dominantProfile && aiState.dominantProfile !== prev) {
    const lang = getLang();
    const name = AI_PROFILE_LABELS[lang][aiState.dominantProfile] || aiState.dominantProfile;
    showAgentMsg(lang === 'de' ? `Profil: ${name}.` : `Profile: ${name}.`, false, aiState.dominantProfile);
  }

  applyProfileBonuses();
  checkAwarenessStage();
  _tickArchitectMirror();
  signalAIChanged();
}
