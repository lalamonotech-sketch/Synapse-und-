/**
 * SYNAPSE v99 — Layer 3: Macro Clusters (index / orchestrator)
 *
 * Refactored from the v98 monolith layer3.js (1709 lines) into focused sub-modules:
 *
 *   _l3Materials.js    — MM material pack, macNodes/macLinks/macCores arrays,
 *                        render helpers (_setCoreMaterial, _setCoreEmissiveHex),
 *                        HUD-change-signal throttle
 *   _l3Elites.js       — ELITE_CLUSTER_DEFS (5 encounters) + LAYER_CONDITIONS +
 *                        selectLayerCondition()
 *   _l3Projects.js     — STRATEGIC_PROJECTS (4 defs) + project API:
 *                        checkProjectTriggers, accumulateMemoryCache,
 *                        applyEchoBeaconEliteBoost, applyBackboneRelayBossBonus,
 *                        applyMemoryCacheDischargeBonus, getEchoBeaconRareBonus
 *   _l3ClusterLogic.js — countConnectedCorePairs, checkSpine, tryFusion,
 *                        captureOpenClusters, checkL3Objectives, updateL3ClusterHUD
 *   _l3Animate.js      — startSyncDecayBar, stopSyncDecayBar, animateLayer3
 *
 * This file is the public API surface. All existing import paths
 * 'layers/meta/layer3.js' or 'layers/meta/index.js' continue to work.
 */

import * as THREE from 'three';
import { macGroup, GS, clock } from '../../engine/scene.js';
import { G }                   from '../../state/gameState.js';
import { getLang }             from '../../state/settings.js';
import { TUNING }              from '../../state/tuning.js';
import { protocolState }       from '../../systems/protocols.js';
import { conditionState, getActiveConditionId } from '../../state/runContext.js';
import { metaState }           from '../../state/metaState.js';
import { regTimer, clearTimer } from '../../registries/timerRegistry.js';
import { loadAIMeta }          from '../../systems/ai/index.js';
import { showProtocolChip }    from '../../systems/protocols.js';
import { setNowAction, clearNowAction } from '../../ui/actionFlow.js';
import { onboarding }          from '../../meta/onboarding.js';

// ── Sub-modules ───────────────────────────────────────────────────────────
export { MM, macNodes, macLinks, macCores } from './_l3Materials.js';
export { ELITE_CLUSTER_DEFS, selectLayerCondition } from './_l3Elites.js';
export {
  checkProjectTriggers,
  accumulateMemoryCache,
  applyEchoBeaconEliteBoost,
  applyBackboneRelayBossBonus,
  applyMemoryCacheDischargeBonus,
  getEchoBeaconRareBonus,
} from './_l3Projects.js';
export {
  countConnectedCorePairs,
  checkSpine,
  checkSpineAlmost,
  tryFusion,
  captureOpenClusters,
  checkL3Objectives,
  updateL3ClusterHUD,
} from './_l3ClusterLogic.js';
export { startSyncDecayBar, stopSyncDecayBar, animateLayer3 } from './_l3Animate.js';

// ── Local imports needed for initLayer3 ──────────────────────────────────
import { MM, macNodes, macLinks, macCores } from './_l3Materials.js';
import { ELITE_CLUSTER_DEFS, selectLayerCondition } from './_l3Elites.js';
import { initStrategicProjects } from './_l3Projects.js';
import { initL3HUD } from './_l3ClusterLogic.js';

// ═══════════════════════════════════════════════════════════════════════════
//  ELITE CLUSTER ASSIGNMENT  (private — called only from initLayer3)
// ═══════════════════════════════════════════════════════════════════════════

function assignEliteClusters(clusters) {
  // Sync protocol elite affinity before use (FIX L-07)
  if (!protocolState.protocolEliteAffinity && protocolState.activeProtocol?.eliteAffinity) {
    protocolState.protocolEliteAffinity = protocolState.activeProtocol.eliteAffinity;
  }
  regTimer('l3eliteOnboard', setTimeout(() => {
    clearTimer('l3eliteOnboard');
    onboarding.onElite();
  }, 2000), 'timeout');
  metaState.eliteResults = [];

  const meta = loadAIMeta?.();
  const totalRuns = meta?.totalRuns || 0;
  if (totalRuns < 1) return;

  const maxElites = totalRuns >= 2 ? 2 : 1;
  let defsPool = [...ELITE_CLUSTER_DEFS].sort(() => Math.random() - 0.5);
  const affinity = protocolState.protocolEliteAffinity || [];
  if (affinity.length) {
    defsPool.sort((a, b) => (affinity.includes(a.id) ? -1 : 0) - (affinity.includes(b.id) ? -1 : 0));
  }
  const slotPool = clusters.map((_, i) => i).sort(() => Math.random() - 0.5);
  let assigned = 0;
  for (let d = 0; d < defsPool.length && assigned < maxElites && assigned < slotPool.length; d++) {
    const roll = assigned === 0 ? 0.70 : 0.55;
    if (Math.random() < roll) {
      const idx = slotPool[assigned];
      clusters[idx]._eliteType   = defsPool[d].id;
      clusters[idx]._eliteDef    = defsPool[d];
      clusters[idx]._eliteActive = false;
      assigned++;
      if (typeof __DEV__ !== 'undefined' && __DEV__) console.debug('[Elite] Assigned', defsPool[d].id, 'to cluster', idx);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════════════════

export function initLayer3(options = {}) {
  const restoring = !!options.restoring;
  G.l3Clusters = [];
  const hwMats = [];

  // ── Build 8 macro clusters ────────────────────────────────────────────
  for (let c = 0; c < 8; c++) {
    const r  = 112 + Math.random() * 72;
    const ph = Math.acos(2 * Math.random() - 1);
    const th = Math.random() * Math.PI * 2;
    const cx = r * Math.sin(ph) * Math.cos(th);
    const cy = r * Math.sin(ph) * Math.sin(th) * 0.54;
    const cz = r * Math.cos(ph);

    const cm = new THREE.Mesh(GS, Math.random() < 0.35 ? MM.purp : MM.core);
    cm.scale.setScalar(1.8 + Math.random() * 1.3);
    cm.position.set(cx, cy, cz);
    cm.userData = { bp: new THREE.Vector3(cx, cy, cz), off: Math.random() * Math.PI * 2, coreIdx: c };
    macGroup.add(cm); macNodes.push(cm); macCores.push(cm);

    G.l3Clusters.push({
      id: c, coreIdx: c, mesh: cm,
      captured: false, syncReady: false, syncWindowOpen: false,
      syncTimer: 0,
      syncCooldown: TUNING.syncWindowCooldownMin + Math.random() * (TUNING.syncWindowCooldownMax - TUNING.syncWindowCooldownMin),
      lastSyncOpen: -999, lastPulseCapture: -999,
      connectedTo: new Set(),
    });

    // Satellites
    const loc = [cm];
    for (let s = 0; s < 7 + Math.floor(Math.random() * 8); s++) {
      const sr = 6 + Math.random() * 22;
      const sp = Math.acos(2 * Math.random() - 1);
      const st = Math.random() * Math.PI * 2;
      const sm = new THREE.Mesh(GS, Math.random() < 0.28 ? MM.purp : MM.sat);
      sm.scale.setScalar(0.35 + Math.random() * 0.95);
      sm.position.set(
        cx + sr * Math.sin(sp) * Math.cos(st),
        cy + sr * Math.sin(sp) * Math.sin(st),
        cz + sr * Math.cos(sp)
      );
      sm.userData = { bp: sm.position.clone(), off: Math.random() * Math.PI * 2 };
      macGroup.add(sm); macNodes.push(sm); loc.push(sm);
    }

    // Intra-cluster links
    for (let i = 0; i < loc.length; i++) {
      for (let j = i + 1; j < loc.length; j++) {
        if (loc[i].position.distanceTo(loc[j].position) < 28 && (i === 0 || j === 0 || Math.random() < 0.3)) {
          const g = new THREE.BufferGeometry().setFromPoints([loc[i].position.clone(), loc[j].position.clone()]);
          macGroup.add(new THREE.Line(g, MM.line));
          macLinks.push({ a: loc[i], b: loc[j], geo: g });
        }
      }
    }
  }

  // ── Protocol spawn-weight bias ────────────────────────────────────────
  (function applyProtocolSpawnBias() {
    const proto = protocolState.activeProtocol;
    if (!proto?.spawnWeights) return;
    const sw = proto.spawnWeights;
    function pickBias() {
      const entries = Object.entries(sw);
      const total = entries.reduce((s, [, w]) => s + w, 0);
      let roll = Math.random() * total;
      for (const [key, w] of entries) { roll -= w; if (roll <= 0) return key; }
      return entries[entries.length - 1][0];
    }
    G.l3Clusters.forEach(cl => {
      if (Math.random() > 0.55) return;
      const bias = pickBias();
      cl._archetypeBias = bias;
      switch (bias) {
        case 'dormant':
          cl._dormant = true;
          break;
        case 'spine_node':
          cl.syncCooldown = Math.max(TUNING.syncWindowCooldownMin, cl.syncCooldown * (0.72 + Math.random() * 0.16));
          cl._protoSpineBoost = true;
          break;
        case 'temporal_anchor':
          cl._syncWindowMult = Math.min(1.55, 1.0 + (sw.temporal_anchor - 1.0) * 0.38);
          break;
        case 'phantom':
          cl.syncCooldown *= 0.80 + Math.random() * 0.65;
          cl.syncCooldown = Math.min(TUNING.syncWindowCooldownMax * 1.15, Math.max(TUNING.syncWindowCooldownMin, cl.syncCooldown));
          cl._phantomBias = true;
          break;
      }
    });
  })();

  // ── Highway links between cores (per-link materials) ──────────────────
  for (let i = 0; i < macCores.length; i++) {
    const sorted = [...macCores]
      .map((n, idx) => ({ n, idx, d: n.position.distanceTo(macCores[i].position) }))
      .filter(e => e.idx !== i)
      .sort((a, b) => a.d - b.d);
    const nh = Math.random() < 0.5 ? 2 : 1;
    for (let k = 0; k < nh && k < sorted.length; k++) {
      if (
        sorted[k].d < 230 &&
        !macLinks.some(l =>
          (l.a === macCores[i] && l.b === sorted[k].n) ||
          (l.b === macCores[i] && l.a === sorted[k].n)
        )
      ) {
        const g = new THREE.BufferGeometry().setFromPoints([macCores[i].position.clone(), sorted[k].n.position.clone()]);
        const hwMat = new THREE.LineBasicMaterial({ color: 0xaa44ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending });
        macGroup.add(new THREE.Line(g, hwMat));
        macLinks.push({ a: macCores[i], b: sorted[k].n, geo: g, isHighway: true, coreA: i, coreB: sorted[k].idx, hwMat });
        hwMats.push(hwMat);
      }
    }
  }

  // ── Fade-in (enrolled in _TIMERS as 'l3fade') ─────────────────────────
  let op = 0;
  const fi = setInterval(() => {
    op = Math.min(1, op + 0.012);
    MM.core.opacity = MM.sat.opacity = MM.purp.opacity = MM.fuse.opacity = MM.spine.opacity = op;
    MM.line.opacity = op * 0.35;
    hwMats.forEach(m => m.opacity = op * 0.55);
    if (op >= 1) {
      clearInterval(fi);
      clearTimer('l3fade');
      initL3HUD();
    }
  }, 30);
  regTimer('l3fade', fi, 'interval');

  // ── Elite assignment + strategic projects ─────────────────────────────
  assignEliteClusters(G.l3Clusters);
  initStrategicProjects(restoring);

  // ── Protocol HUD chip ─────────────────────────────────────────────────
  if (protocolState.activeProtocol) {
    showProtocolChip(protocolState.activeProtocol);
    const _proto = protocolState.activeProtocol;
    const _lang  = getLang();
    regTimer('l3ProtocolHintShow', setTimeout(() => {
      if (_proto) {
        const _label = _lang === 'de' ? _proto.tagDe : _proto.tagEn;
        const _hook  = _lang === 'de' ? _proto.hookDe : _proto.hookEn;
        setNowAction('event', '◈ ' + _label + ' · ' + _hook, 'now-info');
        regTimer('l3ProtocolHintClear', setTimeout(() => {
          clearNowAction('event');
          clearTimer('l3ProtocolHintClear');
        }, 5000), 'timeout');
      }
      clearTimer('l3ProtocolHintShow');
    }, 2000), 'timeout');
  }

  // ── Layer condition selection ──────────────────────────────────────────
  regTimer('l3ConditionSelect', setTimeout(() => {
    if (getActiveConditionId()) {
      clearTimer('l3ConditionSelect');
      return;
    }
    const cond = selectLayerCondition();
    if (cond) {
      conditionState.activeCondition   = cond;
      conditionState.activeConditionId = cond.id || null;
      cond.apply?.();
    }
    clearTimer('l3ConditionSelect');
  }, 3000), 'timeout');
}

// ═══════════════════════════════════════════════════════════════════════════
//  BACKWARDS-COMPAT WINDOW BRIDGES
// ═══════════════════════════════════════════════════════════════════════════

import { animateLayer3, startSyncDecayBar, stopSyncDecayBar } from './_l3Animate.js';
import {
  countConnectedCorePairs,
  checkSpine, tryFusion, captureOpenClusters, checkL3Objectives,
  updateL3ClusterHUD,
} from './_l3ClusterLogic.js';
import {
  checkProjectTriggers, accumulateMemoryCache,
  applyEchoBeaconEliteBoost, applyBackboneRelayBossBonus,
  applyMemoryCacheDischargeBonus, getEchoBeaconRareBonus,
  updateActiveProjectsHud,
} from './_l3Projects.js';

// Note: updateL3ObjPanel is internal to _l3ClusterLogic — not bridged here.
window._initL3                         = initLayer3;
window._tickL3                         = animateLayer3;
window._startSyncDecayBar              = startSyncDecayBar;
window._stopSyncDecayBar               = stopSyncDecayBar;
window._updateL3ClusterHUD             = updateL3ClusterHUD;
window._updateL3ObjPanel               = () => {}; // noop — internal only
window._accumulateMemoryCache          = accumulateMemoryCache;
window._checkProjectTriggers           = checkProjectTriggers;
window._applyEchoBeaconEliteBoost      = applyEchoBeaconEliteBoost;
window._applyBackboneRelayBossBonus    = applyBackboneRelayBossBonus;
window._applyMemoryCacheDischargeBonus = applyMemoryCacheDischargeBonus;
window._getEchoBeaconRareBonus         = getEchoBeaconRareBonus;
window._countConnectedCorePairs        = countConnectedCorePairs;
window.captureOpenClusters             = captureOpenClusters;
window.checkL3Objectives               = checkL3Objectives;
window.checkSpine                      = checkSpine;
window.tryFusion                       = tryFusion;
window.logTL                           = window.logTL || (() => {}); // compat stub
