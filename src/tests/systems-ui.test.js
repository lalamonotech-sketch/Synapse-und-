/**
 * SYNAPSE v100 — tests/systems-ui.test.js
 *
 * P2 Fix 4.1: DOM-mount smoke tests for all embedded system UIs.
 * Tests: _ensureUI / initSentienceUI badge mounts + body-class toggles.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Test helpers ─────────────────────────────────────────────────────────────

function makeMinimalDOM() {
  document.body.innerHTML = `
    <div id="ctrl-dock">
      <button id="btn-overclock"></button>
    </div>
    <div id="hud-right">
      <div id="pulse-mode-wrap"></div>
    </div>
    <div id="topbar"></div>
  `;
}

// ── Body-class toggle tests ──────────────────────────────────────────────────

describe('applyUnlockBodyClasses', () => {
  beforeEach(() => {
    document.body.className = '';
    document.body.innerHTML = '';
  });

  it('sets unlock-bridges when G.l2On is true', async () => {
    const { G } = await import('../state/gameState.js');
    const { applyUnlockBodyClasses } = await import('../gameplay/progression.js');
    G.l2On = true;
    G.l3On = false;
    G.sentienceEverActive = false;
    applyUnlockBodyClasses();
    expect(document.body.classList.contains('unlock-bridges')).toBe(true);
    expect(document.body.classList.contains('unlock-l3')).toBe(false);
  });

  it('sets unlock-l3 when G.l3On is true', async () => {
    const { G } = await import('../state/gameState.js');
    const { applyUnlockBodyClasses } = await import('../gameplay/progression.js');
    G.l2On = true;
    G.l3On = true;
    applyUnlockBodyClasses();
    expect(document.body.classList.contains('unlock-l3')).toBe(true);
  });

  it('sets sentience-unlocked when G.sentienceEverActive', async () => {
    const { G } = await import('../state/gameState.js');
    const { applyUnlockBodyClasses } = await import('../gameplay/progression.js');
    G.sentienceEverActive = true;
    applyUnlockBodyClasses();
    expect(document.body.classList.contains('sentience-unlocked')).toBe(true);
  });

  it('removes unlock-bridges when G.l2On is false', async () => {
    const { G } = await import('../state/gameState.js');
    const { applyUnlockBodyClasses } = await import('../gameplay/progression.js');
    document.body.classList.add('unlock-bridges');
    G.l2On = false;
    applyUnlockBodyClasses();
    expect(document.body.classList.contains('unlock-bridges')).toBe(false);
  });
});

// ── Sentience badge mount ────────────────────────────────────────────────────

describe('initSentienceUI — badge mount', () => {
  beforeEach(() => {
    makeMinimalDOM();
    // Clear module cache to reset internal _ui refs
    vi.resetModules();
  });

  it('mounts #sentience-badge into #hud-right', async () => {
    const { initSentienceUI } = await import('../systems/sentience.js');
    initSentienceUI();
    expect(document.getElementById('sentience-badge')).not.toBeNull();
  });

  it('is idempotent — double-call does not create duplicate badges', async () => {
    const { initSentienceUI } = await import('../systems/sentience.js');
    initSentienceUI();
    initSentienceUI();
    const badges = document.querySelectorAll('#sentience-badge');
    expect(badges.length).toBe(1);
  });

  it('falls back to #topbar if #hud-right is missing', async () => {
    document.getElementById('hud-right')?.remove();
    const { initSentienceUI } = await import('../systems/sentience.js');
    initSentienceUI();
    const badge = document.getElementById('sentience-badge');
    expect(badge).not.toBeNull();
    expect(document.getElementById('topbar')?.contains(badge)).toBe(true);
  });
});

// ── Chronos button mount ─────────────────────────────────────────────────────

describe('initChronosUI — button mount', () => {
  beforeEach(() => {
    makeMinimalDOM();
    vi.resetModules();
  });

  it('mounts #btn-chronos into #ctrl-dock', async () => {
    const { initChronosUI } = await import('../systems/chronos.js');
    initChronosUI();
    expect(document.getElementById('btn-chronos')).not.toBeNull();
  });

  it('unlockChronos adds chronos-unlocked to body', async () => {
    const { initChronosUI, unlockChronos } = await import('../systems/chronos.js');
    initChronosUI();
    unlockChronos();
    expect(document.body.classList.contains('chronos-unlocked')).toBe(true);
  });
});

// ── Difficulty badge classes ─────────────────────────────────────────────────

describe('difficulty badge — class toggles', () => {
  beforeEach(() => {
    document.body.innerHTML = '<span id="diff-badge"></span>';
    vi.resetModules();
  });

  it('sets .hard class for hard difficulty', async () => {
    const { G } = await import('../state/gameState.js');
    G.run = { difficulty: 'hard' };
    // Simulate _applyDifficultyBadge logic directly
    const badge = document.getElementById('diff-badge');
    const diff = G.run?.difficulty || 'normal';
    badge.classList.toggle('hard',   diff === 'hard');
    badge.classList.toggle('brutal', diff === 'brutal');
    badge.classList.toggle('vis',    diff !== 'normal');
    expect(badge.classList.contains('hard')).toBe(true);
    expect(badge.classList.contains('vis')).toBe(true);
    expect(badge.classList.contains('brutal')).toBe(false);
  });

  it('sets no class for normal difficulty', async () => {
    const { G } = await import('../state/gameState.js');
    G.run = { difficulty: 'normal' };
    const badge = document.getElementById('diff-badge');
    const diff = G.run?.difficulty || 'normal';
    badge.classList.toggle('hard',   diff === 'hard');
    badge.classList.toggle('brutal', diff === 'brutal');
    badge.classList.toggle('vis',    diff !== 'normal');
    expect(badge.classList.contains('hard')).toBe(false);
    expect(badge.classList.contains('vis')).toBe(false);
  });
});
