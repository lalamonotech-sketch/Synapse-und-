/**
 * SYNAPSE v99 — Boss System (index / orchestrator)
 *
 * Refactored from the v95 monolith boss.js into focused sub-modules:
 *
 *   _profiles.js  — profile definitions, difficulty selection, setBossProfile
 *   _combat.js    — tick loop, vulnerability windows, attacks, phase, hit, win/lose
 *   _specials.js  — per-profile mechanics (Ghost, Vortex, Rogue Node, Phase Attack)
 *
 * All existing import paths 'systems/boss.js' or 'systems/boss/index.js' continue
 * to work unchanged via these re-exports.
 */

// ── Profile management ────────────────────────────────────────────────────
export {
  BOSS_PROFILES,
  selectBossProfile,
  initBossFromDifficulty,
  setBossProfile,
} from './_profiles.js';

// ── Combat loop ───────────────────────────────────────────────────────────
export {
  triggerBossIntro,
  startBossFight,
  tickBoss,
  updateBossHUD,
  bossHit,
  onBossWindowMissed,
  onEnergyGainDuringEntropy,
} from './_combat.js';

// ── Special mechanics ─────────────────────────────────────────────────────
export {
  triggerBossRogueNode,
  triggerBossPhaseCounterAttack,
} from './_specials.js';

// ── Warning helpers (remain in root scope for ease of access) ─────────────
import { spawnShock } from '../../layers/network/index.js';
import { showToast } from '../../ui/hud/index.js';
import { getLang } from '../../state/settings.js';
import { regTimer, clearTimer } from '../../registries/timerRegistry.js';

export function triggerBossWarning() {
  const lang = getLang();
  spawnShock(0xff6600);
  showToast(
    lang === 'de' ? '⚠ ETWAS BEOBACHTET DICH' : '⚠ SOMETHING WATCHES YOU',
    lang === 'de' ? '6 Cluster übernommen · Das Netz reagiert' : '6 clusters captured · The network is reacting',
    3200
  );
  let flashes = 0;
  regTimer('bossWarningFlash', setInterval(() => {
    spawnShock(0xff4400);
    if (++flashes >= 3) clearTimer('bossWarningFlash');
  }, 700), 'interval');
}

export function triggerBossWarning2() {
  const lang = getLang();
  spawnShock(0xff2200);
  showToast(
    lang === 'de' ? '⚠ FINALES CLUSTER — DER WÄCHTER ERWACHT' : '⚠ FINAL CLUSTER — THE GUARDIAN AWAKENS',
    lang === 'de' ? '7/8 Cluster · Bereite dich vor' : '7/8 clusters · Prepare yourself',
    3800
  );
}

// ── Shared state pass-through ─────────────────────────────────────────────
export {
  BOSS,
  bossState,
  getActiveBossProfile,
  getBossWinClass,
  syncLegacyBossState,
  resetBossRuntimeState,
  exportBossRuntimeState,
  restoreBossRuntimeState,
} from '../../state/bossShared.js';

// ── Window bridges ────────────────────────────────────────────────────────
import { BOSS_PROFILES, selectBossProfile, initBossFromDifficulty } from './_profiles.js';
import { triggerBossIntro, startBossFight, tickBoss, updateBossHUD, bossHit, onBossWindowMissed } from './_combat.js';
import { triggerBossRogueNode, triggerBossPhaseCounterAttack } from './_specials.js';
import { BOSS, bossState } from '../../state/bossShared.js';

window.BOSS_PROFILES          = BOSS_PROFILES;
window.BOSS                   = BOSS;
window._selectBossProfile     = selectBossProfile;
window.initBossFromDifficulty = initBossFromDifficulty;
window.triggerBossIntro       = triggerBossIntro;
window.updateBossHUD          = updateBossHUD;
window._startBossFight        = startBossFight;
window.tickBoss               = tickBoss;
window.bossHit                = bossHit;
window._bossHit               = bossHit;
window.onBossWindowMissed     = onBossWindowMissed;
window.triggerBossRogueNode   = triggerBossRogueNode;
