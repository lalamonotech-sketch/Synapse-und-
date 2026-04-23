/**
 * SYNAPSE v99 — Phase 1: Branching Objectives (Entscheidungspfade)
 *
 * Implementiert obj.type === 'choice' für den Objective-Layer.
 * Zeigt zwei wählbare Pfade unter #obj-line an (ab Run 2).
 * Die Wahl filtert den verfügbaren Draft-Pool für den Rest der Epoche.
 *
 * Integration:
 *   - Importiere initBranchingObjectives() im runController nach initResearchSystem().
 *   - Rufe resetBranchingState() bei resetG() / neuer Run-Session auf.
 *   - Rufe maybeShowChoiceObjective() aus checkObjectives() auf.
 *
 * Design-Pfeiler:
 *   - Rein additiv: filtert Draft-Tags, ergänzt keine neuen Nodes.
 *   - CSS-Hook: nutzt bestehende .mbtn-Klassen für die Auswahl-Buttons.
 *   - UI State Machine: togglet .show / .vis konsistent.
 */

import { G }           from '../state/gameState.js';
import { mastery }     from '../state/masteryState.js';
import { getLang }     from '../state/settings.js';
import { showToast }   from '../ui/hud/index.js';
import { el }          from '../util/dom.js';
import { emitAgentMessage } from '../meta/_combo.js';

// ── Branching State (shared via window bridge) ────────────────────────────

export const branchState = window.__synBranchState || (window.__synBranchState = {
  /** Ob Branching Objectives für diesen Run freigeschaltet sind. */
  enabled:       false,
  /** Aktuell aktive choice-Def (null = keine Choice offen). */
  activeChoice:  null,
  /** Gewählter Pfad-Tag (z.B. 'predator', 'analyst', …). */
  chosenPath:    null,
  /** Wurde diese Choice bereits in diesem Run abgeschlossen? */
  resolved:      false,
  /** ID-Tracking — verhindert doppeltes Rendern derselben Choice. */
  _renderedId:   null,
});

// ── Choice-Definitionen ───────────────────────────────────────────────────

/**
 * Jede Choice-Def hat:
 *   id       – eindeutig im Run
 *   trigger  – Funktion → bool: wann soll die Choice erscheinen?
 *   options  – genau zwei Pfad-Optionen (tag + label DE/EN)
 *
 * Trigger greift nach dem ersten erfolgreichen L1-Objective-Abschluss,
 * sobald Run 2+ aktiv ist (branchState.enabled === true).
 */
export const CHOICE_DEFS = [
  {
    id: 'epoch1_path',
    trigger: (G) => {
      // Zeige Choice nach dem ersten abgeschlossenen L1-Objective
      const doneCount = (G.objectives || []).filter(o => o.done).length;
      return doneCount >= 1;
    },
    titleDE: '▸ ENTSCHEIDUNGSPFAD — Wähle deine Strategie',
    titleEN: '▸ DECISION PATH — Choose your strategy',
    options: [
      {
        tag:     'predator',
        labelDE: '⚡ ANGRIFF  — Schnelle Pulses, aggressives Tempo',
        labelEN: '⚡ ASSAULT — Fast pulses, aggressive pace',
        descDE:  'Schaltet Predator-Draft-Karten für diese Epoche frei.',
        descEN:  'Unlocks Predator draft cards for this epoch.',
      },
      {
        tag:     'analyst',
        labelDE: '◈ STRUKTUR — Backbone-Tiefe, stabile Brücken',
        labelEN: '◈ STRUCTURE — Backbone depth, stable bridges',
        descDE:  'Schaltet Analyst-Draft-Karten für diese Epoche frei.',
        descEN:  'Unlocks Analyst draft cards for this epoch.',
      },
    ],
  },
  {
    id: 'epoch1_sub',
    trigger: (G) => {
      // Zweite Choice: nach dem zweiten L1-Abschluss UND Pfad ist bereits gewählt
      const doneCount = (G.objectives || []).filter(o => o.done).length;
      return doneCount >= 3 && branchState.chosenPath !== null && !branchState.resolved;
    },
    titleDE: '▸ VERTIEFUNG — Spezialisiere dich weiter',
    titleEN: '▸ SPECIALISE — Deepen your build',
    options: [
      {
        tag:     'mnemonic',
        labelDE: '◉ SPEICHER  — Memory-Entladungen, Puls-Echo',
        labelEN: '◉ MEMORY   — Memory discharges, pulse echo',
        descDE:  'Kombi-Pool: Memory-Synergien freigeschaltet.',
        descEN:  'Combo pool: Memory synergies unlocked.',
      },
      {
        tag:     'architect',
        labelDE: '⬟ ARCHITEKTUR — Spine, Fusion, Makro-Boni',
        labelEN: '⬟ ARCHITECT  — Spine, fusion, macro bonuses',
        descDE:  'Kombi-Pool: Architect-Synergien freigeschaltet.',
        descEN:  'Combo pool: Architect synergies unlocked.',
      },
    ],
  },
];

// ── DOM-IDs ───────────────────────────────────────────────────────────────

const CHOICE_CONTAINER_ID = 'obj-choice-container';
const CHOICE_TITLE_ID     = 'obj-choice-title';
const CHOICE_BTN_A_ID     = 'obj-choice-btn-a';
const CHOICE_BTN_B_ID     = 'obj-choice-btn-b';

// ── Initialiserung ────────────────────────────────────────────────────────

/**
 * Muss einmal pro Run nach resetG() aufgerufen werden.
 * Aktiviert das System ab Run 2+ (mastery.totalRuns >= 1).
 */
export function initBranchingObjectives() {
  branchState.enabled    = (mastery.totalRuns || 0) >= 1;
  branchState.activeChoice = null;
  branchState.resolved   = false;
  branchState._renderedId = null;
  // chosenPath bleibt bis resolveChoice gesetzt
  branchState.chosenPath = null;
  _ensureChoiceDOM();
  hideChoiceUI();
}

/** Reset für neuen Run (saubere Trennung vom Window-Bridge-State). */
export function resetBranchingState() {
  branchState.enabled      = false;
  branchState.activeChoice = null;
  branchState.chosenPath   = null;
  branchState.resolved     = false;
  branchState._renderedId  = null;
  hideChoiceUI();
}

// ── Trigger-Check (aus checkObjectives aufrufen) ──────────────────────────

/**
 * Prüft alle CHOICE_DEFS und blendet ggf. die Choice-UI ein.
 * Idempotent — mehrfaches Aufrufen ist safe.
 */
export function maybeShowChoiceObjective() {
  if (!branchState.enabled) return;
  if (branchState.resolved)  return;
  if (branchState.activeChoice) return; // Choice bereits offen

  for (const def of CHOICE_DEFS) {
    if (def.id === branchState._renderedId) continue;
    if (!def.trigger(G)) continue;

    branchState.activeChoice = def;
    branchState._renderedId  = def.id;
    _renderChoiceUI(def);
    emitAgentMessage('stage', false);
    return;
  }
}

// ── Auswahl-Handler ───────────────────────────────────────────────────────

/**
 * Wird aufgerufen wenn der Spieler eine Option wählt.
 * @param {string} tag - gewählter Pfad-Tag
 */
export function resolveChoice(tag) {
  const def = branchState.activeChoice;
  if (!def) return;

  const lang = getLang();
  const opt  = def.options.find(o => o.tag === tag);
  if (!opt) return;

  // Speichere gewählten Pfad
  branchState.chosenPath   = tag;
  branchState.activeChoice = null;

  // Markiere als resolved wenn es die letzte Choice-Def war
  const remaining = CHOICE_DEFS.filter(
    d => d.id !== def.id && !d.trigger?.(G)
  );
  if (remaining.length === 0) branchState.resolved = true;

  // Toast-Feedback
  const title = lang === 'de' ? '▸ PFAD GEWÄHLT' : '▸ PATH CHOSEN';
  const body  = lang === 'de' ? opt.labelDE : opt.labelEN;
  showToast(title, body, 2800);

  // CSS-Hook: body-Klasse für Epoch-Feedback (optional, nicht-destructive)
  document.body.classList.add('branch-path-' + tag);

  hideChoiceUI();
  _applyDraftFilter(tag);
}

// ── Draft-Filter-Integration ──────────────────────────────────────────────

/**
 * Filtert den G_DRAFT-Pool nach dem gewählten Tag.
 * Hook-point für _draft.js: lese branchState.chosenPath dort aus.
 * Diese Funktion setzt den Filter auf dem window-Bridge-Objekt.
 */
function _applyDraftFilter(tag) {
  // Exportiere den gewählten Path-Tag ins Draft-System.
  // _draft.js liest window.__synBranchState.chosenPath beim Pool-Aufbau.
  // Keine direkte Mutation von TUNING — nur Signaling.
  const lang = getLang();
  const msg  = lang === 'de'
    ? `Draft-Pool: ${tag.toUpperCase()}-Karten bevorzugt für diese Epoche`
    : `Draft pool: ${tag.toUpperCase()} cards prioritised for this epoch`;
  // Leichter Agent-Hint nach kurzer Verzögerung
  setTimeout(() => showToast('⬡ DRAFT-POOL', msg, 2200), 800);
}

// ── DOM-Helpers ───────────────────────────────────────────────────────────

/** Erzeugt das Choice-Container-DOM, falls noch nicht vorhanden. */
function _ensureChoiceDOM() {
  if (document.getElementById(CHOICE_CONTAINER_ID)) return;

  const container = document.createElement('div');
  container.id        = CHOICE_CONTAINER_ID;
  container.className = 'obj-choice-wrap';
  container.setAttribute('aria-live', 'polite');
  container.innerHTML = `
    <div id="${CHOICE_TITLE_ID}" class="obj-choice-title"></div>
    <div class="obj-choice-btns">
      <button id="${CHOICE_BTN_A_ID}" class="mbtn obj-choice-btn" type="button"></button>
      <button id="${CHOICE_BTN_B_ID}" class="mbtn obj-choice-btn" type="button"></button>
    </div>
  `;

  // Einhängen direkt unter #obj-line (im HUD-Topbar-Bereich)
  const objLine = document.getElementById('obj-line');
  if (objLine?.parentNode) {
    objLine.parentNode.insertBefore(container, objLine.nextSibling);
  } else {
    // Fallback: ans Ende von #hud
    const hud = document.getElementById('hud');
    if (hud) hud.appendChild(container);
  }

  // Event-Listener binden
  document.getElementById(CHOICE_BTN_A_ID)
    ?.addEventListener('click', () => resolveChoice(_currentOptTags[0]));
  document.getElementById(CHOICE_BTN_B_ID)
    ?.addEventListener('click', () => resolveChoice(_currentOptTags[1]));
}

let _currentOptTags = ['', ''];

/** Rendert den Choice-Container mit der gegebenen Def. */
function _renderChoiceUI(def) {
  _ensureChoiceDOM();
  const lang    = getLang();
  const title   = lang === 'de' ? def.titleDE : def.titleEN;
  const [optA, optB] = def.options;
  _currentOptTags = [optA.tag, optB.tag];

  const titleEl = document.getElementById(CHOICE_TITLE_ID);
  const btnA    = document.getElementById(CHOICE_BTN_A_ID);
  const btnB    = document.getElementById(CHOICE_BTN_B_ID);

  if (titleEl) titleEl.textContent = title;
  if (btnA) {
    btnA.textContent = lang === 'de' ? optA.labelDE : optA.labelEN;
    btnA.title       = lang === 'de' ? optA.descDE  : optA.descEN;
    btnA.dataset.tag = optA.tag;
  }
  if (btnB) {
    btnB.textContent = lang === 'de' ? optB.labelDE : optB.labelEN;
    btnB.title       = lang === 'de' ? optB.descDE  : optB.descEN;
    btnB.dataset.tag = optB.tag;
  }

  const container = document.getElementById(CHOICE_CONTAINER_ID);
  if (container) {
    container.classList.add('show', 'vis');
    container.setAttribute('aria-hidden', 'false');
  }
}

/** Blendet das Choice-UI aus (CSS übernimmt die Transition). */
export function hideChoiceUI() {
  const container = document.getElementById(CHOICE_CONTAINER_ID);
  if (!container) return;
  container.classList.remove('show', 'vis');
  container.setAttribute('aria-hidden', 'true');
}

// ── Draft-Pool-Filter (für _draft.js) ────────────────────────────────────

/**
 * Gibt den Boost-Faktor für einen Upgrade-Tag zurück.
 * Wird von _draft.js beim Pool-Aufbau aufgerufen (Weight-Modifikator).
 *
 * Gewählter Tag: ×3.0 Gewicht
 * Neutraler Tag: ×1.0
 * Antagonist-Tag (predator↔analyst, mnemonic↔architect): ×0.25
 */
export function getDraftTagWeight(upgradeTag) {
  const chosen = branchState.chosenPath;
  if (!chosen) return 1.0;

  // Direkter Match
  if (upgradeTag === chosen) return 3.0;

  // Komplementäre Tags (synergieren gut zusammen)
  const SYNERGY_MAP = {
    predator:  ['mnemonic'],
    analyst:   ['architect'],
    mnemonic:  ['predator'],
    architect: ['analyst'],
  };
  if (SYNERGY_MAP[chosen]?.includes(upgradeTag)) return 1.6;

  // Wilder Tag ist immer neutral
  if (upgradeTag === 'wild') return 1.0;

  // Antagonist-Tags leicht unterdrückt
  return 0.25;
}

/**
 * Gibt zurück ob Branching derzeit aktiv ist (für UI-Logik in anderen Modulen).
 */
export function isBranchingActive() {
  return branchState.enabled && !branchState.resolved;
}
