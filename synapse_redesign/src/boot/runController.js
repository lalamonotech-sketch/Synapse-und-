import { controls } from '../engine/scene.js';
import { G, resetG } from '../state/gameState.js';
import { initResearchSystem } from '../systems/research.js';
import { onboarding } from '../meta/onboarding.js';
import { initSprint4, playEpochNarrative, applyEpochPalette, removeEpochIRestrictions } from '../systems/epochReveal.js';
import { resetTuning } from '../state/tuning.js';
import { resetGameplayFlagsState } from '../state/gameplayFlags.js';
import { resetAIRuntimeState } from '../state/aiShared.js';
import { resetBossRuntimeState } from '../state/bossShared.js';
import { loadSave, applyRestoredState, restoreTopology, startAutoSave, stopAutoSave } from '../state/saveSystem.js';
import { conditionState, resetRunContextState } from '../state/runContext.js';
import { initDOMCache, setLayerTag, setPhaseName, updateHUD } from '../ui/hud/index.js';
import { applyProtocolModifiers, protocolState, showProtocolChip, showProtocolScreen } from '../systems/protocols.js';
import { bLinks, initLayer2 } from '../layers/bridge/index.js';
import { macNodes, initLayer3 } from '../layers/meta/index.js';
import { bindPointerInput, clearSelection } from '../input/pointer.js';
import { bindKeyboardShortcuts } from '../input/hotkeys.js';
import { syncModeTypeUI, checkPhase, applyUnlockBodyClasses } from '../gameplay/progression.js';
import { startLoop, stopLoop } from '../engine/gameLoop.js';
import { initShellControls, resetShellPanelsForRun, setPauseState } from '../gameplay/shellControls.js';
import { resetMetaFlowRuntime, restoreMetaFlow } from '../meta/flow.js';
import { resetMetaTelemetry, restoreMetaTelemetry } from '../meta/screens.js';
import { initOnboarding, openOnboarding, resetOnboardingRuntime } from '../meta/onboarding.js';
import { resetActivityState } from './activity.js';
import { regTimer } from '../registries/timerRegistry.js';
import { getLang } from '../state/settings.js';
import { initAwakeningOnRunStart } from '../systems/awakening.js'; // FIX: was imported in progression.js but never called
import { initBranchingObjectives } from '../systems/branchingObjectives.js'; // Phase 1
import { initComboMilestones }     from '../systems/comboMilestones.js';    // Phase 1
import { resetPulseMode, cyclePulseMode } from '../systems/pulseMode.js';         // Phase 2
import { rollSectorVariable, restoreSectorVariable, resetSectorVariable, showSectorToast } from '../systems/sectorVariables.js'; // Phase 2
import { resetDraftSynergies }    from '../systems/draftSynergies.js';       // Phase 2
import { initOverclock, resetOverclock } from '../systems/overclocking.js';         // Phase 3
import { resetBossMechanics }            from '../systems/bossMechanics.js';         // Phase 3
import { initSentience, resetSentience } from '../systems/sentience.js';             // Phase 4
import { resetDataOcean }             from '../systems/dataOcean.js';                    // Post-Game
// RC-3 fix: import mountRootServerPanel so bootRuntime can mount it directly —
// the DOMContentLoaded listener in screens.js fires before screens.js is imported,
// so the panel was never appearing on the title screen.
import { mountRootServerPanel } from '../systems/rootServer.js';

function showGameplayChrome() {
  const hud = document.getElementById('hud');
  const dock = document.getElementById('ctrl-dock');
  const pauseBtn = document.getElementById('pause-btn');
  const hint = document.getElementById('hint');
  if (hud) hud.style.display = 'block';
  if (dock) dock.style.display = 'flex';
  if (pauseBtn) pauseBtn.style.display = 'block';
  if (hint) hint.style.display = 'block';
}

function hideTitleScreen() {
  const title = document.getElementById('title-screen');
  if (!title) return;
  title.classList.add('fade-out');
  regTimer('titleFadeOut', setTimeout(() => { title.style.display = 'none'; }, 1400), 'timeout');
}

function showTitleScreen() {
  const title = document.getElementById('title-screen');
  if (!title) return;
  title.style.display = 'flex';
  title.classList.remove('fade-out');
}

function formatAge(ts) {
  if (!ts) return '—';
  const delta = Math.max(0, Date.now() - ts);
  const mins = Math.round(delta / 60000);
  const de = getLang() === 'de';
  if (mins < 1) return de ? 'gerade eben' : 'just now';
  if (mins < 60) return de ? `vor ${mins} min` : `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return de ? `vor ${hours} h` : `${hours} h ago`;
  return de ? `vor ${Math.round(hours / 24)} d` : `${Math.round(hours / 24)} d ago`;
}

function syncContinueUI(saved) {
  const btnContinue = document.getElementById('btn-continue');
  const saveCard = document.getElementById('save-card');
  const hasSave = !!saved?.save && !saved?.save?.G?.runWon;

  if (btnContinue) btnContinue.style.display = hasSave ? 'block' : 'none';
  if (saveCard) saveCard.style.display = hasSave ? 'block' : 'none';
  if (!hasSave) return;

  const state = saved.save;
  const g = state.G || {};
  const layer = g.l3On ? 'Layer 3' : g.l2On ? 'Layer 2' : g.autoOn ? 'Layer 1+' : 'Dormant';
  let diff = 'normal';
  try { diff = JSON.parse(localStorage.getItem('synapse_run') || '{}')?.difficulty || 'normal'; } catch (_) {}

  const scDiff = document.getElementById('sc-diff');
  const scClusters = document.getElementById('sc-clusters');
  const scEnergy = document.getElementById('sc-energy');
  const scLayer = document.getElementById('sc-layer');
  const scAge = document.getElementById('sc-age');
  if (scDiff) scDiff.textContent = `Diff · ${diff}`;
  if (scClusters) scClusters.textContent = `Cluster · ${g.l3CapturedClusters || 0}/8`;
  if (scEnergy) scEnergy.textContent = `⬡ ${Math.round(g.energy || 0)}`;
  if (scLayer) scLayer.textContent = layer;
  if (scAge) scAge.textContent = formatAge(state._savedAt);
}

function prepareRunShell() {
  hideTitleScreen();
  showGameplayChrome();
  resetShellPanelsForRun();
  setPauseState(false, { showOverlay: false });
  bindPointerInput();
  bindKeyboardShortcuts();
  syncModeTypeUI();
  _applyDifficultyBadge(); // P1 Fix 3.5
}

// P1 Fix 3.5 — #diff-badge visibility via class toggle (progressive-ui.css relies on .hard/.brutal/.vis)
function _applyDifficultyBadge() {
  const diffBadge = document.getElementById('diff-badge');
  if (!diffBadge) return;
  const diff = G.run?.difficulty || 'normal';
  diffBadge.classList.toggle('hard',   diff === 'hard');
  diffBadge.classList.toggle('brutal', diff === 'brutal');
  diffBadge.classList.toggle('vis',    diff !== 'normal');
}

function initUnlockedLayers() {
  if (G.l2On && bLinks.length === 0) initLayer2();
  if (G.l3On && macNodes.length === 0) initLayer3({ restoring: !!(G.activeProjects?.length || conditionState.activeConditionId) });
  if (G.l3On) controls.autoRotateSpeed = 0.15;
  else if (G.l2On) controls.autoRotateSpeed = 0.3;
}


// P2 Fix 4.7 — Centralised subsystem reset sequence (order matters).
// opts.withDataOcean: true for new runs, false for continue (ocean state persists).
function _resetAllSubsystems({ withDataOcean = true } = {}) {
  stopLoop();
  stopAutoSave();
  clearSelection();
  resetG();
  resetTuning();
  resetGameplayFlagsState();
  resetAIRuntimeState();
  resetBossRuntimeState();
  if (withDataOcean) resetDataOcean();
  resetMetaFlowRuntime();
  resetMetaTelemetry();
  resetRunContextState();
  resetOnboardingRuntime();
  resetActivityState();
}

export function launchRun() {
  _resetAllSubsystems({ withDataOcean: true });

  if (protocolState.activeProtocol) applyProtocolModifiers(protocolState.activeProtocol);

  G.mode = 'place';
  G.nType = 'source';
  G.lType = 'stable';

  setLayerTag('SCHICHT 00 · DORMANT');
  setPhaseName('Dormant');
  prepareRunShell();
  checkPhase();
  openOnboarding();
  initResearchSystem();   // Sprint 3: reset Data + research tree
  initBranchingObjectives(); // Phase 1: Entscheidungspfade (ab Run 2)
  initComboMilestones();     // Phase 1: Combo-Milestone-Effekte (ab Run 2)
  resetPulseMode();          // Phase 2: Pulse-Modus auf Standard zurücksetzen
  resetDraftSynergies();     // Phase 2: Draft-Synergien zurücksetzen
  rollSectorVariable();      // Phase 2: Neuen Sektor ziehen
  showSectorToast();         // Phase 2: Sektor anzeigen
  initOverclock();           // Phase 3: Overclocking & Heat zurücksetzen
  resetBossMechanics();      // Phase 3: Boss Phase Dots & Corruption zurücksetzen
  initSentience();           // Phase 4: Sentience & Synergy state zurücksetzen
  initAwakeningOnRunStart(protocolState.activeProtocol?.id || null, false); // FIX: Root Server bonuses + Epoch setup
  initSprint4(true);       // Sprint 4: UI restrictions + genetic ruin + AP badge
  try { onboarding.onEpochI(); } catch(e) { console.warn('[Onboarding] onEpochI failed:', e); } // v98
  startAutoSave();
  startLoop();
}

export function continueRun(saveBundle) {
  const saved = saveBundle || loadSave();
  if (!saved?.save || saved.save?.G?.runWon) return;

  _resetAllSubsystems({ withDataOcean: false });
  applyRestoredState(saved.save);
  applyUnlockBodyClasses(); // P0 Fix 2.1: restore body classes from saved state
  if (protocolState.activeProtocol) applyProtocolModifiers(protocolState.activeProtocol);
  if (protocolState.activeProtocol) showProtocolChip(protocolState.activeProtocol);
  restoreTopology(saved.save);
  restoreMetaFlow(saved.save);

  prepareRunShell();
  initResearchSystem();   // Sprint 3: restore research state
  initBranchingObjectives(); // Phase 1: (re)init für fortgesetzten Run
  initComboMilestones();     // Phase 1: (re)init für fortgesetzten Run
  resetPulseMode();          // Phase 2: Pulse-Modus zurücksetzen
  resetDraftSynergies();     // Phase 2: Draft-Synergien zurücksetzen
  initOverclock();           // Phase 3: Overclocking & Heat zurücksetzen
  resetBossMechanics();      // Phase 3: Boss Phase Dots & Corruption zurücksetzen
  initSentience();           // Phase 4: Sentience & Synergy state zurücksetzen
  const _sid = saved?.save?.sectorId || 'null_zone';
  restoreSectorVariable(_sid); // Phase 2: gespeicherten Sektor wiederherstellen
  initAwakeningOnRunStart(protocolState.activeProtocol?.id || null, true); // FIX: Root Server bonuses + Epoch setup (Continue)
  initSprint4(false);      // Sprint 4: AP badge + ruin (not new run, no restrictions)

  // RC-4 fix: if the restored save is Epoch II+, s4-epoch-restricted must be gone
  // and the correct palette applied. initSprint4(false) skips applyEpochIRestrictions,
  // but it doesn't remove the class if it was left over from a previous session.
  const restoredIdx = G.awakening?.epochIndex || 0;
  if (restoredIdx >= 1) {
    removeEpochIRestrictions();
    const epochId = ['mechanical', 'reactive', 'temporal', 'sentience'][restoredIdx] || 'mechanical';
    try { applyEpochPalette(epochId); } catch(_) {}
  }
  initUnlockedLayers();
  restoreMetaTelemetry(saved.save);
  checkPhase();
  openOnboarding();
  startAutoSave();
  startLoop();
}

export function continueLatestSave() {
  return continueRun(loadSave());
}

export function startGame() {
  if (typeof showProtocolScreen === 'function') showProtocolScreen();
  else launchRun();
}

export function bootRuntime() {
  initDOMCache();
  showTitleScreen();
  syncModeTypeUI();
  updateHUD();
  initShellControls();
  initOnboarding();
  // RC-3 fix: mount Root Server panel explicitly here — the DOMContentLoaded
  // listener in screens.js fires before that module is imported, so the panel
  // was never appearing. bootRuntime() is the correct canonical boot hook.
  try { mountRootServerPanel(); } catch(e) { console.warn('[Synapse] mountRootServerPanel (boot) failed:', e); }

  const saved = loadSave();
  syncContinueUI(saved);

}
