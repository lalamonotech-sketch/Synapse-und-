/**
 * SYNAPSE v99 — Phase 2 · Tactical Pulse Modes
 * (Progressive-UI hooks now embedded — no separate phase2UI module needed
 *  for the pulse-mode flyout badge.)
 *
 * Three selectable pulse modes that fundamentally change doPulse() behaviour.
 * Each mode has cost/CD multipliers, a capture bonus, and a visual
 * fingerprint (body[data-pulse-mode]).
 *
 * Public API:
 *   activePulseMode() / isPulseFocusMode() / isPulseScatterMode()
 *   getPulseModeMult()        — { costMult, cdMult, captureBonus, scatterShocks }
 *   setPulseMode(id)          — instant switch (no cooldown)
 *   cyclePulseMode()          — standard → focus → scatter → standard
 *   resetPulseMode()          — back to standard (run reset)
 *   initPulseModeUI()         — kept for backward compatibility
 *   refreshPulseModeUI()      — kept for backward compatibility
 *
 * Progressive-UI body classes / DOM driven by this module:
 *   .pulse-mode-active                      — set whenever mode ≠ standard
 *   data-pulse-mode="<id>"                  — global selector hook
 *   #pulse-mode-badge.mode-<id>             — flyout chip above the pulse btn
 */

import { showToast } from '../ui/hud/index.js';
import { getLang }   from '../state/settings.js';

// ── Mode-Definitionen ──────────────────────────────────────────────────────

export const PULSE_MODE_DEFS = {
  standard: {
    id:'standard', label:{de:'Standard-Puls',en:'Standard Pulse'}, shortLabel:{de:'STD',en:'STD'},
    icon:'⚡', costMult:1.0, cdMult:1.0,  captureBonus:0, scatterShocks:0, comboEnabled:true,
    desc:{ de:'Normaler Puls. Kein Bonus, keine Einschränkung.', en:'Normal pulse. No bonus, no restriction.' },
  },
  focus: {
    id:'focus',    label:{de:'Fokus-Puls',en:'Focus Pulse'},      shortLabel:{de:'FOC',en:'FOC'},
    icon:'◎', costMult:1.7, cdMult:0.65, captureBonus:8, scatterShocks:0, comboEnabled:true,
    desc:{ de:'Hochenergie-Fokus. Kosten ×1.7, Cooldown −35%, +8⬡ Capture-Bonus.',
           en:'High-energy focus. Cost ×1.7, cooldown −35%, +8⬡ capture bonus.' },
  },
  scatter: {
    id:'scatter',  label:{de:'Streufeuer',en:'Scatter Pulse'},    shortLabel:{de:'SCT',en:'SCT'},
    icon:'⟡', costMult:0.6, cdMult:1.6,  captureBonus:0, scatterShocks:2, comboEnabled:false,
    desc:{ de:'Billiger, aber langsam und ohne Combo. Erzeugt 2 Mini-Shocks.',
           en:'Cheap but slow and no combo. Spawns 2 mini-shocks.' },
  },
};

// ── Interner State ─────────────────────────────────────────────────────────

let _currentMode = 'standard';
let _badgeEl     = null;

// ── Public API ─────────────────────────────────────────────────────────────

export function activePulseMode()    { return _currentMode; }
export function isPulseFocusMode()   { return _currentMode === 'focus';   }
export function isPulseScatterMode() { return _currentMode === 'scatter'; }

export function getPulseModeMult() {
  return PULSE_MODE_DEFS[_currentMode] || PULSE_MODE_DEFS.standard;
}

export function setPulseMode(id) {
  if (!PULSE_MODE_DEFS[id]) {
    console.warn('[PulseMode] Unbekannter Modus:', id);
    return;
  }
  _currentMode = id;
  _applyBodyClass();
  _renderBadge();
  _showModeToast();
}

export function cyclePulseMode() {
  const order = ['standard', 'focus', 'scatter'];
  const idx   = order.indexOf(_currentMode);
  setPulseMode(order[(idx + 1) % order.length]);
}

export function resetPulseMode() {
  _currentMode = 'standard';
  _applyBodyClass();
  _renderBadge();
}

/** Backward-compatible aliases for existing call-sites. */
export function initPulseModeUI()    { _ensureBadge(); _renderBadge(); }
export function refreshPulseModeUI() { _renderBadge(); }

// ── Progressive-UI / DOM hooks ─────────────────────────────────────────────

function _ensureBadge() {
  _badgeEl = document.getElementById('pulse-mode-badge');
  if (_badgeEl) return _badgeEl;

  // Mount target: inside #pulse-cd-wrap so the flyout sits directly above the
  // pulse button (the progressive-ui CSS positions it absolutely from there).
  const host = document.getElementById('pulse-cd-wrap')
            || document.getElementById('btn-pulse')?.parentNode
            || document.getElementById('dock-action-zone');
  if (!host) return null;

  // Promote host so the absolutely-positioned badge anchors correctly.
  if (host.id !== 'pulse-cd-wrap') {
    const cs = getComputedStyle(host);
    if (cs.position === 'static') host.style.position = 'relative';
  }

  const el = document.createElement('span');
  el.id = 'pulse-mode-badge';
  el.setAttribute('aria-hidden', 'true');
  host.appendChild(el);
  _badgeEl = el;
  return el;
}

function _renderBadge() {
  const el = _ensureBadge();
  if (!el) return;
  const def  = PULSE_MODE_DEFS[_currentMode];
  const lang = getLang();
  const isActive = _currentMode !== 'standard';

  el.textContent  = `${def.icon} ${def.shortLabel[lang] || def.shortLabel.en}`;
  el.dataset.mode = _currentMode;
  el.title        = def.desc[lang] || def.desc.en;

  // Reset mode classes, apply current.
  el.classList.remove('mode-standard', 'mode-focus', 'mode-scatter', 'mode-burst', 'mode-snipe');
  el.classList.add(`mode-${_currentMode}`);

  document.body.classList.toggle('pulse-mode-active', isActive);
}

function _applyBodyClass() {
  document.body.dataset.pulseMode = _currentMode;
}

function _showModeToast() {
  const lang = getLang();
  const def  = PULSE_MODE_DEFS[_currentMode];
  const label = def.label[lang] || def.label.en;
  const desc  = def.desc[lang]  || def.desc.en;
  try { showToast(`${def.icon} ${label.toUpperCase()}`, desc, 1400); } catch(_) {}
}

// ── Self-install so DOM nodes exist before first render ───────────────────
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { _ensureBadge(); _renderBadge(); }, { once: true });
  } else {
    queueMicrotask(() => { _ensureBadge(); _renderBadge(); });
  }
}
