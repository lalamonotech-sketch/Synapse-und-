/**
 * SYNAPSE v99 — Phase 2 · Sektor-Variablen
 * (Progressive-UI hooks now embedded — no separate phase2UI module needed
 *  for the sector badge.)
 *
 * Each run rolls one sector modifier that lasts the whole run. Sectors
 * influence energy, cooldowns, signal noise and specific gameplay knobs.
 *
 * Public API:
 *   rollSectorVariable()      — call on run start (returns id)
 *   restoreSectorVariable(id) — call on continueRun() (silent restore)
 *   resetSectorVariable()     — return to null_zone
 *   activeSector()            — read the active sector definition
 *   getSectorMod(key)         — read a single mod value
 *   showSectorToast()         — fire the announcement (skipped for null_zone)
 *   getSectorId()             — accessor for save system
 *
 * Progressive-UI body classes / DOM driven by this module:
 *   .sector-active                          — set whenever sector ≠ null_zone
 *   #sector-badge.sector-<theme>            — colour theme on the chip
 *   data-sector="<id>"                      — global selector hook
 */

import { showToast }  from '../ui/hud/index.js';
import { getLang }    from '../state/settings.js';
import { metaState }  from '../state/metaState.js';

// ── Sektor-Definitionen ────────────────────────────────────────────────────

export const SECTOR_DEFS = {
  null_zone:   { id:'null_zone',   label:{de:'Nullzone',en:'Null Zone'},          icon:'○', color:'#8899aa', weight:1.2,  theme:null,           desc:{de:'Neutrale Bedingungen. Keine Modifikatoren.',en:'Neutral conditions. No modifiers.'}, mods:{} },
  inferno:     { id:'inferno',     label:{de:'Inferno-Sektor',en:'Inferno Sector'},icon:'⬡', color:'#ff6a30', weight:1.0,  theme:'corrupted',    desc:{de:'Energie +25%, Pulse schneller (−15%), aber Captures −30%.',en:'Energy +25%, pulse faster (−15%), but captures −30%.'}, mods:{ energyMult:1.25, pulseCdMult:0.85, captureBonusMult:0.70 } },
  deadzone:    { id:'deadzone',    label:{de:'Totzone',en:'Dead Zone'},           icon:'◇', color:'#6a7a8a', weight:1.0,  theme:'corrupted',    desc:{de:'Passive Energie −25%, Training günstiger (−30%), Memory ×1.4.',en:'Passive energy −25%, training cheaper (−30%), memory ×1.4.'}, mods:{ energyMult:0.75, trainCostMult:0.70, memoryMult:1.40 } },
  surge_field: { id:'surge_field', label:{de:'Surge-Feld',en:'Surge Field'},      icon:'↑', color:'#30ddaa', weight:0.85, theme:'resonance',    desc:{de:'Combo-Aufbau +20%, Combo-Verfall −40%. Synergiert mit Predator-Pfad.',en:'Combo gain +20%, combo decay −40%. Synergizes with Predator path.'}, mods:{ comboGainMult:1.20, comboDecayMult:0.60 } },
  static_fog:  { id:'static_fog',  label:{de:'Statik-Nebel',en:'Static Fog'},     icon:'~', color:'#a0a0cc', weight:0.85, theme:'resonance',    desc:{de:'Sync-Windows −1s kürzer, aber fehlgeschlagene Pulses geben +2⬡ zurück.',en:'Sync windows −1s shorter, but missed pulses return +2⬡.'}, mods:{ syncWindowDelta:-1.0, missedPulseReturn:2 } },
  deep_core:   { id:'deep_core',   label:{de:'Tiefenkern',en:'Deep Core'},        icon:'◈', color:'#50c0ff', weight:0.80, theme:'data-ocean',   desc:{de:'L3-Passiv +35%, aber L2-Bridge-Reward −1⬡. Synergiert mit Architect-Pfad.',en:'L3 passive +35%, but L2 bridge reward −1⬡. Synergizes with Architect path.'}, mods:{ l3PassiveMult:1.35, l2BridgeRewardDelta:-1 } },
};

// ── Interner State ─────────────────────────────────────────────────────────

let _activeSectorId = 'null_zone';
let _sectorBadgeEl  = null;

// ── Public API ─────────────────────────────────────────────────────────────

export function activeSector() {
  return SECTOR_DEFS[_activeSectorId] || SECTOR_DEFS.null_zone;
}

export function getSectorMod(key) {
  const mods = activeSector().mods || {};
  if (key in mods) return mods[key];
  const DEFAULTS = {
    energyMult:1.0, pulseCdMult:1.0, captureBonusMult:1.0, trainCostMult:1.0,
    memoryMult:1.0, comboGainMult:1.0, comboDecayMult:1.0, syncWindowDelta:0,
    missedPulseReturn:0, l3PassiveMult:1.0, l2BridgeRewardDelta:0,
  };
  return DEFAULTS[key] ?? null;
}

export function rollSectorVariable() {
  const isVeteran = (metaState?.totalRuns || 0) > 0;
  const pool = [];
  for (const [id, def] of Object.entries(SECTOR_DEFS)) {
    const w = (isVeteran && id === 'null_zone') ? def.weight * 0.5 : def.weight;
    for (let i = 0; i < Math.round(w * 10); i++) pool.push(id);
  }
  _activeSectorId = pool[Math.floor(Math.random() * pool.length)];
  _applyBodyClass();
  _renderBadge();
  _persistToWindow();
  return _activeSectorId;
}

export function restoreSectorVariable(id) {
  if (!SECTOR_DEFS[id]) return;
  _activeSectorId = id;
  _applyBodyClass();
  _renderBadge();
  _persistToWindow();
}

export function resetSectorVariable() {
  _activeSectorId = 'null_zone';
  _applyBodyClass();
  _renderBadge();
  _persistToWindow();
}

let _sectorToastTimer = null;
export function showSectorToast() {
  // P3 Fix 5.1 — Debounce 250ms so rapid sector changes don't stack toasts
  if (_sectorToastTimer) { clearTimeout(_sectorToastTimer); }
  _sectorToastTimer = setTimeout(() => {
    _sectorToastTimer = null;
    const lang = getLang();
    const def  = activeSector();
    _renderBadge();
    if (def.id === 'null_zone') return;
    const label = def.label[lang] || def.label.en;
    const desc  = def.desc[lang]  || def.desc.en;
    try { showToast(`${def.icon} ${label}`, desc, 2200); } catch(_) {}
  }, 250);
}

export function getSectorId() { return _activeSectorId; }

/** Backward-compatible aliases for existing call-sites. */
export function initSectorUI()    { _ensureBadge(); _renderBadge(); }
export function refreshSectorUI() { _renderBadge(); }

// ── Progressive-UI / DOM hooks ─────────────────────────────────────────────

function _ensureBadge() {
  _sectorBadgeEl = document.getElementById('sector-badge');
  if (_sectorBadgeEl) {
    // index.html may pre-render an empty shell; populate it if needed.
    if (!_sectorBadgeEl.querySelector('.sector-icon')) {
      _sectorBadgeEl.innerHTML = `
        <span class="sector-icon"  aria-hidden="true">○</span>
        <span class="sector-label-text"></span>
      `;
    }
    return _sectorBadgeEl;
  }

  // Mount target: next to #phase-name in the topbar centre column. The
  // progressive-ui CSS expects #sector-badge as a small chip there.
  const phaseRow = document.getElementById('phase-name-row')
                || document.getElementById('phase-name')?.parentNode
                || document.getElementById('hud-center');
  if (!phaseRow) return null;

  const el = document.createElement('span');
  el.id = 'sector-badge';
  el.innerHTML = `
    <span class="sector-icon"  aria-hidden="true">○</span>
    <span class="sector-label-text"></span>
  `;
  phaseRow.appendChild(el);
  _sectorBadgeEl = el;
  return el;
}

function _renderBadge() {
  const el = _ensureBadge();
  if (!el) return;
  const def  = activeSector();
  const lang = getLang();
  const isActive = def.id !== 'null_zone';

  el.querySelector('.sector-icon').textContent       = def.icon;
  el.querySelector('.sector-label-text').textContent = (def.label[lang] || def.label.en).toUpperCase();
  el.title = (def.desc[lang] || def.desc.en);

  // Reset theme classes, then apply the active one.
  el.classList.remove('sector-corrupted', 'sector-resonance', 'sector-data-ocean');
  if (def.theme) el.classList.add(`sector-${def.theme}`);

  document.body.classList.toggle('sector-active', isActive);
}

function _applyBodyClass() {
  document.body.dataset.sector = _activeSectorId;
}

function _persistToWindow() {
  window.__synActiveSector = _activeSectorId;
}

// ── Self-install so DOM nodes exist before first render ───────────────────
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { _ensureBadge(); _renderBadge(); }, { once: true });
  } else {
    queueMicrotask(() => { _ensureBadge(); _renderBadge(); });
  }
}
