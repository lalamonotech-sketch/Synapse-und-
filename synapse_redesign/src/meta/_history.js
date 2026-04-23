/**
 * SYNAPSE v99 — History Panel UI
 *
 * Renders the in-game history panel (runs, codex, traits, boss-codex)
 * and the title-screen meta box.
 */

import { G } from '../state/gameState.js';
import { getLang } from '../state/settings.js';
import { aiState } from '../state/aiShared.js';
import { BOSS_PROFILES } from '../state/bossShared.js';
import { el } from '../util/dom.js';
import { escapeHtml, loadRunHistory } from './_runHistory.js';
import { loadAIMetaCached } from '../systems/ai/index.js';
import { getProtocolUnlockRules, PROTOCOL_DEFS } from '../systems/protocols.js';
import { fmtDuration, profileLabel, nextUnlockHint } from './_summary.js';

function lang() { return getLang(); }

function tierLabel(tier) {
  const t = Number(tier || 1);
  return t === 3 ? 'Tier III' : t === 2 ? 'Tier II' : 'Tier I';
}

function rowHtml(run, idx) {
  const isLast = idx === 0;
  return `<div class="hp-row">` +
    `<span class="hp-run-num">${isLast ? (lang() === 'de' ? 'Neu' : 'New') : '#' + (idx + 1)}</span>` +
    `<span class="hp-tier t${Math.max(1, Math.min(3, run.tier || 1))}">${escapeHtml(tierLabel(run.tier))}</span>` +
    `<span class="hp-profile">${escapeHtml(profileLabel(run.profile))}</span>` +
    `<span class="hp-time">${escapeHtml(fmtDuration(run.duration))}</span>` +
  `</div>`;
}

function renderProfileFrequency(history) {
  const target = el('hp-profile-freq');
  if (!target) return;
  const counts = {};
  history.forEach(run => { if (run.profile) counts[run.profile] = (counts[run.profile] || 0) + 1; });
  const parts = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([p, c]) => `${profileLabel(p)} ${c}x`);
  target.innerHTML = parts.length
    ? `<div style="font-size:.32rem;letter-spacing:2px;color:rgba(180,220,255,.36);text-transform:uppercase">${parts.join(' · ')}</div>`
    : `<div style="opacity:.22">${lang() === 'de' ? 'Noch keine Profil-Daten' : 'No profile data yet'}</div>`;
}

function renderLastRunStrip(history, meta) {
  const node = el('hp-last-run');
  if (!node) return;
  if (!history.length) { node.style.display = 'none'; node.textContent = ''; return; }
  const last = history[history.length - 1];
  const totalTraits = (meta.unlockedTraits || []).length;
  const perfects = history.filter(run => run.perfect).length;
  node.style.display = 'block';
  node.textContent = `${lang() === 'de' ? 'Letzter' : 'Last'} · ${tierLabel(last.tier)} · ${profileLabel(last.profile)} · ${fmtDuration(last.duration || 0)} · ${lang() === 'de' ? 'Perfekt' : 'Perfect'} ${perfects} · Traits ${totalTraits}`;
}

function protocolCodexHtml(meta) {
  const totalRuns = meta.totalRuns || 0;
  const rules = getProtocolUnlockRules();
  return Object.entries(PROTOCOL_DEFS).map(([id, proto]) => {
    const need = rules[id]?.runs || 0;
    const unlocked = totalRuns >= need;
    const label = lang() === 'de' ? (proto.nameDe || id) : (proto.nameEn || id);
    const status = unlocked ? (lang() === 'de' ? 'frei' : 'open') : `${totalRuns}/${need}`;
    const color = unlocked ? 'rgba(100,255,170,.16)' : 'rgba(255,180,60,.12)';
    return `<div class="codex-trait" style="border-color:${color}"><span>${label}</span><span class="ct-run">${status}</span></div>`;
  }).join('');
}

function bossCodexHtml(history, meta) {
  const totalRuns = meta.totalRuns || 0;
  const tier2Wins = history.filter(r => (r.tier || 0) >= 2).length;
  const tier3Wins = history.filter(r => (r.tier || 0) >= 3).length;
  const perfectRuns = history.filter(r => r.perfect).length;
  const seen = new Set(history.map(r => r.bossId).filter(Boolean));
  const states = [
    { id: 'null_cortex', unlocked: true, seen: seen.has('null_cortex') },
    { id: 'ghost_matrix', unlocked: totalRuns >= 3 && tier2Wins >= 1, seen: seen.has('ghost_matrix') },
    { id: 'vortex_architect', unlocked: totalRuns >= 5 && perfectRuns >= 1, seen: seen.has('vortex_architect') },
    { id: 'sigma_recursive', unlocked: totalRuns >= 6 && tier2Wins >= 2, seen: seen.has('sigma_recursive') },
    { id: 'parasite_choir', unlocked: totalRuns >= 8 && tier3Wins >= 2, seen: seen.has('parasite_choir') },
  ];
  return states.map(entry => {
    const boss = BOSS_PROFILES?.[entry.id];
    const name = boss?.name || entry.id;
    const status = !entry.unlocked ? (lang() === 'de' ? 'gesperrt' : 'locked') : entry.seen ? (lang() === 'de' ? 'bekämpft' : 'encountered') : (lang() === 'de' ? 'frei' : 'unlocked');
    const color = !entry.unlocked ? 'rgba(80,80,80,.12)' : entry.seen ? 'rgba(255,80,80,.16)' : 'rgba(60,200,120,.14)';
    return `<div class="codex-trait" style="border-color:${color}"><span>${escapeHtml(name)}</span><span class="ct-run">${status}</span></div>`;
  }).join('');
}

export function renderHistoryPanel(tab = 'recent') {
  const history = loadRunHistory();
  const meta = loadAIMetaCached();

  renderLastRunStrip(history, meta);

  const runsEl = el('hp-runs');
  if (runsEl) {
    const recent = [...history].reverse().slice(0, 6);
    runsEl.innerHTML = recent.length
      ? recent.map((run, idx) => rowHtml(run, idx)).join('')
      : `<div style="opacity:.22;font-size:.34rem;padding:4px 0">${lang() === 'de' ? 'Noch keine Runs gespeichert' : 'No runs saved yet'}</div>`;
  }
  renderProfileFrequency(history);

  const bestEl = el('hp-best-runs');
  if (bestEl) {
    const best = [...history].sort((a, b) => (b.tier || 0) - (a.tier || 0) || (a.duration || 99999) - (b.duration || 99999)).slice(0, 5);
    bestEl.innerHTML = best.length
      ? best.map((run, idx) => rowHtml(run, idx)).join('')
      : `<div style="opacity:.22;font-size:.34rem;padding:4px 0">${lang() === 'de' ? 'Noch keine Bestläufe' : 'No best runs yet'}</div>`;
  }

  const codexEl = el('hp-codex');
  if (codexEl) {
    const traits = meta.unlockedTraits || [];
    const next = nextUnlockHint(meta);
    const profileRuns = Object.entries((meta.profileHistory || []).reduce((acc, run) => {
      if (run.profile) acc[run.profile] = (acc[run.profile] || 0) + 1;
      return acc;
    }, {}));
    let html = '';
    if (!traits.length) {
      html = `<div style="opacity:.25;font-size:.34rem;letter-spacing:1px;padding:4px 0">${lang() === 'de' ? 'Noch keine Traits freigeschaltet' : 'No traits unlocked yet'}</div>`;
    } else {
      html += `<div style="font-size:.32rem;letter-spacing:2px;color:rgba(100,200,255,.3);text-transform:uppercase;margin-bottom:6px">★ ${traits.length} ${lang() === 'de' ? 'Traits freigeschaltet' : 'traits unlocked'}</div>`;
      html += traits.map(t => `<div class="codex-trait"><span>${t}</span><span class="ct-run">${lang() === 'de' ? 'aktiv' : 'active'}</span></div>`).join('');
    }
    if (profileRuns.length) {
      html += `<div style="font-size:.30rem;letter-spacing:2px;color:rgba(180,120,255,.3);text-transform:uppercase;margin:8px 0 4px">◈ ${lang() === 'de' ? 'Profile' : 'Profiles'}</div>`;
      html += profileRuns.sort((a, b) => b[1] - a[1]).map(([p, c]) => `<div class="codex-trait" style="border-color:rgba(180,100,255,.15)"><span>${profileLabel(p)}</span><span class="ct-run">${c}x</span></div>`).join('');
    }
    html += `<div style="font-size:.30rem;letter-spacing:2px;color:rgba(140,220,255,.32);text-transform:uppercase;margin:8px 0 4px">◌ ${lang() === 'de' ? 'Protokolle' : 'Protocols'}</div>`;
    html += protocolCodexHtml(meta);
    html += `<div style="font-size:.30rem;letter-spacing:2px;color:rgba(255,100,100,.32);text-transform:uppercase;margin:8px 0 4px">⚠ ${lang() === 'de' ? 'Boss-Codex' : 'Boss codex'}</div>`;
    html += bossCodexHtml(history, meta);
    html += `<div style="font-size:.30rem;letter-spacing:2px;color:rgba(255,180,80,.3);text-transform:uppercase;margin:8px 0 4px">🔓 ${lang() === 'de' ? 'Nächste Freischaltung' : 'Next unlock'}</div>`;
    html += `<div class="codex-trait" style="border-color:rgba(255,160,40,.18)"><span>${next}</span><span class="ct-run">${meta.totalRuns || 0} ${lang() === 'de' ? 'Runs' : 'runs'}</span></div>`;
    codexEl.innerHTML = html;
  }

  const traitsEl = el('hp-traits');
  if (traitsEl) {
    const traits = meta.unlockedTraits || [];
    traitsEl.style.display = tab === 'codex' ? 'none' : '';
    traitsEl.innerHTML = traits.length
      ? `<span style="opacity:.45;letter-spacing:2px">★ </span>${traits.map(t => `<span class="hp-trait-item">${t}</span>`).join(' ')}`
      : `<span style="opacity:.22">${lang() === 'de' ? 'Noch keine Traits' : 'No traits yet'}</span>`;
  }

  // Import from screens to avoid circular dep
  import('./screens.js').then(m => m.updateHistoryToggle()).catch(() => {});
}
