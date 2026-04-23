# SYNAPSE v99 — Data Ocean & Progressive UI: HTML-Snippets

Chirurgische Eingriffe in `index.html` ohne UI-Bloat.

---

## 1. Win-Screen: ABTAUCHEN-Button

Füge direkt **nach** `#win-restart` ein:

```html
<!-- Post-Game: Data Ocean Dive Button (display:none bis JS .visible setzt) -->
<button id="btn-dive" class="dive-btn" type="button">▼ ABTAUCHEN (ENDLESS)</button>
```

Wird automatisch von `_winScreen.js :: _setupDiveButton()` gesteuert.

---

## 2. Topbar: Sektor-Badge neben #phase-name

Finde `<div id="hud-main-row">` und füge das Badge nach `#phase-name` ein:

```html
<div id="hud-main-row">
  <span id="layer-tag">SCHICHT 00 · DORMANT</span>
  <span id="phase-name">Dormant</span>
  <!-- NEU: Sektor-Badge (display:none, via body.sector-active sichtbar) -->
  <span id="sector-badge" aria-live="polite">
    <span class="sector-badge-icon">◈</span>
    <span class="sector-label-text" id="sector-badge-label">—</span>
  </span>
  <!-- ... Rest des HUD ... -->
</div>
```

---

## 3. Heat-Bar: 2px Hairline unter #hud-prog-row

Finde `<div id="hud-prog-row">` und füge direkt danach ein:

```html
<div id="hud-prog-row">
  <div id="hud-prog-wrap">
    <div id="hud-prog"></div>
  </div>
</div>
<!-- NEU: Heat-Bar (2px, display:none bis body.overclock-active) -->
<div id="heat-bar-wrap" role="meter" aria-label="Heat level">
  <div id="heat-bar-fill"></div>
</div>
```

---

## 4. Pulse-Mode Badge: Flyout über #pulse-cd-wrap

Finde `<div id="pulse-cd-wrap">` im Dock und füge das Badge davor ein:

```html
<div id="pulse-cd-wrap" style="position: relative;">
  <!-- NEU: Pulse-Mode Flyout (display:none bis body.pulse-mode-active) -->
  <div id="pulse-mode-badge" aria-live="polite">STANDARD</div>
  <!-- ... bestehender Pulse-Button ... -->
</div>
```

---

## 5. Overclock (☢) & Chronos-Shift (⏳) im Dock

Finde `<div id="mode-bar">` und hänge die Buttons ans Ende:

```html
<div id="mode-bar">
  <!-- ... bestehende Dock-Buttons ... -->

  <!-- NEU: Overclock — display:none bis body.overclock-unlocked / body.epoch-temporal -->
  <button id="btn-overclock" class="dock-btn dock-btn-epoch" type="button"
          title="Overclock aktivieren (☢ Hitzegefahr!)" aria-label="Overclock">
    ☢
  </button>

  <!-- NEU: Chronos-Shift — display:none bis body.chronos-unlocked / body.epoch-temporal -->
  <button id="btn-chronos" class="dock-btn dock-btn-epoch" type="button"
          title="Chronos-Shift: Rewind Buffer" aria-label="Chronos Shift">
    ⏳
  </button>
</div>
```

---

## 6. Depth Meter (optional, separates Element)

Falls du ein eigenes Element statt der umgekehrten #obj-line bevorzugst:

```html
<!-- NEU: Depth Meter — display:none bis body.biome-data-ocean -->
<div id="depth-meter" aria-live="polite" aria-label="Ocean depth">▼ 0 TF</div>
```

Einfügen im HUD-Center oder unter #obj-line. `dataOcean.js` befüllt
automatisch beide (`#obj-line` und `#depth-meter` falls vorhanden).

---

## JS-Hooks für Sector-Badge (sectorVariables.js)

In `showSectorToast()` oder `rollSectorVariable()` ergänzen:

```js
// Sektor-Badge aktualisieren
const badge = document.getElementById('sector-badge');
const label = document.getElementById('sector-badge-label');
if (badge && label) {
  label.textContent = sector.name;
  badge.className   = `sector-${sector.type || 'normal'}`;
  document.body.classList.add('sector-active');
}
```

Beim Reset (resetSectorVariable):
```js
document.body.classList.remove('sector-active');
```

## JS-Hooks für Heat-Bar (overclocking.js)

In `updateHeat()`:
```js
const heatFill = document.getElementById('heat-bar-fill');
if (heatFill) {
  const pct = Math.min(100, (heatState.heat / heatState.maxHeat) * 100);
  heatFill.style.width = pct + '%';
  heatFill.classList.toggle('heat-critical', pct >= 80);
  document.body.classList.toggle('overclock-active', heatState.active);
  document.body.classList.toggle('heat-warning', pct >= 50);
}
```

## JS-Hooks für Pulse-Mode Badge (pulseMode.js)

In `cyclePulseMode()`:
```js
const badge = document.getElementById('pulse-mode-badge');
if (badge) {
  const modeId = currentMode.id || 'standard';
  const isStandard = modeId === 'standard';
  badge.textContent = currentMode.label || modeId.toUpperCase();
  badge.className   = `mode-${modeId}`;
  document.body.classList.toggle('pulse-mode-active', !isStandard);
}
```
