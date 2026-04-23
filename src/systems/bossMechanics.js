/**
 * SYNAPSE v99 — Phase 3: Boss Phase Management & Grid Corruption
 *
 * Orchestrates multi-phase boss encounters on top of the existing boss
 * combat system (src/systems/boss/). Responsibilities:
 *   • Rendering and updating the Phase Dots HUD (#boss-phase-dots)
 *   • Tracking which grid nodes are corrupted via the Corruption system
 *   • Firing boss-specific phase events (Ghost fake clusters, Mass Corruption)
 *
 * This module is intentionally thin — it bridges boss profile data from
 * bossShared.js with the CSS hooks already wired in boss.css.
 *
 * Integration points:
 *   • Call initBossEncounter(bossId, phases) when a boss fight starts.
 *     Wrap inside the existing startBossFight() flow in boss/_combat.js.
 *   • Call advanceBossPhase()  when BOSS.phase changes (inside updatePhase()).
 *   • Call applyCorruptionToNode(nodeId) / cleanseNode(nodeId) from the
 *     boss attack path or dedicated player-cleanse action.
 *   • Call resetBossMechanics() from the run-reset chain.
 */

import { showToast } from '../ui/hud/index.js';
import { getLang }   from '../state/settings.js';

// ── Module state ──────────────────────────────────────────────────────────

let _currentBossId  = null;
let _currentPhase   = 0;
let _maxPhases      = 3;
let _corruptedNodes = new Set();  // Set<nodeId: string>

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Call at the start of every boss encounter.
 * @param {string} bossId   — profile id (e.g. 'ghost_matrix', 'parasite_choir')
 * @param {number} phases   — total number of phases for this boss (usually 3)
 */
export function initBossEncounter(bossId, phases = 3) {
  _currentBossId = bossId;
  _currentPhase  = 1;
  _maxPhases     = phases;
  _corruptedNodes.clear();

  // Apply boss CSS theme so boss.css data-boss-profile rules fire.
  document.body.setAttribute('data-boss-profile', bossId);

  _renderPhaseDotsUI();
}

/** Advance to the next boss phase and trigger phase-specific mechanics. */
export function advanceBossPhase() {
  if (_currentPhase >= _maxPhases) return;

  _currentPhase++;
  _updatePhaseDotsUI();
  _triggerPhaseEvent(_currentBossId, _currentPhase);
}

/** Reset all state — call during the run-reset chain. */
export function resetBossMechanics() {
  _currentBossId  = null;
  _currentPhase   = 0;
  _maxPhases      = 3;
  _corruptedNodes.clear();

  document.body.removeAttribute('data-boss-profile');

  const container = document.getElementById('boss-phase-dots');
  if (container) container.innerHTML = '';

  const lbl = document.getElementById('boss-phase-lbl');
  if (lbl) { lbl.textContent = ''; lbl.className = ''; }
}

// ── Corruption System ─────────────────────────────────────────────────────

/**
 * Mark a grid node as corrupted.
 * Applies CSS classes used by blueprint-nomads.css for visual feedback.
 * @param {string|number} nodeId
 */
export function applyCorruptionToNode(nodeId) {
  _corruptedNodes.add(String(nodeId));

  const el = document.getElementById(`node-overlay-${nodeId}`);
  if (el) {
    el.classList.add('biome-corrupted', 'cl-slot', 'corrupted');
  }
}

/**
 * Remove corruption from a node (player cleanses it).
 * @param {string|number} nodeId
 * @returns {boolean} true if the node was corrupted and is now clean.
 */
export function cleanseNode(nodeId) {
  const id = String(nodeId);
  if (!_corruptedNodes.has(id)) return false;

  _corruptedNodes.delete(id);

  const el = document.getElementById(`node-overlay-${nodeId}`);
  if (el) {
    el.classList.remove('biome-corrupted', 'cl-slot', 'corrupted');
  }

  return true;
}

/** Returns how many nodes are currently corrupted. */
export function getCorruptedCount() { return _corruptedNodes.size; }

/** Returns an array of all currently corrupted node IDs. */
export function getCorruptedNodeIds() { return [..._corruptedNodes]; }

/** True if a given node is corrupted. */
export function isNodeCorrupted(nodeId) { return _corruptedNodes.has(String(nodeId)); }

// ── UI Rendering ──────────────────────────────────────────────────────────

function _renderPhaseDotsUI() {
  const container = document.getElementById('boss-phase-dots');
  if (!container) return;

  container.innerHTML = '';
  for (let i = 1; i <= _maxPhases; i++) {
    const dot = document.createElement('div');
    dot.className = 'bpd ' + (i === 1 ? 'bpd-active' : 'bpd-pending');
    container.appendChild(dot);
  }

  _updatePhaseLabelUI();
}

function _updatePhaseDotsUI() {
  const dots = document.querySelectorAll('#boss-phase-dots .bpd');
  dots.forEach((dot, idx) => {
    dot.classList.remove('bpd-active', 'bpd-pending', 'bpd-done');
    const phase = idx + 1;
    if (phase < _currentPhase)      dot.classList.add('bpd-done');
    else if (phase === _currentPhase) dot.classList.add('bpd-active');
    else                              dot.classList.add('bpd-pending');
  });

  _updatePhaseLabelUI();
}

function _updatePhaseLabelUI() {
  const lbl = document.getElementById('boss-phase-lbl');
  if (!lbl) return;
  lbl.textContent = `PHASE 0${_currentPhase}`;
  // Applies colour rules defined in boss.css (.phase-1, .phase-2, .phase-3)
  lbl.className = `phase-${_currentPhase}`;
}

// ── Phase-specific events ─────────────────────────────────────────────────

function _triggerPhaseEvent(bossId, phase) {
  if (!bossId) return;

  if (bossId === 'ghost_matrix' && phase === 2) {
    _triggerGhostFakeClusters();
  } else if (bossId === 'parasite_choir' && phase === 3) {
    _triggerMassCorruption();
  } else if (bossId === 'sigma_recursive' && phase === 2) {
    _triggerSigmaRecursionWarning();
  } else if (bossId === 'vortex_architect' && phase === 3) {
    _triggerVortexFinalDrain();
  }
}

function _triggerGhostFakeClusters() {
  const hud = document.getElementById('boss-hud');
  if (hud) {
    // ghost-fake-hint defined in boss.css — shows yellow warning overlay on HUD
    hud.classList.add('ghost-fake-hint');
    setTimeout(() => hud.classList.remove('ghost-fake-hint'), 3000);
  }

  const lang = getLang();
  showToast(
    lang === 'de' ? '⚠ SYSTEMWARNUNG' : '⚠ SYSTEM WARNING',
    lang === 'de'
      ? 'Fehlerhafte Datensignaturen entdeckt! Nicht alle Cluster sind real.'
      : 'Corrupted data signatures detected! Not all clusters are real.',
    3500,
  );
}

function _triggerMassCorruption() {
  const lang = getLang();
  showToast(
    lang === 'de' ? '☣ PARASITÄRER MASSENBEFALL' : '☣ PARASITIC MASS INFECTION',
    lang === 'de'
      ? 'Der Chor breitet sich aus · Isoliere die Verbindungen!'
      : 'The choir spreads · Isolate the connections!',
    4000,
  );

  // Signal to the caller that mass corruption should be applied to 5–10 nodes.
  // The actual node selection happens in boss/_specials.js or the caller,
  // which should iterate gameNodes and call applyCorruptionToNode().
  document.body.dispatchEvent(new CustomEvent('syn:mass-corruption', {
    bubbles: true,
    detail: { bossId: _currentBossId, phase: _currentPhase },
  }));
}

function _triggerSigmaRecursionWarning() {
  const lang = getLang();
  showToast(
    lang === 'de' ? '∞ REKURSIONSSCHLEIFE TIEFER' : '∞ RECURSION LOOP DEEPER',
    lang === 'de'
      ? 'Die Sigma-Frequenz eskaliert · Brich den Zyklus!'
      : 'Sigma frequency escalating · Break the cycle!',
    3000,
  );
}

function _triggerVortexFinalDrain() {
  const lang = getLang();
  showToast(
    lang === 'de' ? '🌀 VORTEX FINALZUSTAND' : '🌀 VORTEX FINAL STATE',
    lang === 'de'
      ? 'Der Strudel kollabiert · Triff den Sättigungspunkt jetzt!'
      : 'The vortex collapses · Hit the saturation point now!',
    3500,
  );
}
