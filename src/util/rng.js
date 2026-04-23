/**
 * SYNAPSE v99 — Seeded PRNG (Mulberry32)
 *
 * Provides a seedable pseudo-random number generator so runs can be
 * deterministic: daily challenges, share codes, reproducible testing.
 *
 * Usage:
 *   import { makePRNG, seedFromString, getDailySeed } from './util/rng.js';
 *
 *   const rng = makePRNG(getDailySeed());
 *   const x = rng(); // 0 ≤ x < 1  — drop-in replacement for Math.random()
 *
 * The draft system checks for G._rng and uses it when present.
 * If absent, falls back to Math.random() so nothing breaks.
 */

/**
 * Mulberry32 PRNG — fast, good quality for games, 32-bit state.
 * @param {number} seed - integer seed (use seedFromString for strings)
 * @returns {function} rng() → float in [0, 1)
 */
export function makePRNG(seed) {
  let s = seed >>> 0; // ensure unsigned 32-bit
  return function () {
    s |= 0;
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Convert an arbitrary string to a 32-bit integer seed (djb2 variant).
 * Stable across JS engines — pure arithmetic, no platform APIs.
 * @param {string} str
 * @returns {number} unsigned 32-bit integer
 */
export function seedFromString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (Math.imul(h, 0x01000193)) >>> 0;
  }
  return h;
}

/**
 * Returns today's daily seed as YYYYMMDD integer.
 * Same value for every player on the same calendar day (UTC).
 * @returns {number}
 */
export function getDailySeed() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return Number(`${y}${m}${day}`);
}

/**
 * Returns a base-36 share code for a given seed (compact, URL-safe).
 * @param {number} seed
 * @returns {string}
 */
export function seedToCode(seed) {
  return (seed >>> 0).toString(36).toUpperCase().padStart(7, '0');
}

/**
 * Parse a share code back to a seed integer.
 * Returns null if the code is invalid.
 * @param {string} code
 * @returns {number|null}
 */
export function codeToSeed(code) {
  if (!code || typeof code !== 'string') return null;
  const n = parseInt(code.trim().toUpperCase(), 36);
  return isNaN(n) ? null : (n >>> 0);
}
