/**
 * SYNAPSE v99 — Phase 1: Combo Milestones (Spielbare Combos)
 *
 * Hookt in comboState.count aus _combo.js.
 * Bei x2.0, x3.0 etc. (Combo-Level-Schwellen) werden spezielle
 * Milestone-Effekte ausgelöst — z.B. Energie-Rabatt, Pulse-Echo.
 *
 * Freigeschaltet: Nach dem ersten gescheiterten Run (Teil des "Awakening").
 * Prüfung: mastery.totalRuns >= 1 (d.h. mindestens ein Run beendet).
 *
 * Integration:
 *   - Importiere tickComboMilestones() und rufe sie nach updateCombo() auf.
 *   - Importiere initComboMilestones() im runController / Awakening-Init.
 *   - Resetze via resetComboMilestones() bei Runstart.
 *
 * CSS-Hooks:
 *   - @keyframes pulse-ping (keyframes.css) wird auf #combo-hud gefeuert.
 *   - body.combo-milestone-active für kurzfristigen Glow-State.
 */

import { G }            from '../state/gameState.js';
import { mastery }      from '../state/masteryState.js';
import { TUNING }       from '../state/tuning.js';
import { getLang }      from '../state/settings.js';
import { showToast }    from '../ui/hud/index.js';
import { el }           from '../util/dom.js';
import { emitAgentMessage } from '../meta/_combo.js';
import { comboState, COMBO_LEVELS } from '../meta/_combo.js';
import { regTimer, clearTimer } from '../registries/timerRegistry.js';

// ── Milestone-State ───────────────────────────────────────────────────────

export const comboMilestoneState = window.__synComboMilestone || (window.__synComboMilestone = {
  /** System aktiv (ab Run 2 / nach erstem gescheiterten Run). */
  enabled:           false,
  /** Wie viele Milestone-Effekte in diesem Run wurden ausgelöst. */
  triggeredCount:    0,
  /** Letztes ausgelöstes Combo-Level (verhindert Doppel-Trigger). */
  lastTriggeredMult: 0,
  /** Temporäre Energie-Rabatt-Restdauer in ms (aktiver Zustand). */
  discountMs:        0,
  /** Startzeitpunkt des aktiven Discounts. */
  discountStart:     0,
});

// ── Milestone-Definitionen ────────────────────────────────────────────────

/**
 * Jede Def hat:
 *   mult       – combo.mult-Schwelle, ab der dieser Milestone triggert
 *   effectFn   – Funktion(lang): führt den Effekt aus, gibt Toast-Texts zurück
 *   titleDE/EN – Anzeigename im Toast
 */
const MILESTONE_DEFS = [
  {
    mult: 1.2,
    titleDE: '⚡ x1.2 COMBO BONUS',
    titleEN: '⚡ x1.2 COMBO BONUS',
    effectFn(lang) {
      // Kleiner Energie-Bonus
      const bonus = 3;
      G.energy += bonus;
      return {
        titleDE: '⚡ x1.2 COMBO',
        titleEN: '⚡ x1.2 COMBO',
        bodyDE:  `+${bonus}⬡ Energie-Boost`,
        bodyEN:  `+${bonus}⬡ energy boost`,
      };
    },
  },
  {
    mult: 1.5,
    titleDE: '⚡ x1.5 COMBO — ENERGIE-RABATT',
    titleEN: '⚡ x1.5 COMBO — ENERGY DISCOUNT',
    effectFn(lang) {
      // Nächste 8 Sekunden: Pulse kostet 0.7x
      _startDiscount(0.70, 8000);
      return {
        titleDE: '⚡ x1.5 COMBO',
        titleEN: '⚡ x1.5 COMBO',
        bodyDE:  '8s: Pulse-Energie −30%',
        bodyEN:  '8s: Pulse energy −30%',
      };
    },
  },
  {
    mult: 2.0,
    titleDE: '⚡⚡ MAX COMBO — SURGE',
    titleEN: '⚡⚡ MAX COMBO — SURGE',
    effectFn(lang) {
      // Starker Energie-Surge + Ping-Animation auf combo-hud
      const surge = Math.round(6 + G.l3CapturedClusters * 2);
      G.energy += surge;
      _pingComboHUD();
      // Visueller Screen-Hit (wenn vorhanden)
      window.spawnShock?.(0xffcc00, 3);
      window.spawnShock?.(0xff8800, 2);
      return {
        titleDE: '⚡⚡ MAX COMBO SURGE',
        titleEN: '⚡⚡ MAX COMBO SURGE',
        bodyDE:  `+${surge}⬡ Energie · Nächster Pulse gratis`,
        bodyEN:  `+${surge}⬡ energy · Next pulse free`,
      };
    },
  },
];

// ── Initialisierung ───────────────────────────────────────────────────────

/**
 * Muss einmal pro Run nach resetG() aufgerufen werden.
 * Aktiviert Milestones wenn mindestens ein Run stattgefunden hat.
 */
export function initComboMilestones() {
  comboMilestoneState.enabled        = (mastery.totalRuns || 0) >= 1;
  comboMilestoneState.triggeredCount  = 0;
  comboMilestoneState.lastTriggeredMult = 0;
  comboMilestoneState.discountMs     = 0;
  comboMilestoneState.discountStart  = 0;
  _clearDiscountBody();
}

/** Reset für neuen Run. */
export function resetComboMilestones() {
  comboMilestoneState.enabled           = false;
  comboMilestoneState.triggeredCount    = 0;
  comboMilestoneState.lastTriggeredMult = 0;
  comboMilestoneState.discountMs        = 0;
  comboMilestoneState.discountStart     = 0;
  _clearDiscountBody();
  clearTimer('comboMilestoneDiscount');
}

// ── Haupt-Tick (nach updateCombo() aufrufen) ──────────────────────────────

/**
 * Wird nach jedem updateCombo()-Aufruf aus actions.js getriggert.
 * Prüft ob ein Milestone erreicht wurde und führt den Effekt aus.
 */
export function tickComboMilestones() {
  if (!comboMilestoneState.enabled) return;

  const current = comboState.mult;
  const last    = comboMilestoneState.lastTriggeredMult;

  // Finde den höchsten Milestone der gerade überschritten wurde
  for (const def of MILESTONE_DEFS) {
    if (current >= def.mult && last < def.mult) {
      _triggerMilestone(def);
      comboMilestoneState.lastTriggeredMult = def.mult;
      break; // Nur einen pro updateCombo-Call
    }
  }

  // Wenn Combo resettet wurde, lastTriggeredMult auch zurücksetzen
  if (current <= 1.0 && last > 1.0) {
    comboMilestoneState.lastTriggeredMult = 0;
  }
}

// ── Discount-System (Energie-Rabatt) ─────────────────────────────────────

/**
 * Gibt den aktuellen Energie-Multiplikator zurück (für balance.js).
 * 1.0 = kein Rabatt, 0.7 = 30% Rabatt etc.
 */
export function getComboDiscountMult() {
  if (!comboMilestoneState.enabled) return 1.0;
  if (comboMilestoneState.discountMs <= 0) return 1.0;
  const elapsed = Date.now() - comboMilestoneState.discountStart;
  if (elapsed >= comboMilestoneState.discountMs) {
    comboMilestoneState.discountMs = 0;
    _clearDiscountBody();
    return 1.0;
  }
  return comboMilestoneState._discountMult || 1.0;
}

/** Gibt true zurück wenn gerade ein Combo-Energie-Rabatt aktiv ist. */
export function isComboDiscountActive() {
  return getComboDiscountMult() < 1.0;
}

// ── Private Helpers ───────────────────────────────────────────────────────

function _triggerMilestone(def) {
  const lang   = getLang();
  const result = def.effectFn(lang);

  comboMilestoneState.triggeredCount++;
  emitAgentMessage('pulse', true);

  showToast(
    lang === 'de' ? result.titleDE : result.titleEN,
    lang === 'de' ? result.bodyDE  : result.bodyEN,
    1800,
  );

  // body-Klasse für kurzzeitigen globalen Glow
  _flashBodyClass('combo-milestone-active', 1200);
}

/**
 * Startet einen Energie-Rabatt für durationMs Millisekunden.
 * @param {number} mult  - Multiplikator (z.B. 0.7 für −30%)
 * @param {number} dur   - Dauer in ms
 */
function _startDiscount(mult, dur) {
  comboMilestoneState._discountMult  = mult;
  comboMilestoneState.discountMs     = dur;
  comboMilestoneState.discountStart  = Date.now();

  // Visuell: body-Klasse für Discount-Indikator
  document.body.classList.add('combo-discount-active');
  clearTimer('comboMilestoneDiscount');
  regTimer('comboMilestoneDiscount', setTimeout(() => {
    comboMilestoneState.discountMs = 0;
    _clearDiscountBody();
    clearTimer('comboMilestoneDiscount');
  }, dur), 'timeout');
}

/** Entfernt Discount-CSS-Klassen vom body. */
function _clearDiscountBody() {
  document.body.classList.remove('combo-discount-active');
}

/**
 * Fügt eine CSS-Klasse für `durationMs` ms zum body hinzu, dann entfernt sie.
 * Nutzt CSS-Transitions für den Glow-Effekt (kein direktes Style-Schreiben).
 */
function _flashBodyClass(cls, durationMs) {
  document.body.classList.add(cls);
  clearTimer('comboMilestoneFlash');
  regTimer('comboMilestoneFlash', setTimeout(() => {
    document.body.classList.remove(cls);
    clearTimer('comboMilestoneFlash');
  }, durationMs), 'timeout');
}

/**
 * Feuert die pulse-ping @keyframe-Animation auf #combo-hud.
 * Nutzt die existierende Animation aus keyframes.css.
 */
function _pingComboHUD() {
  const node = el('combo-hud');
  if (!node) return;
  // Animation neu starten: Klasse kurz entfernen → Reflow → wieder hinzufügen
  node.classList.remove('milestone-ping');
  // Force reflow
  void node.offsetWidth;
  node.classList.add('milestone-ping');
  clearTimer('comboHudPing');
  regTimer('comboHudPing', setTimeout(() => {
    node.classList.remove('milestone-ping');
    clearTimer('comboHudPing');
  }, 620), 'timeout');
}

// ── Cheat-Bypass für Dev-Konsole ──────────────────────────────────────────
// window.__synComboMilestone ist bereits oben als window-Bridge gesetzt.
