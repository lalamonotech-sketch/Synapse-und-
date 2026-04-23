/**
 * SYNAPSE v99 — Mastery State (Meta-Progression)
 *
 * Persists cross-run progression in localStorage under a dedicated key
 * (separate from the run save so it survives restarts and wipes).
 *
 * Design principles:
 *   - Never breaks run balance: bonuses are minor QoL, not power-creep.
 *   - Additive only: earned unlocks can't be lost between runs.
 *   - Transparent: every bonus is shown in the post-run screen.
 *
 * Milestone thresholds and their rewards:
 *
 *   totalRuns ≥  3  → unlock: startingProtocol 'sentinel'
 *   totalRuns ≥  7  → unlock: startingProtocol 'cascade'
 *   totalWins ≥  1  → bonus:  pulseCd −100 ms permanently
 *   totalWins ≥  5  → bonus:  pulseCd −200 ms permanently (cumulative)
 *   totalWins ≥ 10  → bonus:  pulseCd −200 ms more (−500 ms total cap)
 *   bestWinTier ≥ 2 → bonus:  startingEnergy +10
 *   bestWinTier ≥ 3 → bonus:  startingEnergy +20 (cumulative)
 *
 * Usage:
 *   import { mastery, recordRunResult, getMasteryBonuses } from './masteryState.js';
 *
 *   // At run end:
 *   recordRunResult({ won: true, winTier: 2, durationMs: 180000 });
 *
 *   // At run start (after resetTuning):
 *   const { pulseCdBonus, startingEnergyBonus } = getMasteryBonuses();
 *   TUNING.pulseCd = Math.max(1500, TUNING.pulseCd - pulseCdBonus);
 *   G.energy += startingEnergyBonus;
 */

const LS_MASTERY_KEY = 'synapse_mastery_v1';

// ── Default state factory ─────────────────────────────────────────────────

function defaultMastery() {
  return {
    totalRuns:                 0,
    totalWins:                 0,
    bestWinTier:               0,        // 1=normal, 2=good, 3=perfect
    bestRunDurationMs:         0,
    unlockedStartingProtocols: [],       // string[]
    permanentTuningBonuses: {
      pulseCdReduction:        0,        // ms — subtracted from TUNING.pulseCd
      startingEnergy:          0,        // flat energy added at run start
    },
    runHistory: [],                      // last 20 run summaries
  };
}

// ── Singleton ─────────────────────────────────────────────────────────────

export const mastery = _loadMastery();

function _loadMastery() {
  try {
    const raw = localStorage.getItem(LS_MASTERY_KEY);
    if (!raw) return defaultMastery();
    const parsed = JSON.parse(raw);
    // Merge with defaults so new fields survive future schema bumps
    const base = defaultMastery();
    return {
      ...base,
      ...parsed,
      permanentTuningBonuses: {
        ...base.permanentTuningBonuses,
        ...(parsed.permanentTuningBonuses || {}),
      },
      unlockedStartingProtocols: Array.isArray(parsed.unlockedStartingProtocols)
        ? parsed.unlockedStartingProtocols
        : [],
      runHistory: Array.isArray(parsed.runHistory) ? parsed.runHistory : [],
    };
  } catch (_) {
    return defaultMastery();
  }
}

function _saveMastery() {
  try {
    localStorage.setItem(LS_MASTERY_KEY, JSON.stringify(mastery));
  } catch (_) {
    // Best-effort — same quota handling as saveSystem
  }
}

// ── Milestone evaluation ──────────────────────────────────────────────────

const MILESTONES = [
  // Starting protocol unlocks
  { check: m => m.totalRuns  >= 3,  once: 'protocol_sentinel',
    apply(m) { if (!m.unlockedStartingProtocols.includes('sentinel')) m.unlockedStartingProtocols.push('sentinel'); } },
  { check: m => m.totalRuns  >= 7,  once: 'protocol_cascade',
    apply(m) { if (!m.unlockedStartingProtocols.includes('cascade'))  m.unlockedStartingProtocols.push('cascade');  } },
  // pulseCd reductions (stacking milestones, target cumulative value)
  { check: m => m.totalWins  >= 1,  once: 'win1_pulseCd',
    apply(m) { m.permanentTuningBonuses.pulseCdReduction = Math.max(m.permanentTuningBonuses.pulseCdReduction, 100); } },
  { check: m => m.totalWins  >= 5,  once: 'win5_pulseCd',
    apply(m) { m.permanentTuningBonuses.pulseCdReduction = Math.max(m.permanentTuningBonuses.pulseCdReduction, 300); } },
  { check: m => m.totalWins  >= 10, once: 'win10_pulseCd',
    apply(m) { m.permanentTuningBonuses.pulseCdReduction = Math.max(m.permanentTuningBonuses.pulseCdReduction, 500); } },
  // Starting energy bonuses
  { check: m => m.bestWinTier >= 2, once: 'tier2_energy',
    apply(m) { m.permanentTuningBonuses.startingEnergy = Math.max(m.permanentTuningBonuses.startingEnergy, 10); } },
  { check: m => m.bestWinTier >= 3, once: 'tier3_energy',
    apply(m) { m.permanentTuningBonuses.startingEnergy = Math.max(m.permanentTuningBonuses.startingEnergy, 30); } },
];

// Track which milestones have already been applied (stored as plain array)
if (!mastery._appliedMilestones) mastery._appliedMilestones = [];

function _evaluateMilestones() {
  let changed = false;
  for (const ms of MILESTONES) {
    if (mastery._appliedMilestones.includes(ms.once)) continue;
    if (ms.check(mastery)) {
      ms.apply(mastery);
      mastery._appliedMilestones.push(ms.once);
      changed = true;
    }
  }
  return changed;
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Call at the end of every run (win or loss).
 * @param {{ won: boolean, winTier?: number, durationMs?: number, profile?: string }} result
 * @returns {string[]} list of newly triggered milestone ids
 */
export function recordRunResult({ won = false, winTier = 0, durationMs = 0, profile = null } = {}) {
  mastery.totalRuns++;
  if (won) {
    mastery.totalWins++;
    mastery.bestWinTier = Math.max(mastery.bestWinTier, winTier || 1);
  }
  if (durationMs > 0 && (mastery.bestRunDurationMs === 0 || durationMs < mastery.bestRunDurationMs)) {
    mastery.bestRunDurationMs = durationMs;
  }

  // Store a compact run summary (keep last 20)
  mastery.runHistory.unshift({
    won,
    winTier: won ? (winTier || 1) : 0,
    durationMs,
    profile,
    ts: Date.now(),
  });
  if (mastery.runHistory.length > 20) mastery.runHistory.length = 20;

  const beforeCount = mastery._appliedMilestones.length;
  _evaluateMilestones();
  const newMilestones = mastery._appliedMilestones.slice(beforeCount);
  _saveMastery();
  return newMilestones;
}

/**
 * Returns the currently active permanent bonuses.
 * Apply these after resetTuning() at run start.
 */
export function getMasteryBonuses() {
  return { ...mastery.permanentTuningBonuses };
}

/**
 * Wipe mastery data (dev / debug only).
 */
export function resetMastery() {
  const fresh = defaultMastery();
  Object.assign(mastery, fresh);
  mastery._appliedMilestones = [];
  _saveMastery();
}

// Re-evaluate on load in case a milestone was added in a newer version
_evaluateMilestones();
