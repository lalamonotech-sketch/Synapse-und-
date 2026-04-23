/**
 * SYNAPSE v99 — Post-Game: Data Ocean (Endless Mode)
 *
 * Aktiviert sich nach einem siegreichen Run wenn der Spieler "ABTAUCHEN" wählt.
 * Mechanik: Tiefe steigt mit Combo × Zeit. Jedes Depth-Level fügt eine
 * zufällige Anomalie hinzu. Es gibt keine Objectives mehr — nur Überleben.
 *
 * Integration:
 *   - initDataOcean()    → in runController.js / bootRuntime importieren
 *   - startDataOcean()   → aus _winScreen.js aufrufen wenn btn-dive geklickt
 *   - tickDataOcean(dt)  → in gameLoop._gameUpdate() ganz unten einhängen
 *   - resetDataOcean()   → in resetMetaFlowRuntime() / launchRun() aufrufen
 *
 * CSS-Hooks:
 *   - body.biome-data-ocean  — globales Tiefsee-Theme
 *   - .ocean-sonar-ping      — Sonar-Expand Keyframe (in data-ocean.css)
 */

import { G }         from '../state/gameState.js';
import { comboState } from '../meta/_combo.js';
import { showToast }  from '../ui/hud/index.js';
import { getLang }    from '../state/settings.js';
import { SFX }        from '../audio/sfx.js';
import { el }         from '../util/dom.js';
import { regTimer, clearTimer } from '../registries/timerRegistry.js';

// ── Init hook (no-op — state wird beim Modul-Load via oceanState-Literal initialisiert) ──
/** Expliziter Init-Hook für bootRuntime / Tests. Kein Setup nötig — State ist
 *  bereits beim Modul-Import fertig. Existiert damit Tooling einen stabilen
 *  Einstiegspunkt hat und die Integrations-Doku korrekt bleibt. */
export function initDataOcean() {
  // no-op: module-level initialisation via oceanState literal is sufficient.
}

// ── Ocean State (window bridge für Dev-Konsole) ───────────────────────────

export const oceanState = window.__synOceanState = window.__synOceanState || {
  /** Ob der Endless Mode gerade läuft. */
  active:              false,
  /** Aktuelle Tiefe in TF (Tiefen-Einheiten). */
  depth:               0,
  /** Schwelle für das nächste Depth-Level. */
  nextThreshold:       5000,
  /** Bisher aktive Anomalien (Array von ANOMALY_DEFS-Einträgen). */
  activeAnomalies:     [],
  /** Wie viele Depth-Level bisher erreicht wurden. */
  levelsReached:       0,
  /** Upkeep-Multiplikator (durch pressure-Anomalie). */
  upkeepMult:          1.0,
  /** Ob Sensor-Blindheit aktiv ist. */
  sensorBlind:         false,
  /** Ob Nomaden im feral-Modus sind. */
  feralNomads:         false,
  /** Ob Links spontan reißen können. */
  brittleLinks:        false,
};

// ── Anomalie-Definitionen ─────────────────────────────────────────────────

const ANOMALY_DEFS = [
  {
    id:     'pressure',
    icon:   '▼',
    nameDE: 'ABYSSAL PRESSURE',
    nameEN: 'ABYSSAL PRESSURE',
    descDE: 'Upkeep-Kosten steigen mit der Tiefe.',
    descEN: 'Upkeep costs scale with depth.',
    apply(state) {
      state.upkeepMult = 1 + (state.depth * 0.00008);
      document.body.classList.add('anomaly-pressure');
    },
    tick(state) {
      // Kontinuierlich skalieren
      state.upkeepMult = 1 + (state.depth * 0.00008);
    },
    remove(state) {
      state.upkeepMult = 1.0;
      document.body.classList.remove('anomaly-pressure');
    },
  },
  {
    id:     'blind',
    icon:   '◌',
    nameDE: 'SENSOR FAILURE',
    nameEN: 'SENSOR FAILURE',
    descDE: 'Nebelschleier über dem Grid.',
    descEN: 'Fog shrouds the grid.',
    apply(state) {
      state.sensorBlind = true;
      document.body.classList.add('anomaly-sensor-blind');
    },
    tick() {},
    remove(state) {
      state.sensorBlind = false;
      document.body.classList.remove('anomaly-sensor-blind');
    },
  },
  {
    id:     'feral',
    icon:   '⚠',
    nameDE: 'FERAL NOMADS',
    nameEN: 'FERAL NOMADS',
    descDE: 'Nomaden bewegen sich erratisch und aggressiv.',
    descEN: 'Nomads move erratically and aggressively.',
    apply(state) {
      state.feralNomads = true;
      document.body.classList.add('anomaly-feral');
    },
    tick() {},
    remove(state) {
      state.feralNomads = false;
      document.body.classList.remove('anomaly-feral');
    },
  },
  {
    id:     'fragile',
    icon:   '⬡',
    nameDE: 'BRITTLE LINKS',
    nameEN: 'BRITTLE LINKS',
    descDE: 'Verbindungen können spontan reißen.',
    descEN: 'Links may spontaneously sever.',
    apply(state) {
      state.brittleLinks = true;
      document.body.classList.add('anomaly-brittle');
    },
    tick(state, dt) {
      // Jeden ~30s zufällig einen Link beschädigen (wenn viele vorhanden)
      if (Math.random() < dt * 0.005 && state.brittleLinks) {
        window.__synBrittleLinkTick?.();
      }
    },
    remove(state) {
      state.brittleLinks = false;
      document.body.classList.remove('anomaly-brittle');
    },
  },
];

// ── DOM Helpers ───────────────────────────────────────────────────────────

function _spawnSonarPing() {
  const ping = document.createElement('div');
  ping.className = 'ocean-sonar-ping';
  document.body.appendChild(ping);
  regTimer('oceanSonarClean', setTimeout(() => {
    ping.remove();
    clearTimer('oceanSonarClean');
  }, 3200), 'timeout');
}

function _updateDepthUI() {
  const objLine = el('obj-line');
  if (!objLine) return;
  const lang = getLang();
  const tf   = Math.floor(oceanState.depth);
  const label = lang === 'de' ? 'TIEFE' : 'DEPTH';
  objLine.innerHTML = `${label}: <span style="color:#64ffdc;text-shadow:0 0 8px rgba(100,255,220,0.7)">${tf.toLocaleString()} TF</span>`;
  objLine.style.color = 'rgba(255,255,255,0.45)';

  // Depth Meter Element (optionales separates Element)
  const depthMeter = el('depth-meter');
  if (depthMeter) depthMeter.textContent = `▼ ${tf.toLocaleString()} TF`;

  // Phase-Name zeigt aktuelle Tiefe an
  const phaseName = el('phase-name');
  if (phaseName && oceanState.active) {
    phaseName.textContent = lang === 'de' ? 'DER ABGRUND' : 'THE ABYSS';
  }
}

function _applyOceanAudio() {
  // Dumpft den Audio-Kontext via Gain-Ramp (simuliert Low-Pass)
  try {
    const ac = window.SFX?._ctx || null;
    if (ac) {
      const masterGain = ac.createGain();
      masterGain.gain.setValueAtTime(1.0, ac.currentTime);
      masterGain.gain.exponentialRampToValueAtTime(0.35, ac.currentTime + 1.5);
      masterGain.gain.exponentialRampToValueAtTime(0.6, ac.currentTime + 3.0);
    }
  } catch (_) {}
  // Alternativ: Wir spielen einen tiefen, biolumineszenten Ton
  _playDiveSound();
}

function _playDiveSound() {
  try {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    const ac = new Ctor();
    // Tiefer Bass-Ton für das Abtauchen
    const osc  = ac.createOscillator();
    const gain = ac.createGain();
    // Biolumineszenter Filter
    const filter = ac.createBiquadFilter();
    filter.type            = 'lowpass';
    filter.frequency.value = 800;
    filter.Q.value         = 2.0;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ac.destination);

    osc.type            = 'sine';
    osc.frequency.setValueAtTime(180, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(60, ac.currentTime + 2.5);

    gain.gain.setValueAtTime(0.0001, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.4, ac.currentTime + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 3.0);

    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + 3.1);
    setTimeout(() => { try { ac.close(); } catch (_) {} }, 3500);
  } catch (_) {}
}

function _flashDiveTransition(onDone) {
  // Bildschirm auf Dunkelblau blenden, dann HUD hochfahren
  const overlay = document.createElement('div');
  overlay.id    = 'ocean-dive-overlay';
  Object.assign(overlay.style, {
    position:   'fixed',
    inset:      '0',
    background: 'radial-gradient(ellipse at 50% 50%, #000b18 0%, #000205 100%)',
    zIndex:     '9998',
    opacity:    '0',
    transition: 'opacity 1.4s cubic-bezier(0.4,0,0.2,1)',
    pointerEvents: 'none',
  });
  document.body.appendChild(overlay);

  // Fade in
  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
    setTimeout(() => {
      onDone?.();
      // Fade out nach HUD-Reset
      setTimeout(() => {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 1500);
      }, 600);
    }, 1400);
  });
}

// ── Descent Logic ─────────────────────────────────────────────────────────

function _descendDeeper() {
  oceanState.levelsReached++;
  const lang = getLang();

  // Neue Anomalie hinzufügen (Duplikate erlaubt, aber mit Puffer)
  const available = ANOMALY_DEFS.filter(
    d => !oceanState.activeAnomalies.find(a => a.id === d.id)
  );
  const pool  = available.length > 0 ? available : ANOMALY_DEFS;
  const pick  = pool[Math.floor(Math.random() * pool.length)];
  oceanState.activeAnomalies.push(pick);
  pick.apply(oceanState);

  // Nächste Threshold skaliert exponentiell
  oceanState.nextThreshold += 5000 + (oceanState.depth * 0.5);

  // Toast
  const title = lang === 'de' ? `▼ TIEFE ${oceanState.levelsReached} ERREICHT` : `▼ DEPTH ${oceanState.levelsReached} REACHED`;
  const body  = lang === 'de'
    ? `Anomalie: ${pick.icon} ${pick.nameDE} — ${pick.descDE}`
    : `Anomaly: ${pick.icon} ${pick.nameEN} — ${pick.descEN}`;
  showToast(title, body, 4200);

  // Sonar Ping bei jedem Descent
  _spawnSonarPing();

  // SFX: Tiefen-Alarm
  try { SFX?.bossTelegraph?.(); } catch (_) {}
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Startet den Data Ocean Endless Mode.
 * Wird vom btn-dive onClick in _winScreen.js aufgerufen.
 */
export function startDataOcean() {
  // State initialisieren
  oceanState.active          = true;
  oceanState.depth           = 0;
  oceanState.nextThreshold   = 5000;
  oceanState.activeAnomalies = [];
  oceanState.levelsReached   = 0;
  oceanState.upkeepMult      = 1.0;
  oceanState.sensorBlind     = false;
  oceanState.feralNomads     = false;
  oceanState.brittleLinks    = false;

  // Win-Screen ausblenden + Dive-Transition
  _flashDiveTransition(() => {
    const winScreen = el('win-screen');
    if (winScreen) {
      winScreen.classList.remove('show');
      winScreen.style.display = 'none';
    }

    // Biome body-class
    document.body.classList.add('biome-data-ocean');

    // Alle alten Anomalie-Klassen cleanen
    ['anomaly-pressure', 'anomaly-sensor-blind', 'anomaly-feral', 'anomaly-brittle'].forEach(c =>
      document.body.classList.remove(c)
    );

    // Audio-Transition
    _applyOceanAudio();

    // Erstes Sonar-Ping
    _spawnSonarPing();

    // UI initialisieren
    _updateDepthUI();

    // HUD sicherstellen (falls ausgeblendet)
    const hud  = el('hud');
    const dock = el('ctrl-dock');
    if (hud)  hud.style.display  = 'block';
    if (dock) dock.style.display = 'flex';

    // G.runWon zurücksetzen damit die Game-Loop weiterläuft
    G.runWon = false;
    G.paused = false;
  });
}

/**
 * Per-Frame-Tick — in gameLoop._gameUpdate() nach tickSentience() einhängen.
 * @param {number} dt - Delta-Zeit in Sekunden
 */
export function tickDataOcean(dt) {
  if (!oceanState.active) return;

  // Tiefe akkumulieren: Combo × Energie-Produktion × dt
  const comboMult = comboState.mult || 1.0;
  const energyRate = Math.max(0.5, (G.income || 1));
  oceanState.depth += comboMult * energyRate * dt * 8;

  // Depth-Level Check
  if (oceanState.depth >= oceanState.nextThreshold) {
    _descendDeeper();
  }

  // Alle aktiven Anomalien ticken
  for (const anomaly of oceanState.activeAnomalies) {
    try { anomaly.tick(oceanState, dt); } catch (_) {}
  }

  // Upkeep-Multiplikator auf G anwenden
  if (oceanState.upkeepMult > 1.0 && G.l3On) {
    // Passiver Energie-Drain durch Pressure
    const drain = (oceanState.upkeepMult - 1.0) * (G.upkeepPerTick || 0.5) * dt;
    G.energy = Math.max(0, G.energy - drain);
  }

  // Brittle Links: zufälliges Reißen via window hook
  if (oceanState.brittleLinks) {
    window.__synBrittleLinkTick = () => {
      // Implementierung in _linkTopology.js oder hier per Event
      window.dispatchEvent(new CustomEvent('ocean:brittle-link-sever'));
    };
  }

  // UI aktualisieren (jedes Frame, billig)
  _updateDepthUI();
}

/**
 * Reset beim Start eines neuen Runs (aus resetMetaFlowRuntime / launchRun).
 */
export function resetDataOcean() {
  // Alle Anomalien deaktivieren
  for (const anomaly of oceanState.activeAnomalies) {
    try { anomaly.remove(oceanState); } catch (_) {}
  }

  oceanState.active          = false;
  oceanState.depth           = 0;
  oceanState.nextThreshold   = 5000;
  oceanState.activeAnomalies = [];
  oceanState.levelsReached   = 0;
  oceanState.upkeepMult      = 1.0;
  oceanState.sensorBlind     = false;
  oceanState.feralNomads     = false;
  oceanState.brittleLinks    = false;
  window.__synBrittleLinkTick = null;

  document.body.classList.remove('biome-data-ocean');
  ['anomaly-pressure', 'anomaly-sensor-blind', 'anomaly-feral', 'anomaly-brittle'].forEach(c =>
    document.body.classList.remove(c)
  );

  // obj-line zurücksetzen (wird von progression.js übernommen)
  const objLine = el('obj-line');
  if (objLine) {
    objLine.innerHTML = '';
    objLine.style.color = '';
  }
}

/**
 * Gibt den aktuellen Upkeep-Multiplikator zurück (für economy.js).
 */
export function getOceanUpkeepMult() {
  if (!oceanState.active) return 1.0;
  return oceanState.upkeepMult;
}

/**
 * Gibt zurück ob der Feral-Nomad-Modus aktiv ist (für dataNomads.js).
 */
export function isFeralNomadMode() {
  return oceanState.active && oceanState.feralNomads;
}

/**
 * Gibt zurück ob Sensor-Blindheit aktiv ist.
 */
export function isSensorBlind() {
  return oceanState.active && oceanState.sensorBlind;
}
