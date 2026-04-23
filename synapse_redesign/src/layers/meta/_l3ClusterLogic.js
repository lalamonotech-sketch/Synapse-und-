/**
 * SYNAPSE v99 — Layer 3: Cluster Utilities + Spine + Fusion + Capture
 *
 * Extracted from layer3.js (was lines 1043–1350).
 * Owns:
 *   countConnectedCorePairs()  – highway core pair count
 *   checkSpine()               – recompute spine length + activate bonuses
 *   tryFusion(idA, idB)        – fuse two captured cores
 *   captureOpenClusters()      – handle a Pulse press for open sync windows
 *   checkSpineAlmost()
 *   checkL3Objectives()        – progress-check all layer-3 objectives
 *   updateL3ClusterHUD()       – sync highway materials + push HUD update
 *   initL3HUD()                – one-time HUD bootstrap (called from initLayer3)
 */

import { G }            from '../../state/gameState.js';
import { getLang }      from '../../state/settings.js';
import { TUNING }       from '../../state/tuning.js';
import { upgradeState, traitState } from '../../state/actionState.js';
import { regTimer, clearTimer } from '../../registries/timerRegistry.js';
import { PROFILE_BONUS, agentOnBackbone, agentOnSpine, agentOnFusion } from '../../systems/ai/index.js';
import { aiState }      from '../../state/aiShared.js';
import { bossState }    from '../../state/bossShared.js';
import { triggerBossIntro, triggerBossWarning, triggerBossWarning2 } from '../../systems/boss/index.js';
import { checkQuestlineProgress, onSyncCapture, triggerMilestoneDraft } from '../../meta/flow.js';
import { spawnShock }   from '../network/layer1.js';
import { showToast, refreshHUDSections } from '../../ui/hud/index.js';
import {
  initL3HUDUI,
  updateL3ClusterHUDUI,
  updateL3ObjectivesUI,
} from '../../ui/hud/index.js';
import { initL3ClusterTooltipsUI } from '../../ui/layer3Panels.js';
const _initTooltips = initL3ClusterTooltipsUI;
import { signalLayer3Changed } from '../../platform/stateSignals.js';
import { showSyncOverlay, hideSyncOverlay, setNowAction, logTL } from '../../ui/actionFlow.js';
import { macLinks, macCores, MM } from './_l3Materials.js';
import { onClusterCaptured as _sentienceCapture, onClusterLost as _sentienceLost } from '../../systems/sentience.js'; // Phase 4
import { checkProjectTriggers, accumulateMemoryCache, updateActiveProjectsHud } from './_l3Projects.js';
import { eliteState } from '../../state/gameplayFlags.js';

// ─── forward references (set by layer3/index.js after all modules load) ───
let _checkL3Objectives = null; // set below — split to avoid circular at init
export function _setCheckL3Obj(fn) { _checkL3Objectives = fn; }

// ═══════════════════════════════════════════════════════════════════════════
//  HUD
// ═══════════════════════════════════════════════════════════════════════════

export function initL3HUD() {
  initL3HUDUI(G.l3Clusters, G.l3Objectives || []);
  showToast('SCHICHT 3 AKTIV', 'Cluster stehen bereit — Pulse übernehmen, Paare verbinden', 4000);
  _initTooltips({
    getCluster:      idx => G.l3Clusters?.[idx],
    getTemporalState: () => eliteState?.temporalAnchor,
  });
  updateActiveProjectsHud();
}

function updateL3ObjPanel() {
  updateL3ObjectivesUI(G.l3Objectives || []);
}

export function updateL3ClusterHUD() {
  macLinks.forEach(lk => {
    if (!lk.isHighway) return;
    const ca = G.l3Clusters[lk.coreA], cb = G.l3Clusters[lk.coreB];
    if (lk.hwMat) {
      lk.hwMat.color.setHex(ca?.captured && cb?.captured ? 0xffcc44 : 0xaa44ff);
      lk.hwMat.opacity = ca?.captured && cb?.captured ? 0.85 : 0.55;
    }
  });

  updateL3ClusterHUDUI({
    clusters:      G.l3Clusters,
    capturedCount: G.l3CapturedClusters,
    spineNodes:    G.spineNodes,
    spineLength:   G.spineLength,
    fusedPairs:    G.fusedPairs,
    macLinks,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  UTILITIES — SPINE + CORE PAIRS
// ═══════════════════════════════════════════════════════════════════════════

export function countConnectedCorePairs() {
  let count = 0;
  macLinks.forEach(lk => {
    if (!lk.isHighway) return;
    const ca = G.l3Clusters[lk.coreA], cb = G.l3Clusters[lk.coreB];
    if (ca?.captured && cb?.captured) count++;
  });
  G.l3ConnectedCores = count;
  return count;
}

const _spineCache = { capturedKey: '', length: 0, nodes: new Set() };

function computeSpineLength() {
  const capturedIds = G.l3Clusters.filter(cl => cl.captured).map(cl => cl.id);
  if (!capturedIds.length) {
    G.spineNodes = new Set();
    _spineCache.capturedKey = '';
    _spineCache.length = 0;
    _spineCache.nodes = new Set();
    return 0;
  }

  const cacheKey = capturedIds.join('-');
  if (_spineCache.capturedKey === cacheKey) {
    G.spineNodes = new Set(_spineCache.nodes);
    return _spineCache.length;
  }

  const adjacency = new Map();
  capturedIds.forEach(id => adjacency.set(id, []));
  macLinks.forEach(lk => {
    if (!lk.isHighway) return;
    const a = lk.coreA, b = lk.coreB;
    if (!G.l3Clusters[a]?.captured || !G.l3Clusters[b]?.captured) return;
    adjacency.get(a)?.push(b);
    adjacency.get(b)?.push(a);
  });

  const bfsFrom = start => {
    const dist = {}, parent = {};
    capturedIds.forEach(id => { dist[id] = -1; parent[id] = null; });
    dist[start] = 0;
    const queue = [start];
    let farthest = start;
    while (queue.length) {
      const cur = queue.shift();
      if (dist[cur] > dist[farthest]) farthest = cur;
      (adjacency.get(cur) || []).forEach(next => {
        if (dist[next] !== -1) return;
        dist[next] = dist[cur] + 1;
        parent[next] = cur;
        queue.push(next);
      });
    }
    return { farthest, dist, parent };
  };

  const first = capturedIds[0];
  const { farthest: f1 }              = bfsFrom(first);
  const { farthest: f2, dist, parent } = bfsFrom(f1);
  const maxD = dist[f2] >= 0 ? dist[f2] : 0;
  const spineSet = new Set();
  let cursor = f2;
  while (cursor != null) { spineSet.add(cursor); cursor = parent[cursor]; }

  G.spineNodes = spineSet;
  _spineCache.capturedKey = cacheKey;
  _spineCache.length = maxD + 1;
  _spineCache.nodes = new Set(spineSet);
  return maxD + 1;
}

export function checkSpine() {
  if (!G.l3On) return;
  _spineCache.capturedKey = '';
  const len = computeSpineLength();
  G.spineLength = len;

  if (len >= 4 && !G.backboneActive) {
    G.backboneActive = true;
    G.spineBonusActive = true;
    logTL('structure', 'Backbone aktiviert', 'rgba(255,160,40,.85)', '⬟');
    showToast('BACKBONE AKTIV', 'Kerne synchronisieren sich selbst — fokus auf Außencluster', 4000);
    agentOnBackbone?.();
    spawnShock(0xff9900);
    spawnShock(0xffcc44);
    checkL3Objectives();
  } else if (len >= 3 && !G.spineBonusActive) {
    G.spineBonusActive = true;
    logTL('structure', 'Spine ×' + len + ' aktiv', 'rgba(255,210,60,.7)', '⬟');
    G.pulseCd = Math.round(TUNING.pulseCd * 0.52);
    const archBonus  = PROFILE_BONUS?.architect?.spineBonusScale || 0;
    const linearBonus = traitState.linearThinking ? 0.04 : 0;
    const backboneMasterBonus = traitState.backboneMaster ? 0.03 : 0;
    const totalBonus = archBonus + linearBonus + backboneMasterBonus;
    if (totalBonus > 0) {
      const cdReduction = Math.round(TUNING.pulseCd * (0.52 + totalBonus));
      G.pulseCd = Math.max(800, TUNING.pulseCd - cdReduction);
      const cdPct = Math.round((1 - G.pulseCd / TUNING.pulseCd) * 100);
      showToast('SPINE AKTIV ⬟', `Pulse-Cooldown −${cdPct}% · Bonus aktiv`, 3200);
    } else {
      showToast('SPINE AKTIV', 'Pulse-Cooldown −48% · Feuerrhythmus erhöht', 3200);
    }
    agentOnSpine?.();
    spawnShock(0xffaa44);
    checkL3Objectives();
  } else if (len < 3 && G.spineBonusActive) {
    G.spineBonusActive = false;
    G.backboneActive   = false;
    G.pulseCd          = TUNING.pulseCd;
  }
}

export function checkSpineAlmost() {
  if (!G.spineBonusActive && G.spineLength >= 3) agentOnSpine?.();
}

// ═══════════════════════════════════════════════════════════════════════════
//  FUSION
// ═══════════════════════════════════════════════════════════════════════════

export function tryFusion(idA, idB) {
  const key = `${Math.min(idA, idB)}-${Math.max(idA, idB)}`;
  if (G.fusedPairs.has(key)) return false;
  const connected = macLinks.some(lk =>
    lk.isHighway && ((lk.coreA === idA && lk.coreB === idB) || (lk.coreA === idB && lk.coreB === idA))
  );
  if (!connected) return false;
  if (G.backboneActive && G.spineNodes && (G.spineNodes.has(idA) || G.spineNodes.has(idB))) {
    showToast('FUSION BLOCKIERT', 'Backbone-Spine-Node kann nicht fusioniert werden', 2000);
    return false;
  }

  G.fusedPairs.add(key);
  agentOnFusion?.();

  const fusionXPBonus     = traitState.fusionXP && G.fusedPairs.size === 1 ? 15 : 0;
  const volatileFusionMult = traitState.volatile ? 1.12 : 1.0;
  const quantumBonus       = (upgradeState.quantumSpine && G.spineLength >= 2) ? 20 : 0;
  const burst = Math.round(
    (60 + G.l3CapturedClusters * 8 + (PROFILE_BONUS?.mnemonic?.fusionBurst || 0) + fusionXPBonus + quantumBonus)
    * volatileFusionMult
  );
  if (fusionXPBonus > 0) traitState.fusionXP = false;
  if (aiState) aiState.burstEvents += 2;
  G.energy += burst;

  showToast(`FUSION C${idA + 1}↔C${idB + 1}`, `+${burst}⬡ · Sync-Fenster jetzt gekoppelt!`, 3400);
  spawnShock(0xff6600); spawnShock(0xffbb00); spawnShock(0xff8800);

  [idA, idB].forEach(id => {
    if (!macCores[id]) return;
    macCores[id].material = MM.fuse;
    macCores[id].scale.setScalar(macCores[id].scale.x * 1.55);
  });
  macLinks.forEach(lk => {
    if (!lk.isHighway) return;
    if ((lk.coreA === idA && lk.coreB === idB) || (lk.coreA === idB && lk.coreB === idA)) {
      if (lk.hwMat) { lk.hwMat.color.setHex(0xff8800); lk.hwMat.opacity = 1.0; }
    }
  });
  checkL3Objectives();
  signalLayer3Changed();
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
//  CAPTURE
// ═══════════════════════════════════════════════════════════════════════════

export function captureOpenClusters() {
  if (G.runWon) return 0;
  let captured = 0;
  const newlyCaptured = [];

  G.l3Clusters.forEach((cl, i) => {
    if (!cl.syncWindowOpen) return;

    if (!cl.captured) {
      cl.captured = true;
      G.l3CapturedClusters++;
      newlyCaptured.push(i);
      // Phase 4: notify sentience system
      try { _sentienceCapture(i); } catch(_) {}
      checkProjectTriggers();

      // Elite capture callback
      if (cl._eliteActive && cl._eliteDef) {
        cl._eliteActive = false;
        cl._eliteDef.onCapture(i);
        if (traitState.eliteVeteran && (traitState.eliteVeteranCaptureBonus || 0) > 0) {
          G.energy += traitState.eliteVeteranCaptureBonus;
          traitState.eliteVeteranCaptureBonus = 0;
          const lang = getLang();
          showToast('★ ELITE-VETERAN', lang === 'de' ? '+20⬡ Veteranen-Bonus' : '+20⬡ veteran bonus', 1800);
        }
      }

      const newCap       = G.l3CapturedClusters;
      const passiveGain  = newCap * TUNING.l3PassiveGain;
      const coldLoopBonus = traitState.coldLoop ? 30 : 0;
      if (coldLoopBonus > 0) { G.energy += coldLoopBonus; spawnShock(0x44ddff); }

      if (upgradeState.chainCapture) {
        const cdReduction = upgradeState.chainCaptureCd || 1500;
        G.pulseCd  = Math.max(400, G.pulseCd - cdReduction);
        TUNING.pulseCd = Math.max(400, TUNING.pulseCd - cdReduction);
      }

      showToast(
        `CLUSTER C${i + 1} ÜBERNOMMEN`,
        `Passiv +${passiveGain}⬡/${TUNING.l3PassiveTick}s · ${newCap}/8${coldLoopBonus ? ` · Kalte Schleife +${coldLoopBonus}⬡` : ''}`,
        2400
      );
      logTL('cluster', `C${i + 1} übernommen · ${newCap}/8 · +${passiveGain}⬡/t`, 'rgba(100,255,170,.7)', '✓');
      if (window._metaObj_captureTimestamps) window._metaObj_captureTimestamps.push(Date.now());
      window.checkMetaObjectives?.();
      spawnShock(0x44ff99);

      // Milestone draft triggers
      const cap = G.l3CapturedClusters;
      if (cap === 1 || cap === 4 || cap === 7) {
        setTimeout(() => triggerMilestoneDraft?.(`C${cap} captured`), 1200);
      }
      if (cap === 6) triggerBossWarning();
      if (cap === 7) triggerBossWarning2();
    } else {
      // Resync burst on already-captured cluster
      const volatileMult = traitState.volatile ? 1.12 : 1.0;
      const burst = Math.round(
        (30 + G.l3CapturedClusters * 5 + (PROFILE_BONUS?.predator?.burstBonus || 0)) * volatileMult
      );
      G.energy += burst;
      if (aiState) aiState.burstEvents++;
      showToast(`RESYNC C${i + 1}`, `+ ${burst} ⬡ Burst`, 1800);
      spawnShock(0xffcc44);
    }

    cl.syncWindowOpen = false;
    cl.syncReady = false;
    cl.lastSyncOpen = -999;
    captured++;
  });

  // Auto-attempt fusion between simultaneously captured clusters
  if (newlyCaptured.length >= 2) {
    for (let a = 0; a < newlyCaptured.length; a++) {
      for (let b = a + 1; b < newlyCaptured.length; b++) {
        tryFusion(newlyCaptured[a], newlyCaptured[b]);
      }
    }
  }
  if (newlyCaptured.length > 0) { checkSpine(); checkSpineAlmost(); }

  if (captured > 0) {
    if (aiState) aiState.syncHits += captured;
    G.l3MacroPulseCount++;
    hideSyncOverlay();
    onSyncCapture();
    const stillOpen = G.l3Clusters.filter(cl => cl.syncWindowOpen && !cl.captured);
    if (stillOpen.length > 0) setNowAction('sync', '⟳ SYNC-FENSTER — PULSE JETZT!', 'now-sync');
    checkL3Objectives();
    signalLayer3Changed();
  }
  return captured;
}

// ═══════════════════════════════════════════════════════════════════════════
//  OBJECTIVES
// ═══════════════════════════════════════════════════════════════════════════

export function checkL3Objectives() {
  if (G.runWon) return;
  const objectives = G.l3Objectives || [];
  const cap   = G.l3Clusters.filter(cl => cl.captured).length;
  const pairs  = countConnectedCorePairs();
  const checks = {
    capture1:    cap >= 1,
    capture4:    cap >= 4,
    syncWindow:  G.l3Clusters.some(cl => cl.syncWindowOpen),
    coreConn2:   pairs >= 2,
    coreBonus:   G.l3BonusActive,
    spine3:      G.spineLength >= 3,
    backbone4:   G.spineLength >= 4,
    fusion1:     G.fusedPairs.size >= 1,
    allClusters: cap >= 8,
  };

  let changed = false;
  objectives.forEach(entry => {
    if (!entry.done && checks[entry.id]) {
      entry.done = true;
      changed = true;
      const lang   = getLang();
      const title  = lang === 'de' ? 'MAKRO-ZIEL ✓' : 'MACRO OBJECTIVE ✓';
      const label  = (lang !== 'de' && entry.labelEN) ? entry.labelEN : entry.label;
      showToast(title, label.replace(/^[^\s]+ /, ''), 3000);
      spawnShock(0x44ff99);
    }
  });
  if (changed) { updateL3ObjPanel(); signalLayer3Changed(); }

  if (cap >= 8 && !G.runWon) {
    const spine   = G.spineLength;
    const fusions = G.fusedPairs.size;
    const clusters = G.l3CapturedClusters || 0;
    if (spine >= 4 || clusters >= 8) G.winTier = 3;
    else if (spine >= 3 || fusions >= 1) G.winTier = 2;
    else G.winTier = 1;
    if (!bossState.bossTriggered) {
      regTimer('bossIntroDefer', setTimeout(() => {
        clearTimer('bossIntroDefer');
        triggerBossIntro();
      }, 800), 'timeout');
    }
  }
}
