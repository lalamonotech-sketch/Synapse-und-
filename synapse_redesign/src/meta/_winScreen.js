/**
 * SYNAPSE v99 — Win Screen & Fail Screen UI
 *
 * Owns all DOM writes for the end-of-run screens:
 *   showWinScreen()  — stats, bars, grade, trait list, history strip
 *   showFailScreen() — partial stats + tip
 */

import { G } from '../state/gameState.js';
import { metaState, resetMetaState } from '../state/metaState.js';
import { synSettings, getLang } from '../state/settings.js';
import { safeRestart } from '../engine/dispose.js';
import { LS_SAVE } from '../state/saveSystem.js';
import { getBossWinClass } from '../state/bossShared.js';
import { el } from '../util/dom.js';
import { escapeHtml, loadRunHistory, saveRunHistory } from './_runHistory.js';
import {
  fmtDuration, fmtNum, profileLabel, getConditionLabel,
  calculateBars, overallGrade, buildRunSummary, updateMetaWithRun,
} from './_summary.js';
import { getActiveProtocolId, PROTOCOL_DEFS } from '../systems/protocols.js';
import { injectResearchSummary, mountGeneticMemoryOverlay, updateAPBadge } from '../systems/epochReveal.js';
import { bankAwakeningPoints } from '../systems/awakening.js';
import { computeResearchAP } from '../systems/research.js';
import { loadAIMetaCached } from '../systems/ai/index.js';
import { renderHistoryPanel } from './_history.js';
import { populateTitleMetaBox } from './screens.js';
import { onRunEnd } from './screens.js';
import { renderPostRunBreakdown } from './postRunBreakdown.js';
import { recordRunResult } from '../state/masteryState.js';
import { startDataOcean }   from '../systems/dataOcean.js'; // Post-Game: Data Ocean


function lang() { return getLang(); }

function setText(id, text) {
  const node = el(id);
  if (node) node.textContent = text ?? '';
}

function protocolLabel(protocolId) {
  const p = PROTOCOL_DEFS?.[protocolId];
  if (!p) return '—';
  return lang() === 'de' ? (p.nameDe || p.id) : (p.nameEn || p.id);
}

function tierLabel(tier) {
  const t = Number(tier || 1);
  return t === 3 ? 'Tier III' : t === 2 ? 'Tier II' : 'Tier I';
}

// ── Win Screen ────────────────────────────────────────────────────────────

export function showWinScreen(summary, meta, newTraits = []) {
  const winScreen = el('win-screen');
  if (!winScreen) return;
  if (winScreen.classList.contains('show')) return;

  const bars = calculateBars(summary);
  const grade = overallGrade(summary, bars);
  const history = loadRunHistory();

  winScreen.classList.add('show');
  winScreen.classList.remove('boss-ghost', 'boss-sigma', 'boss-vortex', 'boss-parasite', 'boss-null');
  if (getBossWinClass()) winScreen.classList.add(getBossWinClass().replace(/^win-/, '').replace(/^boss-/, 'boss-'));

  setText('win-mode', `${profileLabel(summary.profile)} · ${protocolLabel(summary.protocolId)} · ${(synSettings.difficulty || 'normal').toUpperCase()}`);
  const tierEl = el('win-tier');
  if (tierEl) { tierEl.style.display = ''; tierEl.textContent = tierLabel(summary.winTier); }
  el('win-perfect')?.classList.toggle('show', !!summary.perfect);

  setText('ws-time',         summary.durationLabel);
  setText('ws-peak',         `${fmtNum(summary.peakEnergy)}⬡`);
  setText('ws-tris',         fmtNum(summary.triangles));
  setText('ws-bridges',      fmtNum(summary.activeBridges));
  setText('ws-pulses',       fmtNum(summary.pulses));
  setText('ws-clusters',     `${fmtNum(summary.capturedClusters)} / ${fmtNum(summary.fusionPairs)}`);
  setText('ws-spine',        `${fmtNum(summary.spineLength)} / ${summary.backboneActive ? 'ON' : 'OFF'}`);
  setText('ws-upgrades',     fmtNum(summary.upgrades));
  setText('ws-events',       fmtNum(summary.events));
  setText('ws-boss-acc',     `${fmtNum(summary.bossAccuracy)}%`);
  setText('ws-boss-time',    summary.bossDurationSec ? fmtDuration(summary.bossDurationSec) : '—');
  setText('ws-dominant-tag', profileLabel(summary.profile));
  setText('ws-synergies',    summary.synergies.length ? summary.synergies.join(' · ') : '—');
  setText('ws-draft-picks',  fmtNum(summary.draftPicks));
  setText('ws-train-scores', ['routing', 'timing', 'stability', 'memory'].map(k => `${k[0].toUpperCase()}:${fmtNum(summary.trainScores[k])}`).join(' · '));
  setText('ws-node-mix',     `S:${summary.nodeMix.source || 0} · R:${summary.nodeMix.relay || 0} · A:${summary.nodeMix.amplifier || 0} · M:${summary.nodeMix.memory || 0}`);
  setText('ws-layer-times',  `D ${fmtDuration(summary.layerTimes.dormant || 0)} · L1 ${fmtDuration(summary.layerTimes.l1 || 0)} · L2 ${fmtDuration(summary.layerTimes.l2 || 0)} · L3 ${fmtDuration(summary.layerTimes.l3 || 0)}`);
  setText('ws-awareness',    summary.awarenessLabel);
  setText('ws-condition',    getConditionLabel());
  setText('ws-elite-results',summary.eliteResults.length ? summary.eliteResults.map(i => `${i.name}:${i.result}`).join(' · ') : '—');

  // Grade
  const gradeEl = el('win-grade');
  if (gradeEl) gradeEl.textContent = grade;

  // Performance bars
  for (const [key, val] of Object.entries(bars)) {
    const fillEl = el(`ws-bar-${key}`);
    if (fillEl) fillEl.style.transform = `scaleX(${Math.max(0,Math.min(1,val/100))})`; // v99 perf
    const numEl = el(`ws-bar-${key}-num`);
    if (numEl) numEl.textContent = val;
  }

  // Questline result
  if (summary.questline) {
    setText('ws-questline', `${escapeHtml(summary.questline.name || summary.questline.id)} ${summary.questline.completed ? (lang() === 'de' ? '✓ Abgeschlossen' : '✓ Completed') : (lang() === 'de' ? '– Nicht beendet' : '– Incomplete')}`);
  }

  // New traits
  const traitsEl = el('win-new-traits');
  if (traitsEl) {
    traitsEl.style.display = newTraits.length ? '' : 'none';
    traitsEl.innerHTML = newTraits.map(t => `<span class="hp-trait-item">${escapeHtml(t)}</span>`).join(' ');
  }

  // Win-screen history strip
  _renderWinHistory(history, meta);
  _renderWinProgression(history, meta, summary);
  _renderWinTimeline();

  // Data Ocean: ABTAUCHEN-Button einblenden
  _setupDiveButton(summary);
}

// ── Data Ocean: Dive Button Setup ────────────────────────────────────────

/**
 * Zeigt den ABTAUCHEN-Button wenn der Spieler Tier III oder Tier II erreicht hat.
 * Der Button triggert startDataOcean() und beendet die Anzeige des Win-Screens.
 */
function _setupDiveButton(summary) {
  // Tier I zeigt den Button nicht — erster echter Sieg muss zuerst kommen
  const diveEligible = (summary.winTier || 1) >= 2;

  let btn = el('btn-dive');
  if (!btn) {
    // Dynamisch erstellen falls nicht im HTML
    btn = document.createElement('button');
    btn.id        = 'btn-dive';
    btn.className = 'dive-btn';
    btn.type      = 'button';
    const restartBtn = el('win-restart');
    if (restartBtn?.parentNode) {
      restartBtn.parentNode.insertBefore(btn, restartBtn.nextSibling);
    }
  }

  const l = lang();
  btn.textContent = l === 'de' ? '▼ ABTAUCHEN (ENDLESS)' : '▼ DIVE IN (ENDLESS)';
  btn.title       = l === 'de'
    ? 'Betritt den Data Ocean — der Abgrund wartet.'
    : 'Enter the Data Ocean — the abyss awaits.';

  if (diveEligible) {
    btn.classList.add('visible');
    btn.style.display = '';
  } else {
    btn.classList.remove('visible');
    btn.style.display = 'none';
  }

  // onClick: Dive-Transition starten
  btn.onclick = () => {
    try { startDataOcean(); } catch (e) { console.warn('[DataOcean] startDataOcean failed:', e); }
  };
}

function _renderWinTimeline() {
  const rows = el('win-timeline-rows');
  const empty = el('win-timeline-empty');
  if (!rows || !empty) return;
  const items = Array.isArray(metaState.runTimeline) ? metaState.runTimeline : [];
  rows.innerHTML = items.map(item => `<div style="display:flex;align-items:center;gap:8px;font-size:.34rem;letter-spacing:1.5px;color:${escapeHtml(item.color || 'rgba(255,255,255,.7)')};padding:2px 0"><span style="opacity:.85;min-width:14px">${escapeHtml(item.icon || '•')}</span><span style="flex:1">${escapeHtml(item.label || item.type || 'Event')}</span><span style="opacity:.35">${escapeHtml(item.tsLabel || '')}</span></div>`).join('');
  empty.style.display = items.length ? 'none' : 'block';
}

function _renderWinHistory(history, meta) {
  const rows = el('win-history-rows');
  const codex = el('win-history-codex');
  const tierLabel_ = t => t === 3 ? 'Tier III' : t === 2 ? 'Tier II' : 'Tier I';
  const rowHtml = (run, idx) => `<div class="hp-row"><span class="hp-run-num">${idx === 0 ? 'Neu' : '#' + (idx + 1)}</span><span class="hp-tier t${Math.max(1, Math.min(3, run.tier || 1))}">${escapeHtml(tierLabel_(run.tier))}</span><span class="hp-profile">${escapeHtml(profileLabel(run.profile))}</span><span class="hp-time">${escapeHtml(fmtDuration(run.duration))}</span></div>`;
  if (rows) {
    const recent = [...history].reverse().slice(0, 5);
    rows.innerHTML = recent.length ? recent.map((r, i) => rowHtml(r, i)).join('') : `<div style="opacity:.22">${lang() === 'de' ? 'Noch keine Historie' : 'No history yet'}</div>`;
  }
  if (codex) {
    const traits = meta.unlockedTraits || [];
    const parts = [`${lang() === 'de' ? 'Runs' : 'Runs'}: ${meta.totalRuns || 0}`, `${lang() === 'de' ? 'Traits' : 'Traits'}: ${traits.length}`];
    if (meta.dominantOverall) parts.push(`${lang() === 'de' ? 'Profil' : 'Profile'}: ${profileLabel(meta.dominantOverall)}`);
    codex.textContent = parts.join(' · ');
  }
}

function _renderWinProgression(history, meta, summary) {
  const tierLabel_ = t => t === 3 ? 'Tier III' : t === 2 ? 'Tier II' : 'Tier I';
  const rowHtml = (run, idx) => `<div class="hp-row"><span class="hp-run-num">#${idx + 1}</span><span class="hp-tier t${Math.max(1, Math.min(3, run.tier || 1))}">${escapeHtml(tierLabel_(run.tier))}</span><span class="hp-profile">${escapeHtml(profileLabel(run.profile))}</span><span class="hp-time">${escapeHtml(fmtDuration(run.duration))}</span></div>`;

  const progBest = el('prog-best-runs');
  if (progBest) {
    const best = [...history].sort((a, b) => (b.tier || 0) - (a.tier || 0) || (a.duration || 99999) - (b.duration || 99999)).slice(0, 3);
    progBest.innerHTML = best.length ? best.map((r, i) => rowHtml(r, i)).join('') : '';
  }

  const traitList = el('prog-trait-list');
  if (traitList) {
    const traits = meta.unlockedTraits || [];
    traitList.innerHTML = traits.length ? traits.slice(-8).map(t => `<span class="hp-trait-item">${escapeHtml(t)}</span>`).join(' ') : `<span style="opacity:.22">${lang() === 'de' ? 'Noch keine Traits' : 'No traits yet'}</span>`;
  }

  const compare = el('win-run-compare');
  if (compare) {
    const prevBest = [...history].slice(0, -1).sort((a, b) => (b.tier || 0) - (a.tier || 0) || (a.duration || 99999) - (b.duration || 99999))[0];
    const isNewBest = !prevBest || (summary.winTier > (prevBest.tier || 0)) || (summary.winTier === (prevBest.tier || 0) && summary.durationSec < (prevBest.duration || Infinity));
    compare.style.display = '';
    compare.classList.toggle('new-best', isNewBest);
    compare.textContent = isNewBest ? (lang() === 'de' ? '★ Neuer Bestlauf' : '★ New best run') : (lang() === 'de' ? `Bester Lauf bleibt ${tierLabel_(prevBest?.tier || 1)}` : `Best run remains ${tierLabel_(prevBest?.tier || 1)}`);
  }

  const nextRunBox = el('prog-next-run');
  const nextObj = el('prog-next-objectives');
  if (nextRunBox && nextObj) {
    const objectives = meta.metaObjectivesGenerated || [];
    nextRunBox.style.display = objectives.length ? '' : 'none';
    nextObj.textContent = objectives.map(obj => lang() === 'de' ? obj.de : obj.en).join(' · ');
  }
}

// ── Fail Screen ───────────────────────────────────────────────────────────

function _epochLabel(idx) {
  const names = { 0: 'Epoch I · Mechanical', 1: 'Epoch II · Reactive', 2: 'Epoch III · Temporal', 3: 'Epoch IV · Sentience' };
  return names[idx] || `Epoch ${idx}`;
}

export function showFailScreen(stats = {}) {
  const screen = el('fail-screen');
  if (!screen || screen.classList.contains('show')) return;
  const s = (id, v) => { const n = el(id); if (n) n.textContent = v ?? ''; };

  s('fs-time',     stats.durationLabel || fmtDuration(stats.durationSec || 0));
  s('fs-epoch',    _epochLabel(stats.epochReached || 0));
  s('fs-energy',   `${fmtNum(stats.peakEnergy)}⬡`);
  s('fs-nodes',    fmtNum(stats.nodesPlaced));
  s('fs-research', fmtNum(stats.researchCompleted));
  s('fs-tris',     fmtNum(stats.triangles));

  if (stats.apEarned > 0) {
    const apEl = el('fail-ap-earned');
    if (apEl) apEl.textContent = `◈ +${stats.apEarned} Awakening Points`;
  }
  const hintEl = el('fail-hint');
  if (hintEl) {
    const hints = [
      stats.epochReached < 1  ? 'Tipp: 300+ Gesamtenergie oder 1000 Spitzenenergie bringen — Epoch II schaltet Research frei.' : null,
      stats.researchCompleted < 1 ? 'Tipp: Ersten Research abschließen — jedes Projekt bringt AP und Netzwerk-Boni.' : null,
      stats.nodesPlaced < 4   ? 'Tipp: Früh mehr Memory-Nodes platzieren für stabilen Data-Flow.' : null,
    ].filter(Boolean);
    hintEl.textContent = hints[0] || '';
  }
  const btn = el('fail-restart');
  if (btn) btn.onclick = () => { try { safeRestart(); } catch (_) {} };
  screen.classList.add('show');
}
