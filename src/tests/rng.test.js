/**
 * SYNAPSE — Unit Tests: util/rng.js
 * Run: npx vitest run src/tests/rng.test.js
 */

import { describe, it, expect } from 'vitest';
import { makePRNG, seedFromString, getDailySeed, seedToCode, codeToSeed } from '../util/rng.js';

describe('makePRNG()', () => {
  it('returns values in [0, 1)', () => {
    const rng = makePRNG(12345);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('produces the same sequence for the same seed', () => {
    const a = makePRNG(42);
    const b = makePRNG(42);
    for (let i = 0; i < 50; i++) {
      expect(a()).toBe(b());
    }
  });

  it('produces different sequences for different seeds', () => {
    const a = makePRNG(1);
    const b = makePRNG(2);
    const seqA = Array.from({ length: 20 }, a);
    const seqB = Array.from({ length: 20 }, b);
    expect(seqA).not.toEqual(seqB);
  });

  it('does not get stuck in a short cycle (passes chi-square uniformity)', () => {
    const rng = makePRNG(0xDEADBEEF);
    const buckets = new Array(10).fill(0);
    const N = 10_000;
    for (let i = 0; i < N; i++) buckets[Math.floor(rng() * 10)]++;
    // Each bucket should be within ±30 % of expected (1000)
    buckets.forEach(count => {
      expect(count).toBeGreaterThan(700);
      expect(count).toBeLessThan(1300);
    });
  });

  it('handles seed=0 without crashing', () => {
    const rng = makePRNG(0);
    expect(() => rng()).not.toThrow();
  });

  it('handles negative seeds (coerced to uint32)', () => {
    const rng = makePRNG(-1);
    const v = rng();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });
});

describe('seedFromString()', () => {
  it('returns a non-negative integer', () => {
    const s = seedFromString('hello world');
    expect(s).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(s)).toBe(true);
  });

  it('is deterministic', () => {
    expect(seedFromString('synapse')).toBe(seedFromString('synapse'));
  });

  it('differs for different strings', () => {
    expect(seedFromString('abc')).not.toBe(seedFromString('xyz'));
  });

  it('handles empty string without crashing', () => {
    expect(() => seedFromString('')).not.toThrow();
  });
});

describe('getDailySeed()', () => {
  it('returns a positive integer', () => {
    const s = getDailySeed();
    expect(s).toBeGreaterThan(0);
    expect(Number.isInteger(s)).toBe(true);
  });

  it('returns the same value when called twice on the same day', () => {
    expect(getDailySeed()).toBe(getDailySeed());
  });

  it('encodes a plausible YYYYMMDD value (> 20240101)', () => {
    expect(getDailySeed()).toBeGreaterThan(20240101);
  });
});

describe('seedToCode() / codeToSeed() round-trip', () => {
  it('round-trips an arbitrary seed', () => {
    const seed = 0xCAFEBABE >>> 0;
    expect(codeToSeed(seedToCode(seed))).toBe(seed);
  });

  it('round-trips seed=0', () => {
    expect(codeToSeed(seedToCode(0))).toBe(0);
  });

  it('round-trips the maximum uint32', () => {
    const seed = 0xFFFFFFFF >>> 0;
    expect(codeToSeed(seedToCode(seed))).toBe(seed);
  });

  it('codeToSeed returns null for invalid input', () => {
    expect(codeToSeed(null)).toBeNull();
    expect(codeToSeed('')).toBeNull();
    expect(codeToSeed('!!!!')).toBeNull();
  });

  it('seedToCode produces a string of max 7 characters', () => {
    const code = seedToCode(0xFFFFFFFF >>> 0);
    expect(typeof code).toBe('string');
    expect(code.length).toBeLessThanOrEqual(7);
  });
});
