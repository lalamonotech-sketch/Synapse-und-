/**
 * SYNAPSE v99 — Layer 3: Per-Frame Animation + Sync Decay Bar
 *
 * Extracted from layer3.js (was lines 1352–1690).
 * Owns:
 *   startSyncDecayBar(dur, isFusion)
 *   stopSyncDecayBar()
 *   animateLayer3(t, dt)  — the main per-frame loop
 */

import * as THREE from 'three';
import { macGroup }       from '../../engine/scene.js';
import { G }              from '../../state/gameState.js';
import { getLang }        from '../../state/settings.js';
import { TUNING }         from '../../state/tuning.js';
import { eventMods, eliteState, gameplayFlags } from '../../state/gameplayFlags.js';
import { upgradeState, traitState, synergyState } from '../../state/actionState.js';
import { protocolState }  from '../../systems/protocols.js';
import { PROFILE_BONUS, agentOnSyncOpen, getLinkTypeCounts } from '../../systems/ai/index.js';
import { aiState }        from '../../state/aiShared.js';
import { bossState }      from '../../state/bossShared.js';
import { applyEventEnergyMult } from '../../systems/events.js';
import { SFX }            from '../../audio/sfx.js';
import { spawnShock }     from '../network/layer1.js';
import { showToast }      from '../../ui/hud/index.js';
import { signalLayer3Changed } from '../../platform/stateSignals.js';
import {
  showSyncOverlay, hideSyncOverlay, showMissedSync,
  updateSyncBar, setNowAction,
} from '../../ui/actionFlow.js';
import { triggerLayer3BonusFlashUI } from '../../ui/layer3Panels.js';
import {
  startSyncDecayBarUI,
  stopSyncDecayBarUI,
} from '../../ui/hud/index.js';
import { regTimer, clearTimer } from '../../registries/timerRegistry.js';
import { macNodes, macLinks, macCores, MM, setCoreMaterial, setCoreEmissiveHex, signalL3HudIfChanged } from './_l3Materials.js';
import { checkProjectTriggers, accumulateMemoryCache } from './_l3Projects.js';
import { checkSpine, checkL3Objectives, countConnectedCorePairs } from './_l3ClusterLogic.js';

// ═══════════════════════════════════════════════════════════════════════════
//  SYNC DECAY BAR  (M-01: own cancelable RAF)
// ═══════════════════════════════════════════════════════════════════════════

let _syncDecayRaf    = null;

export function startSyncDecayBar(dur, isFusion) {
  startSyncDecayBarUI(dur, isFusion);
}

export function stopSyncDecayBar() {
  stopSyncDecayBarUI();
  if (_syncDecayRaf) { cancelAnimationFrame(_syncDecayRaf); _syncDecayRaf = null; }
}

// ═══════════════════════════════════════════════════════════════════════════
//  PER-FRAME ANIMATION
// ═══════════════════════════════════════════════════════════════════════════

export function animateLayer3(t, dt) { // eslint-disable-line no-unused-vars
  if (!G.l3On) return;
  const gameActive = !G.runWon;

  // ── Animate macro nodes ────────────────────────────────────────────────
  macNodes.forEach(n => {
    const d = n.userData;
    n.position.x = d.bp.x + Math.sin(t * 0.3  + d.off) * 0.9;
    n.position.y = d.bp.y + Math.cos(t * 0.25 + d.off) * 0.9;
    n.position.z = d.bp.z + Math.sin(t * 0.38 + d.off) * 0.9;
  });

  // ── Update link geometry (pre-allocated BufferAttribute, PERF-004) ─────
  // geo.setAttribute called only once (lazy-init); only typed-array values + needsUpdate after that.
  for (let li = 0; li < macLinks.length; li++) {
    const l = macLinks[li];
    if (!l._posArr) {
      l._posArr  = new Float32Array(6);
      l._posAttr = new THREE.BufferAttribute(l._posArr, 3);
      l.geo.setAttribute('position', l._posAttr); // once only
    }
    const p = l._posArr;
    p[0]=l.a.position.x; p[1]=l.a.position.y; p[2]=l.a.position.z;
    p[3]=l.b.position.x; p[4]=l.b.position.y; p[5]=l.b.position.z;
    l._posAttr.needsUpdate = true;
  }

  // ── Base emissive animation + macGroup rotation ────────────────────────
  MM.core.emissiveIntensity = 2.5 + Math.sin(t * 1.4) * 0.7;
  MM.purp.emissiveIntensity = 2.2 + Math.sin(t * 1.7 + 1) * 0.6;
  macGroup.rotation.y = t * 0.012;

  // ── Cluster sync window logic ──────────────────────────────────────────
  if (gameActive) G.l3Clusters.forEach((cl, i) => {
    const sinceLastOpen = t - cl.lastSyncOpen;
    const cd    = cl.syncCooldown;
    const phase = sinceLastOpen % cd;
    const gridLockBonus = synergyState.gridLock ? 2 : 0;
    const windowDur = (bossState.bossP3SyncNerf ? G.l3SyncWindowDur * 0.5 : G.l3SyncWindowDur + gridLockBonus)
                    * (cl._syncWindowMult || 1.0);
    const warnDur = 3 + (PROFILE_BONUS.analyst?.warnPhaseBonus || 0);

    if (phase >= cd - windowDur - warnDur && phase < cd - windowDur) {
      if (!cl.syncReady && !cl.syncWindowOpen) {
        cl.syncReady = true; cl.syncWindowOpen = false;
        const warnPct = Math.max(0, Math.min(1, (phase - (cd - windowDur - warnDur)) / warnDur));
        if (warnPct < 0.3 && macCores[i]) {
          const warnColor = new THREE.Color(0.2 + warnPct * 0.8, 0.1, 0.6 - warnPct * 0.5);
          if (macCores[i].mat) macCores[i].mat.emissive?.copy?.(warnColor);
        }
        try { SFX?.syncWarn?.(); } catch (err) {
          if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[Synapse] syncWarn error', err);
        }
      }
    } else if (phase >= cd - windowDur && phase < cd) {
      if (!cl.syncWindowOpen && !eventMods.syncLocked) {
        cl.syncWindowOpen = true;
        agentOnSyncOpen?.();
        cl.syncReady = false;
        cl.lastSyncOpen = t - (phase - (cd - windowDur));

        // Fused partner opens simultaneously
        let fusionPartner = -1;
        for (const key of G.fusedPairs) {
          const dash = key.indexOf('-');
          const ka = +key.slice(0, dash), kb = +key.slice(dash + 1);
          if (ka === i) { fusionPartner = kb; break; }
          if (kb === i) { fusionPartner = ka; break; }
        }
        if (fusionPartner >= 0) {
          const partner = G.l3Clusters[fusionPartner];
          if (partner && !partner.syncWindowOpen) {
            partner.syncWindowOpen = true; partner.syncReady = false; partner.lastSyncOpen = t;
            setNowAction('sync', '⟳ FUSION-SYNC — PULSE JETZT!', 'now-sync');
            SFX.syncReady?.();
          }
          showSyncOverlay(cl, i, windowDur, true);
        } else {
          showSyncOverlay(cl, i, windowDur, false);
        }

        // Backbone: auto-capture spine nodes
        if (G.backboneActive && G.spineNodes?.has(i)) {
          const autoDelay = windowDur * 0.55 * 1000;
          regTimer(`l3BackboneAuto-${i}`, setTimeout(() => {
            if (cl.syncWindowOpen && !G.runWon && G.backboneActive) {
              if (!cl.captured) {
                cl.captured = true;
                G.l3CapturedClusters++;
                showToast('AUTO-SYNC C' + (i + 1), 'Backbone hält die Linie · ' + G.l3CapturedClusters + '/8', 2000);
                spawnShock(0xff9900);
              } else {
                const burst = 20 + G.l3CapturedClusters * 3
                  + (PROFILE_BONUS.predator?.burstBonus || 0)
                  + (traitState.huntInstinct ? 5 : 0)
                  + (PROFILE_BONUS.architect?.backboneBonus || 0);
                const silentSpineMult = traitState.silentSpine ? 1.35 : 1.0;
                const finalBurst = Math.round(burst * silentSpineMult);
                G.energy += finalBurst;
                accumulateMemoryCache(finalBurst);
                checkProjectTriggers();
                showToast('BACKBONE RESYNC C' + (i + 1), '+' + finalBurst + '⬡' + (traitState.silentSpine ? ' · Stille Wirbelsäule ×1.35' : ''), 1400);
                spawnShock(0xffcc44);
              }
              cl.syncWindowOpen = false; cl.syncReady = false; cl.lastSyncOpen = -999;
              hideSyncOverlay();
              checkL3Objectives();
              signalLayer3Changed();
            }
            clearTimer(`l3BackboneAuto-${i}`);
          }, autoDelay), 'timeout');
        }
        checkL3Objectives();
      }
      updateSyncBar(1 - (phase - (cd - windowDur)) / windowDur);
    } else {
      if (cl.syncReady && !cl.syncWindowOpen && macCores[i]) {
        const warnFreq  = 3.0 + (phase / (cd - windowDur - warnDur)) * 5.0;
        const warnPulse = 0.5 + Math.abs(Math.sin(t * warnFreq)) * 0.5;
        if (macCores[i].mat?.emissiveIntensity !== undefined) {
          macCores[i].mat.emissiveIntensity = 1.2 + warnPulse * 2.5;
        }
      }
      if (cl.syncWindowOpen) {
        if (!cl.captured) {
          showMissedSync();
          if (typeof window.agentOnSyncMissed === 'function') window.agentOnSyncMissed();
        }
        cl.syncWindowOpen = false; cl.syncReady = false;
        hideSyncOverlay();
      } else if (cl.syncReady) {
        cl.syncReady = false;
      }
    }

    // Captured cluster material animation
    if (cl.captured && macCores[i]) {
      let isFused = false;
      for (const key of G.fusedPairs) {
        const dash = key.indexOf('-');
        if (+key.slice(0, dash) === i || +key.slice(dash + 1) === i) { isFused = true; break; }
      }
      const isSpine = G.spineNodes?.has(i) && G.spineLength >= 3;
      if (cl._dormant) {
        setCoreMaterial(macCores[i], MM.purp);
        MM.purp.emissiveIntensity = 0.5 + Math.sin(t * 0.6 + i) * 0.2;
      } else if (isFused) {
        setCoreMaterial(macCores[i], MM.fuse);
        MM.fuse.emissiveIntensity = 5.5 + Math.sin(t * 3.2 + i) * 1.5;
      } else if (isSpine) {
        setCoreMaterial(macCores[i], MM.spine);
        MM.spine.emissiveIntensity = 4.2 + Math.sin(t * 2.4 + i) * 1.0;
      } else {
        macCores[i].material.emissiveIntensity = 4.5 + Math.sin(t * 2 + i) * 0.8;
      }
    }
    // syncReady 3D cue: uncaptured cluster pulses amber (F-003 FIX)
    if (!cl.captured && cl.syncReady && macCores[i]) {
      setCoreEmissiveHex(macCores[i], 0xffcc44);
      macCores[i].material.emissiveIntensity = 1.8 + Math.sin(t * 4 + i) * 0.9;
    } else if (!cl.captured && !cl.syncWindowOpen && macCores[i]) {
      setCoreEmissiveHex(macCores[i], 0xaa44ff);
      macCores[i].material.emissiveIntensity = 2.2 + Math.sin(t * 1.7 + i) * 0.6;
    }
  });

  // ── Spine Protocol passive tick ────────────────────────────────────────
  if (gameActive && protocolState.activeProtocol?.modifiers?.spinePassiveTick && G.spineLength >= 2) {
    if (t - (G._spinePassiveLast || 0) > 4) {
      G._spinePassiveLast = t;
      G.energy += Math.round(G.spineLength * 1.5);
      signalLayer3Changed();
    }
  }

  // ── Mnemonic: show Tap Memory button ──────────────────────────────────
  if (gameActive && protocolState.activeProtocol?.modifiers?.mnemonicTapEnabled) {
    const tapBtn = document.getElementById('btn-tap-memory');
    if (tapBtn) {
      const hasMemory = (typeof gameNodes !== 'undefined') && gameNodes.some(n => n.type === 'memory' && (n.memCharge || 0) > 5);
      tapBtn.style.display = hasMemory ? '' : 'none';
    }
  }

  // ── Passive energy tick from captured clusters ─────────────────────────
  if (gameActive && t - G.l3SyncTick > TUNING.l3PassiveTick) {
    G.l3SyncTick = t;
    const cap = G.l3CapturedClusters;
    if (cap > 0) {
      const _nsPassBoost = (eventMods.neuroStorm && (eventMods.neuroStormPassiveBoost || 1) > 1)
        ? (eventMods.neuroStormPassiveBoost || 1) : 1.0;
      let gain = cap * TUNING.l3PassiveGain * _nsPassBoost;
      if (aiState.emergenceActive) gain = Math.round(gain * 1.11);
      if (upgradeState.resonPassive) {
        const resonLinks = getLinkTypeCounts().resonance || 0;
        gain += resonLinks * upgradeState.resonPassive * TUNING.l3PassiveTick;
      }
      if (upgradeState.fragileClusterBonus) {
        const hasFragile = (getLinkTypeCounts().fragile || 0) > 0;
        if (hasFragile) gain += upgradeState.fragileClusterBonus * cap;
      }
      if (upgradeState.gamblerMod) {
        if (G.energy < 20) gain = 0;
        else if (G.energy > 60) gain = Math.round(gain * 2.5);
      }
      gain = applyEventEnergyMult(gain);
      if ((PROFILE_BONUS.architect?.macroCouplingRange || 0) > 0) {
        gain += Math.floor(cap * PROFILE_BONUS.architect.macroCouplingRange);
      }
      const connectedPairs = countConnectedCorePairs();
      if (connectedPairs >= 2 && cap >= 2) {
        const bonus = connectedPairs * cap * 2 + Math.round(PROFILE_BONUS.architect?.backboneBonus || 0);
        gain += bonus;
        if (!G.l3BonusActive) {
          G.l3BonusActive = true;
          triggerLayer3BonusFlashUI(1200);
          showToast('VERBINDUNGSBONUS', '×' + connectedPairs + ' Kern-Paar · +' + bonus + '⬡', 2400);
          checkL3Objectives();
        }
      } else {
        G.l3BonusActive = false;
      }
      // FIX 3.1: Deep Geometry — stable links +0.5⬡ per passive tick
      if (upgradeState.deepGeometry) {
        const stableLinks = (typeof getLinkTypeCounts === 'function') ? (getLinkTypeCounts().stable || 0) : 0;
        gain += stableLinks * 0.5 * TUNING.l3PassiveTick;
      }
      G.energy += gain;
      signalLayer3Changed();
    }
  }

  // ── Elite cluster tick ─────────────────────────────────────────────────
  if (gameActive) {
    G.l3Clusters.forEach((cl, i) => {
      if (!cl._eliteType || !cl._eliteDef) {
        if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[Elite] Activation skipped — _eliteDef null for cluster', i);
        return;
      }
      if (cl.syncWindowOpen && !cl._eliteActive && !cl.captured) {
        cl._eliteActive = true;
        cl._eliteDef.onActivate(i);
        // logTL is window-bridged so we call it safely
        if (typeof logTL === 'function') logTL('elite', `Elite: ${cl._eliteDef.name}`, 'rgba(255,180,80,.75)', '◈');
      }
      if (cl._eliteType === 'temporal_anchor' && cl._eliteActive) {
        const _taState = eliteState.temporalAnchor;
        if (_taState && !_taState.reverted && (Date.now() - _taState.startTime) / 1000 > cl._eliteDef.captureWindow) {
          cl._eliteDef.onTimeout(i); cl.captured = true;
        }
      }
      if (cl._eliteType === 'mirror_relay' && cl._eliteActive) {
        const state = eliteState.mirrorRelay;
        if (state && !state.failed && t - state.startTime > cl._eliteDef.captureWindow && !cl.captured) {
          cl._eliteActive = false; cl._eliteDef.onTimeout(i);
        }
      }
      if (cl._eliteType === 'dormant_fortress' && cl._eliteActive) {
        if (eliteState.dormantFortress && !cl.syncWindowOpen && !cl.captured) {
          cl._eliteActive = false; cl._eliteDef.onFailure(i);
        }
      }
      if (cl._eliteType === 'void_anchor' && cl._eliteActive) {
        const state = eliteState.voidAnchor;
        if (state && !state.failed && t - state.startTime > cl._eliteDef.captureWindow && !cl.captured) {
          cl._eliteActive = false; cl._eliteDef.onTimeout(i);
        }
      }
      if (cl._eliteType === 'phantom_nexus' && cl._eliteActive) {
        const state = eliteState.phantomNexus;
        if (state && !state.failed && !state.captured && t - state.startTime > cl._eliteDef.captureWindow && !cl.captured) {
          cl._eliteActive = false; cl._eliteDef.onTimeout(i);
        }
      }
    });

    // Signal Noise: sync window duration recovery
    if (gameplayFlags.eliteCaptureSignalNoiseDur > 0) {
      const noiseElapsed = t - (gameplayFlags.eliteCaptureSignalNoiseStart || 0);
      if (noiseElapsed >= gameplayFlags.eliteCaptureSignalNoiseDur) {
        G.l3SyncWindowDur = Math.min(TUNING.syncWindowDuration, G.l3SyncWindowDur + 0.4);
        gameplayFlags.eliteCaptureSignalNoiseDur = 0;
      }
    }

    // Dormant Fortress pulse-cost penalty recovery
    if (gameplayFlags.eliteCapturePulsePenaltyEnd && t >= gameplayFlags.eliteCapturePulsePenaltyEnd) {
      G.pulseCost = Math.max(TUNING.pulseCost, G.pulseCost - 5);
      gameplayFlags.eliteCapturePulsePenaltyEnd = null;
      const lang = getLang();
      showToast('PULSE-PENALTY ENDET', lang === 'de' ? 'Kosten normalisiert' : 'Cost normalized', 1600);
    }
  }

  // ── checkSpine every 5 s (BUG-007 FIX) ───────────────────────────────
  if (gameActive && (!G._lastSpineCheck || t - G._lastSpineCheck > 5)) {
    G._lastSpineCheck = t;
    checkSpine();
  }

  // ── HUD change signal (throttled) ─────────────────────────────────────
  signalL3HudIfChanged(t);
}
