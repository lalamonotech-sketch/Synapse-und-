/**
 * SYNAPSE v99 — AI System (index / orchestrator)
 *
 * Refactored from the v95 monolith ai.js into focused sub-modules:
 *
 *   _meta.js      — localStorage persistence (loadAIMeta / saveAIMeta)
 *   _scoring.js   — profile scoring, dominant profile, profile bonuses
 *   _awareness.js — awareness stage advancement + stage-gated bonuses
 *   _combat.js    — phantom misfires, SPOF detection, behavior eval, architect mirror
 *   _events.js    — doTrainPulse, agent event hooks, pulse interval tracking
 *
 * This file is the public API surface. All imports from 'systems/ai.js' or
 * 'systems/ai/index.js' continue to work unchanged.
 */

// ── Re-export sub-modules ─────────────────────────────────────────────────

export {
  invalidateAIMetaCache,
  loadAIMeta,
  loadAIMetaCached,
  saveAIMeta,
} from './_meta.js';

export {
  getLinkTypeCounts,
  getTrainingLevel,
  applyProfileBonuses,
  computeAIProfiles,
} from './_scoring.js';

export {
  checkAwarenessStage,
  applyStageEffects,
} from './_awareness.js';

export {
  isNodeTypeCountered,
} from './_combat.js';

export {
  updateAIHud,
  doTrainPulse,
  recordPulseInterval,
  agentOnSyncOpen,
  agentOnSyncMissed,
  agentOnPulse,
  agentOnWin,
  agentOnBridge,
  agentOnMemory,
  agentOnBackbone,
  agentOnSpine,
  agentOnFusion,
} from './_events.js';

// ── Re-export shared state (pass-through so consumers keep working) ───────
export {
  aiState,
  AI_STAGE_NAMES,
  AI_PROFILE_LABELS,
  AI_MOOD_LABELS,
  AI_PROFILE_COLORS,
  PROFILE_BONUS,
  resetAIRuntimeState,
  exportAIRuntimeState,
  restoreAIRuntimeState,
} from '../../state/aiShared.js';

// ── Main tick (orchestrator) ──────────────────────────────────────────────

import { computeAIProfiles } from './_scoring.js';
import { tickPhantomMisfires, tickPredatorSPOF, tickBehaviorEval } from './_combat.js';
import { signalAIChanged } from '../../platform/stateSignals.js';

let _lastAITick = 0;
let _lastHudTick = 0;

export function tickAI(t, signals) {
  if (t - _lastAITick >= 2.0) {
    _lastAITick = t;
    computeAIProfiles();
  }
  if (t - _lastHudTick >= 0.25) {
    _lastHudTick = t;
    signalAIChanged();
  }
  tickPhantomMisfires(t);
  tickPredatorSPOF(t, signals);
  tickBehaviorEval(t);
}

// ── Window bridges (legacy HTML onclick / not-yet-migrated callers) ───────

import {
  invalidateAIMetaCache, loadAIMeta, loadAIMetaCached, saveAIMeta,
} from './_meta.js';
import { getLinkTypeCounts, getTrainingLevel, applyProfileBonuses } from './_scoring.js';
import { checkAwarenessStage, applyStageEffects } from './_awareness.js';
import { isNodeTypeCountered } from './_combat.js';
import {
  updateAIHud, doTrainPulse, recordPulseInterval,
  agentOnSyncOpen, agentOnSyncMissed,
  agentOnPulse, agentOnWin, agentOnBridge, agentOnMemory,
  agentOnBackbone, agentOnSpine, agentOnFusion,
} from './_events.js';

window.invalidateAIMetaCache = invalidateAIMetaCache;
window.loadAIMeta            = loadAIMeta;
window.loadAIMetaCached      = loadAIMetaCached;
window.saveAIMeta            = saveAIMeta;
window.getLinkTypeCounts     = getLinkTypeCounts;
window.getTrainingLevel      = getTrainingLevel;
window.applyProfileBonuses   = applyProfileBonuses;
window.computeAIProfiles     = computeAIProfiles;
window.checkAwarenessStage   = checkAwarenessStage;
window.applyStageEffects     = applyStageEffects;
window.updateAIHud           = updateAIHud;
window._trainPulse           = doTrainPulse;
window.tickAI                = tickAI;
window.recordPulseInterval   = recordPulseInterval;
window.agentOnSyncOpen       = agentOnSyncOpen;
window.agentOnSyncMissed     = agentOnSyncMissed;
window.isNodeTypeCountered   = isNodeTypeCountered;
window.agentOnPulse          = agentOnPulse;
window.agentOnWin            = agentOnWin;
window.agentOnBridge         = agentOnBridge;
window.agentOnMemory         = agentOnMemory;
window.agentOnBackbone       = agentOnBackbone;
window.agentOnSpine          = agentOnSpine;
window.agentOnFusion         = agentOnFusion;
