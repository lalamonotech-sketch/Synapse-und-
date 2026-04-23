/**
 * SYNAPSE v99 — Combo System & Agent Messages
 *
 * Manages the pulse-combo multiplier and the AI agent message display.
 */

import { aiState } from '../state/aiShared.js';
import { synSettings } from '../state/settings.js';
import { regTimer, clearTimer } from '../registries/timerRegistry.js';
import { el } from '../util/dom.js';
import { showToast } from '../ui/hud/index.js';

// ── Combo state (shared via window bridge) ────────────────────────────────

export const COMBO_LEVELS = [1.0, 1.2, 1.5, 2.0];
export const COMBO_LABELS = ['', 'x1.2 COMBO', 'x1.5 COMBO', 'x2.0 MAX COMBO'];
export const comboState = window._combo = window._combo || { mult: 1.0, lastPulse: 0, count: 0 };

// ── Agent message pools ───────────────────────────────────────────────────

const AGENT_MSGS = {
  sync:     ['SYNC-Fenster offen.', 'Jetzt pingen.', 'Timingfenster stabil.'],
  pulse:    ['Pulse registriert.', 'Signalwelle bestätigt.', 'Rhythmus gehalten.'],
  win:      ['Netz stabilisiert.', 'Lauf abgeschlossen.', 'Abschluss bestätigt.'],
  bridge:   ['Brücke aktiv.', 'Konvergenz steigt.', 'Topologie verdichtet sich.'],
  memory:   ['Memory entladen.', 'Archiv freigegeben.', 'Langzeitspur aktiv.'],
  backbone: ['Backbone online.', 'Makro-Spine reagiert.', 'Netzachse verriegelt.'],
  spine:    ['Spine wächst.', 'Achse verlängert.', 'Makrofeld verdichtet.'],
  fusion:   ['Fusion bestätigt.', 'Cluster verschmelzen.', 'Überlagerung stabil.'],
  stage:    ['Awareness steigt.', 'Die KI lernt sichtbar.', 'Ein neuer Zustand formt sich.'],
  draft:    ['Upgrade-Fenster in Kürze.', 'Ein Draft nähert sich.', 'Entwurfslot wird vorbereitet.'],
  rogue:    ['Feindlicher Einfluss erkannt.', 'Rogue-Node aktiv.', 'Netzwerk unter Beschuss.'],
  phantom:  ['Geistimpuls registriert.', 'Phantomsignal im Netz.', 'Anomalie detektiert.'],
  counter:  ['Taktik analysiert.', 'Muster gespeichert.', 'Gegenmaßnahme aktiv.'],
};
const AGENT_MSGS_EN = {
  sync:     ['SYNC window open.', 'Ping now.', 'Timing window stable.'],
  pulse:    ['Pulse registered.', 'Signal wave confirmed.', 'Rhythm maintained.'],
  win:      ['Network stabilised.', 'Run complete.', 'Completion confirmed.'],
  bridge:   ['Bridge active.', 'Convergence rising.', 'Topology densifying.'],
  memory:   ['Memory discharged.', 'Archive released.', 'Long-term trace active.'],
  backbone: ['Backbone online.', 'Macro-spine responding.', 'Network axis locked.'],
  spine:    ['Spine growing.', 'Axis extending.', 'Macrofield condensing.'],
  fusion:   ['Fusion confirmed.', 'Clusters merging.', 'Superposition stable.'],
  stage:    ['Awareness rising.', 'The AI is visibly learning.', 'A new state is forming.'],
  draft:    ['Upgrade window approaching.', 'A draft is near.', 'Draft slot being prepared.'],
  rogue:    ['Hostile influence detected.', 'Rogue node active.', 'Network under attack.'],
  phantom:  ['Ghost impulse registered.', 'Phantom signal in network.', 'Anomaly detected.'],
  counter:  ['Tactic analysed.', 'Pattern memorised.', 'Counter-measure active.'],
};

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function currentLang() { return synSettings.lang || 'de'; }

// ── Agent messages ────────────────────────────────────────────────────────

let _agentCooldown = 0;

export function showAgentMsg(text, urgent = false, profile = null, ttl = 3200) {
  const node = el('agent-line');
  if (!node) return;
  clearTimer('agentMsgFade'); clearTimer('agentMsgTicker'); clearTimer('agentMsgClear');
  node.textContent = text || '';
  node.className = '';
  node.classList.add('ticker-in');
  if (urgent) node.classList.add('urgent');
  const p = profile || aiState?.dominantProfile;
  if (p) node.classList.add('profile-' + p);
  regTimer('agentMsgFade', setTimeout(() => { node.classList.add('fade-out'); clearTimer('agentMsgFade'); }, Math.max(1200, ttl - 420)), 'timeout');
  regTimer('agentMsgTicker', setTimeout(() => { node.classList.remove('ticker-in'); clearTimer('agentMsgTicker'); }, 420), 'timeout');
  regTimer('agentMsgClear', setTimeout(() => {
    if (node.classList.contains('fade-out')) { node.textContent = ''; node.className = ''; }
    clearTimer('agentMsgClear');
  }, ttl), 'timeout');
}

export function emitAgentMessage(kind, urgent = false) {
  const now = Date.now();
  if (!urgent && now < _agentCooldown) return;
  _agentCooldown = now + (urgent ? 350 : 1400);
  const profile = aiState?.dominantProfile || null;
  const msgBank = currentLang() === 'en' ? AGENT_MSGS_EN : AGENT_MSGS;
  const pool = msgBank[kind] || msgBank.pulse;
  showAgentMsg(rand(pool), urgent, profile, urgent ? 3600 : 2600);
}

export function resetAgentCooldown() { _agentCooldown = 0; }

// ── Combo ─────────────────────────────────────────────────────────────────

function updateComboHUD() {
  const node = el('combo-hud');
  if (!node) return;
  if (comboState.count > 0) {
    node.textContent = '⚡ ×' + comboState.mult.toFixed(1) + ' COMBO';
    node.style.opacity = '1';
    node.style.transform = 'translateX(-50%) scale(1)';
  } else {
    node.style.opacity = '0';
    node.style.transform = 'translateX(-50%) scale(.9)';
  }
}

export function updateCombo() {
  const now = Date.now();
  const gap = now - (comboState.lastPulse || 0);
  comboState.lastPulse = now;
  comboState.count = gap <= 2000 ? Math.min(3, comboState.count + 1) : 0;
  const nextMult = COMBO_LEVELS[comboState.count];
  if (nextMult > comboState.mult && COMBO_LABELS[comboState.count]) {
    const lang = currentLang();
    showToast('⚡ ' + COMBO_LABELS[comboState.count], lang === 'de' ? 'Nächster Pulse ×' + nextMult : 'Next pulse ×' + nextMult, 1400);
  }
  comboState.mult = nextMult;
  if (nextMult >= 2.0) { window.spawnShock?.(0xffcc00, 2); window.spawnShock?.(0xff8800, 2); }
  updateComboHUD();
}

export function resetCombo() {
  comboState.count = 0; comboState.mult = 1.0; updateComboHUD();
}

export function tickComboDecay() {
  if (comboState.count > 0 && (Date.now() - comboState.lastPulse) > 2000) resetCombo();
}

export { updateComboHUD };
