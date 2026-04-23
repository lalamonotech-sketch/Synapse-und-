/**
 * SYNAPSE v99 — Layer 3: Elite Cluster Definitions + Layer Conditions
 *
 * Extracted from layer3.js (was lines 147–545).
 * Owns:
 *   ELITE_CLUSTER_DEFS   – 5 elite encounter definitions
 *   LAYER_CONDITIONS     – 2 layer condition definitions
 *   selectLayerCondition – picks a condition for the current run
 */

import { clock }         from '../../engine/scene.js';
import { G }             from '../../state/gameState.js';
import { getLang }       from '../../state/settings.js';
import { TUNING }        from '../../state/tuning.js';
import { eliteState, gameplayFlags } from '../../state/gameplayFlags.js';
import { conditionState, questState } from '../../state/runContext.js';
import { aiState }       from '../../state/aiShared.js';
import { protocolState } from '../../systems/protocols.js';
import { checkQuestlineProgress } from '../../meta/flow.js';
import { pushEliteResult } from '../../state/metaState.js';
import { loadAIMeta }    from '../../systems/ai/index.js';
import { spawnShock }    from '../network/layer1.js';
import { showToast, refreshHUDSections, showConditionChip, hideConditionChip } from '../../ui/hud/index.js';
import { setClusterPhantomStateUI } from '../../ui/layer3Panels.js';
import { logTL }         from '../../ui/actionFlow.js';
import { applyEchoBeaconEliteBoost } from './_l3Projects.js';

// ═══════════════════════════════════════════════════════════════════════════
//  ELITE CLUSTER DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export const ELITE_CLUSTER_DEFS = [

  // ── Mirror Relay ────────────────────────────────────────────────────────
  {
    id: 'mirror_relay',
    name: 'Mirror Relay', nameEN: 'Mirror Relay',
    color: 0x44ccff,
    captureWindow: 20, pulseStreak: 0, pulseStreakNeeded: 3,
    onActivate(clIdx) {
      eliteState.mirrorRelay = { clusterIdx:clIdx, active:true, startTime:clock.getElapsedTime(), pulseCount:0, failed:false };
      const lang = getLang();
      showToast('⟳ ELITE: MIRROR RELAY', lang==='de' ? 'Jeder 2. Pulse wird gespiegelt · 3 Pulses für Bonus' : 'Every 2nd pulse mirrored · 3 pulses for bonus', 4000);
      spawnShock(0x44ccff);
    },
    onCapture(clIdx) {
      const state = eliteState.mirrorRelay;
      if (!state || state.clusterIdx !== clIdx) return;
      const success = state.pulseCount >= 3;
      const lang = getLang();
      if (success) {
        const burst = applyEchoBeaconEliteBoost(32 + G.l3CapturedClusters * 4);
        G.energy += burst;
        gameplayFlags.eliteCaptureRareChainBonus = true;
        showToast('✓ MIRROR RELAY GESÄUBERT', lang==='de' ? `+${burst}⬡ · Echo-Resonanz aktiv · Seltene Kette wahrscheinlicher` : `+${burst}⬡ · Echo resonance active · Rare chain more likely`, 3500);
        spawnShock(0x44ccff); spawnShock(0xffffff);
        questState.progress = questState.progress || {};
        questState.progress.eliteClears = (questState.progress.eliteClears||0) + 1;
        questState.progress.eliteClearNoFailure = true;
        checkQuestlineProgress();
        pushEliteResult({ name:'Mirror Relay', result:'success', pulses:state.pulseCount });
      } else {
        gameplayFlags.eliteCaptureSignalNoiseDur = 15;
        gameplayFlags.eliteCaptureSignalNoiseStart = clock.getElapsedTime();
        showToast('✗ MIRROR RELAY GEFAILED', lang==='de' ? 'Nicht genug Pulses · Sync-Fenster −0.4s für 15s' : 'Not enough pulses · Sync windows −0.4s for 15s', 3000);
        G.l3SyncWindowDur = Math.max(0.8, G.l3SyncWindowDur - 0.4);
        spawnShock(0xff4444);
        questState.progress = questState.progress || {};
        questState.progress.eliteClearNoFailure = false;
        pushEliteResult({ name:'Mirror Relay', result:'fail', pulses:state.pulseCount });
      }
      eliteState.mirrorRelay = null;
    },
    onTimeout(clIdx) {
      const state = eliteState.mirrorRelay;
      if (!state || state.clusterIdx !== clIdx) return;
      state.failed = true;
      const lang = getLang();
      showToast('⚠ MIRROR RELAY ABGELAUFEN', lang==='de' ? 'Fenster geschlossen · Sync-Penalty aktiv' : 'Window expired · Sync penalty active', 2500);
      G.l3SyncWindowDur = Math.max(0.8, G.l3SyncWindowDur - 0.4);
      gameplayFlags.eliteCaptureSignalNoiseDur = 10;
      gameplayFlags.eliteCaptureSignalNoiseStart = clock.getElapsedTime();
      eliteState.mirrorRelay = null;
      spawnShock(0xff6644);
      pushEliteResult({ name:'Mirror Relay', result:'timeout' });
    },
  },

  // ── Dormant Fortress ────────────────────────────────────────────────────
  {
    id: 'dormant_fortress',
    name: 'Dormant Fortress', nameEN: 'Dormant Fortress',
    color: 0x88aaff,
    onActivate(clIdx) {
      eliteState.dormantFortress = { clusterIdx:clIdx, active:true, startTime:clock.getElapsedTime(), streak:0, failed:false };
      const lang = getLang();
      showToast('◈ ELITE: DORMANT FORTRESS', lang==='de' ? 'Stark gepanzert · 3 Pulses hintereinander für Capture-Progress' : 'Heavily fortified · 3 consecutive pulses for capture progress', 4000);
      spawnShock(0x88aaff);
    },
    onPulseHit(clIdx) {
      const state = eliteState.dormantFortress;
      if (!state || state.clusterIdx !== clIdx) return false;
      state.streak++;
      return state.streak >= 3;
    },
    onPulseMiss(clIdx) {
      const state = eliteState.dormantFortress;
      if (!state || state.clusterIdx !== clIdx) return;
      state.streak = 0;
    },
    onCapture(clIdx) {
      const state = eliteState.dormantFortress;
      if (!state || state.clusterIdx !== clIdx) return;
      gameplayFlags.eliteCaptureFortifiedSpine = true;
      if (window.TUNING) TUNING.spineEnergyMult = Math.min(1.6, (TUNING.spineEnergyMult || 1.0) * 1.20);
      const lang = getLang();
      showToast('✓ FESTUNG GEFALLEN', lang==='de' ? 'Disziplin belohnt · Backbone-Effekte +20% für diesen Run' : 'Discipline rewarded · Backbone effects +20% this run', 3500);
      spawnShock(0x88aaff); spawnShock(0xffffff);
      questState.progress = questState.progress || {};
      questState.progress.eliteClears = (questState.progress.eliteClears||0) + 1;
      questState.progress.dormantFortressClear = true;
      eliteState.dormantFortress = null;
      checkQuestlineProgress();
      pushEliteResult({ name:'Dormant Fortress', result:'success' });
    },
    onFailure(clIdx) {
      const state = eliteState.dormantFortress;
      if (!state || state.clusterIdx !== clIdx) return;
      G.pulseCost += 5;
      gameplayFlags.eliteCapturePulsePenaltyEnd = clock.getElapsedTime() + 20;
      const lang = getLang();
      showToast('✗ FESTUNG HÄLT STAND', lang==='de' ? 'Rhythmus gebrochen · Pulse-Kosten +5 für 20s' : 'Rhythm broken · Pulse cost +5 for 20s', 3000);
      spawnShock(0xff4444);
      eliteState.dormantFortress = null;
      pushEliteResult({ name:'Dormant Fortress', result:'fail' });
    },
    onTimeout(clIdx) {
      const state = eliteState.dormantFortress;
      if (state && state.clusterIdx === clIdx) {
        G.pulseCost += 5;
        gameplayFlags.eliteCapturePulsePenaltyEnd = clock.getElapsedTime() + 15;
        eliteState.dormantFortress = null;
      }
      const lang = getLang();
      showToast('◈ FESTUNG HÄLT STAND', lang==='de' ? 'Zeit abgelaufen · Pulse-Kosten +5 für 15s' : 'Time expired · Pulse cost +5 for 15s', 2500);
      spawnShock(0xff8844);
      pushEliteResult({ name:'Dormant Fortress', result:'timeout' });
    },
  },

  // ── Void Anchor ──────────────────────────────────────────────────────────
  {
    id: 'void_anchor',
    name: 'Void Anchor', nameEN: 'Void Anchor',
    color: 0xbb44ff,
    captureWindow: 18, drainPerMiss: 5,
    onActivate(clIdx) {
      eliteState.voidAnchor = { clusterIdx:clIdx, active:true, startTime:clock.getElapsedTime(), missCount:0 };
      const lang = getLang();
      showToast('⊗ ELITE: VOID ANCHOR', lang==='de' ? 'Drain-Zone aktiv · Jeder Fehlpulse kostet −5⬡ · Fokus ist alles' : 'Drain zone active · Each missed pulse costs −5⬡ · Focus is everything', 4000);
      spawnShock(0xbb44ff);
    },
    onPulseMiss(clIdx) {
      const state = eliteState.voidAnchor;
      if (!state || state.clusterIdx !== clIdx || !state.active) return;
      state.missCount++;
      G.energy = Math.max(0, G.energy - this.drainPerMiss);
      refreshHUDSections('top', 'l3');
    },
    onCapture(clIdx) {
      const state = eliteState.voidAnchor;
      if (!state || state.clusterIdx !== clIdx) return;
      const lang = getLang();
      const cleanKill = (state.missCount === 0);
      const bonus = cleanKill ? 50 : 30;
      G.energy += bonus;
      refreshHUDSections('top', 'l3');
      showToast(cleanKill ? '✓ VOID ANCHOR — FLAWLESS' : '✓ VOID ANCHOR GESÄUBERT', lang==='de' ? `+${bonus}⬡ · Drain aufgehoben${cleanKill?' · Kein Verlust!':''}` : `+${bonus}⬡ · Drain lifted${cleanKill?' · No losses!':''}`, 3500);
      spawnShock(0xbb44ff); spawnShock(0xffffff);
      questState.progress = questState.progress || {};
      questState.progress.eliteClears = (questState.progress.eliteClears||0) + 1;
      questState.progress.eliteClearNoFailure = cleanKill;
      checkQuestlineProgress();
      pushEliteResult({ name:'Void Anchor', result:cleanKill?'flawless':'success', missCount:state.missCount });
      eliteState.voidAnchor = null;
    },
    onFailure(clIdx) {
      const state = eliteState.voidAnchor;
      if (!state || state.clusterIdx !== clIdx) return;
      const lang = getLang();
      const totalDrain = (state.missCount||0) * this.drainPerMiss;
      showToast('✗ VOID ANCHOR GEFAILED', lang==='de' ? `Drain hält an · −${totalDrain}⬡ Gesamtverlust` : `Drain continues · −${totalDrain}⬡ total loss`, 3000);
      spawnShock(0xff44aa);
      questState.progress = questState.progress || {};
      questState.progress.eliteClearNoFailure = false;
      pushEliteResult({ name:'Void Anchor', result:'fail', missCount:state.missCount });
      eliteState.voidAnchor = null;
    },
    onTimeout(_clIdx) {
      eliteState.voidAnchor = null;
      const lang = getLang();
      showToast('⊗ VOID ANCHOR', lang==='de' ? 'Fenster abgelaufen · Drain endet' : 'Window expired · Drain ends', 2000);
      pushEliteResult({ name:'Void Anchor', result:'timeout' });
    },
  },

  // ── Phantom Nexus ────────────────────────────────────────────────────────
  {
    id: 'phantom_nexus',
    name: 'Phantom Nexus', nameEN: 'Phantom Nexus',
    color: 0xee88ff,
    captureWindow: 22,
    onActivate(clIdx) {
      eliteState.phantomNexus = { clusterIdx:clIdx, active:true, startTime:clock.getElapsedTime(), evasions:0, captured:false, failed:false };
      const lang = getLang();
      showToast('◈ ELITE: PHANTOM NEXUS', lang==='de' ? 'Nicht greifbar · Train zuerst — dann Pulse!' : 'Untouchable · Train first — then Pulse!', 4500);
      spawnShock(0xee88ff);
      setClusterPhantomStateUI(clIdx, true);
    },
    onPulseAttempt(clIdx) {
      const state = eliteState.phantomNexus;
      if (!state || state.clusterIdx !== clIdx) return true;
      const timeSinceTrain = Date.now() - (aiState?.lastTrainTime || 0);
      if (timeSinceTrain <= 4000) return true;
      state.evasions++;
      const drain = 8 + state.evasions * 3;
      G.energy = Math.max(0, G.energy - drain);
      gameplayFlags.phantomNexusGhostCooldownEnd = Date.now() + 8000;
      const lang = getLang();
      showToast('⟳ PHANTOM ENTKOMMT', lang==='de' ? `−${drain}⬡ · Train zuerst!` : `−${drain}⬡ · Train first!`, 1800);
      spawnShock(0xee88ff);
      return false;
    },
    onCapture(clIdx) {
      const state = eliteState.phantomNexus;
      if (!state || state.clusterIdx !== clIdx) return;
      setClusterPhantomStateUI(clIdx, false);
      const lang = getLang();
      const cleanKill = (state.evasions === 0);
      const bonus = cleanKill ? 55 : Math.max(20, 40 - state.evasions * 5);
      G.energy += bonus;
      showToast(cleanKill ? '✓ PHANTOM NEXUS — FLAWLESS' : '✓ PHANTOM NEXUS GESÄUBERT', lang==='de' ? `+${bonus}⬡${cleanKill?' · Perfekte Jagd!':''}` : `+${bonus}⬡${cleanKill?' · Perfect hunt!':''}`, 3500);
      spawnShock(0xee88ff); spawnShock(0xffffff);
      questState.progress = questState.progress || {};
      questState.progress.eliteClears = (questState.progress.eliteClears||0) + 1;
      questState.progress.eliteClearNoFailure = cleanKill;
      checkQuestlineProgress();
      pushEliteResult({ name:'Phantom Nexus', result:cleanKill?'flawless':'success', evasions:state.evasions });
      eliteState.phantomNexus = null;
    },
    onFailure(clIdx) {
      const state = eliteState.phantomNexus;
      if (!state || state.clusterIdx !== clIdx) return;
      setClusterPhantomStateUI(clIdx, false);
      const lang = getLang();
      showToast('✗ PHANTOM ENTKOMMEN', lang==='de' ? 'Nexus entkommen · Nächstes Mal früher trainieren' : 'Nexus escaped · Train earlier next time', 3000);
      spawnShock(0xff44ee);
      pushEliteResult({ name:'Phantom Nexus', result:'fail', evasions:state.evasions });
      eliteState.phantomNexus = null;
    },
    onTimeout(clIdx) {
      const state = eliteState.phantomNexus;
      if (state && state.clusterIdx === clIdx) {
        setClusterPhantomStateUI(clIdx, false);
        eliteState.phantomNexus = null;
      }
      const lang = getLang();
      showToast('◈ PHANTOM NEXUS', lang==='de' ? 'Fenster abgelaufen · Phantom entkommen' : 'Window expired · Phantom escaped', 2000);
      pushEliteResult({ name:'Phantom Nexus', result:'timeout' });
    },
  },

  // ── Temporal Anchor ──────────────────────────────────────────────────────
  {
    id: 'temporal_anchor',
    name: 'Temporal Anchor', nameEN: 'Temporal Anchor',
    color: 0x44eeff,
    captureWindow: 16, coreWindowStart: 8, coreWindowEnd: 13,
    onActivate(clIdx) {
      const baseCd = G.pulseCd;
      const slowedCd = Math.round(baseCd * 1.40);
      eliteState.temporalAnchor = { clusterIdx:clIdx, active:true, startTime:Date.now(), baseCd, slowedCd, reverted:false };
      G.pulseCd = slowedCd;
      refreshHUDSections('top', 'l3');
      const lang = getLang();
      showToast(lang==='de' ? '⧗ ELITE: TEMPORAL ANCHOR' : '⧗ ELITE: TEMPORAL ANCHOR', lang==='de' ? 'Zeitfeld aktiv · Pulse-Takt +40% · Kern-Fenster: 8–13s nach Aktivierung' : 'Time field active · Pulse rate +40% · Core window: 8–13s after activation', 4500);
      spawnShock(0x44eeff); spawnShock(0x0088cc);
    },
    onPulseHit(clIdx) {
      const state = eliteState.temporalAnchor;
      if (!state || state.clusterIdx !== clIdx || !state.active) return false;
      return true;
    },
    onCapture(clIdx) {
      const state = eliteState.temporalAnchor;
      if (!state || state.clusterIdx !== clIdx) return;
      const lang = getLang();
      const elapsed = (Date.now() - state.startTime) / 1000;
      const inCore = elapsed >= this.coreWindowStart && elapsed <= this.coreWindowEnd;
      if (!state.reverted) { G.pulseCd = state.baseCd; state.reverted = true; }
      if (inCore) {
        const cdReduction = Math.round(state.baseCd * 0.25);
        G.pulseCd = Math.max(800, state.baseCd - cdReduction);
        G.l3SyncWindowDur = Math.min(12, (G.l3SyncWindowDur || TUNING.syncWindowDuration) + 1.5);
        TUNING.syncWindowDuration = G.l3SyncWindowDur;
        const cdPct = Math.round((1 - G.pulseCd / state.baseCd) * 100);
        showToast(lang==='de' ? '✓ TEMPORAL ANCHOR — PRÄZISION' : '✓ TEMPORAL ANCHOR — PRECISION', lang==='de' ? `Kern-Fenster! Pulse-CD −${cdPct}% · Sync-Fenster +1.5s` : `Core window! Pulse CD −${cdPct}% · Sync window +1.5s`, 4000);
        spawnShock(0x44eeff); spawnShock(0xffffff); spawnShock(0x00ffcc);
        logTL('elite', `◈ Temporal Anchor PRECISION · −${cdPct}% CD`, 'rgba(80,240,255,.9)', '★');
      } else {
        const cdReduction10 = Math.round(state.baseCd * 0.10);
        G.pulseCd = Math.max(800, state.baseCd - cdReduction10);
        showToast(lang==='de' ? '✓ TEMPORAL ANCHOR GESÄUBERT' : '✓ TEMPORAL ANCHOR CLEARED', lang==='de' ? 'Zeitfeld aufgelöst · Pulse-CD −10%' : 'Time field dissolved · Pulse CD −10%', 3000);
        spawnShock(0x44eeff); spawnShock(0xffffff);
        logTL('elite', '◈ Temporal Anchor cleared · −10% CD', 'rgba(80,200,255,.7)', '✓');
      }
      refreshHUDSections('top', 'l3');
      questState.progress = questState.progress || {};
      questState.progress.eliteClears = (questState.progress.eliteClears||0) + 1;
      questState.progress.eliteClearNoFailure = inCore;
      checkQuestlineProgress();
      pushEliteResult({ name:'Temporal Anchor', result:inCore?'flawless':'success', pulses:0 });
      eliteState.temporalAnchor = null;
    },
    onPulseMiss(_clIdx) {
      // Temporal Anchor has no per-miss penalty — the slowdown IS the penalty
    },
    onFailure(clIdx) {
      const state = eliteState.temporalAnchor;
      if (!state || state.clusterIdx !== clIdx) return;
      const lang = getLang();
      if (!state.reverted) { G.pulseCd = state.baseCd; state.reverted = true; }
      refreshHUDSections('top', 'l3');
      showToast(lang==='de' ? '✗ TEMPORAL ANCHOR — VERLOREN' : '✗ TEMPORAL ANCHOR — LOST', lang==='de' ? 'Fenster abgelaufen · Kein Bonus' : 'Window expired · No bonus', 2800);
      spawnShock(0xff4444);
      logTL('elite', '✗ Temporal Anchor — verloren', 'rgba(255,100,100,.7)', '✗');
      pushEliteResult({ name:'Temporal Anchor', result:'timeout' });
      eliteState.temporalAnchor = null;
    },
    onTimeout(clIdx) {
      const state = eliteState.temporalAnchor;
      if (state && state.clusterIdx === clIdx && !state.reverted) {
        G.pulseCd = state.baseCd;
        state.reverted = true;
        refreshHUDSections('top', 'l3');
      }
      const lang = getLang();
      showToast(lang==='de' ? '⧗ TEMPORAL ANCHOR' : '⧗ TEMPORAL ANCHOR', lang==='de' ? 'Zeitfeld endet · Kein Bonus' : 'Time field ends · No bonus', 2000);
      logTL('elite', '⧗ Temporal Anchor — Timeout', 'rgba(80,200,255,.35)', '⧗');
      pushEliteResult({ name:'Temporal Anchor', result:'timeout' });
      eliteState.temporalAnchor = null;
    },
  },

  // ── Phase 4: Hive Nexus ──────────────────────────────────────────────────
  {
    id: 'hive_nexus',
    name: 'Hive Nexus', nameEN: 'Hive Nexus',
    color: 0xff88ff,
    onActivate(clIdx) {
      eliteState.hiveNexus = { clusterIdx: clIdx, active: true, startTime: clock.getElapsedTime(), pulseCount: 0 };
      const lang = getLang();
      showToast(
        '✦ ELITE: HIVE NEXUS',
        lang === 'de'
          ? 'Das Cluster denkt mit · 5 Pulses in 12s für Sentience-Boost'
          : 'The cluster thinks with you · 5 pulses in 12s for Sentience boost',
        4500
      );
      spawnShock(0xff88ff);
      spawnShock(0xaa44ff);
    },
    onPulseHit(clIdx) {
      const state = eliteState.hiveNexus;
      if (!state || state.clusterIdx !== clIdx) return;
      state.pulseCount = (state.pulseCount || 0) + 1;
      spawnShock(0xff88ff);
    },
    onCapture(clIdx) {
      const state = eliteState.hiveNexus;
      if (!state || state.clusterIdx !== clIdx) return;
      const elapsed = clock.getElapsedTime() - state.startTime;
      const success = state.pulseCount >= 5 && elapsed <= 12;
      const lang = getLang();
      if (success) {
        // Bonus: instant Sentience macro-node + large energy burst
        const burst = 60 + G.l3CapturedClusters * 6;
        G.energy += burst;
        document.body.dispatchEvent(new CustomEvent('syn:sentience-boost', { detail: { burst } }));
        showToast(
          '✦ HIVE NEXUS ASSIMILIERT',
          lang === 'de' ? `+${burst}⬡ · Sentience-Schub · Macro-Node beschleunigt` : `+${burst}⬡ · Sentience boost · Macro-node accelerated`,
          4000
        );
        spawnShock(0xff88ff); spawnShock(0xffffff); spawnShock(0xaa44ff);
        pushEliteResult({ name: 'Hive Nexus', result: 'success', pulses: state.pulseCount });
      } else {
        G.l3SyncWindowDur = Math.max(0.8, G.l3SyncWindowDur - 0.5);
        showToast(
          '✗ HIVE NEXUS ENTKOMMEN',
          lang === 'de' ? 'Nicht schnell genug · Sync-Fenster −0.5s' : 'Too slow · Sync windows −0.5s',
          3000
        );
        spawnShock(0x882244);
        pushEliteResult({ name: 'Hive Nexus', result: 'fail', pulses: state.pulseCount });
      }
      eliteState.hiveNexus = null;
    },
    onTimeout(clIdx) {
      const state = eliteState.hiveNexus;
      if (!state || state.clusterIdx !== clIdx) return;
      const lang = getLang();
      showToast('⚠ HIVE NEXUS ABGELAUFEN', lang === 'de' ? 'Zeitfenster geschlossen' : 'Time window closed', 2000);
      spawnShock(0x882244);
      eliteState.hiveNexus = null;
      pushEliteResult({ name: 'Hive Nexus', result: 'timeout' });
    },
  },

  // ── Phase 4: Gestalt Fragment ──────────────────────────────────────────
  {
    id: 'gestalt_fragment',
    name: 'Gestalt Fragment', nameEN: 'Gestalt Fragment',
    color: 0xffffff,
    onActivate(clIdx) {
      eliteState.gestaltFragment = {
        clusterIdx: clIdx, active: true, startTime: clock.getElapsedTime(), held: false, holdStart: -1,
      };
      const lang = getLang();
      showToast(
        '◈ ELITE: GESTALT FRAGMENT',
        lang === 'de'
          ? 'Fragment des Bewusstseins · Halte Sync-Fenster 6s offen für vollständige Integration'
          : 'Fragment of consciousness · Hold sync window open for 6s for full integration',
        5000
      );
      spawnShock(0xffffff);
    },
    onPulseHit(clIdx) {
      const state = eliteState.gestaltFragment;
      if (!state || state.clusterIdx !== clIdx) return;
      if (!state.held) {
        state.held = true;
        state.holdStart = clock.getElapsedTime();
      }
    },
    onCapture(clIdx) {
      const state = eliteState.gestaltFragment;
      if (!state || state.clusterIdx !== clIdx) return;
      const holdDuration = state.held ? clock.getElapsedTime() - state.holdStart : 0;
      const success = holdDuration >= 6;
      const lang = getLang();
      if (success) {
        // Unlock a sentience synergy duration boost + large energy burst
        const burst = 50 + G.l3CapturedClusters * 8;
        G.energy += burst;
        // Extend all active sentience synergies by 10 s via event
        document.body.dispatchEvent(new CustomEvent('syn:synergy-extend', { detail: { seconds: 10 } }));
        showToast(
          '◈ GESTALT FRAGMENT INTEGRIERT',
          lang === 'de' ? `+${burst}⬡ · Alle Synergien +10s · Bewusstsein wächst` : `+${burst}⬡ · All synergies +10s · Consciousness grows`,
          4500
        );
        spawnShock(0xffffff); spawnShock(0xff88ff); spawnShock(0xffffff);
        pushEliteResult({ name: 'Gestalt Fragment', result: 'success', holdDuration });
      } else {
        showToast(
          '✗ GESTALT FRAGMENT VERLOREN',
          lang === 'de' ? 'Zu kurz gehalten · Fragment zerfällt' : 'Hold too brief · Fragment dissolves',
          3000
        );
        spawnShock(0x444444);
        pushEliteResult({ name: 'Gestalt Fragment', result: 'fail', holdDuration });
      }
      eliteState.gestaltFragment = null;
    },
    onTimeout(clIdx) {
      const state = eliteState.gestaltFragment;
      if (!state || state.clusterIdx !== clIdx) return;
      const lang = getLang();
      showToast('⚠ GESTALT FRAGMENT AUFGELÖST', lang === 'de' ? 'Zeitfenster überschritten' : 'Time window exceeded', 2000);
      spawnShock(0x444444);
      eliteState.gestaltFragment = null;
      pushEliteResult({ name: 'Gestalt Fragment', result: 'timeout' });
    },
  },

  // ── Phase 4: Resonance Anchor ──────────────────────────────────────────
  {
    id: 'resonance_anchor',
    name: 'Resonance Anchor', nameEN: 'Resonance Anchor',
    color: 0x44ffcc,
    onActivate(clIdx) {
      eliteState.resonanceAnchor = {
        clusterIdx: clIdx, active: true, resonanceBuilt: 0, required: 4, startTime: clock.getElapsedTime(),
      };
      const lang = getLang();
      showToast(
        '⟳ ELITE: RESONANCE ANCHOR',
        lang === 'de'
          ? 'Energie-Resonanz aufbauen · 4 aufeinanderfolgende Spine-Pulse für vollen Bonus'
          : 'Build energy resonance · 4 consecutive spine pulses for full bonus',
        4500
      );
      spawnShock(0x44ffcc);
    },
    onPulseHit(clIdx) {
      const state = eliteState.resonanceAnchor;
      if (!state || state.clusterIdx !== clIdx) return;
      const spineLen = G.spineLength || 0;
      if (spineLen >= 3) {
        state.resonanceBuilt = (state.resonanceBuilt || 0) + 1;
        spawnShock(0x44ffcc);
      } else {
        // Broken chain — reset counter
        state.resonanceBuilt = 0;
        spawnShock(0xff4444);
        const lang = getLang();
        showToast('⟳ KETTE GEBROCHEN', lang === 'de' ? 'Spine zu kurz — Resonanz verloren' : 'Spine too short — resonance lost', 1600);
      }
    },
    onCapture(clIdx) {
      const state = eliteState.resonanceAnchor;
      if (!state || state.clusterIdx !== clIdx) return;
      const success = (state.resonanceBuilt || 0) >= state.required;
      const lang = getLang();
      if (success) {
        const burst = 80 + (G.spineLength || 0) * 10;
        G.energy += burst;
        // Boost heartbeat speed for 15 s via global flag
        document.body.dispatchEvent(new CustomEvent('syn:resonance-pulse', { detail: { duration: 15 } }));
        showToast(
          '✓ RESONANCE ANCHOR VERANKERT',
          lang === 'de'
            ? `+${burst}⬡ · Heartbeat ×0.75 für 15s · Kette vervollständigt`
            : `+${burst}⬡ · Heartbeat ×0.75 for 15s · Chain complete`,
          4500
        );
        spawnShock(0x44ffcc); spawnShock(0xffffff); spawnShock(0x44ffcc);
        pushEliteResult({ name: 'Resonance Anchor', result: 'success', resonance: state.resonanceBuilt });
      } else {
        G.l3SyncWindowDur = Math.max(0.8, G.l3SyncWindowDur - 0.3);
        showToast(
          '✗ RESONANCE ANCHOR VERLOREN',
          lang === 'de' ? `Nur ${state.resonanceBuilt}/${state.required} Resonanz · Sync-Penalty` : `Only ${state.resonanceBuilt}/${state.required} resonance · Sync penalty`,
          3000
        );
        spawnShock(0xff4444);
        pushEliteResult({ name: 'Resonance Anchor', result: 'fail', resonance: state.resonanceBuilt });
      }
      eliteState.resonanceAnchor = null;
    },
    onTimeout(clIdx) {
      const state = eliteState.resonanceAnchor;
      if (!state || state.clusterIdx !== clIdx) return;
      const lang = getLang();
      showToast('⚠ RESONANCE ANCHOR AUFGEGEBEN', lang === 'de' ? 'Fenster geschlossen' : 'Window closed', 2000);
      spawnShock(0xff4444);
      eliteState.resonanceAnchor = null;
      pushEliteResult({ name: 'Resonance Anchor', result: 'timeout' });
    },
  },
];

window.ELITE_CLUSTER_DEFS = ELITE_CLUSTER_DEFS;

// ═══════════════════════════════════════════════════════════════════════════
//  LAYER CONDITIONS
// ═══════════════════════════════════════════════════════════════════════════

const LAYER_CONDITIONS = [
  {
    id: 'low_signal',
    name: 'Low Signal',
    nameDe: 'Low Signal',
    nameEn: 'Low Signal',
    desc: 'Telemetrie gedämpft · Höhere Event-Chance · Improvisation zahlt sich aus',
    descEn: 'Telemetry dampened · Higher event chance · Improvisation pays off',
    apply() {
      conditionState.lowSignal = true;
      conditionState.recursiveStorm = false;
      conditionState.activeCondition = this;
      conditionState.activeConditionId = this.id;
      if (typeof G_EVENT !== 'undefined' && G_EVENT?.nextEventIn) {
        G_EVENT.nextEventIn = Math.max(30, G_EVENT.nextEventIn * 0.75);
      }
      showToast('LOW SIGNAL', getLang() === 'de'
        ? 'Telemetrie rauscht · Events häufiger · Instinkt ist jetzt dein Werkzeug'
        : 'Telemetry noise · Events more frequent · Instinct is your tool', 4000);
      spawnShock(0x4488ff);
      showConditionChip(this);
    },
    revert() {
      conditionState.lowSignal = false;
      hideConditionChip();
      showToast('SCHICHT ABGESCHLOSSEN', getLang() === 'de'
        ? 'Low Signal · Condition beendet'
        : 'Low Signal · Condition ended', 2500);
    },
  },
  {
    id: 'recursive_storm',
    name: 'Recursive Storm',
    nameDe: 'Recursive Storm',
    nameEn: 'Recursive Storm',
    desc: 'Event-Ketten leichter · Tradeoff-Ketten häufiger · Extra Chain-Score im Run-Report',
    descEn: 'Event chains easier · Tradeoff chains more frequent · Bonus chain score',
    apply() {
      conditionState.recursiveStorm = true;
      conditionState.lowSignal = false;
      conditionState.activeCondition = this;
      conditionState.activeConditionId = this.id;
      conditionState.recursiveStormChainChanceBonus = 0.08;
      showToast('RECURSIVE STORM', getLang() === 'de'
        ? 'Ereignisstrudel dreht sich auf · Ketten brechen leichter los · Risiko = Chance'
        : 'Event vortex spinning up · Chains break loose easier · Risk = Reward', 4000);
      spawnShock(0xcc44ff);
      spawnShock(0x8800aa);
      showConditionChip(this);
    },
    revert() {
      conditionState.recursiveStorm = false;
      conditionState.recursiveStormChainChanceBonus = 0;
      hideConditionChip();
      showToast('SCHICHT ABGESCHLOSSEN', getLang() === 'de'
        ? 'Recursive Storm · Condition beendet'
        : 'Recursive Storm · Condition ended', 2500);
    },
  },
];

/** Pick a random layer condition for the current run (60 % chance after run 2). */
export function selectLayerCondition() {
  const meta = loadAIMeta();
  const totalRuns = meta?.totalRuns || 0;
  if (totalRuns < 2 || Math.random() > 0.60) return null;

  const proto = protocolState.activeProtocol;
  if (proto?.conditionAffinity?.length && Math.random() < 0.55) {
    const preferred = LAYER_CONDITIONS.find(cond => proto.conditionAffinity.includes(cond.id));
    if (preferred) return preferred;
  }
  return LAYER_CONDITIONS[Math.floor(Math.random() * LAYER_CONDITIONS.length)] || null;
}
