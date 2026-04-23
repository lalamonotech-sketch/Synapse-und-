/**
 * SYNAPSE v99 — UI HUD: Layer-3 HUD panels
 *
 * Extracted from hud.js (was lines 647–838).
 * Owns:
 *   initL3HUDUI            – one-time DOM setup for cluster + objective panel
 *   updateL3ClusterHUDUI   – per-frame cluster slot state
 *   updateL3ObjectivesUI   – objective list rendering
 *   startSyncDecayBarUI    – animated sync decay progress bar
 *   stopSyncDecayBarUI     – cancel the sync decay bar
 */

import { G }       from '../../state/gameState.js';
import { getLang } from '../../state/settings.js';
import { el }      from './_domCache.js';

// ─── L3 HUD slot cache ────────────────────────────────────────────────────
const _l3HudCache = {
  headerEl:      null,
  objLabelEl:    null,
  headerText:    '',
  headerClass:   '',
  objectiveSig:  '',
  slots:         [],
};

// ═══════════════════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════════════════

export function initL3HUDUI(clusters, objectives = []) {
  const hud = el('l3-hud');
  if (!hud) return;
  _l3HudCache.headerEl    = null;
  _l3HudCache.objLabelEl  = null;
  _l3HudCache.headerText  = '';
  _l3HudCache.headerClass = '';
  _l3HudCache.objectiveSig = '';
  _l3HudCache.slots       = [];
  hud.style.display = 'flex';
  hud.innerHTML = '<div id="l3-hud-label">L3 · CLUSTER</div><div id="l3-hud-header">0 / 8</div><div id="l3-hud-sep"></div>';
  clusters.forEach((_, i) => {
    const div = document.createElement('div');
    div.className = 'cl-slot';
    div.id = 'cl-' + i;
    div.innerHTML = '<span class="cl-state"></span><span class="cl-id">C' + (i + 1) + '</span><div class="cl-dot"></div>';
    hud.appendChild(div);
  });
  const obj = el('l3-obj');
  if (obj) {
    obj.style.display = 'flex';
    if (!document.getElementById('l3-obj-label')) {
      const lbl = document.createElement('div');
      lbl.id = 'l3-obj-label';
      lbl.textContent = 'ZIELE';
      obj.prepend(lbl);
    }
  }
  updateL3ObjectivesUI(objectives);
}

// ═══════════════════════════════════════════════════════════════════════════
//  CLUSTER HUD
// ═══════════════════════════════════════════════════════════════════════════

export function updateL3ClusterHUDUI({ clusters, capturedCount, spineNodes, spineLength, fusedPairs, macLinks }) {
  const hdr = _l3HudCache.headerEl || (_l3HudCache.headerEl = document.getElementById('l3-hud-header'));
  if (hdr) {
    const nextText  = `${capturedCount} / 8`;
    const nextClass = capturedCount >= 6 ? 'near-win' : '';
    if (_l3HudCache.headerText !== nextText) {
      _l3HudCache.headerText = nextText;
      hdr.innerText = nextText;
    }
    if (_l3HudCache.headerClass !== nextClass) {
      _l3HudCache.headerClass = nextClass;
      hdr.className = nextClass;
    }
  }

  const pairedIdx = new Set();
  const fusedIdx  = new Set();
  (macLinks || []).forEach(lk => {
    if (!lk.isHighway) return;
    const ca = clusters[lk.coreA], cb = clusters[lk.coreB];
    if (ca?.captured && cb?.captured) { pairedIdx.add(lk.coreA); pairedIdx.add(lk.coreB); }
  });
  for (const key of fusedPairs || []) {
    const dash = key.indexOf('-');
    fusedIdx.add(+key.slice(0, dash));
    fusedIdx.add(+key.slice(dash + 1));
  }

  clusters.forEach((cl, i) => {
    const slotCache = _l3HudCache.slots[i] || (_l3HudCache.slots[i] = { cls: '', state: '', node: null, stateEl: null });
    const node = slotCache.node || (slotCache.node = document.getElementById('cl-' + i));
    if (!node) return;
    const isPaired = pairedIdx.has(i);
    const isSpine  = spineNodes?.has?.(i) && spineLength >= 3;
    const isFused  = fusedIdx.has(i);
    let cls = 'cl-slot';
    if (cl._dormant)         cls += ' dormant';
    else if (cl.syncWindowOpen) cls += ' open';
    else if (cl.syncReady)   cls += ' syncing';
    else if (isFused)        cls += ' fused';
    else if (isSpine)        cls += ' spine-node';
    else if (isPaired)       cls += ' pair-linked';
    else if (cl.captured)    cls += ' captured';
    if (slotCache.cls !== cls) { slotCache.cls = cls; node.className = cls; }

    const stateEl = slotCache.stateEl || (slotCache.stateEl = node.querySelector('.cl-state'));
    if (!stateEl) return;
    let s = '';
    if (cl._dormant) s = '—';
    else if (cl._eliteType === 'phantom_nexus' && cl._eliteActive && cl.syncWindowOpen) s = '◉phn';
    else if (cl.syncWindowOpen) s = '◉';
    else if (cl._eliteType === 'phantom_nexus' && !cl.captured) s = 'phn';
    else if (cl.syncReady)   s = '◎';
    else if (isFused)        s = '⬡⬡';
    else if (isSpine)        s = '⬟';
    else if (isPaired)       s = '⬡';
    else if (cl.captured)    s = '✦';
    if (slotCache.state !== s) { slotCache.state = s; stateEl.textContent = s; }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  OBJECTIVES
// ═══════════════════════════════════════════════════════════════════════════

function formatL3Progress(entry) {
  if (!entry || entry.done) return '';
  switch (entry.id) {
    case 'capture1':    return ` (${Math.min(1, G.l3CapturedClusters || 0)}/1)`;
    case 'capture4':    return ` (${Math.min(4, G.l3CapturedClusters || 0)}/4)`;
    case 'coreConn2':   return ` (${Math.min(2, G.l3ConnectedCores   || 0)}/2)`;
    case 'spine3':      return ` (${Math.min(3, G.spineLength        || 0)}/3)`;
    case 'backbone4':   return ` (${Math.min(4, G.spineLength        || 0)}/4)`;
    case 'allClusters': return ` (${Math.min(8, G.l3CapturedClusters || 0)}/8)`;
    default:            return '';
  }
}

export function updateL3ObjectivesUI(objectives = []) {
  const obj = el('l3-obj');
  if (!obj) return;
  const lang = getLang();
  const getLabel = entry => (lang !== 'de' && entry.labelEN) ? entry.labelEN : entry.label;
  const sig = objectives.map((entry, i) => {
    const active = !entry.done && (i === 0 || objectives[i - 1].done);
    return `${entry.done ? 1 : 0}:${active ? 1 : 0}:${lang}:${getLabel(entry)}:${formatL3Progress(entry)}`;
  }).join('|');
  if (_l3HudCache.objectiveSig === sig) return;
  _l3HudCache.objectiveSig = sig;

  const label = _l3HudCache.objLabelEl || (_l3HudCache.objLabelEl = document.getElementById('l3-obj-label'));
  obj.innerHTML = '';
  if (label) obj.appendChild(label);
  objectives.forEach((entry, i) => {
    const row = document.createElement('div');
    const active = !entry.done && (i === 0 || objectives[i - 1].done);
    row.className = 'l3o' + (entry.done ? ' done' : active ? ' active' : '');
    row.innerText = getLabel(entry) + formatL3Progress(entry);
    obj.appendChild(row);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  SYNC DECAY BAR  (UI only — logic lives in _l3Animate.js)
// ═══════════════════════════════════════════════════════════════════════════

let syncDecayRaf      = null;
let syncDecayStart    = 0;
let syncDecayDuration = 0;
let syncDecayFusion   = false;

export function startSyncDecayBarUI(duration, isFusion) {
  const wrap = el('sync-decay-bar-wrap');
  const fill = el('sync-decay-fill');
  if (!wrap || !fill) return;
  syncDecayStart    = Date.now();
  syncDecayDuration = duration;
  syncDecayFusion   = !!isFusion;
  fill.classList.remove('critical', 'fusion');
  if (syncDecayFusion) fill.classList.add('fusion');
  fill.style.transform = 'scaleX(1)'; // v99 perf
  wrap.classList.add('vis');
  if (syncDecayRaf) cancelAnimationFrame(syncDecayRaf);

  const tick = () => {
    const elapsed = Date.now() - syncDecayStart;
    const frac = Math.max(0, 1 - (elapsed / Math.max(1, syncDecayDuration)));
    fill.style.transform = `scaleX(${Math.max(0,Math.min(1,frac))})`; // v99 perf
    fill.classList.toggle('critical', frac < 0.25 && !syncDecayFusion);
    if (frac > 0 && wrap.classList.contains('vis')) {
      syncDecayRaf = requestAnimationFrame(tick);
    } else {
      wrap.classList.remove('vis');
      syncDecayRaf = null;
    }
  };
  syncDecayRaf = requestAnimationFrame(tick);
}

export function stopSyncDecayBarUI() {
  el('sync-decay-bar-wrap')?.classList.remove('vis');
  if (syncDecayRaf) { cancelAnimationFrame(syncDecayRaf); syncDecayRaf = null; }
}
