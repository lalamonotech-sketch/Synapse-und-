/**
 * SYNAPSE — Unit Tests: state/masteryState.js
 * Run: npx vitest run src/tests/masteryState.test.js
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Stub localStorage
const _store = {};
vi.stubGlobal('localStorage', {
  getItem:    key => _store[key] ?? null,
  setItem:    (key, val) => { _store[key] = val; },
  removeItem: key => { delete _store[key]; },
});

// Import AFTER stubbing so module reads from stub
import {
  mastery,
  recordRunResult,
  getMasteryBonuses,
  resetMastery,
} from '../state/masteryState.js';

describe('resetMastery()', () => {
  it('resets all counters to zero', () => {
    resetMastery();
    expect(mastery.totalRuns).toBe(0);
    expect(mastery.totalWins).toBe(0);
    expect(mastery.bestWinTier).toBe(0);
    expect(mastery.runHistory).toHaveLength(0);
  });
});

describe('recordRunResult()', () => {
  beforeEach(resetMastery);

  it('increments totalRuns on loss', () => {
    recordRunResult({ won: false });
    expect(mastery.totalRuns).toBe(1);
    expect(mastery.totalWins).toBe(0);
  });

  it('increments totalRuns and totalWins on win', () => {
    recordRunResult({ won: true, winTier: 1 });
    expect(mastery.totalRuns).toBe(1);
    expect(mastery.totalWins).toBe(1);
  });

  it('tracks bestWinTier correctly', () => {
    recordRunResult({ won: true, winTier: 2 });
    recordRunResult({ won: true, winTier: 1 });
    expect(mastery.bestWinTier).toBe(2);
  });

  it('tracks bestRunDurationMs (lowest wins)', () => {
    recordRunResult({ won: true, durationMs: 180_000 });
    recordRunResult({ won: true, durationMs: 90_000 });
    recordRunResult({ won: false, durationMs: 300_000 });
    expect(mastery.bestRunDurationMs).toBe(90_000);
  });

  it('stores profile in run history', () => {
    recordRunResult({ won: true, winTier: 1, profile: 'analyst' });
    expect(mastery.runHistory[0].profile).toBe('analyst');
  });

  it('caps run history at 20 entries', () => {
    for (let i = 0; i < 25; i++) recordRunResult({ won: false });
    expect(mastery.runHistory.length).toBeLessThanOrEqual(20);
  });

  it('keeps history newest-first', () => {
    recordRunResult({ won: true,  winTier: 2, profile: 'predator' });
    recordRunResult({ won: false, profile: 'analyst' });
    expect(mastery.runHistory[0].profile).toBe('analyst');
  });
});

describe('Milestones', () => {
  beforeEach(resetMastery);

  it('unlocks sentinel protocol after 3 runs', () => {
    for (let i = 0; i < 3; i++) recordRunResult({ won: false });
    expect(mastery.unlockedStartingProtocols).toContain('sentinel');
  });

  it('unlocks cascade protocol after 7 runs', () => {
    for (let i = 0; i < 7; i++) recordRunResult({ won: false });
    expect(mastery.unlockedStartingProtocols).toContain('cascade');
  });

  it('does not duplicate protocol unlocks', () => {
    for (let i = 0; i < 10; i++) recordRunResult({ won: false });
    const sentinelCount = mastery.unlockedStartingProtocols.filter(p => p === 'sentinel').length;
    expect(sentinelCount).toBe(1);
  });

  it('grants pulseCd −100 ms after first win', () => {
    recordRunResult({ won: true, winTier: 1 });
    expect(mastery.permanentTuningBonuses.pulseCdReduction).toBeGreaterThanOrEqual(100);
  });

  it('grants pulseCd −300 ms after 5 wins (cumulative)', () => {
    for (let i = 0; i < 5; i++) recordRunResult({ won: true, winTier: 1 });
    expect(mastery.permanentTuningBonuses.pulseCdReduction).toBeGreaterThanOrEqual(300);
  });

  it('grants startingEnergy +10 after winTier ≥ 2', () => {
    recordRunResult({ won: true, winTier: 2 });
    expect(mastery.permanentTuningBonuses.startingEnergy).toBeGreaterThanOrEqual(10);
  });

  it('grants startingEnergy +30 after winTier ≥ 3', () => {
    recordRunResult({ won: true, winTier: 3 });
    expect(mastery.permanentTuningBonuses.startingEnergy).toBeGreaterThanOrEqual(30);
  });
});

describe('getMasteryBonuses()', () => {
  beforeEach(resetMastery);

  it('returns zero bonuses on fresh mastery', () => {
    const b = getMasteryBonuses();
    expect(b.pulseCdReduction).toBe(0);
    expect(b.startingEnergy).toBe(0);
  });

  it('returns the bonuses accumulated so far', () => {
    recordRunResult({ won: true, winTier: 1 });
    const b = getMasteryBonuses();
    expect(b.pulseCdReduction).toBeGreaterThan(0);
  });

  it('returns a copy — mutations do not affect mastery state', () => {
    const b = getMasteryBonuses();
    b.pulseCdReduction = 9999;
    expect(mastery.permanentTuningBonuses.pulseCdReduction).toBe(0);
  });
});
