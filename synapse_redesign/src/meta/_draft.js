/**
 * SYNAPSE v99 — Draft System
 *
 * Manages upgrade drafts: pool building, UI rendering, pick/skip,
 * synergy application, and draft cap logic.
 */

import { G } from '../state/gameState.js';
import { TUNING } from '../state/tuning.js';
import { synSettings } from '../state/settings.js';
import { bossState } from '../state/bossShared.js';
import { upgradeState, traitState, synergyState, mergeActionStateSnapshot } from '../state/actionState.js';
import { PROFILE_BONUS } from '../state/aiShared.js';
import { regTimer, clearTimer } from '../registries/timerRegistry.js';
import { el } from '../util/dom.js';
import { showToast, updateHUD } from '../ui/hud/index.js';
import { spawnShock } from '../layers/network/index.js';
import { logTL } from '../ui/actionFlow.js';
import { SFX } from '../audio/sfx.js';
import { emitAgentMessage } from './_combo.js';
import { questState } from '../state/runContext.js';
import { getDraftTagWeight }    from '../systems/branchingObjectives.js'; // Phase 1
import { checkDraftSynergies }  from '../systems/draftSynergies.js';      // Phase 2

// ── Draft state (shared via window bridge) ────────────────────────────────

export const G_DRAFT = window.G_DRAFT = window.G_DRAFT || {
  lastDraftTime: 0,
  nextDraftIn: 95 + Math.random() * 30,
  active: false,
  draftCount: 0,
  appliedUpgrades: [],
  firstDraftDone: false,
};

// ── Upgrade definitions ───────────────────────────────────────────────────

const UPGRADE_DEFS = [
  { id: 'predator_blitz',          tag: 'predator',  icon: '⚡',    name: 'Blitz Doctrine',       desc: 'Pulse-CD −0.9s und aggressiveres Tempo.',             descEN: 'Pulse cooldown −0.9s and more aggressive tempo.',        apply() { TUNING.pulseCd = Math.max(1800, TUNING.pulseCd - 900); G.pulseCd = TUNING.pulseCd; } },
  { id: 'predator_chain',          tag: 'predator',  icon: '⟳',    name: 'Chain Capture',        desc: 'Ermöglicht Ketten-Captures nach schnellen Treffern.',  descEN: 'Enables chain captures after rapid hits.',               apply() { upgradeState.chainCapture = true; upgradeState.chainCaptureCd = 900; } },
  { id: 'analyst_bridge',          tag: 'analyst',   icon: '↔',    name: 'Bridge Immunity',      desc: 'Stabile Backbone-Links werden immunisiert.',           descEN: 'Stable backbone links become immune to disruption.',     apply() { upgradeState.bridgeImmunity = true; } },
  { id: 'analyst_geometry',        tag: 'analyst',   icon: '△',    name: 'Structural Audit',     desc: 'Struktur- und Linear-Traits werden aktiv.',            descEN: 'Structural and linear traits activate.',                 apply() { traitState.structural = true; traitState.linearThinking = true; } },
  { id: 'mnemonic_flood',          tag: 'mnemonic',  icon: '◉',    name: 'Memory Flood',         desc: 'Memory-Entladung effizienter und stärker.',            descEN: 'Memory discharge becomes more efficient and powerful.',  apply() { TUNING.memoryMultiplier += 0.28; } },
  { id: 'mnemonic_echo',           tag: 'mnemonic',  icon: '⬢',    name: 'Pulse Echo',           desc: 'Pulses geben zusätzliche Energie beim Feuern.',        descEN: 'Pulses grant bonus energy on fire.',                     apply() { upgradeState.pulseEnergyBonus = (upgradeState.pulseEnergyBonus || 0) + 2; } },
  { id: 'architect_backbone',      tag: 'architect', icon: '◈',    name: 'Backbone Master',      desc: 'Backbone-Boni und Projektkopplung steigen.',           descEN: 'Backbone bonuses and project coupling increase.',        apply() { traitState.backboneMaster = true; } },
  { id: 'architect_spine',         tag: 'architect', icon: '⬟',    name: 'Silent Spine',         desc: 'Spine-Erträge steigen bei sauberer Führung.',          descEN: 'Spine yields increase with clean routing.',              apply() { traitState.silentSpine = true; } },
  { id: 'architect_fusion',        tag: 'architect', icon: '✶',    name: 'Fusion Primer',        desc: 'Erste Fusion liefert mehr Fortschritt.',               descEN: 'First fusion delivers more progress.',                   apply() { traitState.fusionXP = true; } },
  { id: 'wild_precision',          tag: 'wild',      icon: '◎',    name: 'Precision Synapse',    desc: 'Verfehlte Pulses kosten keine Energie.',               descEN: 'Missed pulses cost no energy.',                         apply() { upgradeState.noMissedPulseCost = true; } },
  { id: 'wild_elite',              tag: 'wild',      icon: '★',    name: 'Elite Veteran',        desc: 'Elite-Captures geben zusätzliche Belohnungen.',        descEN: 'Elite captures grant additional rewards.',               apply() { traitState.eliteVeteran = true; } },
  { id: 'wild_fragile',            tag: 'wild',      icon: '~',    name: 'Fragile Harvest',      desc: 'Fragile Cluster geben zusätzlichen Burst.',            descEN: 'Fragile clusters deliver an extra burst.',               apply() { upgradeState.fragileClusterBonus = Math.max(upgradeState.fragileClusterBonus || 0, 1); traitState.fractureLogic = true; } },
  { id: 'wild_resonance_debt',     tag: 'wild',      icon: '⬡',    name: 'Resonance Debt',       desc: 'Alle 3 Pulses: ×1.8 Energie-Burst + Memory −30.',     descEN: 'Every 3rd pulse: ×1.8 energy burst + Memory −30.',      apply() { traitState.resonanceDebt = true; } },
  { id: 'mnemonic_cascade',        tag: 'mnemonic',  icon: '◌',    name: 'Resonance Cascade',    desc: 'Triangles entladen Memory-Nodes partiell bei Aktivierung.', descEN: 'Triangles partially discharge Memory nodes on activation.', apply() { upgradeState.resonanceCascade = true; } },
  { id: 'predator_overcharge',     tag: 'predator',  icon: '⚡⚡',  name: 'Overcharge',           desc: 'Pulse kann doppelt gefeuert werden — kostet ×2 Energie.', descEN: 'Pulse can double-fire — costs ×2 energy.',            apply() { upgradeState.overcharge = true; } },
  { id: 'analyst_deep_geometry',   tag: 'analyst',   icon: '◇',    name: 'Deep Geometry',        desc: 'Jeder stabile Link gibt passiv +0.5⬡/s.',              descEN: 'Each stable link grants +0.5⬡/s passively.',            apply() { upgradeState.deepGeometry = true; } },
  { id: 'architect_quantum_spine', tag: 'architect', icon: '⬡↑',   name: 'Quantum Spine',        desc: 'Spine-Nodes geben +20⬡ Bonus auf nächste Fusion.',     descEN: 'Spine-nodes grant +20⬡ bonus on next fusion.',          apply() { upgradeState.quantumSpine = true; } },
  { id: 'mnemonic_echo_chamber',   tag: 'mnemonic',  icon: '⬢⬢',   name: 'Echo Chamber',         desc: 'Jeder Pulse wiederholt den letzten Memory-Discharge zu 40%.', descEN: 'Each pulse repeats the last memory discharge at 40%.', apply() { upgradeState.echoChamber = true; } },
  { id: 'wild_cold_loop',          tag: 'wild',      icon: '❄',    name: 'Cold Loop',            desc: 'Jeder Cluster-Capture gibt sofort +30⬡ Kältebonus.',   descEN: 'Each cluster capture gives +30⬡ cold bonus.',           apply() { traitState.coldLoop = true; } },
  { id: 'wild_hunt_instinct',      tag: 'wild',      icon: '◉',    name: 'Hunt Instinct',        desc: 'Pulsgeschwindigkeit steigt nach jedem Capture für 5 Sekunden.', descEN: 'Pulse speed increases for 5 seconds after each capture.', apply() { traitState.huntInstinct = true; } },
  { id: 'v95_fragile_phoenix',     tag: 'wild',      icon: '🔥',   name: 'Fragile Phoenix',      desc: 'Fragile-Bruch spawnt sofort 2 neue stabile Links.',    descEN: 'Fragile break spawns 2 stable links to adjacent nodes.', tier: 'build', apply() { upgradeState.fragilePhoenix = true; } },
  { id: 'v95_relay_overdrive',     tag: 'predator',  icon: '⚡↑',  name: 'Relay Overdrive',      desc: 'Relays verarbeiten bis zu 8 Signale gleichzeitig.',    descEN: 'Relays handle up to 8 signals simultaneously.',         tier: 'build', apply() { upgradeState.relayOverdrive = true; } },
  { id: 'v95_memory_network',      tag: 'mnemonic',  icon: '◉◉',   name: 'Memory Network',       desc: 'Memory-Nodes teilen Ladung automatisch.',              descEN: 'Memory nodes share charge automatically.',              tier: 'build', apply() { upgradeState.memoryNetwork = true; } },
  { id: 'v95_entropy_drain',       tag: 'analyst',   icon: '▽',    name: 'Entropy Drain',        desc: 'Jeder Fragile-Bruch gibt stabilen Links +15⬡.',        descEN: 'Each fragile break gives stable links +15⬡.',           tier: 'build', apply() { upgradeState.entropyDrain = true; } },
  { id: 'v95_phantom_web',         tag: 'architect', icon: '~◈',   name: 'Phantom Web',          desc: 'Gebrochene Fragile Links werden zu Geist-Links.',      descEN: 'Broken fragile links become ghost links.',              tier: 'build', apply() { upgradeState.phantomWeb = true; synergyState.phantomWebActive = true; } },
  // ── v99: Tier-2 Upgrades — Analyst & Mnemonic ─────────────────────────
  { id: 'analyst_deep_scan',       tag: 'analyst',   icon: '⊙',    name: 'Deep Scan',            desc: 'Jeder fragile Link gibt Daten — Warmup nach 2 Captures.',     descEN: 'Each fragile link yields data — activates after 2 captures.',  tier: 'build', apply() { upgradeState.deepScan = true; } },
  { id: 'analyst_resonance_map',   tag: 'analyst',   icon: '∿',    name: 'Resonance Map',        desc: 'Alle Triangles zeigen Nachbar-Cluster-Schwäche an.',           descEN: 'All triangles reveal adjacent cluster weakness.',               tier: 'build', apply() { upgradeState.resonanceMap = true; } },
  { id: 'mnemonic_imprint',        tag: 'mnemonic',  icon: '◍',    name: 'Deep Imprint',         desc: 'Memory-Discharge trifft alle Nodes im Radius (−40 % Stärke).', descEN: 'Memory discharge hits all nodes in radius (−40 % strength).',  tier: 'build', apply() { upgradeState.deepImprint = true; } },
  { id: 'mnemonic_latency',        tag: 'mnemonic',  icon: '⏱',    name: 'Zero Latency',         desc: 'Memory-Entladung hat keine Abklingzeit nach erstem Discharge.', descEN: 'Memory discharge has no cooldown after first discharge.',       tier: 'build', apply() { upgradeState.zeroLatency = true; } },
  // ── v99: Cross-Profile Synergies ───────────────────────────────────────
  { id: 'syn_architect_mnemonic',  tag: 'wild',      icon: '◈◉',   name: 'Spine Memory',         desc: 'Spine-Erträge laden Memory-Nodes passiv auf.',                 descEN: 'Spine yields passively charge memory nodes.',                   apply() { upgradeState.spineMemoryLink = true; } },
  { id: 'syn_predator_analyst',    tag: 'wild',      icon: '⚡↔',   name: 'Pressure Analysis',    desc: 'Hohe Pulsrate gibt temporären Bridge-Immunität-Bonus.',        descEN: 'High pulse rate grants temporary bridge immunity boost.',        apply() { upgradeState.pressureAnalysis = true; } },
  // ── v99: Temporal Fold (Rewind as Draft Upgrade) ───────────────────────
  { id: 'temporal_fold',           tag: 'wild',      icon: '↩',    name: 'Temporal Fold',        desc: 'Rewind-Fenster: 10s → 30s. Rewind kann taktisch eingesetzt werden.', descEN: 'Rewind window: 10s → 30s. Rewind becomes a tactical tool.', tier: 'build', apply() { if (typeof window._setRewindDepth === 'function') window._setRewindDepth(30); } },
];

// ── Draft cap ─────────────────────────────────────────────────────────────

export function draftCap() {
  const diff = synSettings.difficulty || 'normal';
  return diff === 'easy' ? 5 : diff === 'hard' ? 3 : 4;
}

// ── Pool + synergy ────────────────────────────────────────────────────────

function filteredUpgradePool() {
  const picked = new Set(G_DRAFT.appliedUpgrades || []);
  const pool = UPGRADE_DEFS.filter(up => !picked.has(up.id));
  const buildDefining = pool.filter(up => up.tier === 'build');
  const regular = pool.filter(up => up.tier !== 'build');

  // Phase 1: Branching-Objectives Draft-Filter.
  // getDraftTagWeight() gibt einen Gewichts-Multiplikator zurück:
  //   3.0 = gewählter Pfad-Tag (dreifach gewichtet)
  //   1.6 = komplementärer Synergy-Tag
  //   1.0 = neutral (Wild)
  //   0.25 = unterdrückter Antagonist-Tag
  // Wir bauen einen gewichteten Pool: Einträge werden entsprechend dupliziert.
  function _weightedShuffle(arr) {
    const weighted = [];
    for (const up of arr) {
      const w = getDraftTagWeight(up.tag || 'wild');
      const copies = w >= 3.0 ? 3 : w >= 1.6 ? 2 : w <= 0.25 ? 0 : 1;
      for (let i = 0; i < copies; i++) weighted.push(up);
    }
    // Deduplizieren nach dem Mischen, Originalreihenfolge wiederherstellen
    const shuffled = weighted.sort(() => Math.random() - 0.5);
    const seen = new Set();
    return shuffled.filter(up => {
      if (seen.has(up.id)) return false;
      seen.add(up.id);
      return true;
    });
  }

  if (buildDefining.length > 0) {
    const shuffledBuild = _weightedShuffle(buildDefining);
    const pick = shuffledBuild[0] || buildDefining[Math.floor(Math.random() * buildDefining.length)];
    return [pick, ..._weightedShuffle(regular.filter(u => u !== pick))];
  }
  return _weightedShuffle(pool);
}

function getSynergyHint(id) {
  const picked = new Set(G_DRAFT.appliedUpgrades || []);
  if (id === 'predator_blitz'       && picked.has('mnemonic_flood'))    return '◉⚡ SYNERGIE · Drain Pulse';
  if (id === 'mnemonic_flood'       && picked.has('predator_blitz'))    return '◉⚡ SYNERGIE · Drain Pulse';
  if (id === 'analyst_geometry'     && picked.has('analyst_bridge'))    return '↔ SYNERGIE · Vollstruktur';
  if (id === 'analyst_bridge'       && picked.has('analyst_geometry'))  return '↔ SYNERGIE · Vollstruktur';
  if (id === 'architect_backbone'   && picked.has('architect_spine'))   return '⬟ SYNERGIE · Silent Backbone';
  if (id === 'architect_spine'      && picked.has('architect_backbone'))return '⬟ SYNERGIE · Silent Backbone';
  if (id === 'mnemonic_flood'       && picked.has('mnemonic_echo'))     return '⬢◉ SYNERGIE · Resonance Storm';
  if (id === 'mnemonic_echo'        && picked.has('mnemonic_flood'))    return '⬢◉ SYNERGIE · Resonance Storm';
  if (id === 'architect_backbone'   && picked.has('predator_chain'))    return '◈⟳ SYNERGIE · Grid Lock';
  if (id === 'predator_chain'       && picked.has('architect_backbone'))return '◈⟳ SYNERGIE · Grid Lock';

  if (id === 'syn_architect_mnemonic' && (picked.has('architect_backbone') || picked.has('architect_spine'))) return '◈◉ SYNERGIE · Spine Memory';
  if (id === 'syn_predator_analyst'   && (picked.has('predator_blitz')     || picked.has('predator_chain')))  return '⚡↔ SYNERGIE · Pressure Analysis';
  if (id === 'architect_backbone'     && picked.has('mnemonic_flood'))      return '◈◉ SYNERGIE · Spine Memory';
  if (id === 'predator_blitz'         && picked.has('analyst_bridge'))      return '⚡↔ SYNERGIE · Pressure Analysis';
  return '';
}

function applyUpgradeById(id) {
  const up = UPGRADE_DEFS.find(e => e.id === id);
  if (!up) return false;
  up.apply?.();
  return true;
}

function applyUpgradeSynergies() {
  const picked = new Set(G_DRAFT.appliedUpgrades || []);
  if (picked.has('predator_blitz')     && picked.has('mnemonic_flood'))    synergyState.drainpulse = true;
  if (picked.has('analyst_geometry')   && picked.has('analyst_bridge'))    traitState.conservative = true;
  if (picked.has('architect_backbone') && picked.has('architect_spine'))   { traitState.backboneMaster = true; traitState.silentSpine = true; }
  if (picked.has('mnemonic_flood')     && picked.has('mnemonic_echo'))     synergyState.resonanceStorm = true;
  if (picked.has('architect_backbone') && picked.has('predator_chain'))    synergyState.gridLock = true;
  if (picked.has('architect_backbone') && picked.has('mnemonic_flood'))   upgradeState.spineMemoryLink = true;
  if (picked.has('architect_spine')    && picked.has('mnemonic_echo'))    upgradeState.spineMemoryLink = true;
  if (picked.has('predator_blitz')     && picked.has('analyst_bridge'))   upgradeState.pressureAnalysis = true;
  if (picked.has('predator_chain')     && picked.has('analyst_geometry')) upgradeState.pressureAnalysis = true;
}

// ── Overlay rendering ─────────────────────────────────────────────────────

function renderDraftOverlay(reason = '') {
  const overlay = el('draft-overlay');
  const cards   = el('draft-cards');
  const sub     = el('draft-sub');
  if (!overlay || !cards || !sub) return;

  sub.textContent = reason || 'Wähle eine Verbesserung für diesen Run';
  const shuffled = [...filteredUpgradePool()].sort(() => Math.random() - 0.5);
  const picks = [];
  const tagCount = {};
  for (const up of shuffled) {
    if (picks.length >= 3) break;
    const tag = up.tag || 'wild';
    const max = tag === 'wild' ? 1 : 2;
    if ((tagCount[tag] || 0) >= max) continue;
    picks.push(up);
    tagCount[tag] = (tagCount[tag] || 0) + 1;
  }
  if (picks.length < 3) { shuffled.forEach(up => { if (picks.length >= 3 || picks.includes(up)) return; picks.push(up); }); }

  const tagLabel = { predator: 'PREDATOR', analyst: 'ANALYST', mnemonic: 'MNEMONIC', architect: 'ARCHITEKT', wild: 'WILDCARD' };
  cards.innerHTML = '';
  picks.forEach(up => {
    const card = document.createElement('div');
    card.className = 'draft-card' + (up.tag ? ' dc-tag-' + up.tag : '');
    const hint = getSynergyHint(up.id);
    card.innerHTML = `<div class="dc-icon">${up.icon}</div><div class="dc-tag">${tagLabel[up.tag] || String(up.tag || '').toUpperCase()}</div><div class="dc-name">${up.name}</div><div class="dc-desc">${up.desc}</div>${hint ? `<div style="margin-top:6px;font-size:.3rem;letter-spacing:2px;color:rgba(255,220,80,.88);text-transform:uppercase;text-shadow:0 0 10px rgba(255,200,40,.5)">${hint}</div>` : ''}`;
    card.onclick = () => pickDraft(up.id);
    cards.appendChild(card);
  });
  overlay.classList.add('show');
}

// ── Public API ────────────────────────────────────────────────────────────

export function closeDraft(forceUnpause = true) {
  G_DRAFT.active = false;
  el('draft-overlay')?.classList.remove('show');
  if (forceUnpause && !bossState.bossActive) G.paused = false;
}

export function pickDraft(id) {
  const up = UPGRADE_DEFS.find(e => e.id === id);
  if (!up) return false;
  if (!G_DRAFT.appliedUpgrades.includes(id)) G_DRAFT.appliedUpgrades.push(id);
  checkDraftSynergies(G_DRAFT.appliedUpgrades); // Phase 2: Synergie-Check
  G_DRAFT.draftCount += 1;
  applyUpgradeById(id);
  applyUpgradeSynergies();
  closeDraft(true);
  spawnShock(0xcc66ff);
  const lang = synSettings.lang || 'de';
  showToast('UPGRADE AKTIV · ' + up.name, lang === 'de' ? up.desc : (up.descEN || up.desc), 3200);
  updateHUD();
  return true;
}

export function skipDraft() {
  closeDraft(true);
  const lang = synSettings.lang || 'de';
  showToast(lang === 'de' ? 'ÜBERSPRUNGEN' : 'SKIPPED', lang === 'de' ? 'Kein Upgrade gewählt' : 'No upgrade selected', 1400);
}

export function maybeShowDraftAdvisory() {
  if (questState.advisoryDraftShown || G_DRAFT.active) return;
  questState.advisoryDraftShown = true;
  emitAgentMessage('draft', true);
  const lang = synSettings.lang || 'de';
  showToast(lang === 'de' ? '◈ DRAFT NÄHERT SICH' : '◈ DRAFT INCOMING', lang === 'de' ? 'Upgrade-Fenster öffnet bald' : 'Upgrade window opening soon', 2400);
}

export function triggerDraft(reason = '') {
  if (G_DRAFT.active || G.runWon) return false;
  if (G_DRAFT.draftCount >= draftCap()) return false;
  if (filteredUpgradePool().length === 0) return false;
  G_DRAFT.active = true;
  G_DRAFT.firstDraftDone = true;
  G_DRAFT.lastDraftTime = (Date.now() - G.runStart) / 1000;
  G_DRAFT.nextDraftIn = 90 + Math.random() * 35;
  G.paused = true;
  questState.advisoryDraftShown = false;
  SFX?.draft?.();
  renderDraftOverlay(reason);
  logTL('draft', 'Upgrade Draft', 'rgba(200,100,255,.72)', '◈');
  emitAgentMessage('draft', true);
  return true;
}

export function triggerMilestoneDraft(reason) {
  if (!G_DRAFT.firstDraftDone || G_DRAFT.draftCount === 0) {
    triggerDraft(reason);
  }
}

export function shouldTriggerDraft() {
  if (G_DRAFT.active || G.runWon || !G.l3On) return false;
  if (G_DRAFT.draftCount >= draftCap()) return false;
  if (filteredUpgradePool().length === 0) return false;
  const elapsed = (Date.now() - G.runStart) / 1000;
  const timeSinceLast = elapsed - (G_DRAFT.lastDraftTime || 0);
  if (!G_DRAFT.firstDraftDone) return elapsed > 75;
  return timeSinceLast >= G_DRAFT.nextDraftIn;
}

export function restoreDraft(save) {
  const draft = save?.draft || {};
  G_DRAFT.appliedUpgrades = Array.isArray(draft.appliedUpgrades) ? [...draft.appliedUpgrades] : [];
  G_DRAFT.draftCount       = draft.draftCount || 0;
  G_DRAFT.lastDraftTime    = draft.lastDraftTime || 0;
  G_DRAFT.nextDraftIn      = draft.nextDraftIn || (95 + Math.random() * 30);
  G_DRAFT.firstDraftDone   = !!draft.firstDraftDone;
  G_DRAFT.active           = !!draft.active;
  G_DRAFT.appliedUpgrades.forEach(applyUpgradeById);
  applyUpgradeSynergies();
  mergeActionStateSnapshot(save?.actionState);
  if (G_DRAFT.active) { G.paused = true; renderDraftOverlay('Fortsetzung · Draft noch offen'); }
}

export { applyUpgradeById, applyUpgradeSynergies };
