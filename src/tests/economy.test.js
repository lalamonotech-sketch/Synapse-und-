/**
 * SYNAPSE — Unit Tests: economy.js
 * Run: npx vitest run src/tests/economy.test.js
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Minimal stubs for imports economy.js needs ────────────────────────────

vi.mock('../state/gameState.js',          () => ({ G: {} }));
vi.mock('../state/tuning.js',             () => ({ TUNING: { sourceTick: 5, ecoUpkeepMult: 1.0 } }));
vi.mock('../layers/network/index.js',     () => ({ gameNodes: [], gameLinks: [], spawnShock: vi.fn() }));
vi.mock('../state/gameplayFlags.js',      () => ({ eventMods: {} }));
vi.mock('../ui/hud/index.js',             () => ({ showToast: vi.fn() }));
vi.mock('../platform/stateSignals.js',    () => ({ signalEnergyChanged: vi.fn() }));
vi.mock('../state/settings.js',           () => ({ getLang: () => 'de' }));

import { G } from '../state/gameState.js';
import { gameNodes, gameLinks } from '../layers/network/index.js';
import { signalEnergyChanged } from '../platform/stateSignals.js';
import {
  initEconomyState,
  tickAutoPulse,
  tickBandwidth,
  tickRefinement,
  rebuildAdjacencyCache,
  applyAdjacencyBonuses,
  ECO_TUNING,
} from '../systems/economy.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function freshG() {
  Object.keys(G).forEach(k => delete G[k]);
  G.energy = 50;
  G.l2On = true;
  G.l3On = true;
  G.l3CapturedClusters = 0;
}

function freshEco() {
  delete G.eco;
  initEconomyState();
}

function makeNode(type, x = 0, y = 0, isMain = false) {
  return { type, isMain, base: { x, y, z: 0 }, _id: Math.random().toString(36).slice(2) };
}

function makeLink(type, src, tgt) {
  return { type, _src: src._id, _tgt: tgt._id, a: src, b: tgt, _signalLoad: 0 };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('initEconomyState()', () => {
  it('creates G.eco when missing', () => {
    freshG();
    delete G.eco;
    initEconomyState();
    expect(G.eco).toBeDefined();
    expect(G.eco.rawData).toBe(0);
    expect(G.eco.autoPulseEnabled).toBe(true);
  });

  it('is idempotent — does not reset existing eco', () => {
    freshG();
    freshEco();
    G.eco.rawData = 42;
    initEconomyState();
    expect(G.eco.rawData).toBe(42);
  });
});

describe('tickAutoPulse()', () => {
  beforeEach(() => { freshG(); freshEco(); gameLinks.length = 0; });

  it('does nothing when autoPulseEnabled is false', () => {
    G.eco.autoPulseEnabled = false;
    G.eco.lastAutoPulseTick = 0;
    tickAutoPulse(999);
    expect(G.eco.lastAutoPulseTick).toBe(0);
  });

  it('does not fire before interval elapses', () => {
    G.eco.lastAutoPulseTick = 100;
    tickAutoPulse(101); // only 1s elapsed, interval is 5.0
    expect(G.eco.lastAutoPulseTick).toBe(100);
  });

  it('fires when interval has elapsed and updates lastAutoPulseTick', () => {
    const link = makeLink('stable', makeNode('relay'), makeNode('amplifier'));
    gameLinks.push(link);
    G.eco.lastAutoPulseTick = 0;
    tickAutoPulse(6);
    expect(G.eco.lastAutoPulseTick).toBe(6);
    gameLinks.length = 0;
  });

  it('marks under-capacity links for auto-pulse', () => {
    const link = makeLink('stable', makeNode('relay'), makeNode('amplifier'));
    link._signalLoad = 0; // cap is 3 for 'stable'
    gameLinks.push(link);
    G.eco.lastAutoPulseTick = 0;
    tickAutoPulse(10);
    expect(link._autoPulseQueued).toBe(true);
    gameLinks.length = 0;
  });

  it('skips links at or over capacity', () => {
    const link = makeLink('stable', makeNode('relay'), makeNode('amplifier'));
    link._signalLoad = 3; // exactly at cap
    gameLinks.push(link);
    G.eco.lastAutoPulseTick = 0;
    tickAutoPulse(10);
    expect(link._autoPulseQueued).toBeFalsy();
    gameLinks.length = 0;
  });
});

describe('tickBandwidth()', () => {
  beforeEach(() => { freshG(); freshEco(); gameLinks.length = 0; });

  it('marks over-capacity links as bottlenecks', () => {
    const link = makeLink('stable', makeNode('relay'), makeNode('source'));
    link._signalLoad = 5; // cap=3 → over
    gameLinks.push(link);
    tickBandwidth();
    expect(G.eco.bottlenecks).toContain(link);
    expect(link._overCapacity).toBe(true);
    gameLinks.length = 0;
  });

  it('drains energy proportional to over-capacity load', () => {
    const link = makeLink('stable', makeNode('relay'), makeNode('source'));
    link._signalLoad = 6; // 3 over cap=3
    gameLinks.push(link);
    G.energy = 50;
    tickBandwidth();
    expect(G.energy).toBeLessThan(50);
    expect(signalEnergyChanged).toHaveBeenCalled();
    gameLinks.length = 0;
  });

  it('does not drain energy when all links are under capacity', () => {
    const link = makeLink('stable', makeNode('relay'), makeNode('source'));
    link._signalLoad = 1;
    gameLinks.push(link);
    G.energy = 50;
    tickBandwidth();
    expect(G.energy).toBe(50);
    gameLinks.length = 0;
  });
});

describe('tickRefinement()', () => {
  beforeEach(() => { freshG(); freshEco(); gameNodes.length = 0; });

  it('accumulates rawData from source nodes', () => {
    gameNodes.push(makeNode('source', 0, 0));
    gameNodes.push(makeNode('source', 1, 0));
    G.eco.lastRefineTick = 0;
    tickRefinement(6); // 6 > interval 5
    expect(G.eco.rawData).toBe(2 * ECO_TUNING.rawDataPerSource);
    gameNodes.length = 0;
  });

  it('converts rawData → processedData when relays present', () => {
    gameNodes.push(makeNode('source', 0, 0));
    gameNodes.push(makeNode('relay',  1, 0));
    G.eco.lastRefineTick = 0;
    // Prime rawData above threshold
    G.eco.rawData = ECO_TUNING.rawPerProcessed;
    tickRefinement(6);
    expect(G.eco.processedData).toBeGreaterThan(0);
    gameNodes.length = 0;
  });

  it('does not tick before interval elapses', () => {
    gameNodes.push(makeNode('source', 0, 0));
    G.eco.lastRefineTick = 100;
    G.eco.rawData = 0;
    tickRefinement(102); // only 2s elapsed
    expect(G.eco.rawData).toBe(0);
    gameNodes.length = 0;
  });

  it('does not process brownedOut source nodes', () => {
    const src = makeNode('source', 0, 0);
    src._brownedOut = true;
    gameNodes.push(src);
    G.eco.lastRefineTick = 0;
    tickRefinement(6);
    expect(G.eco.rawData).toBe(0);
    gameNodes.length = 0;
  });
});

describe('rebuildAdjacencyCache()', () => {
  beforeEach(() => { freshG(); freshEco(); gameNodes.length = 0; gameLinks.length = 0; });

  it('detects source-source interference within range', () => {
    const a = makeNode('source', 0, 0);
    const b = makeNode('source', 1, 0); // dist=1 < interferenceDistance 1.8
    gameNodes.push(a, b);
    G.eco._adjCacheDirty = true;
    rebuildAdjacencyCache();
    expect(G.eco._interferences.length).toBe(1);
    expect(a._interfering).toBe(true);
    gameNodes.length = 0;
  });

  it('does not flag interference when sources are far apart', () => {
    const a = makeNode('source', 0, 0);
    const b = makeNode('source', 5, 0); // dist=5 > interferenceDistance 1.8
    gameNodes.push(a, b);
    G.eco._adjCacheDirty = true;
    rebuildAdjacencyCache();
    expect(G.eco._interferences.length).toBe(0);
    gameNodes.length = 0;
  });

  it('is a no-op when cache is clean', () => {
    G.eco._adjCacheDirty = false;
    G.eco._synergies = ['sentinel'];
    rebuildAdjacencyCache();
    // should not have cleared the sentinel
    expect(G.eco._synergies).toContain('sentinel');
  });
});
