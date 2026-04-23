/**
 * SYNAPSE v99 — Layer 3: Strategic Projects
 *
 * Extracted from layer3.js (was lines 547–795).
 * Owns:
 *   STRATEGIC_PROJECTS          – 4 project definitions
 *   checkProjectTriggers()      – fire rewards when thresholds are met
 *   accumulateMemoryCache(gain) – feed Memory Cache project
 *   applyEchoBeaconEliteBoost   – scale elite burst by Echo Beacon
 *   applyBackboneRelayBossBonus – consume boss-counter bonus
 *   applyMemoryCacheDischargeBonus
 *   getEchoBeaconRareBonus
 *   initStrategicProjects       – called from initLayer3
 */

import { clock }        from '../../engine/scene.js';
import { G }            from '../../state/gameState.js';
import { getLang }      from '../../state/settings.js';
import { TUNING }       from '../../state/tuning.js';
import { projectState, conditionState, hasActiveCondition } from '../../state/runContext.js';
import { regTimer, clearTimer } from '../../registries/timerRegistry.js';
import { loadAIMeta }   from '../../systems/ai/index.js';
import { spawnShock }   from '../network/layer1.js';
import { showToast }    from '../../ui/hud/index.js';
import {
  showProjectSelectionPanelUI,
  closeProjectSelectionPanelUI,
  updateActiveProjectsHudUI,
} from '../../ui/layer3Panels.js';
import { getQuestProgress } from '../../meta/flow.js';

// ═══════════════════════════════════════════════════════════════════════════
//  STRATEGIC PROJECT DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

const STRATEGIC_PROJECTS = [
  {
    id: 'backbone_relay', name: 'Backbone Relay', nameEN: 'Backbone Relay',
    desc: 'Frühe Energie-Investition stärkt Spine-Wachstum und Backbone-Boni dauerhaft.',
    descEN: 'Early energy investment permanently strengthens Spine growth and Backbone bonuses.',
    theme: 'structural', cost: 40, costLabel: '−40⬡',
    trigger: { type: 'spineLength', threshold: 4 },
    triggered: false, active: false,
    reward(project) {
      if (window.TUNING) TUNING.spineEnergyMult = Math.min(2.0, (TUNING.spineEnergyMult || 1.0) * 1.30);
      const lang = getLang();
      if (G.backboneActive) {
        const burst = 55;
        G.energy += burst;
        spawnShock(0xffcc44); spawnShock(0xffaa22);
        showToast('◈ BACKBONE RELAY GEERNTET', lang === 'de' ? `Spine-Multiplikator ×1.3 · Backbone-Burst +${burst}⬡` : `Spine multiplier ×1.3 · Backbone burst +${burst}⬡`, 4500);
      } else {
        showToast('◈ BACKBONE RELAY GEERNTET', lang === 'de' ? 'Spine-Multiplikator ×1.3 · Backbone-Bonus vorgeladen' : 'Spine multiplier ×1.3 · Backbone bonus preloaded', 4000);
        spawnShock(0xffcc44);
      }
      projectState.backboneRelayBossBonus = true;
      project.triggered = true;
    },
    rewardLabel: 'Spine ≥ 4 → Spine-Mult ×1.3 · Backbone-Burst +55⬡ · Boss-Konter',
    rewardLabelEN: 'Spine ≥ 4 → Spine mult ×1.3 · Backbone burst +55⬡ · Boss counter',
    color: 'rgba(255,200,60,.95)', colorHex: 0xffcc44,
  },
  {
    id: 'memory_cache', name: 'Memory Cache', nameEN: 'Memory Cache',
    desc: 'Speichert laufenden Ertrag aus Layer 3. Wird im nächsten kritischen Moment als Burst entladen.',
    descEN: 'Stores ongoing gains from Layer 3. Released as a burst at the next critical moment.',
    theme: 'economic', cost: 25, costLabel: '−25⬡',
    trigger: { type: 'capturedClusters', threshold: 5 },
    triggered: false, active: false, stored: 0,
    reward(project) {
      const burst = Math.max(30, project.stored);
      G.energy += burst;
      if (projectState.mnemonic) projectState.memoryCacheActive = true;
      spawnShock(0xcc44ff); spawnShock(0x8822aa);
      const lang = getLang();
      showToast('◉ MEMORY CACHE ENTLADEN', lang === 'de' ? `+${burst}⬡ Gespeicherter Ertrag · Discharge-Effizienz +15%` : `+${burst}⬡ Stored output released · Discharge efficiency +15%`, 4500);
      project.triggered = true;
    },
    rewardLabel: '5 Cluster → Burst (gespeicherter Ertrag) · Discharge +15%',
    rewardLabelEN: '5 clusters → Burst (stored output) · Discharge +15%',
    color: 'rgba(200,80,255,.95)', colorHex: 0xcc44ff,
  },
  {
    id: 'quarantine_lattice', name: 'Quarantine Lattice', nameEN: 'Quarantine Lattice',
    desc: 'Schwächt negative Layer Conditions und Parasite-Effekte.',
    descEN: 'Weakens negative Layer Conditions and Parasite effects.',
    theme: 'defensive', cost: 30, costLabel: '−30⬡',
    trigger: { type: 'conditionActive', threshold: 1 },
    triggered: false, active: false,
    reward(project) {
      if (conditionState.lowSignal && typeof G_EVENT !== 'undefined') {
        G_EVENT.nextEventIn = Math.max(G_EVENT.nextEventIn, G_EVENT.nextEventIn * 1.25);
      }
      if (conditionState.recursiveStorm) {
        conditionState.recursiveStormChainChanceBonus = Math.max(0, (conditionState.recursiveStormChainChanceBonus || 0) * 0.5);
      }
      G.l3SyncWindowDur = Math.min(8, (G.l3SyncWindowDur || 5) + 0.8);
      const burst = 35;
      G.energy += burst;
      spawnShock(0x44ffaa); spawnShock(0x22cc88);
      const lang = getLang();
      showToast('⬡ QUARANTINE LATTICE AKTIV', lang === 'de' ? `Condition mitigiert · Sync +0.8s · +${burst}⬡ Konter` : `Condition mitigated · Sync +0.8s · +${burst}⬡ counter`, 4500);
      project.triggered = true;
    },
    rewardLabel: 'Condition aktiv → Condition geschwächt · Sync-Fenster +0.8s · +35⬡',
    rewardLabelEN: 'Condition active → Condition weakened · Sync window +0.8s · +35⬡',
    color: 'rgba(60,255,170,.95)', colorHex: 0x44ffaa,
  },
  {
    id: 'echo_beacon', name: 'Echo Beacon', nameEN: 'Echo Beacon',
    desc: 'Verbessert Rare-Chain-Chancen und Elite-Cluster-Erträge für den Rest des Runs.',
    descEN: 'Improves Rare Chain chances and Elite Cluster yields for the rest of the run.',
    theme: 'economic', cost: 35, costLabel: '−35⬡',
    trigger: { type: 'eliteClear', threshold: 1 },
    triggered: false, active: false,
    reward(project) {
      projectState.echoBeaconRareBonus = 0.12;
      projectState.echoBeaconEliteMult = 1.25;
      spawnShock(0x44ccff); spawnShock(0x2299dd);
      const lang = getLang();
      showToast('⟳ ECHO BEACON AKTIV', lang === 'de' ? 'Rare-Chain-Chance +12% · Elite-Erträge ×1.25 für diesen Run' : 'Rare chain chance +12% · Elite yields ×1.25 for this run', 4500);
      project.triggered = true;
    },
    rewardLabel: '1 Elite-Clear → Rare-Chain +12% · Elite-Erträge ×1.25',
    rewardLabelEN: '1 Elite clear → Rare chain +12% · Elite yields ×1.25',
    color: 'rgba(60,200,255,.95)', colorHex: 0x44ccff,
  },
];

// ─── Internal helpers ─────────────────────────────────────────────────────

export function updateActiveProjectsHud() {
  updateActiveProjectsHudUI({
    projects:         G.activeProjects || [],
    lang:             getLang(),
    capturedClusters: G.l3CapturedClusters || 0,
    energy:           G.energy || 0,
    spineLength:      G.spineLength || 0,
    backboneActive:   !!G.backboneActive,
    conditionActive:  hasActiveCondition(),
    eliteClears:      getQuestProgress()?.eliteClears || 0,
  });
}

function activateProject(projectId) {
  const def = STRATEGIC_PROJECTS.find(p => p.id === projectId);
  if (!def || G.projectSlotsUsed >= 2) return;
  const lang = getLang();
  if (G.energy < def.cost) {
    showToast(lang === 'de' ? 'ZU WENIG ENERGIE' : 'NOT ENOUGH ENERGY', lang === 'de' ? `Projekt kostet ${def.cost}⬡` : `Project costs ${def.cost}⬡`, 2000);
    return;
  }
  G.energy -= def.cost;
  const instance = { ...def, triggered: false, active: true, stored: 0, _startTime: clock.getElapsedTime() };
  G.activeProjects.push(instance);
  G.projectSlotsUsed++;
  spawnShock(instance.colorHex);
  showToast('◈ PROJEKT GESTARTET: ' + instance.name.toUpperCase(), lang === 'de' ? `${def.costLabel} investiert · ${def.rewardLabel}` : `${def.costLabel} invested · ${def.rewardLabelEN}`, 5000);
  updateActiveProjectsHud();
}

function showProjectSelectionPanel(pool, lang) {
  showProjectSelectionPanelUI({
    pool,
    lang,
    maxSlots: 2,
    getSlotsUsed: () => G.projectSlotsUsed,
    onSelect: activateProject,
    onClose: () => regTimer('l3ProjectHudRefresh', setTimeout(() => {
      updateActiveProjectsHud();
      clearTimer('l3ProjectHudRefresh');
    }, 450), 'timeout'),
  });
}

function closeProjectPanel() {
  closeProjectSelectionPanelUI({ silent: false });
}
window.closeProjectPanel = closeProjectPanel;
window._updateActiveProjectsHud = updateActiveProjectsHud;

function rehydrateProjectInstance(project) {
  const def = STRATEGIC_PROJECTS.find(item => item.id === project?.id);
  if (!def) return null;
  return {
    ...def,
    triggered:  !!project?.triggered,
    active:     project?.active !== false,
    stored:     project?.stored || 0,
    _startTime: project?._startTime || clock.getElapsedTime(),
  };
}

/** Called from initLayer3 — sets up or restores strategic projects. */
export function initStrategicProjects(restoring = false) {
  if (restoring && Array.isArray(G.activeProjects) && G.activeProjects.length) {
    G.activeProjects    = G.activeProjects.map(rehydrateProjectInstance).filter(Boolean);
    G.projectSlotsUsed  = G.projectSlotsUsed || G.activeProjects.length;
    updateActiveProjectsHud();
    return;
  }

  G.activeProjects = [];
  G.projectSlotsUsed = 0;
  projectState.backboneRelayBossBonus  = false;
  projectState.memoryCacheActive       = false;
  projectState.memoryCacheAccum        = 0;
  projectState.echoBeaconRareBonus     = 0;
  projectState.echoBeaconEliteMult     = 1.0;
  updateActiveProjectsHud();

  const meta = loadAIMeta?.();
  if (!meta || (meta.totalRuns || 0) < 2) return;

  const pool = [...STRATEGIC_PROJECTS].sort(() => Math.random() - 0.5).slice(0, 3);
  const lang = getLang();
  regTimer('l3projectSelect', setTimeout(() => {
    clearTimer('l3projectSelect');
    showProjectSelectionPanel(pool, lang);
  }, 6000), 'timeout');
}

// ═══════════════════════════════════════════════════════════════════════════
//  PUBLIC PROJECT API
// ═══════════════════════════════════════════════════════════════════════════

/** Fire rewards for all active, un-triggered projects that have met their threshold. */
export function checkProjectTriggers() {
  if (!G.activeProjects?.length) return;
  for (const proj of G.activeProjects) {
    if (proj.triggered || !proj.active) continue;
    const t = proj.trigger;
    let shouldFire = false;
    switch (t.type) {
      case 'spineLength':
        shouldFire = G.spineLength >= t.threshold;
        break;
      case 'capturedClusters':
        shouldFire = G.l3CapturedClusters >= t.threshold;
        if (proj.id === 'memory_cache' && !proj.triggered && projectState.memoryCacheAccum) {
          proj.stored += projectState.memoryCacheAccum;
          projectState.memoryCacheAccum = 0;
        }
        break;
      case 'backboneActive':   shouldFire = G.backboneActive; break;
      case 'conditionActive':  shouldFire = hasActiveCondition(); break;
      case 'eliteClear':       shouldFire = (getQuestProgress()?.eliteClears || 0) >= t.threshold; break;
      case 'energy':           shouldFire = G.energy >= t.threshold; break;
    }
    if (shouldFire) proj.reward(proj);
  }
  updateActiveProjectsHud();
}

/** Feed ongoing Layer-3 gain into the Memory Cache project (40 % of gain stored). */
export function accumulateMemoryCache(gain) {
  const mc = G.activeProjects?.find(p => p.id === 'memory_cache' && !p.triggered);
  if (mc) {
    mc.stored = (mc.stored || 0) + Math.round(gain * 0.40);
    updateActiveProjectsHud();
  }
}

/** Scale an elite burst by Echo Beacon multiplier (if active). */
export function applyEchoBeaconEliteBoost(baseBurst) {
  if (projectState.echoBeaconEliteMult && !G.activeProjects?.find(p => p.id === 'echo_beacon')?.triggered) {
    return Math.round(baseBurst * projectState.echoBeaconEliteMult);
  }
  return baseBurst;
}

/** Consume the Backbone Relay boss-counter bonus (one-shot). */
export function applyBackboneRelayBossBonus() {
  if (projectState.backboneRelayBossBonus) {
    const bonus = 18;
    G.energy += bonus;
    projectState.backboneRelayBossBonus = false;
    const lang = getLang();
    showToast('◈ RELAY-KONTER', lang === 'de' ? `+${bonus}⬡ Backbone-Relay-Bonus` : `+${bonus}⬡ Backbone Relay bonus`, 2200);
    updateActiveProjectsHud();
  }
}

/** Scale a discharge burst by Memory Cache efficiency (15 % bonus when active). */
export function applyMemoryCacheDischargeBonus(discharge) {
  return projectState.memoryCacheActive ? Math.round(discharge * 1.15) : discharge;
}

/** Return the Echo Beacon rare-chain probability bonus (0 if not active). */
export function getEchoBeaconRareBonus() {
  return projectState.echoBeaconRareBonus || 0;
}
