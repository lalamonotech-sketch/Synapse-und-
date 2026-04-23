/**
 * SYNAPSE v99 — Meta Flow (orchestrator)
 *
 * Refactored from the v95 monolith into focused sub-modules:
 *
 *   _combo.js      — comboState, updateCombo, tickComboDecay, showAgentMsg, emitAgentMessage
 *   _draft.js      — G_DRAFT, upgrade defs, triggerDraft, pickDraft, shouldTriggerDraft
 *   _questline.js  — questline defs, initQuestlineForProfile, checkQuestlineProgress, event hooks
 *
 * This file is the public API surface. All existing import sites keep working.
 */

// ── Re-exports ────────────────────────────────────────────────────────────

export {
  comboState,
  updateCombo,
  resetCombo,
  tickComboDecay,
  showAgentMsg,
  emitAgentMessage,
} from './_combo.js';

export {
  G_DRAFT,
  draftCap,
  triggerDraft,
  triggerMilestoneDraft,
  shouldTriggerDraft,
  pickDraft,
  skipDraft,
  closeDraft,
  maybeShowDraftAdvisory,
  restoreDraft,
} from './_draft.js';

export {
  initQuestlineForProfile,
  getActiveQuestline,
  getQuestProgress,
  checkQuestlineProgress,
  onChainComplete,
  onSyncCapture,
  onBossDefeated,
} from './_questline.js';

// ── Orchestration ─────────────────────────────────────────────────────────

import { G } from '../state/gameState.js';
import { aiState } from '../state/aiShared.js';
import { questState } from '../state/runContext.js';
import { resetActionState } from '../state/actionState.js';
import { el } from '../util/dom.js';

import { resetBranchingState } from '../systems/branchingObjectives.js'; // Phase 1
import { resetComboMilestones } from '../systems/comboMilestones.js';    // Phase 1
import { resetDraftSynergies }  from '../systems/draftSynergies.js';     // Phase 2
import { resetPulseMode }       from '../systems/pulseMode.js';          // Phase 2
import { resetDataOcean }       from '../systems/dataOcean.js';          // Post-Game

import {
  comboState, tickComboDecay, resetCombo, resetAgentCooldown,
  updateComboHUD,
} from './_combo.js';
import {
  G_DRAFT, closeDraft, restoreDraft, shouldTriggerDraft, triggerDraft,
} from './_draft.js';
import {
  initQuestlineForProfile, tickArchitectQuestline, renderQuestlinePanel,
} from './_questline.js';

export function tickMetaFlow(elapsed) {
  tickComboDecay();
  if (aiState?.awarenessStage > 0 && G.l3On) {
    initQuestlineForProfile(aiState?.dominantProfile);
  }
  tickArchitectQuestline(elapsed);
  if (shouldTriggerDraft()) triggerDraft();
}

export function resetMetaFlowRuntime() {
  resetActionState();
  comboState.mult = 1.0;
  comboState.lastPulse = 0;
  comboState.count = 0;
  G_DRAFT.lastDraftTime = 0;
  G_DRAFT.nextDraftIn = 95 + Math.random() * 30;
  G_DRAFT.active = false;
  G_DRAFT.draftCount = 0;
  G_DRAFT.appliedUpgrades = [];
  G_DRAFT.firstDraftDone = false;
  questState.activeQuestline = null;
  questState.progress = {};
  questState.advisoryDraftShown = false;
  resetAgentCooldown();
  updateComboHUD();
  renderQuestlinePanel();
  closeDraft(false);
  const agent = el('agent-line');
  if (agent) { agent.textContent = ''; agent.className = ''; }
  resetBranchingState();   // Phase 1
  resetComboMilestones();  // Phase 1
  resetDraftSynergies();   // Phase 2
  resetPulseMode();        // Phase 2
  resetDataOcean();        // Post-Game
}

export function restoreMetaFlow(save) {
  resetMetaFlowRuntime();
  restoreDraft(save);
  if (save?.questProgress) questState.progress = { ...save.questProgress };
  if (save?.activeQuestline) {
    questState.activeQuestline = {
      ...save.activeQuestline,
      steps: Array.isArray(save.activeQuestline.steps)
        ? save.activeQuestline.steps.map(step => ({ ...step }))
        : [],
    };
  }
  if (save?.combo) {
    comboState.mult = save.combo.mult || 1.0;
    comboState.lastPulse = save.combo.lastPulse || 0;
    comboState.count = save.combo.count || 0;
  }
  updateComboHUD();
  renderQuestlinePanel();
}
