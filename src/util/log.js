/**
 * SYNAPSE v100 — util/log.js
 *
 * P2 Fix 4.2: Logger wrapper with level-based filtering.
 * In production builds (import.meta.env.MODE === 'production') debug
 * output is suppressed. warn/error always pass through.
 *
 * Usage:
 *   import { log } from '../util/log.js';
 *   log.debug('msg', data);   // no-op in production
 *   log.info('msg');          // no-op in production
 *   log.warn('msg', err);     // always shown
 *   log.error('msg', err);    // always shown
 *
 * Gradual migration: replace console.log → log.debug,
 *   console.warn → log.warn, console.error → log.error.
 */

const IS_PROD = typeof import.meta !== 'undefined'
  ? import.meta.env?.MODE === 'production'
  : false;

const noop = () => {};

export const log = {
  debug: IS_PROD ? noop : console.log.bind(console, '[SYN]'),
  info:  IS_PROD ? noop : console.info.bind(console, '[SYN]'),
  warn:  console.warn.bind(console, '[SYN]'),
  error: console.error.bind(console, '[SYN]'),
};

// Convenience: make available globally for quick debugging in DevTools
if (!IS_PROD) window.__synLog = log;
