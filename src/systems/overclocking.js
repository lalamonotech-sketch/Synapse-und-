/**
 * SYNAPSE v99 — Phase 3: Overclocking & Heat System
 * (Progressive-UI hooks now embedded — no separate phase3UI module needed.)
 *
 * Public API:
 *   initOverclock()           — call once per run (mounts UI + resets state)
 *   resetOverclock()          — alias for init (run-reset path)
 *   toggleOverclock()         — bound to dock #btn-overclock and the [O] hotkey
 *   updateHeat(dt)            — call every frame from gameLoop._gameUpdate
 *   getIncomeMultiplier()     — read by economy / heartbeat
 *   coolDownBySacrifice(v)    — call from the node-sacrifice path
 *   getHeatLevel() / isOverclocked() / isBrownoutActive()
 *
 * Progressive-UI body classes driven by this module:
 *   .overclock-unlocked   — permanent after first toggle (reveals dock button)
 *   .overclock-active     — while OC is on (reveals heat bar + dock highlight)
 *   .heat-warning         — heat > 50% (warm tint on dock button)
 *   .brownout-active      — set while a brownout is in progress
 */

import { showToast }    from '../ui/hud/index.js';
import { getLang }      from '../state/settings.js';
import { setNodeScaleX } from '../ui/hud/_domCache.js';

// ── Module state ──────────────────────────────────────────────────────────

let _isOverclocked  = false;
let _heatLevel      = 0;          // 0–100
let _brownoutActive = false;
let _everTouched    = false;      // permanently unlocks the dock button

const MAX_HEAT           = 100;
const BROWNOUT_THRESHOLD = 85;    // brownout triggers at 85 %
const HEAT_RISE_RATE     = 15;    // units / second while OC on
const HEAT_DECAY_RATE    = 5;     // units / second while OC off
const HEAT_WARNING_PCT   = 50;    // body.heat-warning above this threshold

// DOM refs are populated lazily by _ensureUI()
let _btnOverclock = null;
let _heatBarWrap  = null;
let _heatBarFill  = null;
let _statusEl     = null;

// ── Public API ─────────────────────────────────────────────────────────────

/** Called once at the beginning of every run. */
export function initOverclock() {
  _isOverclocked  = false;
  _heatLevel      = 0;
  _brownoutActive = false;
  _everTouched    = false;
  document.body.classList.remove(
    'overclock-active', 'brownout-active', 'heat-warning', 'overclock-unlocked',
  );
  _ensureUI();
  _syncBodyClasses();
  _renderHeatBar();
  _renderButton();
}

/** Alias for the reset path (same as init). */
export const resetOverclock = initOverclock;

/** Toggle overclock on / off. Blocked while a brownout is active. */
export function toggleOverclock() {
  if (_brownoutActive) {
    const lang = getLang();
    showToast(
      lang === 'de' ? 'SYSTEMFEHLER' : 'SYSTEM ERROR',
      lang === 'de'
        ? 'Übertakten während Brownout gesperrt!'
        : 'Overclocking blocked during brownout!',
      2200,
    );
    return;
  }

  _isOverclocked = !_isOverclocked;

  // Permanent unlock on first ever use → reveals dock button.
  if (!_everTouched) {
    _everTouched = true;
    document.body.classList.add('overclock-unlocked');
    _ensureUI();
    if (_btnOverclock) {
      _btnOverclock.classList.add('just-unlocked');
      setTimeout(() => _btnOverclock?.classList.remove('just-unlocked'), 800);
    }
  }

  _syncBodyClasses();
  _renderButton();

  const lang = getLang();
  showToast(
    _isOverclocked
      ? (lang === 'de' ? '⚡ ÜBERTAKTUNG AKTIV'  : '⚡ OVERCLOCK ACTIVE')
      : (lang === 'de' ? '— ÜBERTAKTUNG INAKTIV' : '— OVERCLOCK OFF'),
    _isOverclocked
      ? (lang === 'de' ? '2.5× Einnahmen · Hitze steigt' : '2.5× income · heat rising')
      : (lang === 'de' ? 'System kühlt ab'               : 'System cooling down'),
    1200,
  );
}

/** Income multiplier consumed by economy / heartbeat systems. */
export function getIncomeMultiplier() {
  if (_brownoutActive) return 0.1;
  if (_isOverclocked)  return 2.5;
  return 1.0;
}

/** Called every frame from gameLoop._gameUpdate. */
export function updateHeat(deltaTime) {
  if (_isOverclocked) {
    _heatLevel += HEAT_RISE_RATE * deltaTime;
  } else {
    _heatLevel -= HEAT_DECAY_RATE * deltaTime;
  }

  _heatLevel = Math.max(0, Math.min(_heatLevel, MAX_HEAT));

  if (_heatLevel >= BROWNOUT_THRESHOLD && !_brownoutActive) _triggerBrownout();
  if (_brownoutActive && !_isOverclocked && _heatLevel < 40)  _liftBrownout();

  // Throttle DOM writes — only animate while UI matters.
  if (_everTouched) {
    _renderHeatBar();
    _syncHeatWarningClass();
  }
}

/** Cool the system by sacrificing a node. Returns true if brownout was lifted. */
export function coolDownBySacrifice(nodeValue = 1) {
  const reduction = nodeValue * 10;
  _heatLevel = Math.max(0, _heatLevel - reduction);
  if (_brownoutActive && _heatLevel < 40) {
    _liftBrownout();
    return true;
  }
  return false;
}

/** Read-only accessors used by HUD / diagnostics. */
export function getHeatLevel()     { return _heatLevel; }
export function isOverclocked()    { return _isOverclocked; }
export function isBrownoutActive() { return _brownoutActive; }

// ── Progressive-UI bootstrap (the embedded "phase3UI") ────────────────────

/** Public alias retained for backward compatibility with main.js / phase3UI.js. */
export function initOverclockUI() { _ensureUI(); _renderHeatBar(); _renderButton(); }
export function refreshOverclockUI() { _renderHeatBar(); _renderButton(); }

function _ensureUI() {
  _ensureDockButton();
  _ensureHeatBar();
}

function _ensureDockButton() {
  _btnOverclock = document.getElementById('btn-overclock');
  if (_btnOverclock) {
    if (!_btnOverclock._ocBound) {
      _btnOverclock.addEventListener('click', _handleClick);
      _btnOverclock._ocBound = true;
    }
    return;
  }

  // Mount target: action zone of the dock (CSS expects #btn-overclock there).
  const host = document.getElementById('dock-action-zone')
            || document.getElementById('ctrl-dock');
  if (!host) return;

  const btn = document.createElement('button');
  btn.id        = 'btn-overclock';
  btn.type      = 'button';
  btn.className = 'dock-btn dock-btn-epoch';
  btn.title     = 'Overclock [O]';
  btn.setAttribute('aria-label',  'Toggle Overclocking [O]');
  btn.setAttribute('aria-pressed', 'false');
  btn.innerHTML = '<span class="dock-btn-icon">☢</span>';
  btn.addEventListener('click', _handleClick);
  btn._ocBound = true;
  host.appendChild(btn);
  _btnOverclock = btn;
}

function _ensureHeatBar() {
  _heatBarWrap = document.getElementById('heat-bar-wrap');
  _heatBarFill = document.getElementById('heat-bar-fill');
  _statusEl    = document.getElementById('overclock-status');
  if (_heatBarWrap && _heatBarFill) return;

  // Mount target: directly under the topbar progress bar (#prog-wrap),
  // so the bar appears as a 2 px hairline without claiming new vertical space.
  const progWrap = document.getElementById('prog-wrap');
  const progRow  = document.getElementById('hud-prog-row') || progWrap?.parentNode;
  if (!progRow) return;

  const wrap = document.createElement('div');
  wrap.id = 'heat-bar-wrap';
  // P3 Fix 5.2 — ARIA progressbar for screen readers
  wrap.setAttribute('role',           'progressbar');
  wrap.setAttribute('aria-label',     'Overclock heat level');
  wrap.setAttribute('aria-valuenow',  '0');
  wrap.setAttribute('aria-valuemin',  '0');
  wrap.setAttribute('aria-valuemax',  '100');
  const fill = document.createElement('div');
  fill.id = 'heat-bar-fill';
  wrap.appendChild(fill);

  if (progWrap && progWrap.nextSibling) {
    progRow.insertBefore(wrap, progWrap.nextSibling);
  } else {
    progRow.appendChild(wrap);
  }
  _heatBarWrap = wrap;
  _heatBarFill = fill;
}

function _handleClick(e) {
  e.stopPropagation();
  toggleOverclock();
}

function _renderButton() {
  if (!_btnOverclock) return;
  _btnOverclock.classList.toggle('oc-active', _isOverclocked);
  _btnOverclock.setAttribute('aria-pressed', String(_isOverclocked));
}

function _renderHeatBar() {
  if (!_heatBarFill) return;
  setNodeScaleX(_heatBarFill, _heatLevel / 100); // GPU scaleX statt style.width (kein Layout-Reflow)
  // P3 Fix 5.2 — keep aria-valuenow in sync
  _heatBarWrap?.setAttribute('aria-valuenow', String(Math.round(_heatLevel)));
  _heatBarFill.classList.toggle('heat-critical', _heatLevel > 70);
  if (_statusEl) {
    const lang = getLang();
    if (_brownoutActive)        _statusEl.textContent = lang === 'de' ? '🔴 BROWNOUT' : '🔴 BROWNOUT';
    else if (_isOverclocked)    _statusEl.textContent = lang === 'de' ? '⚡ OC AKTIV' : '⚡ OC ACTIVE';
    else                        _statusEl.textContent = lang === 'de'
        ? `Hitze ${Math.round(_heatLevel)}%`
        : `Heat ${Math.round(_heatLevel)}%`;
  }
}

function _syncHeatWarningClass() {
  document.body.classList.toggle('heat-warning', _heatLevel > HEAT_WARNING_PCT && !_brownoutActive);
}

function _syncBodyClasses() {
  document.body.classList.toggle('overclock-active', _isOverclocked);
  document.body.classList.toggle('brownout-active',  _brownoutActive);
  if (_everTouched) document.body.classList.add('overclock-unlocked');
  _syncHeatWarningClass();
}

function _triggerBrownout() {
  _brownoutActive = true;
  _isOverclocked  = false;
  _syncBodyClasses();
  _renderButton();

  const lang = getLang();
  showToast(
    lang === 'de' ? '🔴 KATASTROPHALER BROWNOUT' : '🔴 CATASTROPHIC BROWNOUT',
    lang === 'de'
      ? 'Netzwerk überhitzt! Nodes opfern oder abwarten.'
      : 'Network overheated! Sacrifice nodes or wait.',
    3600,
  );
}

function _liftBrownout() {
  _brownoutActive = false;
  _syncBodyClasses();
  _renderButton();

  const lang = getLang();
  showToast(
    lang === 'de' ? '✅ SYSTEM STABILISIERT' : '✅ SYSTEM STABILISED',
    lang === 'de' ? 'Temperatur im Normalbereich.' : 'Temperature back to normal.',
    1800,
  );
}

// ── Self-install (so existing call-sites that import once still get UI) ───
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _ensureUI, { once: true });
  } else {
    queueMicrotask(_ensureUI);
  }
}
