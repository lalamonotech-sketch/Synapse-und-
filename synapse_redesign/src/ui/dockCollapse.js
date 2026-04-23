/**
 * SYNAPSE Redesign v10 — Dock Collapse & HUD Idle-Fade
 * ────────────────────────────────────────────────────────
 * Extended with 3-state dock system (collapsed / partial / expanded)
 * and verbose drawer toggle for the TopBar.
 *
 * Body classes controlled:
 *   dock-state-collapsed  — only action strip visible (64px)
 *   dock-state-partial    — mode bar + action strip (112px)
 *   dock-state-expanded   — everything (186px)
 *   v92-types-open        — legacy compat (=expanded)
 *   v92-hud-idle          — no input for IDLE_MS, fade non-critical chrome
 *   hud-verbose-open      — verbose drawer is expanded
 */

const IDLE_MS               = 4000;
const AUTO_SHOW_MS          = 2400;
const PICK_COLLAPSE_MS      = 600;
const VERBOSE_AUTO_CLOSE_MS = 3200;

const $ = (id) => document.getElementById(id);

function ready(fn) {
  if (document.readyState !== 'loading') fn();
  else document.addEventListener('DOMContentLoaded', fn, { once: true });
}

/* ──────────────────────────────────────────────────────────────────
   DOCK STATE MACHINE
   ────────────────────────────────────────────────────────────────── */
const DOCK_STATES = {
  collapsed: 'dock-state-collapsed',
  partial:   'dock-state-partial',
  expanded:  'dock-state-expanded',
};

let _currentDockState = 'collapsed';
let _dockAutoCollapseTimer = null;

function clearDockTimer() {
  if (_dockAutoCollapseTimer) {
    clearTimeout(_dockAutoCollapseTimer);
    _dockAutoCollapseTimer = null;
  }
}

function setDockState(state, autoCollapseMs) {
  const body = document.body;
  Object.values(DOCK_STATES).forEach(c => body.classList.remove(c));
  if (state === 'collapsed') {
    body.classList.add(DOCK_STATES.collapsed);
    body.classList.remove('v92-types-open');
  } else if (state === 'partial') {
    body.classList.add(DOCK_STATES.partial);
    body.classList.remove('v92-types-open');
  } else if (state === 'expanded') {
    body.classList.add(DOCK_STATES.expanded);
    body.classList.add('v92-types-open');
  }
  _currentDockState = state;

  const expandBtn = $('dock-expand-btn');
  if (expandBtn) {
    expandBtn.textContent = (state === 'expanded') ? '▲' : '▼';
  }

  clearDockTimer();
  if (autoCollapseMs) {
    _dockAutoCollapseTimer = setTimeout(() => setDockState('collapsed'), autoCollapseMs);
  }
}

function getDockState() { return _currentDockState; }

ready(() => {
  const body   = document.body;
  const dock   = $('ctrl-dock');
  const typeBar = $('type-bar');

  setDockState('collapsed');
  if (!dock) return;

  /* ── New mode pill buttons ──────────────────────────────────────── */
  const modePlace   = $('dock-mode-place');
  const modeConnect = $('dock-mode-connect');
  const expandBtn   = $('dock-expand-btn');

  function updateModePill(mode) {
    if (modePlace)   modePlace.classList.toggle('active',   mode === 'place');
    if (modeConnect) modeConnect.classList.toggle('active', mode === 'connect');
  }
  const htmlEl = document.documentElement;
  new MutationObserver(() => updateModePill(htmlEl.getAttribute('data-mode') || 'place'))
    .observe(htmlEl, { attributes: true, attributeFilter: ['data-mode'] });
  updateModePill(htmlEl.getAttribute('data-mode') || 'place');

  if (modePlace) modePlace.addEventListener('click', () => {
    const btnP = $('btn-p');
    if (btnP) btnP.click();
    setDockState('partial');
  });
  if (modeConnect) modeConnect.addEventListener('click', () => {
    const btnC = $('btn-c');
    if (btnC) btnC.click();
    setDockState('partial', AUTO_SHOW_MS);
  });
  if (expandBtn) expandBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setDockState(_currentDockState === 'expanded' ? 'partial' : 'expanded');
  });

  /* ── Legacy btn-p / btn-c ───────────────────────────────────────── */
  function wireLegacyMode(btn) {
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (btn.classList.contains('active')) {
        setDockState(_currentDockState === 'expanded' ? 'partial' : 'expanded');
      } else {
        setTimeout(() => setDockState('partial', AUTO_SHOW_MS), 0);
      }
    }, true);
  }
  wireLegacyMode($('btn-p'));
  wireLegacyMode($('btn-c'));

  /* ── Type pick → auto-collapse ──────────────────────────────────── */
  function onTypePick() {
    clearDockTimer();
    _dockAutoCollapseTimer = setTimeout(() => setDockState('collapsed'), PICK_COLLAPSE_MS + 800);
  }
  if (typeBar) typeBar.addEventListener('click', (e) => { if (e.target.closest('.tbtn')) onTypePick(); });
  dock.addEventListener('click', (e) => { if (e.target.closest('.type-tile:not(.tile-disabled)')) onTypePick(); });

  /* ── Tap outside → collapse ─────────────────────────────────────── */
  document.addEventListener('pointerdown', (e) => {
    if (_currentDockState === 'collapsed') return;
    if (dock.contains(e.target)) return;
    if (e.target.closest('#protocol-overlay, #info-overlay, #settings-overlay, #pause-overlay, #win-screen, #onboard-card, #side-panel')) return;
    setDockState('collapsed');
  }, true);

  /* ── Sync btn-pulse-v2 → btn-pulse ──────────────────────────────── */
  const btnPulseV2 = $('btn-pulse-v2');
  const btnPulse   = $('btn-pulse');
  if (btnPulseV2 && btnPulse) {
    btnPulseV2.addEventListener('click', () => { if (!btnPulse.disabled) btnPulse.click(); });
    new MutationObserver(() => {
      btnPulseV2.disabled = btnPulse.disabled;
      btnPulseV2.classList.toggle('is-ready', !btnPulse.disabled && !btnPulse.classList.contains('mbtn-cd'));
    }).observe(btnPulse, { attributes: true, attributeFilter: ['disabled', 'class'] });
    btnPulseV2.disabled = btnPulse.disabled;
  }

  /* ── Sync btn-train-v2 → btn-train ──────────────────────────────── */
  const btnTrainV2 = $('btn-train-v2');
  const btnTrain   = $('btn-train');
  if (btnTrainV2 && btnTrain) {
    btnTrainV2.addEventListener('click', () => { if (!btnTrain.disabled) btnTrain.click(); });
    new MutationObserver(() => {
      btnTrainV2.disabled = btnTrain.disabled;
      btnTrainV2.classList.toggle('is-on', btnTrain.classList.contains('on'));
    }).observe(btnTrain, { attributes: true, attributeFilter: ['disabled', 'class'] });
    btnTrainV2.disabled = btnTrain.disabled;
  }

  /* ── Sync btn-auto-v2 → btn-autoroute ───────────────────────────── */
  const btnAutoV2 = $('btn-auto-v2');
  const btnAuto   = $('btn-autoroute');
  if (btnAutoV2 && btnAuto) {
    btnAutoV2.addEventListener('click', () => { if (!btnAuto.disabled) btnAuto.click(); });
    new MutationObserver(() => {
      btnAutoV2.disabled = btnAuto.disabled;
      btnAutoV2.classList.toggle('is-on', btnAuto.classList.contains('on'));
    }).observe(btnAuto, { attributes: true, attributeFilter: ['disabled', 'class', 'style'] });
    btnAutoV2.disabled = btnAuto.disabled;
  }

  /* ──────────────────────────────────────────────────────────────────
     HUD IDLE FADE
     ────────────────────────────────────────────────────────────────── */
  let idleTimer = null;
  function poke() {
    body.classList.remove('v92-hud-idle');
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (body.classList.contains('is-paused')) return;
      if (_currentDockState === 'expanded') return;
      const anyOpen = !!document.querySelector(
        '#protocol-overlay.show, #info-overlay.show, #settings-overlay.show, ' +
        '#pause-overlay.show, #win-screen.show, #draft-overlay.show, ' +
        '#postrun-overlay.show, #onboard-card.vis, #side-panel.open'
      );
      if (!anyOpen) body.classList.add('v92-hud-idle');
    }, IDLE_MS);
  }
  ['pointerdown','pointermove','keydown','wheel','touchstart'].forEach(
    evt => window.addEventListener(evt, poke, { passive: true })
  );
  poke();

  /* ──────────────────────────────────────────────────────────────────
     HUD VERBOSE DRAWER (tap topbar to expand)
     ────────────────────────────────────────────────────────────────── */
  let verboseTimer = null;
  function openVerbose() {
    body.classList.add('hud-verbose-open');
    if (verboseTimer) clearTimeout(verboseTimer);
    verboseTimer = setTimeout(() => body.classList.remove('hud-verbose-open'), VERBOSE_AUTO_CLOSE_MS);
  }
  function closeVerbose() {
    body.classList.remove('hud-verbose-open');
    if (verboseTimer) clearTimeout(verboseTimer);
  }

  const hudEl = $('hud');
  if (hudEl) {
    hudEl.addEventListener('click', (e) => {
      if (e.target.closest('button, a, [role="button"], #toast, #hint, #now-action')) return;
      body.classList.contains('hud-verbose-open') ? closeVerbose() : openVerbose();
    });
  }

  /* ──────────────────────────────────────────────────────────────────
     PAUSE ORB → SIDE PANEL
     ────────────────────────────────────────────────────────────────── */
  const pauseOrb    = $('pause-orb');
  const sidePanel   = $('side-panel');
  const panelDimmer = $('side-panel-dimmer');
  const panelClose  = $('side-panel-close');

  function openSidePanel()  { body.classList.add('side-panel-open');    sidePanel?.classList.add('open'); }
  function closeSidePanel() { body.classList.remove('side-panel-open'); sidePanel?.classList.remove('open'); }

  pauseOrb?.addEventListener('click', openSidePanel);
  panelDimmer?.addEventListener('click', closeSidePanel);
  panelClose?.addEventListener('click', closeSidePanel);
  $('pause-btn')?.addEventListener('click', openSidePanel);

  /* Side panel tab switching */
  sidePanel?.addEventListener('click', (e) => {
    const tab = e.target.closest('.sp-tab');
    if (!tab?.dataset.pane) return;
    sidePanel.querySelectorAll('.sp-tab').forEach(t => t.classList.toggle('active', t === tab));
    sidePanel.querySelectorAll('.sp-pane').forEach(p => p.classList.toggle('active', p.id === 'sp-' + tab.dataset.pane));
  });

  $('sp-btn-continue')?.addEventListener('click', closeSidePanel);
  $('sp-btn-newrun')?.addEventListener('click', () => {
    closeSidePanel();
    $('btn-start')?.click();
  });

  /* Show pause orb when game is active */
  if (dock && pauseOrb) {
    new MutationObserver(() => {
      const active = dock.style.display !== 'none';
      pauseOrb.classList.toggle('visible', active);
    }).observe(dock, { attributes: true, attributeFilter: ['style'] });
  }

  /* ──────────────────────────────────────────────────────────────────
     TITLE SCREEN — Boot sequence animation
     ────────────────────────────────────────────────────────────────── */
  const bootSeq = $('boot-sequence');
  if (bootSeq) {
    const runCount = parseInt(localStorage.getItem('synapse_run_count') || '0', 10);
    if (runCount >= 3) {
      // Skip animation for returning players
      bootSeq.querySelectorAll('.boot-line').forEach(l => l.classList.add('visible'));
    } else {
      const lines = bootSeq.querySelectorAll('.boot-line');
      lines.forEach((line, i) => {
        setTimeout(() => line.classList.add('visible'), i * 400);
      });
    }
  }
});

export { setDockState, getDockState };
