/**
 * SYNAPSE v99 — Questline System
 *
 * Per-profile arc questlines: init, progress tracking, completion rewards.
 * Questline definitions and step evaluation fully isolated here.
 */

import { G } from '../state/gameState.js';
import { metaState } from '../state/metaState.js';
import { aiState, PROFILE_BONUS } from '../state/aiShared.js';
import { bossState, getActiveBossProfile } from '../state/bossShared.js';
import { gameLinks, gameNodes } from '../layers/network/index.js';
import { synSettings } from '../state/settings.js';
import { regTimer, clearTimer } from '../registries/timerRegistry.js';
import { el } from '../util/dom.js';
import { showToast } from '../ui/hud/index.js';
import { spawnShock } from '../layers/network/index.js';
import { logTL } from '../ui/actionFlow.js';
import { questState } from '../state/runContext.js';

function currentLang() { return synSettings.lang || 'de'; }

// ── Questline definitions ─────────────────────────────────────────────────

const QUESTLINE_DEFS = {
  analyst: {
    id: 'pattern_audit', name: 'Pattern Audit',
    reward: 'Bridge-Stabilität permanent erhöht', rewardEN: 'Bridge stability permanently increased',
    steps: [
      { id: 'chainsNoLoss',        threshold: 2,    label: '2 Ketten ohne Ressourcenverlust',       labelEN: '2 chains without loss' },
      { id: 'eliteClearNoFailure', equals: true,    label: 'Elite sauber abschließen',              labelEN: 'Clear one elite cleanly' },
      { id: 'bossAccuracy',        threshold: 0.6,  label: 'Boss mit hoher Präzision schlagen',     labelEN: 'Defeat boss with high accuracy' },
    ],
    rewardApply() { PROFILE_BONUS.analyst.bridgeStabBonus = Math.max(PROFILE_BONUS.analyst.bridgeStabBonus || 0, 0.14); },
  },
  predator: {
    id: 'burst_doctrine', name: 'Burst Doctrine',
    reward: 'Pulse-Ketten und Capture-Druck verstärkt', rewardEN: 'Pulse chains and capture pressure improved',
    steps: [
      { id: 'fastSyncs',           threshold: 2,    label: '2 schnelle Sync-Treffer',               labelEN: '2 fast sync hits' },
      { id: 'eliteClears',         threshold: 1,    label: '1 Elite-Cluster säubern',               labelEN: 'Clear 1 elite cluster' },
      { id: 'bossWindowsOpened',   threshold: 3,    label: '3 Boss-Fenster öffnen',                 labelEN: 'Open 3 boss windows' },
    ],
    rewardApply() { PROFILE_BONUS.predator.pulseCdReduction = Math.max(PROFILE_BONUS.predator.pulseCdReduction || 0, 0.18); },
  },
  architect: {
    id: 'structural_proof', name: 'Structural Proof',
    reward: 'Spine- und Backbone-Synergien steigen', rewardEN: 'Spine and backbone synergies improve',
    steps: [
      { id: 'stableRatio2',        threshold: 2,    label: '2 stabile Strukturphasen halten',       labelEN: 'Hold 2 stable structure phases' },
      { id: 'dormantFortressClear',equals: true,    label: 'Dormant Fortress sauber räumen',        labelEN: 'Clear Dormant Fortress cleanly' },
      { id: 'parasiteCleanKill',   equals: true,    label: 'Parasite Choir fast sauber töten',      labelEN: 'Defeat Parasite Choir cleanly' },
    ],
    rewardApply() { PROFILE_BONUS.architect.backboneBonus = Math.max(PROFILE_BONUS.architect.backboneBonus || 0, 10); },
  },
  mnemonic: {
    id: 'recall_thread', name: 'Recall Thread',
    reward: 'Memory-Output und Resonanz werden dichter', rewardEN: 'Memory output and resonance become denser',
    steps: [
      { id: 'rareChainWithMemory', equals: true,    label: 'Rare Chain unter Memory-Druck überstehen', labelEN: 'Survive rare chain with memory pressure' },
      { id: 'chain3StepComplete',  threshold: 1,    label: 'Eine 3er-Kette abschließen',             labelEN: 'Complete one 3-step chain' },
      { id: 'totalChains',         threshold: 4,    label: '4 Ketten insgesamt abschließen',         labelEN: 'Complete 4 chains total' },
    ],
    rewardApply() { PROFILE_BONUS.mnemonic.memEfficiency = Math.max(PROFILE_BONUS.mnemonic.memEfficiency || 0, 0.18); },
  },
};

// ── UI ────────────────────────────────────────────────────────────────────

function renderQuestlinePanel() {
  const ql = questState.activeQuestline;
  const panel  = el('ql-panel');
  const name   = el('ql-name');
  const steps  = el('ql-steps');
  const reward = el('ql-reward');
  if (!panel || !name || !steps || !reward) return;
  if (!ql) { panel.classList.remove('vis'); return; }
  panel.classList.add('vis');
  name.textContent = 'QUESTLINE · ' + ql.name.toUpperCase();
  steps.innerHTML = ql.steps.map(step => `<div class="ql-step${step.done ? ' done' : ''}">${currentLang() === 'de' ? step.label : step.labelEN}</div>`).join('');
  reward.textContent = (currentLang() === 'de' ? 'Belohnung · ' + ql.reward : 'Reward · ' + ql.rewardEN);
  reward.classList.toggle('vis', !!ql.completed);
}

function profileColor(profile) {
  return profile === 'predator' ? 0xff6644 : profile === 'analyst' ? 0x44aaff : profile === 'architect' ? 0x44ffbb : 0xcc66ff;
}

// ── Init ──────────────────────────────────────────────────────────────────

export function initQuestlineForProfile(profile) {
  if (!profile || questState.activeQuestline) return null;
  const def = QUESTLINE_DEFS[profile];
  if (!def) return null;
  questState.activeQuestline = {
    id: def.id, profile, name: def.name,
    reward: def.reward, rewardEN: def.rewardEN,
    steps: def.steps.map(step => ({ ...step, done: false })),
    completed: false,
  };
  questState.progress = questState.progress || {};
  renderQuestlinePanel();
  showToast('QUESTLINE: ' + def.name.toUpperCase(), currentLang() === 'de' ? 'Profil-Arc aktiv · 3 Ziele' : 'Profile arc active · 3 objectives', 3600);
  return questState.activeQuestline;
}

export function getActiveQuestline() { return questState.activeQuestline || null; }
export function getQuestProgress()   { return questState.progress || {}; }

// ── Progress check ────────────────────────────────────────────────────────

function bossAccuracy() {
  const opened = metaState.telemetry?.bossWindowsOpened || 0;
  const hit    = metaState.telemetry?.bossWindowsHit    || 0;
  return opened > 0 ? hit / opened : 0;
}

export function checkQuestlineProgress() {
  const ql = questState.activeQuestline;
  if (!ql || ql.completed) { renderQuestlinePanel(); return; }
  const qp = questState.progress || {};
  const lang = currentLang();
  let changed = false;
  ql.steps.forEach(step => {
    if (step.done) return;
    let complete = false;
    switch (step.id) {
      case 'chainsNoLoss':          complete = (qp.chainsNoLoss || 0) >= step.threshold; break;
      case 'eliteClearNoFailure':   complete = qp.eliteClearNoFailure === true; break;
      case 'bossAccuracy':          complete = bossAccuracy() >= step.threshold && !bossState.bossActive; break;
      case 'fastSyncs':             complete = (qp.fastSyncs || 0) >= step.threshold; break;
      case 'eliteClears':           complete = (qp.eliteClears || 0) >= step.threshold; break;
      case 'bossWindowsOpened':     complete = (metaState.telemetry?.bossWindowsOpened || 0) >= step.threshold; break;
      case 'stableRatio2':          complete = (qp._archStableCount || 0) >= step.threshold; break;
      case 'dormantFortressClear':  complete = qp.dormantFortressClear === true; break;
      case 'parasiteCleanKill':     complete = qp.parasiteCleanKill === true; break;
      case 'rareChainWithMemory':   complete = qp.rareChainWithMemory === true; break;
      case 'chain3StepComplete':    complete = (qp.chain3StepComplete || 0) >= step.threshold; break;
      case 'totalChains':           complete = (metaState.telemetry?.totalChains || 0) >= step.threshold; break;
      default:
        if (typeof step.threshold === 'number') complete = (qp[step.id] || 0) >= step.threshold;
        else if ('equals' in step) complete = qp[step.id] === step.equals;
    }
    if (!complete) return;
    step.done = true; changed = true;
    showToast('QUESTLINE ✓ ' + ql.name, lang === 'de' ? step.label : step.labelEN, 2800);
    spawnShock(profileColor(ql.profile));
  });

  if (!ql.completed && ql.steps.every(step => step.done)) {
    ql.completed = true;
    QUESTLINE_DEFS[ql.profile]?.rewardApply?.();
    showToast('★ QUESTLINE ABGESCHLOSSEN!', lang === 'de' ? ql.reward : ql.rewardEN, 4600);
    spawnShock(0xffd700); spawnShock(0xffffff);
    const panel = el('ql-panel');
    panel?.classList.add('ql-complete');
    regTimer('questlineCompleteFlash', setTimeout(() => { panel?.classList.remove('ql-complete'); clearTimer('questlineCompleteFlash'); }, 900), 'timeout');
    aiState.questlinesCompleted = (aiState.questlinesCompleted || 0) + 1;
    logTL('quest', 'Questline abgeschlossen', 'rgba(255,215,90,.8)', '★');
    changed = true;
  }
  renderQuestlinePanel();
}

// ── Event hooks ───────────────────────────────────────────────────────────

export function onChainComplete(chainLength = 1) {
  window._recordChainComplete?.(chainLength);
  const qp = questState.progress || {};
  if (chainLength >= 3) qp.chain3StepComplete = (qp.chain3StepComplete || 0) + 1;
  if (G.energy >= 0) qp.chainsNoLoss = (qp.chainsNoLoss || 0) + 1;
  const hasMemPressure = gameNodes.some(node => node.type === 'memory' && (node.memCharge || 0) > 20);
  if (hasMemPressure) qp.rareChainWithMemory = true;
  questState.progress = qp;
  checkQuestlineProgress();
}

export function onSyncCapture() {
  const qp = questState.progress || {};
  const now = Date.now();
  if (qp._lastSyncTime && now - qp._lastSyncTime < 15000) qp.fastSyncs = (qp.fastSyncs || 0) + 1;
  else qp.fastSyncs = 1;
  qp._lastSyncTime = now;
  questState.progress = qp;
  checkQuestlineProgress();
}

export function onBossDefeated() {
  const _bossKillCount = (window._bossKillCount || 0) + 1;
  window._bossKillCount = _bossKillCount;
  if (_bossKillCount === 1 && typeof window._triggerGridExpansion === 'function') {
    setTimeout(() => window._triggerGridExpansion(), 800);
  }
  const qp = questState.progress || {};
  if (getActiveBossProfile()?.id === 'parasite_choir') {
    const infected = gameLinks.filter(link => link._parasiteInfected).length;
    if (infected < 4) qp.parasiteCleanKill = true;
  }
  questState.progress = qp;
  checkQuestlineProgress();
}

// ── Architect stable-ratio tick ───────────────────────────────────────────

let _qlStableTickAt = 0;

export function tickArchitectQuestline(elapsed) {
  const ql = questState.activeQuestline;
  if (!ql || ql.profile !== 'architect' || elapsed < _qlStableTickAt) return;
  _qlStableTickAt = elapsed + 6;
  if (gameLinks.length < 8) return;
  const stableRatio = gameLinks.filter(link => link.type === 'stable').length / gameLinks.length;
  const qp = questState.progress || {};
  qp._archStableCount = stableRatio >= 0.7 ? (qp._archStableCount || 0) + 1 : 0;
  questState.progress = qp;
  checkQuestlineProgress();
}

export { renderQuestlinePanel };
