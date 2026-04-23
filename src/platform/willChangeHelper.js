/**
 * SYNAPSE v99 — will-change Helper
 *
 * Setzt will-change auf GPU-kritischen Shell-Elementen dynamisch:
 *   - NUR aktivieren, wenn eine Animation/Transition kurz bevorsteht
 *   - Automatisch entfernen nach animationend / transitionend
 *
 * Warum: Dauerhaftes will-change reserviert VRAM-Layer.
 * iOS Safari tötet Tabs, wenn zu viele Layer permanent gehalten werden
 * (speziell bei langen Sessions mit vielen backdrop-filter-Elementen).
 *
 * Verwendung:
 *   import { primeWillChange, setupWillChangeListeners } from './willChangeHelper.js';
 *
 *   // Kurz vor show/hide einer UI-Schicht:
 *   primeWillChange('#hud', 'transform, opacity');
 *
 *   // Einmalig beim Boot — räumt nach jeder Animation auf:
 *   setupWillChangeListeners();
 */

/** IDs → Eigenschaftsgruppen die wir GPU-hintend hinzufügen */
const SHELL_ELEMENTS = {
  '#hud':           'transform, opacity',
  '#ctrl-dock':     'transform, opacity',
  '#pause-overlay': 'transform, opacity',
  '#ai-hud':        'opacity',
  '#boss-hud':      'opacity, transform',
  '#l3-hud':        'opacity',
};

/** Minimale Vorlaufzeit in ms vor der Animation (damit der Browser die Textur vorbereiten kann) */
const PRIME_LEAD_MS = 80;

/** Timeout-Map: ID → timeoutId (für Cleanup) */
const _timers = new Map();

/**
 * Aktiviert will-change für ein Element, auto-cleanup nach Transition/Animation.
 *
 * @param {string} selector   CSS-Selektor (z.B. '#hud')
 * @param {string} props      will-change-Wert (z.B. 'transform, opacity')
 * @param {number} [leadMs]   Millisekunden Vorlauf vor der Animation
 */
export function primeWillChange(selector, props, leadMs = PRIME_LEAD_MS) {
  const el = document.querySelector(selector);
  if (!el) return;

  // Alten Cleanup-Timer canceln
  const existing = _timers.get(selector);
  if (existing) clearTimeout(existing);

  // Sofort setzen wenn kein Vorlauf nötig
  if (leadMs <= 0) {
    _applyWillChange(el, props, selector);
    return;
  }

  // Mit Vorlauf setzen (Browser kann Layer vorab allozieren)
  const tid = setTimeout(() => {
    _applyWillChange(el, props, selector);
  }, leadMs);
  _timers.set(selector, tid);
}

/**
 * Entfernt will-change von einem Element sofort.
 *
 * @param {string} selector
 */
export function clearWillChange(selector) {
  const el = document.querySelector(selector);
  if (!el) return;
  el.style.willChange = 'auto';
  el.classList.remove('is-animating');
}

/**
 * Richtet globale Listener ein: entfernt will-change nach jeder
 * transitionend / animationend auf den Shell-Elementen.
 *
 * Einmalig im Boot aufrufen (z.B. in main.js nach initDomBindings).
 */
export function setupWillChangeListeners() {
  for (const selector of Object.keys(SHELL_ELEMENTS)) {
    const el = document.querySelector(selector);
    if (!el) continue;

    const _reset = () => {
      // Kleine Verzögerung: erst nach Ende der Animation freigeben
      setTimeout(() => {
        el.style.willChange = 'auto';
        el.classList.remove('is-animating');
      }, 100);
    };

    el.addEventListener('transitionend', _reset, { passive: true });
    el.addEventListener('animationend',  _reset, { passive: true });
  }
}

/**
 * Bequemlichkeits-Wrapper: Primer für alle Standard-Shell-Elemente.
 * Nützlich vor großen State-Übergängen (z.B. startGame(), returnToTitle()).
 */
export function primeAllShellElements() {
  for (const [selector, props] of Object.entries(SHELL_ELEMENTS)) {
    primeWillChange(selector, props, PRIME_LEAD_MS);
  }
}

// ── Intern ────────────────────────────────────────────────────────────────

function _applyWillChange(el, props, selector) {
  el.style.willChange = props;
  el.classList.add('is-animating');

  // Maximale Haltezeit: 3s. Danach auto-reset egal ob Event kommt.
  const safetyTimer = setTimeout(() => {
    el.style.willChange = 'auto';
    el.classList.remove('is-animating');
    _timers.delete(selector);
  }, 3000);

  _timers.set(selector, safetyTimer);
}
