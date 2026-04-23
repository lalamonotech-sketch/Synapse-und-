/**
 * SYNAPSE v99 — Boss Special Mechanics
 *
 * Per-profile special abilities:
 *   - Ghost Matrix     (randomised fake vulnerability windows)
 *   - Vortex Architect (capture-delay drain)
 *   - Rogue Node       (hostile draining node)
 *   - Phase Counter-Attack (phase link reversal)
 */

import { G } from '../../state/gameState.js';
import { getLang } from '../../state/settings.js';
import { BOSS, bossState } from '../../state/bossShared.js';
import { regTimer, clearTimer } from '../../registries/timerRegistry.js';
import { spawnShock, gameNodes, gameLinks } from '../../layers/network/index.js';
import { applyCorruptionToNode } from '../bossMechanics.js'; // Phase 3
import { showToast } from '../../ui/hud/index.js';

// ── Ghost Matrix ──────────────────────────────────────────────────────────

export const ghostState = { windowCount: 0, fakeOpen: false, _initialized: false };

export function _ghostDecideFake() {
  ghostState.windowCount = (ghostState.windowCount || 0) + 1;
  ghostState.fakeOpen = Math.random() < 0.30;
  const hudEl = document.getElementById('boss-hud');
  if (hudEl) hudEl.classList.toggle('ghost-fake-hint', ghostState.fakeOpen);
}

export function tickGhostMatrix(t) {
  if (!BOSS.vulnOpen) { ghostState.fakeOpen = false; return; }
  if (!ghostState._initialized) {
    ghostState.windowCount = 0;
    ghostState._initialized = true;
  }
}

// ── Vortex Architect ──────────────────────────────────────────────────────

const vortexState = { captureDecay: 0, warned: false };

export function tickVortexArchitect(t) {
  const elapsed = BOSS.bossStartTime ? (Date.now() - BOSS.bossStartTime) / 1000 : 0;
  if (elapsed > 30 && !vortexState.warned) {
    vortexState.warned = true;
    const lang = getLang();
    showToast(
      lang === 'de' ? '⚠ VORTEX SAUGT' : '⚠ VORTEX DRAINING',
      lang === 'de' ? 'Passive Gewinne sinken — Triff schnell' : 'Passive gains falling — hit quickly',
      2200
    );
  }
  if (elapsed > 30) {
    const decaySteps = Math.min(3, Math.floor((elapsed - 30) / 15));
    G.energy = Math.max(0, G.energy - decaySteps * 0.05);
  }
}

// ── Rogue Node ────────────────────────────────────────────────────────────

const _ROGUE_DURATION = 14000;
let _rogueActive = false;

export function triggerBossRogueNode() {
  if (_rogueActive || !bossState.bossActive) return;
  if (gameNodes.length < 3) return;

  const lang = getLang();
  _rogueActive = true;

  const candidateLink = gameLinks.length > 0
    ? gameLinks[Math.floor(Math.random() * gameLinks.length)]
    : null;

  spawnShock(0xff2200);
  showToast(
    lang === 'de' ? '◈ ROGUE NODE AKTIV' : '◈ ROGUE NODE ACTIVE',
    lang === 'de'
      ? 'Feindlicher Knoten drains Energie · ' + (_ROGUE_DURATION / 1000) + 's'
      : 'Hostile node draining energy · ' + (_ROGUE_DURATION / 1000) + 's',
    3500
  );

  regTimer('bossRogueDrain', setInterval(() => {
    if (!_rogueActive || !bossState.bossActive) { clearTimer('bossRogueDrain'); return; }
    if (G.energy > 4) { G.energy = Math.max(0, G.energy - 3); spawnShock(0xdd0000); }
  }, 2000), 'interval');

  regTimer('bossRogueNode', setTimeout(() => {
    _rogueActive = false;
    clearTimer('bossRogueDrain');
    spawnShock(0x44ff44);
    const l = getLang();
    showToast(
      l === 'de' ? '◈ ROGUE NODE ELIMINIERT' : '◈ ROGUE NODE ELIMINATED',
      l === 'de' ? 'Feindlicher Einfluss entfernt' : 'Hostile influence removed',
      2000
    );
    clearTimer('bossRogueNode');
  }, _ROGUE_DURATION), 'timeout');
}

// ── Phase Counter-Attack ──────────────────────────────────────────────────

export function triggerBossPhaseCounterAttack() {
  if (!bossState.bossActive) return;
  const phaseLinks = gameLinks.filter(l => l.type === 'phase' && l._phaseActive);
  if (phaseLinks.length === 0) return;

  const target = phaseLinks[Math.floor(Math.random() * phaseLinks.length)];
  const lang = getLang();
  const origActive = target._phaseActive;

  target._phaseActive = false;
  showToast(
    lang === 'de' ? '◈ GEGENOFFENSIVE' : '◈ COUNTER-ATTACK',
    lang === 'de' ? 'Phase-Link umgekehrt · Drain aktiv' : 'Phase link reversed · Drain active',
    2400
  );
  spawnShock(BOSS.color || 0xff4400);

  let ticks = 0;
  regTimer('bossPhaseAttack', setInterval(() => {
    if (!bossState.bossActive || ++ticks >= 5) {
      clearTimer('bossPhaseAttack');
      target._phaseActive = origActive;
      return;
    }
    if (G.energy > 2) G.energy = Math.max(0, G.energy - 2);
    spawnShock(0xff2200);
  }, 1000), 'interval');
}

// ── Phase 3: Mass Corruption Event Handler ────────────────────────────────
// Listens for the 'syn:mass-corruption' CustomEvent fired by bossMechanics.js
// when parasite_choir hits Phase 3. Selects 5-10 random non-main nodes and
// corrupts them visually via applyCorruptionToNode().
(function _bindMassCorruptionListener() {
  document.body.addEventListener('syn:mass-corruption', function _onMassCorruption(e) {
    const candidates = gameNodes.filter(n => !n.isMain);
    if (!candidates.length) return;

    const count = Math.min(candidates.length, 5 + Math.floor(Math.random() * 6)); // 5-10
    // Shuffle slice
    const shuffled = candidates.slice().sort(() => Math.random() - 0.5);
    for (let i = 0; i < count; i++) {
      const node = shuffled[i];
      const nodeId = node._id ?? node.id ?? i;
      // Mark node internal state for combat logic
      node._corrupted = true;
      // Apply visual corruption (CSS hooks + DOM overlay)
      try { applyCorruptionToNode(nodeId); } catch(_) {}
      // Also drain a small amount of energy per corrupted node
      if (typeof G !== 'undefined' && G.energy > 2) G.energy = Math.max(0, G.energy - 2);
    }

    spawnShock(0x88ff44);
    spawnShock(0x44cc22);
  });
})();

window.triggerBossPhaseCounterAttack = triggerBossPhaseCounterAttack;
