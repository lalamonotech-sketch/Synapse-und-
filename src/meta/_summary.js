/**
 * SYNAPSE v99 — Run Summary Builder
 *
 * Builds the end-of-run summary object and manages the AI-meta update
 * (traits, objectives, profile history) that persists across runs.
 */

import { G } from '../state/gameState.js';
import { metaState, getTelemetryDefaults, resetMetaState } from '../state/metaState.js';
import { getLang } from '../state/settings.js';
import { gameLinks, gameNodes } from '../layers/network/index.js';
import { BOSS } from '../state/bossShared.js';
import { getActiveBridgeCount } from '../layers/bridge/index.js';
import { G_EVENT } from '../systems/events.js';
import { aiState, AI_STAGE_NAMES } from '../state/aiShared.js';
import { loadAIMetaCached, saveAIMeta } from '../systems/ai/index.js';
import { getActiveProtocolId, PROTOCOL_DEFS } from '../systems/protocols.js';
import { getActiveBossProfile } from '../state/bossShared.js';
import { G_DRAFT, getActiveQuestline } from './flow.js';
import { getActiveActionLabels } from '../state/actionState.js';
import { getActiveConditionId } from '../state/runContext.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function lang() { return getLang(); }

export function fmtDuration(sec) {
  const total = Math.max(0, Math.round(sec || 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtNum(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? String(Math.round(n)) : '0';
}

export function profileLabel(profile) {
  if (!profile) return '—';
  const map = {
    analyst:  lang() === 'de' ? 'Analyst'    : 'Analyst',
    predator: lang() === 'de' ? 'Prädator'   : 'Predator',
    architect:lang() === 'de' ? 'Architekt'  : 'Architect',
    mnemonic: lang() === 'de' ? 'Mnemoniker' : 'Mnemonic',
  };
  return map[profile] || profile;
}

function avgEnergy() {
  const tel = metaState.telemetry || getTelemetryDefaults();
  if (!tel.energySampleCount) return G.energy || 0;
  return tel.energySampleSum / tel.energySampleCount;
}

function getConditionLabel() {
  const id = getActiveConditionId();
  if (!id) return lang() === 'de' ? 'Keine' : 'None';
  const map = { low_signal: 'Low Signal', recursive_storm: 'Recursive Storm' };
  return map[id] || id;
}
export { getConditionLabel };

function getNodeMix() {
  const counts = { source: 0, relay: 0, amplifier: 0, memory: 0 };
  try {
    gameNodes.forEach(n => { counts[n.type] = (counts[n.type] || 0) + 1; });
  } catch (_) {}
  return counts;
}

// ── Profile score bars ────────────────────────────────────────────────────

export function calculateBars(summary) {
  const aggression = Math.max(0, Math.min(100, Math.round(
    (summary.pulsesPerMin * 2.1)
    + (summary.capturedClusters * 4)
    + ((metaState.telemetry?.bossWindowsOpened || 0) * 5)
  )));
  const precision = Math.max(0, Math.min(100, Math.round(
    (summary.bossAccuracy * 0.7)
    + ((aiState.trainingScores?.timing || 0) * 0.35)
    + ((aiState.trainingScores?.routing || 0) * 0.2)
  )));
  const structure = Math.max(0, Math.min(100, Math.round(
    (G.tris.size * 8)
    + (getActiveBridgeCount() * 6)
    + (G.spineLength * 8)
    + (G.backboneActive ? 18 : 0)
  )));
  const efficiency = Math.max(0, Math.min(100, Math.round(
    ((summary.avgEnergy / Math.max(1, summary.peakEnergy || 1)) * 55)
    + ((aiState.trainingScores?.memory || 0) * 0.25)
    + ((aiState.trainingScores?.stability || 0) * 0.2)
  )));
  return { aggression, precision, structure, efficiency };
}

export function overallGrade(summary, bars) {
  const score = (bars.aggression + bars.precision + bars.structure + bars.efficiency) / 4 + (summary.winTier - 1) * 8;
  if (score >= 85) return 'S';
  if (score >= 72) return 'A';
  if (score >= 58) return 'B';
  if (score >= 45) return 'C';
  return 'F';
}

// ── Core summary builder ──────────────────────────────────────────────────

export function buildRunSummary() {
  const durationSec = Math.max(1, Math.round((Date.now() - (G.runStart || Date.now())) / 1000));
  const nodeMix = getNodeMix();
  const synergies = getActiveActionLabels(lang());
  const bossWindowsOpened = metaState.telemetry?.bossWindowsOpened || 0;
  const bossWindowsHit = metaState.telemetry?.bossWindowsHit || 0;
  const bossAccuracy = bossWindowsOpened > 0 ? Math.round((bossWindowsHit / bossWindowsOpened) * 100) : 0;
  const bossDurationSec = BOSS?.bossStartTime ? Math.max(0, Math.round((Date.now() - BOSS.bossStartTime) / 1000)) : 0;
  const profile = aiState.dominantProfile || null;
  const protocolId = getActiveProtocolId() || null;
  const eliteResults = Array.isArray(metaState.eliteResults) ? metaState.eliteResults.map(item => ({ ...item })) : [];
  const activeQuestline = getActiveQuestline();
  const questline = activeQuestline ? {
    id: activeQuestline.id, profile: activeQuestline.profile,
    name: activeQuestline.name, completed: activeQuestline.completed === true,
  } : null;
  const condition = getActiveConditionId();

  return {
    ts: Date.now(), durationSec, durationLabel: fmtDuration(durationSec),
    peakEnergy: Math.round(G.peakEnergy || 0), avgEnergy: Math.round(avgEnergy()),
    pulses: G.pulseCount || 0, pulsesPerMin: Math.round(((G.pulseCount || 0) / Math.max(1, durationSec)) * 60),
    triangles: G.tris?.size || 0, activeBridges: getActiveBridgeCount(),
    capturedClusters: G.l3CapturedClusters || 0, fusionPairs: G.fusedPairs?.size || 0,
    spineLength: G.spineLength || 0, backboneActive: !!G.backboneActive,
    upgrades: G_DRAFT?.appliedUpgrades?.length || 0, draftPicks: G_DRAFT?.appliedUpgrades?.length || 0,
    events: G_EVENT?.eventCount || 0, chains: metaState.telemetry?.totalChains || G_EVENT?.chainCount || 0,
    bossAccuracy, bossDurationSec, profile, protocolId,
    winTier: G.winTier || 1,
    perfect: !!G.backboneActive || (G.spineLength || 0) >= 3 || (G.fusedPairs?.size || 0) >= 2,
    condition, nodeMix, trainScores: { ...(aiState.trainingScores || {}) },
    awarenessStage: aiState.awarenessStage || 0,
    awarenessLabel: (AI_STAGE_NAMES?.[lang()] || [])[aiState.awarenessStage || 0] || String(aiState.awarenessStage || 0),
    eliteResults, questline, synergies: synergies || [],
    metaTraits: { ...(aiState.metaTraits || {}) },
    boss: { id: getActiveBossProfile()?.id || null, name: getActiveBossProfile()?.name || null },
    layerTimes: { ...(metaState.telemetry?.layerTimes || {}) },
    timelineCount: Array.isArray(metaState.runTimeline) ? metaState.runTimeline.length : 0,
  };
}

// ── Meta update (trait/objective derivation, AI meta save) ────────────────

function generateMetaObjectives(meta, summary) {
  const obj = [];
  if ((summary.bossAccuracy || 0) < 55) obj.push({ de: 'Boss-Trefferquote über 55%', en: 'Boss accuracy above 55%' });
  if ((summary.capturedClusters || 0) < 8 || !summary.backboneActive) obj.push({ de: 'Backbone im Boss-Run aktiv halten', en: 'Keep backbone active during the boss run' });
  if ((summary.trainScores?.memory || 0) < 25) obj.push({ de: 'Memory-Training auf 25+ anheben', en: 'Raise memory training to 25+' });
  if ((meta.fusionRuns || 0) < 2) obj.push({ de: '2+ Fusion-Paare sichern', en: 'Secure 2+ fusion pairs' });
  return obj.slice(0, 3);
}

function deriveNewTraits(meta) {
  const existing = new Set(meta.unlockedTraits || []);
  const traits = [];
  const freq = {};
  (meta.profileHistory || []).forEach(run => { if (run.profile) freq[run.profile] = (freq[run.profile] || 0) + 1; });
  const pushTrait = name => { if (!existing.has(name) && !traits.includes(name)) traits.push(name); };
  const l = lang() === 'de';
  if ((freq.architect || 0) >= 3) pushTrait(l ? 'Lineares Denken' : 'Linear Thinking');
  if ((freq.predator || 0) >= 3) pushTrait(l ? 'Jagdinstinkt' : 'Hunt Instinct');
  if ((freq.mnemonic || 0) >= 3) pushTrait(l ? 'Gedächtnisrest' : 'Memory Trace');
  if ((freq.analyst || 0) >= 3) pushTrait(l ? 'Strukturbewusstsein' : 'Structural Awareness');
  if ((meta.profileHistory || []).filter(run => (run.tier || 0) >= 3).length >= 2) pushTrait(l ? 'Backbone-Meister' : 'Backbone Master');
  if ((meta.fusionRuns || 0) >= 2) pushTrait(l ? 'Fusionserfahrung' : 'Fusion Experience');
  if ((meta.profileHistory || []).some(run => run.metaTraits?.rhythmic)) pushTrait(l ? 'Rhythmisch' : 'Rhythmic');
  if ((meta.profileHistory || []).some(run => run.metaTraits?.conservative)) pushTrait(l ? 'Konservativ' : 'Conservative');
  if ((meta.profileHistory || []).some(run => run.metaTraits?.volatile)) pushTrait(l ? 'Volatil' : 'Volatile');
  if ((meta.profileHistory || []).some(run => run.metaTraits?.explorative)) pushTrait(l ? 'Explorativ' : 'Explorative');
  return traits;
}

export function updateMetaWithRun(summary) {
  const meta = loadAIMetaCached();
  const updated = {
    ...meta,
    totalRuns: (meta.totalRuns || 0) + 1,
    profileHistory: Array.isArray(meta.profileHistory) ? [...meta.profileHistory] : [],
    unlockedTraits: Array.isArray(meta.unlockedTraits) ? [...meta.unlockedTraits] : [],
    bestTrainingScores: { ...(meta.bestTrainingScores || {}) },
  };

  updated.profileHistory.push({
    ts: summary.ts, tier: summary.winTier, duration: summary.durationSec,
    profile: summary.profile, protocolId: summary.protocolId,
    bossId: summary.boss?.id || null, condition: summary.condition,
    perfect: summary.perfect, metaTraits: { ...(summary.metaTraits || {}) },
    questlineId: summary.questline?.id || null,
  });
  updated.profileHistory = updated.profileHistory.slice(-40);

  updated.avgSpineLength = Math.round((((meta.avgSpineLength || 0) * (updated.totalRuns - 1)) + (summary.spineLength || 0)) / updated.totalRuns);
  updated.fusionRuns = (meta.fusionRuns || 0) + ((summary.fusionPairs || 0) > 0 ? 1 : 0);
  updated.avgPulseFreq = Math.round((((meta.avgPulseFreq || 0) * (updated.totalRuns - 1)) + (summary.pulsesPerMin || 0)) / updated.totalRuns);
  const stableRatio = gameLinks.length ? (gameLinks.filter(link => link.type === 'stable').length / gameLinks.length) : 0;
  updated.avgStableRatio = Math.round((((meta.avgStableRatio || 0) * (updated.totalRuns - 1)) + stableRatio * 100) / updated.totalRuns);

  for (const key of ['routing', 'timing', 'stability', 'memory']) {
    updated.bestTrainingScores[key] = Math.max(updated.bestTrainingScores[key] || 0, summary.trainScores?.[key] || 0);
  }

  updated.questlinesCompleted = Math.max(meta.questlinesCompleted || 0, aiState.questlinesCompleted || 0);
  updated.conditionsSeen = (meta.conditionsSeen || 0) + (summary.condition ? 1 : 0);
  updated.conditionWins = (meta.conditionWins || 0) + (summary.condition ? 1 : 0);

  let eliteSuccesses = 0, eliteFailures = 0, eliteTimeouts = 0;
  for (const item of summary.eliteResults) {
    const r = item?.result || '';
    if (r === 'fail') eliteFailures++;
    else if (r === 'timeout') eliteTimeouts++;
    else if (/success|flawless|perfect/.test(r)) eliteSuccesses++;
  }
  updated.totalElitesCaptured = (meta.totalElitesCaptured || 0) + eliteSuccesses;
  updated.eliteSuccesses      = (meta.eliteSuccesses || 0) + eliteSuccesses;
  updated.eliteFailures       = (meta.eliteFailures || 0) + eliteFailures;
  updated.eliteTimeouts       = (meta.eliteTimeouts || 0) + eliteTimeouts;
  updated.bossConditionWins   = (meta.bossConditionWins || 0) + (summary.condition ? 1 : 0);

  const counts = {};
  updated.profileHistory.forEach(run => { if (run.profile) counts[run.profile] = (counts[run.profile] || 0) + 1; });
  updated.dominantOverall = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  updated.metaObjectivesGenerated = generateMetaObjectives(updated, summary);
  const newTraits = deriveNewTraits(updated);
  updated.unlockedTraits = [...new Set([...(updated.unlockedTraits || []), ...newTraits])];

  saveAIMeta(updated);
  return { meta: updated, newTraits };
}

export function nextUnlockHint(meta) {
  const runs = meta.totalRuns || 0;
  if (runs < 2) return lang() === 'de' ? `Temporal-Protokoll ${runs}/2 → Freischaltung` : `Temporal protocol ${runs}/2 → unlock`;
  if (runs < 4) return lang() === 'de' ? `Mnemonic-Protokoll ${runs}/4 → Freischaltung` : `Mnemonic protocol ${runs}/4 → unlock`;
  const freq = {};
  (meta.profileHistory || []).forEach(run => { if (run.profile) freq[run.profile] = (freq[run.profile] || 0) + 1; });
  const needs = [
    ['architect', lang() === 'de' ? 'Lineares Denken' : 'Linear Thinking'],
    ['predator',  lang() === 'de' ? 'Jagdinstinkt'    : 'Hunt Instinct'],
    ['mnemonic',  lang() === 'de' ? 'Gedächtnisrest'  : 'Memory Trace'],
    ['analyst',   lang() === 'de' ? 'Strukturbewusstsein' : 'Structural Awareness'],
  ];
  for (const [profile, reward] of needs) {
    if ((freq[profile] || 0) < 3) return `${profileLabel(profile)} ${(freq[profile] || 0)}/3 → ${reward}`;
  }
  const tier3Wins = (meta.profileHistory || []).filter(run => (run.tier || 0) >= 3).length;
  if (tier3Wins < 2) return `Backbone ${tier3Wins}/2 → ${lang() === 'de' ? 'Backbone-Meister' : 'Backbone Master'}`;
  const fusionRuns = meta.fusionRuns || 0;
  if (fusionRuns < 2) return `Fusion ${fusionRuns}/2 → ${lang() === 'de' ? 'Fusionserfahrung' : 'Fusion Experience'}`;
  return lang() === 'de' ? 'Alle Kernfreischaltungen aktiv' : 'All core unlocks active';
}
