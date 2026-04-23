# SYNAPSE v99 — Phase 1 Integration Guide

Dieses Dokument beschreibt die **minimalen Änderungen** an bestehenden Dateien,
um `branchingObjectives.js` und `comboMilestones.js` ins Spiel zu integrieren.
Alle Patches sind additiv — kein bestehender Code wird gelöscht oder umbenannt.

---

## 1. CSS einbinden

In `src/styles/index.css` am Ende hinzufügen:

```css
@import './systems/phase1.css';
```

---

## 2. `src/boot/runController.js` — Initialisierung

```js
// Oben im Import-Block hinzufügen:
import { initBranchingObjectives, resetBranchingState } from '../systems/branchingObjectives.js';
import { initComboMilestones, resetComboMilestones }    from '../systems/comboMilestones.js';
```

In der `startNewRun()` / `bootRuntime()` Funktion, **nach** `initResearchSystem()`:

```js
initBranchingObjectives();   // Phase 1: Entscheidungspfade (ab Run 2)
initComboMilestones();        // Phase 1: Combo-Milestones (ab Run 2)
```

In der `resetRun()` / Cleanup-Funktion, **vor** `resetG()`:

```js
resetBranchingState();
resetComboMilestones();
```

---

## 3. `src/gameplay/progression.js` — checkObjectives()

Am Ende der `checkObjectives()` Funktion, nach dem bestehenden Toast-Block:

```js
// Phase 1: Branching Objectives prüfen
import { maybeShowChoiceObjective } from '../systems/branchingObjectives.js';
// ... (im Import-Block oben)

// In checkObjectives(), am Ende:
maybeShowChoiceObjective();
```

Vollständige Änderung in `checkObjectives()`:

```js
export function checkObjectives() {
  // ... bestehender Code ...

  if (changed) {
    updateObjectiveLine();
    updateHUD();
    maybeShowChoiceObjective(); // ← NEU: Phase 1 Choice-Trigger
  }

  // Auch ohne changed prüfen (für zeitbasierte Trigger):
  maybeShowChoiceObjective();
}
```

---

## 4. `src/gameplay/actions.js` — doPulse() / nach updateCombo()

In `doPulse()`, direkt nach dem `updateCombo()`-Aufruf:

```js
// Phase 1: Combo-Milestones prüfen
import { tickComboMilestones } from '../systems/comboMilestones.js';
// ... (im Import-Block oben)

// In doPulse(), nach updateCombo(...):
tickComboMilestones();  // ← NEU: Phase 1 Milestone-Check
```

---

## 5. `src/gameplay/balance.js` — getEffectivePulseCost()

Energie-Rabatt von Combo-Milestones integrieren:

```js
import { getComboDiscountMult } from '../systems/comboMilestones.js';

export function getEffectivePulseCost() {
  // ... bestehender Code ...

  // Phase 1: Combo-Discount anwenden (Milestone x1.5)
  const discountMult = getComboDiscountMult();
  if (discountMult < 1.0) {
    cost = Math.max(0, Math.round(cost * discountMult));
  }

  return cost;
}
```

---

## 6. `src/meta/_draft.js` — buildDraftPool() / Gewichtung

Im Draft-Pool-Generator, nach dem bestehenden Tag-Filter:

```js
import { getDraftTagWeight, branchState } from '../systems/branchingObjectives.js';

// In buildDraftPool() oder der internen Gewichtungs-Funktion:
// Für jeden Upgrade-Kandidaten:
const branchWeight = getDraftTagWeight(def.tag);
const finalWeight  = baseWeight * branchWeight;
```

Konkret: In der Stelle wo Upgrade-Definitionen in den Pool aufgenommen werden,
`getDraftTagWeight(def.tag)` auf das Gewicht der Karte anwenden. Wenn die
Funktion `3.0` zurückgibt, die Karte 3× in den Pool legen; bei `0.25` nur
jede 4. Iteration einschließen.

---

## 7. `src/meta/flow.js` — resetMetaFlowRuntime()

```js
import { resetBranchingState } from '../systems/branchingObjectives.js';
import { resetComboMilestones }  from '../systems/comboMilestones.js';

export function resetMetaFlowRuntime() {
  // ... bestehender Code ...
  resetBranchingState();   // ← NEU
  resetComboMilestones();  // ← NEU
}
```

---

## Zusammenfassung der neuen Dateien

| Datei                                    | Zweck                                              |
|------------------------------------------|----------------------------------------------------|
| `src/systems/branchingObjectives.js`     | Choice-System, Draft-Filter, DOM-Management        |
| `src/systems/comboMilestones.js`         | Combo-Schwellen-Effekte, Discount-System           |
| `src/styles/systems/phase1.css`          | CSS für Choice-UI + Combo-Milestone-Animationen    |
| `src/systems/PHASE1_INTEGRATION.md`      | Dieses Dokument                                    |

---

## Verhalten im Spiel

### Branching Objectives (ab Run 2)
- Nach dem ersten abgeschlossenen L1-Objective erscheint ein Choice-Panel unter `#obj-line`.
- Der Spieler wählt zwischen zwei Strategiepfaden (z.B. Predator vs. Analyst).
- Die Wahl filtert den Draft-Pool: gewählter Tag erscheint 3× häufiger.
- Eine zweite Choice erscheint nach dem 3. abgeschlossenen L1-Objective.

### Combo Milestones (ab Run 2)
- x1.2 Combo: +3⬡ Energie-Bonus
- x1.5 Combo: 8 Sekunden Pulse-Energie −30% (sichtbar durch Teal-Glow)
- x2.0 MAX COMBO: Energie-Surge + freier Pulse + `pulse-ping` Animation auf `#combo-hud`

### CSS-Hooks (für weitere Ausbaustufen)
- `body.combo-milestone-active` — kurzzeitiger Amber-Glow (1.2s)
- `body.combo-discount-active` — Teal-Puls-Indikator während Rabatt
- `body.branch-path-{tag}` — dauerhafter Pfad-Indikator (bleibt bis Run-Ende)
- `#combo-hud.milestone-ping` — pulse-ping @keyframe (aus keyframes.css)
