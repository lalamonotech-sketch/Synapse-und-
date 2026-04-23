/**
 * SYNAPSE v100 — Chronos-Shift System (stub)
 *
 * P1 Fix 3.1: progressive-ui.css defines #btn-chronos but it was never
 * mounted in the DOM. This module now owns its lifecycle, mirroring the
 * _ensureUI() pattern from overclocking.js.
 *
 * Feature status: Chronos-Shift is gated behind body.chronos-unlocked.
 * Until the feature is fully implemented, _ensureChronosButton() mounts a
 * hidden stub so CSS selectors find the element, but the button stays
 * invisible (progressive-ui.css keeps it display:none until the class fires).
 */

import { showToast } from '../ui/hud/index.js';
import { getLang } from '../state/settings.js';

// ── Internal refs ──────────────────────────────────────────────────────────

let _btn = null;

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Mount #btn-chronos into the dock (idempotent).
 * Call from boot once DOM is ready.
 */
export function initChronosUI() {
  _ensureChronosButton();
}

/**
 * Unlock the Chronos button. Call when the Chronos-Shift system becomes
 * available (e.g. Epoch III / temporal epoch).
 */
export function unlockChronos() {
  _ensureChronosButton();
  document.body.classList.add('chronos-unlocked'); // triggers CSS reveal
  if (_btn) _btn.classList.add('just-unlocked');
}

// ── Internal ───────────────────────────────────────────────────────────────

function _ensureChronosButton() {
  if (_btn || document.getElementById('btn-chronos')) {
    _btn = _btn || document.getElementById('btn-chronos');
    return;
  }

  // Mount next to #btn-overclock in the dock
  const dock = document.getElementById('ctrl-dock');
  if (!dock) {
    console.warn('[Chronos] Cannot mount btn-chronos — #ctrl-dock not found');
    return;
  }

  const btn = document.createElement('button');
  btn.id        = 'btn-chronos';
  btn.type      = 'button';
  btn.title     = 'Chronos Shift';
  btn.textContent = '⏳';
  btn.addEventListener('click', _handleChronosClick);

  // Insert after #btn-overclock if present, else append
  const overclockBtn = document.getElementById('btn-overclock');
  if (overclockBtn && overclockBtn.nextSibling) {
    dock.insertBefore(btn, overclockBtn.nextSibling);
  } else {
    dock.appendChild(btn);
  }

  _btn = btn;
}

function _handleChronosClick() {
  const lang = getLang();
  showToast(
    lang === 'de' ? '⏳ CHRONOS' : '⏳ CHRONOS',
    lang === 'de' ? 'Chronos Shift ist in diesem Build noch nicht aktiv.' : 'Chronos Shift is not active in this build yet.',
    1800
  );
  document.body.dispatchEvent(new CustomEvent('syn:chronos-shift', { detail: { stub: true } }));
}
