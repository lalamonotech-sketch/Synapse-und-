/**
 * SYNAPSE v99 — Post-Run Breakdown (Extended Analytics)
 *
 * Renders a detailed analytics panel onto the Win/Fail screen showing:
 *   A. Energy efficiency curve (sampled over the run)
 *   B. Decision path (draft picks with timing)
 *   C. AI profile arc (awareness stage progression)
 *   D. Mastery progress delta (new milestones unlocked)
 *
 * Usage:
 *   import { renderPostRunBreakdown } from './meta/postRunBreakdown.js';
 *   // After showWinScreen() or showFailScreen():
 *   renderPostRunBreakdown(summary, newMilestones);
 *
 * UI CONTRACT
 *   Expects a container: id="post-run-breakdown"
 *   If absent, renders nothing (graceful no-op).
 */

import { metaState }  from '../state/metaState.js';
import { getLang }     from '../state/settings.js';
import { G_DRAFT }     from './flow.js';
import { mastery }     from '../state/masteryState.js';

function lang() { return getLang?.() || 'de'; }
const isDE = () => lang() === 'de';

// ── Tiny SVG sparkline (energy curve) ─────────────────────────────────────

function _sparkline(samples, width = 220, height = 36) {
  if (!samples || samples.length < 2) return '';
  const max = Math.max(...samples, 1);
  const pts = samples.map((v, i) => {
    const x = Math.round((i / (samples.length - 1)) * width);
    const y = Math.round(height - (v / max) * height);
    return `${x},${y}`;
  }).join(' ');
  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"
    style="display:block;overflow:visible" xmlns="http://www.w3.org/2000/svg">
    <polyline points="${pts}"
      fill="none" stroke="rgba(80,200,255,.7)" stroke-width="1.5"
      stroke-linejoin="round" stroke-linecap="round"/>
    <polyline points="0,${height} ${pts} ${width},${height}"
      fill="url(#ef)" stroke="none"/>
    <defs>
      <linearGradient id="ef" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="rgba(80,200,255,.25)"/>
        <stop offset="100%" stop-color="rgba(80,200,255,0)"/>
      </linearGradient>
    </defs>
  </svg>`;
}

// ── Bar renderer ──────────────────────────────────────────────────────────

function _bar(label, value, max, color = 'rgba(80,200,255,.7)') {
  const pct = Math.round(Math.min(100, (value / Math.max(1, max)) * 100));
  return `<div style="margin-bottom:5px">
    <div style="display:flex;justify-content:space-between;font-size:.55rem;letter-spacing:2px;color:rgba(160,210,255,.55);margin-bottom:2px">
      <span>${label}</span><span>${value}</span>
    </div>
    <div style="height:3px;background:rgba(60,100,160,.25);border-radius:2px">
      <div style="height:100%;width:${pct}%;background:${color};border-radius:2px;transition:width .6s cubic-bezier(.22,1,.36,1)"></div>
    </div>
  </div>`;
}

// ── Section A: Energy Curve ────────────────────────────────────────────────

function _sectionEnergy(summary) {
  const tel = metaState.telemetry || {};
  const samples = tel._energySamples || [];
  const avg = summary.avgEnergy || 0;
  const peak = summary.peakEnergy || 0;
  const effPct = peak > 0 ? Math.round((avg / peak) * 100) : 0;

  const label = isDE()
    ? `Energie-Effizienz · Ø ${avg}⬡ von ${peak}⬡ Peak (${effPct}%)`
    : `Energy efficiency · avg ${avg}⬡ of ${peak}⬡ peak (${effPct}%)`;

  return `
    <div class="prb-section">
      <div class="prb-section-title">${isDE() ? '⬡ ENERGIE-KURVE' : '⬡ ENERGY CURVE'}</div>
      <div style="margin:6px 0 2px">${_sparkline(samples)}</div>
      <div class="prb-label">${label}</div>
      ${_bar(isDE() ? 'Effizienz' : 'Efficiency', effPct, 100, 'rgba(100,230,180,.7)')}
    </div>`;
}

// ── Section B: Decision Path ───────────────────────────────────────────────

function _sectionDecisions(summary) {
  const picks = G_DRAFT?.appliedUpgrades || [];
  if (!picks.length) return '';

  // Timeline: metaState.runTimeline has {type, t, label} entries
  const draftEvents = (metaState.runTimeline || [])
    .filter(e => e.type === 'draft')
    .slice(0, 6); // max 6 shown

  const rows = picks.map((id, i) => {
    const ev = draftEvents[i];
    const timeStr = ev ? `${Math.round(ev.t / 60)}min` : '—';
    const label = id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return `<div class="prb-decision-row">
      <span class="prb-decision-num">${i + 1}</span>
      <span class="prb-decision-label">${label}</span>
      <span class="prb-decision-time">${timeStr}</span>
    </div>`;
  }).join('');

  return `
    <div class="prb-section">
      <div class="prb-section-title">${isDE() ? '◈ ENTSCHEIDUNGSPFAD' : '◈ DECISION PATH'}</div>
      <div class="prb-decision-list">${rows}</div>
    </div>`;
}

// ── Section C: AI Profile Arc ──────────────────────────────────────────────

function _sectionAIArc(summary) {
  const stageNames = isDE()
    ? ['Passiv', 'Beobachtend', 'Adaptiv', 'Strategisch', 'Autonom']
    : ['Passive', 'Observing', 'Adaptive', 'Strategic', 'Autonomous'];

  const finalStage = summary.awarenessStage ?? 0;
  const profile = summary.profile || null;

  const dots = stageNames.map((name, i) => {
    const reached = i <= finalStage;
    const active  = i === finalStage;
    return `<div class="prb-stage-dot ${reached ? 'reached' : ''} ${active ? 'active' : ''}" title="${name}">
      <div class="prb-stage-pip"></div>
      <div class="prb-stage-name">${name}</div>
    </div>`;
  }).join('<div class="prb-stage-line"></div>');

  const profileLine = profile
    ? (isDE() ? `Dominantes Profil: ${profile}` : `Dominant profile: ${profile}`)
    : (isDE() ? 'Kein dominantes Profil' : 'No dominant profile');

  return `
    <div class="prb-section">
      <div class="prb-section-title">${isDE() ? '◉ KI-PROFIL-VERLAUF' : '◉ AI PROFILE ARC'}</div>
      <div class="prb-stage-track">${dots}</div>
      <div class="prb-label" style="margin-top:6px">${profileLine}</div>
    </div>`;
}

// ── Section D: Mastery Delta ───────────────────────────────────────────────

function _sectionMastery(newMilestones) {
  if (!newMilestones?.length) return '';

  const milestoneLabels = {
    protocol_sentinel: isDE() ? '🔓 Protokoll: Sentinel freigeschaltet' : '🔓 Protocol: Sentinel unlocked',
    protocol_cascade:  isDE() ? '🔓 Protokoll: Cascade freigeschaltet'  : '🔓 Protocol: Cascade unlocked',
    win1_pulseCd:      isDE() ? '⚡ Pulse-CD −100 ms (permanent)'       : '⚡ Pulse CD −100 ms (permanent)',
    win5_pulseCd:      isDE() ? '⚡ Pulse-CD −300 ms (kumulativ)'       : '⚡ Pulse CD −300 ms (cumulative)',
    win10_pulseCd:     isDE() ? '⚡ Pulse-CD −500 ms (Maximum)'         : '⚡ Pulse CD −500 ms (maximum)',
    tier2_energy:      isDE() ? '⬡ Start-Energie +10⬡ (permanent)'      : '⬡ Starting energy +10⬡ (permanent)',
    tier3_energy:      isDE() ? '⬡ Start-Energie +30⬡ (Maximum)'        : '⬡ Starting energy +30⬡ (maximum)',
  };

  const items = newMilestones.map(id => {
    const label = milestoneLabels[id] || id;
    return `<div class="prb-milestone">${label}</div>`;
  }).join('');

  return `
    <div class="prb-section prb-section-mastery">
      <div class="prb-section-title">${isDE() ? '🏆 MASTERY — NEU' : '🏆 MASTERY — NEW'}</div>
      ${items}
    </div>`;
}

// ── CSS injection (one-time) ──────────────────────────────────────────────

let _cssInjected = false;
function _injectCSS() {
  if (_cssInjected || typeof document === 'undefined') return;
  _cssInjected = true;
  const style = document.createElement('style');
  style.id = 'prb-styles';
  style.textContent = `
    #post-run-breakdown {
      font-family: 'Share Tech Mono', monospace;
      padding: 10px 0 4px;
      border-top: 1px solid rgba(80,130,255,.12);
      margin-top: 12px;
    }
    .prb-section {
      margin-bottom: 14px;
    }
    .prb-section-title {
      font-size: .48rem;
      letter-spacing: 4px;
      text-transform: uppercase;
      color: rgba(100,180,255,.45);
      margin-bottom: 6px;
    }
    .prb-label {
      font-size: .52rem;
      letter-spacing: 1.5px;
      color: rgba(160,210,255,.55);
    }
    .prb-decision-list { display: flex; flex-direction: column; gap: 3px; }
    .prb-decision-row {
      display: grid;
      grid-template-columns: 18px 1fr auto;
      align-items: center;
      gap: 6px;
      font-size: .52rem;
      letter-spacing: 1px;
      color: rgba(180,220,255,.7);
    }
    .prb-decision-num  { color: rgba(100,180,255,.5); }
    .prb-decision-time { color: rgba(120,200,140,.6); font-size: .48rem; }
    .prb-stage-track {
      display: flex;
      align-items: center;
      gap: 0;
      margin: 6px 0;
    }
    .prb-stage-dot {
      display: flex; flex-direction: column; align-items: center; gap: 3px;
      opacity: .28;
    }
    .prb-stage-dot.reached { opacity: .65; }
    .prb-stage-dot.active  { opacity: 1; }
    .prb-stage-pip {
      width: 8px; height: 8px; border-radius: 50%;
      background: rgba(80,180,255,.4);
      border: 1px solid rgba(80,180,255,.6);
    }
    .prb-stage-dot.active .prb-stage-pip {
      background: rgba(100,230,180,.8);
      box-shadow: 0 0 8px rgba(80,255,180,.5);
    }
    .prb-stage-name { font-size: .4rem; letter-spacing: 1px; color: rgba(160,210,255,.5); }
    .prb-stage-line {
      flex: 1; height: 1px;
      background: rgba(80,130,255,.18);
      margin-bottom: 12px;
    }
    .prb-milestone {
      font-size: .52rem;
      letter-spacing: 2px;
      color: rgba(255,210,80,.88);
      text-shadow: 0 0 10px rgba(255,180,40,.35);
      margin-bottom: 3px;
    }
  `;
  document.head.appendChild(style);
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Render the extended post-run breakdown into #post-run-breakdown.
 * @param {object} summary        - from buildRunSummary()
 * @param {string[]} newMilestones - from recordRunResult()
 */
export function renderPostRunBreakdown(summary, newMilestones = []) {
  const container = document.getElementById('post-run-breakdown');
  if (!container) return;

  _injectCSS();

  container.innerHTML = [
    _sectionEnergy(summary),
    _sectionDecisions(summary),
    _sectionAIArc(summary),
    _sectionMastery(newMilestones),
  ].filter(Boolean).join('');
}

/**
 * Clear the breakdown panel.
 */
export function clearPostRunBreakdown() {
  const el = document.getElementById('post-run-breakdown');
  if (el) el.innerHTML = '';
}

// Energy sampling — call from heartbeat to populate the curve
// Attach to telemetry so it survives between calls
const MAX_SAMPLES = 60;
export function sampleEnergy(energyValue) {
  const tel = metaState.telemetry;
  if (!tel) return;
  if (!tel._energySamples) tel._energySamples = [];
  tel._energySamples.push(Math.round(energyValue));
  if (tel._energySamples.length > MAX_SAMPLES) tel._energySamples.shift();
}
