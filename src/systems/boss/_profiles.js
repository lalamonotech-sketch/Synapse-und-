/**
 * SYNAPSE v99 — Boss Profiles & Difficulty Selection
 *
 * Exports selectBossProfile(), initBossFromDifficulty(), setBossProfile().
 * No runtime state lives here — all state is in bossShared.js.
 */

import { getDifficulty } from '../../state/settings.js';
import {
  BOSS_PROFILES, BOSS, bossState, syncLegacyBossState,
} from '../../state/bossShared.js';
import { setBossProfileUI } from '../../ui/overlays.js';
import { loadAIMeta } from '../ai/index.js';

export { BOSS_PROFILES };

export function selectBossProfile() {
  const meta = loadAIMeta();
  const diff = getDifficulty();
  const history = Array.isArray(meta?.profileHistory) ? meta.profileHistory : [];
  const totalRuns = meta?.totalRuns || 0;
  const tier2Wins = history.filter(run => (run.tier || 0) >= 2).length;
  const tier3Wins = history.filter(run => (run.tier || 0) >= 3).length;
  const perfectRuns = history.filter(run => run.perfect).length;

  if (diff === 'hard') {
    if (tier3Wins >= 3 && totalRuns >= 10) return BOSS_PROFILES.entropy_field;
    if (tier3Wins >= 2 && totalRuns >= 8)  return BOSS_PROFILES.parasite_choir;
    if (tier2Wins >= 2 && totalRuns >= 6)  return BOSS_PROFILES.sigma_recursive;
    if (tier2Wins >= 1 && totalRuns >= 4)  return BOSS_PROFILES.ghost_matrix;
    return BOSS_PROFILES.null_cortex;
  }

  if (perfectRuns >= 1 && totalRuns >= 5) return BOSS_PROFILES.vortex_architect;
  if (tier2Wins >= 1 && totalRuns >= 5)   return BOSS_PROFILES.ghost_matrix;
  return BOSS_PROFILES.null_cortex;
}

export function initBossFromDifficulty() {
  // Intentional no-op — difficulty scaling is fully handled by selectBossProfile().
  // Retained for API compatibility.
}

export function setBossProfile(profile) {
  bossState.activeBossProfile = profile;
  syncLegacyBossState();
  BOSS.profileId = profile.id;
  BOSS.maxHP = profile.maxHP;
  BOSS.hp = profile.maxHP;
  BOSS.attackInterval = profile.attackInterval;
  BOSS.vulnDuration = profile.vulnDuration;
  BOSS.vulnInterval = profile.vulnInterval;
  setBossProfileUI(profile);
}
