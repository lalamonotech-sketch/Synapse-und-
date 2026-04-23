/**
 * SYNAPSE v99 — Phase 2 · Draft-Synergien
 *
 * Dieses Modul erkennt Upgrade-Kombinationen (Synergy-Sets) und löst
 * passive Boni aus, wenn ein Spieler 2+ Upgrades einer Synergy-Gruppe besitzt.
 *
 * Design-Prinzipien:
 *  - Synergien sind NICHT kommuniziert bis sie aktiv sind (Entdeckungs-Prinzip)
 *  - Sie verbleiben aktiv für den gesamten Run; kein Verfall
 *  - Boni sind multiplikativ mit bestehenden Modifikatoren, nicht additiv
 *  - Jede Synergy hat 2 Stufen: Teilsatz (2 von N) und Vollsatz (alle N)
 *
 * Synergy-Sets:
 *  iron_fist       — predator_blitz + predator_chain + predator_overcharge
 *                    2er: Pulse-CD −10% zusätzlich
 *                    3er: Chain-Capture Cooldown halbiert
 *
 *  signal_architect — architect_backbone + architect_spine + architect_quantum_spine
 *                    2er: Spine-Yields +15%
 *                    3er: Backbone-Links geben passive +1⬡/s
 *
 *  memory_palace   — mnemonic_flood + mnemonic_echo + mnemonic_echo_chamber
 *                    2er: Memory-Multiplier +0.15
 *                    3er: Echo-Chamber-Effekt auf 60% statt 40%
 *
 *  deep_observer   — analyst_bridge + analyst_geometry + analyst_deep_geometry
 *                    2er: Triangle-Passive-Tick −0.5s (schneller)
 *                    3er: Stabile Links regenerieren sich automatisch nach Bruch
 *
 *  wild_chaos      — wild_precision + wild_elite + wild_cold_loop + wild_hunt_instinct
 *                    2er: Capture-Burst +5⬡
 *                    4er: Jeder 5. Pulse spawnt gratis Shockwave
 *
 * Integration:
 *  - checkDraftSynergies(appliedUpgradeIds) — nach jedem Draft-Pick aufrufen
 *  - getActiveSynergies() — gibt Array aktiver Synergy-IDs zurück
 *  - getSynergyMod(key) — liest akkumulierten Synergy-Modifier
 *  - resetDraftSynergies() — für run-reset
 *  - hasSynergy(id) — utility check
 *
 * Modifier-Keys (getSynergyMod):
 *  pulseCdReduction    — zusätzliche CD-Reduktion (ms, wird von balance.js subtrahiert)
 *  spineYieldMult      — Multiplikator auf Spine-Yield
 *  memMultBonus        — Addend auf TUNING.memoryMultiplier
 *  triTickReduction    — Sekunden-Abzug auf trianglePassiveTick
 *  captureBurstBonus   — Energie-Bonus pro Cluster-Capture
 *  freeShockInterval   — jede N-te Pulse = Gratis-Shockwave (0 = aus)
 *  chainCaptureCdHalf  — true = chainCaptureCd halbiert
 *  backbonePassive     — ⬡/s pro aktivem Backbone-Link
 *  echoChamberStrength — Stärke des Echo-Chamber-Effekts (0.0–1.0)
 *  linkAutoRegenerate  — true = stabile Links regen sich nach Bruch
 */

import { TUNING }    from '../state/tuning.js';
import { showToast } from '../ui/hud/index.js';
import { getLang }   from '../state/settings.js';

// ── Synergy-Definitionen ───────────────────────────────────────────────────

const SYNERGY_DEFS = [
  {
    id:       'iron_fist',
    label:    { de: 'Eiserne Faust',    en: 'Iron Fist'         },
    icon:     '⚡',
    requires: ['predator_blitz', 'predator_chain', 'predator_overcharge'],
    tiers: [
      {
        count: 2,
        label: { de: 'Eiserne Faust II', en: 'Iron Fist II' },
        desc:  { de: 'Pulse-CD −10% zusätzlich.',            en: 'Pulse CD −10% additional.' },
        mods:  { pulseCdReduction: 850 },  // 850ms bei 8500ms base ≈ 10%
      },
      {
        count: 3,
        label: { de: 'Eiserne Faust FULL', en: 'Iron Fist FULL' },
        desc:  { de: 'Chain-Capture Cooldown halbiert.',       en: 'Chain capture cooldown halved.' },
        mods:  { pulseCdReduction: 850, chainCaptureCdHalf: true },
      },
    ],
  },
  {
    id:       'signal_architect',
    label:    { de: 'Signal-Architekt',  en: 'Signal Architect'  },
    icon:     '◈',
    requires: ['architect_backbone', 'architect_spine', 'architect_quantum_spine'],
    tiers: [
      {
        count: 2,
        label: { de: 'Signal-Architekt II',   en: 'Signal Architect II'   },
        desc:  { de: 'Spine-Ertrag +15%.',     en: 'Spine yield +15%.'     },
        mods:  { spineYieldMult: 1.15 },
      },
      {
        count: 3,
        label: { de: 'Signal-Architekt FULL', en: 'Signal Architect FULL' },
        desc:  { de: 'Backbone-Links: +1⬡/s passiv.',  en: 'Backbone links: +1⬡/s passive.' },
        mods:  { spineYieldMult: 1.15, backbonePassive: 1.0 },
      },
    ],
  },
  {
    id:       'memory_palace',
    label:    { de: 'Gedächtnispalast',  en: 'Memory Palace'     },
    icon:     '◉',
    requires: ['mnemonic_flood', 'mnemonic_echo', 'mnemonic_echo_chamber'],
    tiers: [
      {
        count: 2,
        label: { de: 'Gedächtnispalast II',   en: 'Memory Palace II'   },
        desc:  { de: 'Memory-Multiplikator +0.15.', en: 'Memory multiplier +0.15.' },
        mods:  { memMultBonus: 0.15 },
      },
      {
        count: 3,
        label: { de: 'Gedächtnispalast FULL', en: 'Memory Palace FULL' },
        desc:  { de: 'Echo-Chamber-Effekt 60% statt 40%.', en: 'Echo chamber effect 60% instead of 40%.' },
        mods:  { memMultBonus: 0.15, echoChamberStrength: 0.60 },
      },
    ],
  },
  {
    id:       'deep_observer',
    label:    { de: 'Tief-Beobachter',   en: 'Deep Observer'     },
    icon:     '⊙',
    requires: ['analyst_bridge', 'analyst_geometry', 'analyst_deep_geometry'],
    tiers: [
      {
        count: 2,
        label: { de: 'Tief-Beobachter II',   en: 'Deep Observer II'   },
        desc:  { de: 'Triangle-Tick −0.5s schneller.',  en: 'Triangle tick −0.5s faster.' },
        mods:  { triTickReduction: 0.5 },
      },
      {
        count: 3,
        label: { de: 'Tief-Beobachter FULL', en: 'Deep Observer FULL' },
        desc:  { de: 'Stabile Links regenerieren sich nach Bruch.', en: 'Stable links regenerate after breaking.' },
        mods:  { triTickReduction: 0.5, linkAutoRegenerate: true },
      },
    ],
  },
  {
    id:       'wild_chaos',
    label:    { de: 'Wildes Chaos',      en: 'Wild Chaos'        },
    icon:     '★',
    requires: ['wild_precision', 'wild_elite', 'wild_cold_loop', 'wild_hunt_instinct'],
    tiers: [
      {
        count: 2,
        label: { de: 'Wildes Chaos II',   en: 'Wild Chaos II'   },
        desc:  { de: 'Capture-Burst +5⬡.',  en: 'Capture burst +5⬡.' },
        mods:  { captureBurstBonus: 5 },
      },
      {
        count: 4,
        label: { de: 'Wildes Chaos FULL', en: 'Wild Chaos FULL' },
        desc:  { de: 'Jeder 5. Pulse = Gratis-Shockwave.',  en: 'Every 5th pulse = free shockwave.' },
        mods:  { captureBurstBonus: 5, freeShockInterval: 5 },
      },
    ],
  },
];

// ── Interner State ─────────────────────────────────────────────────────────

let _activeSynergies  = new Set();   // Set von Synergy-IDs (auf aktuellem Tier)
let _synergyTiers     = {};          // { iron_fist: 2, ... }
let _accMods          = {};          // akkumulierte Modifier aller aktiven Synergien

// ── Public API ─────────────────────────────────────────────────────────────

export function getActiveSynergies()  { return [..._activeSynergies]; }
export function hasSynergy(id)        { return _activeSynergies.has(id); }
export function getSynergyTier(id)    { return _synergyTiers[id] || 0; }

/**
 * Liest einen akkumulierten Modifier.
 * Gibt 0 / false / 1.0 als Defaults zurück.
 */
export function getSynergyMod(key) {
  if (key in _accMods) return _accMods[key];
  // Typ-sichere Defaults
  const BOOL_KEYS = ['chainCaptureCdHalf', 'linkAutoRegenerate'];
  if (BOOL_KEYS.includes(key)) return false;
  const MULT_KEYS = ['spineYieldMult'];
  if (MULT_KEYS.includes(key)) return 1.0;
  return 0;
}

/**
 * Hauptfunktion — nach jedem Draft-Pick aufrufen.
 * appliedUpgradeIds: Array aller bisher gewählten Upgrade-IDs.
 *
 * Gibt Array neu aktivierter Synergy-Labels zurück (für externe Notification).
 */
export function checkDraftSynergies(appliedUpgradeIds) {
  const ids  = new Set(appliedUpgradeIds);
  const news = [];

  for (const syn of SYNERGY_DEFS) {
    const have    = syn.requires.filter(id => ids.has(id)).length;
    const prevTier = _synergyTiers[syn.id] || 0;

    // Höchstes erreichtes Tier ermitteln
    let newTier = 0;
    for (const tier of [...syn.tiers].reverse()) {
      if (have >= tier.count) { newTier = tier.count; break; }
    }

    if (newTier > prevTier) {
      _synergyTiers[syn.id] = newTier;
      _activeSynergies.add(syn.id);
      const tierDef = syn.tiers.find(t => t.count === newTier);
      news.push({ syn, tierDef });
      _applyTierMods(syn.id, newTier, syn.tiers);
    }
  }

  if (news.length > 0) {
    _notifySynergies(news);
    _applyToTuning();
  }

  return news.map(n => n.syn.id);
}

/**
 * Reset beim Run-Start.
 */
export function resetDraftSynergies() {
  _activeSynergies.clear();
  _synergyTiers  = {};
  _accMods       = {};
}

// ── Interne Hilfsfunktionen ────────────────────────────────────────────────

function _applyTierMods(synId, tierCount, tiers) {
  // Immer die höchsten Mods des aktuellen Tiers nehmen (kumulativ in tierDef)
  const tierDef = tiers.find(t => t.count === tierCount);
  if (!tierDef) return;

  // Bestehende Mods dieser Synergy entfernen und neu setzen
  // (Einfachheit: wir akkumulieren über alle aktiven Synergien neu)
  _recomputeAccMods();
}

function _recomputeAccMods() {
  const fresh = {};

  for (const syn of SYNERGY_DEFS) {
    const tier = _synergyTiers[syn.id] || 0;
    if (tier === 0) continue;
    const tierDef = syn.tiers.find(t => t.count === tier);
    if (!tierDef) continue;

    for (const [key, val] of Object.entries(tierDef.mods)) {
      if (typeof val === 'boolean') {
        fresh[key] = fresh[key] || val;
      } else if (typeof val === 'number') {
        fresh[key] = (fresh[key] || 0) + val;
      }
    }
  }

  _accMods = fresh;
}

/**
 * Wendet Modifier direkt auf TUNING an (für Werte die TUNING lesen).
 * Nur additive Werte — keine Multiplikatoren auf TUNING direkt.
 */
function _applyToTuning() {
  if (_accMods.memMultBonus) {
    // TUNING.memoryMultiplier baseline ist von resetTuning() gesetzt.
    // Wir addieren on-top — wird bei nächstem Reset bereinigt.
    TUNING.memoryMultiplier = Math.max(1.0, TUNING.memoryMultiplier + (_accMods.memMultBonus || 0));
  }
  if (_accMods.triTickReduction) {
    TUNING.trianglePassiveTick = Math.max(1.0, TUNING.trianglePassiveTick - (_accMods.triTickReduction || 0));
  }
}

function _notifySynergies(news) {
  const lang = getLang();
  // Nur letzte Synergy als Toast (mehrere gleichzeitig sind selten)
  const last    = news[news.length - 1];
  const label   = last.syn.label[lang]        || last.syn.label.en;
  const tierLbl = last.tierDef.label[lang]    || last.tierDef.label.en;
  const desc    = last.tierDef.desc[lang]     || last.tierDef.desc.en;

  try {
    showToast(`${last.syn.icon} SYNERGIE · ${tierLbl}`, desc, 2500);
  } catch(_) {}

  // body-Klasse für Kurz-Glow
  document.body.classList.add('synergy-unlock');
  setTimeout(() => document.body.classList.remove('synergy-unlock'), 1800);
}
