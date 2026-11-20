import './style.css';
import {
  GlobalHangerEntry,
  fetchGlobalHangerHighscores,
  submitGlobalHangerScore,
} from './api/highscores';
import {
  ACCESSORIES,
  CAT_COLORS,
  EYE_COLORS,
  getCatColor,
} from './data/cats';
import { drawCartoonCat } from './game/catRenderer';
import { HangerStage } from './game/HangerStage';
import { soundFX } from './game/SoundFX';
import {
  HangerState,
  loadHangerState,
  recordHangerScore,
  resolveDeviceId,
  saveHangerState,
} from './storage/state';

type ScreenName = 'home' | 'options' | 'game' | 'highscores';
type HsMode = 'global' | 'local';

let state: HangerState;
let currentScreen: ScreenName = 'home';
let hsMode: HsMode = 'global';
let optionsFromPlay = false;
let stage: HangerStage | null = null;
let homeAnimId: number | null = null;
let hsPollInterval: number | null = null;
let resultTimeoutId: number | null = null;
let hsTapCount = 0;
let hsTapTimer: number | null = null;
let confirmQuitArmed = false;

function renderCatThumb(
  canvas: HTMLCanvasElement,
  colorId: number,
  size: number
): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  drawCartoonCat(ctx, size / 2, size * 0.42, size * 0.24, {
    color: getCatColor(colorId),
    eyeColor: state.eyeColor,
    accessory: state.accessory,
    pose: 'portrait',
  });
}

function syncSoundButtons(): void {
  const homeBtn = document.getElementById('btn-home-sound');
  if (homeBtn) homeBtn.textContent = state.soundEnabled ? '🔊' : '🔇';
  const gameBtn = document.getElementById('btn-game-sound');
  if (gameBtn) gameBtn.textContent = state.soundEnabled ? '🔊' : '🔇';
}

function toggleSound(): void {
  state.soundEnabled = !state.soundEnabled;
  soundFX.enabled = state.soundEnabled;
  saveHangerState(state);
  syncSoundButtons();
  if (state.soundEnabled) soundFX.playUiTap();
}

function openPauseModal(): void {
  if (!stage || stage.isFinished()) return;
  stage.setPaused(true);
  confirmQuitArmed = false;
  const quitBtn = document.getElementById('btn-pause-quit')!;
  quitBtn.textContent = '🚪 Quit to Menu';
  quitBtn.classList.remove('armed');
  document.getElementById('pause-modal')?.classList.remove('hidden');
}

function closePauseModal(resume = true): void {
  document.getElementById('pause-modal')?.classList.add('hidden');
  confirmQuitArmed = false;
  const quitBtn = document.getElementById('btn-pause-quit');
  if (quitBtn) {
    quitBtn.textContent = '🚪 Quit to Menu';
    quitBtn.classList.remove('armed');
  }
  if (resume && stage && !stage.isFinished()) {
    stage.setPaused(false);
    const statusEl = document.getElementById('timer-status');
    if (statusEl && statusEl.textContent !== 'Tap and hold the cat!') {
      statusEl.textContent = 'Tap & hold cat to resume!';
    }
  }
}

function buildApp(): void {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <!-- HOME SCREEN -->
    <section id="screen-home" class="screen home-screen">
      <div class="home-topbar">
        <button id="btn-home-more" class="btn btn-small">✨ More Games</button>
        <button id="btn-home-sound" class="btn btn-small" aria-label="Toggle sound">🔊</button>
      </div>
      <div class="home-content">
        <div class="home-hero">
          <canvas id="home-cat-canvas" class="cat-preview-canvas"></canvas>
          <h1 class="game-title">Cat Hanger</h1>
          <p class="game-subtitle">Hang through wind gusts & hit rhythm boosts to refill grip!</p>
          <div id="home-best-pill" class="best-pill hidden"></div>
        </div>
        <div class="home-actions">
          <button id="btn-home-play" class="btn btn-primary">▶ Play</button>
          <div class="home-secondary-row">
            <button id="btn-home-options" class="btn btn-secondary">🐱 Style</button>
            <button id="btn-home-highscores" class="btn btn-secondary">🏆 Ranks</button>
          </div>
        </div>
      </div>
    </section>

    <!-- CAT STYLE SCREEN -->
    <section id="screen-options" class="screen hidden">
      <div class="top-nav">
        <button id="btn-options-back" class="btn btn-small">← Back</button>
        <h2 id="options-heading" class="screen-heading">Cat Style</h2>
        <span style="width:60px"></span>
      </div>

      <div class="options-scroll">
        <div>
          <p class="section-label">Player Name</p>
          <input id="player-name-input" class="name-input" type="text" maxlength="20" placeholder="Your name" />
        </div>

        <div>
          <p class="section-label">Cat Color</p>
          <div id="cat-color-grid" class="color-grid"></div>
        </div>

        <div>
          <p class="section-label">Eye Color</p>
          <div id="eye-chips" class="chip-row"></div>
        </div>

        <div>
          <p class="section-label">Accessory</p>
          <div id="acc-chips" class="chip-row"></div>
        </div>

        <button id="btn-options-start" class="btn btn-primary" style="margin-top:6px;">Play Now</button>
      </div>
    </section>

    <!-- GAME SCREEN -->
    <section id="screen-game" class="screen game-screen hidden">
      <div class="game-hud-bar">
        <button id="btn-game-pause" class="btn btn-small" aria-label="Pause">⏸ Pause</button>
        <div class="hud-center">
          <div class="timer-pill">
            <span id="timer-value" class="timer-value">0.00 s</span>
            <span id="boost-badge" class="boost-badge hidden">🐟 0</span>
          </div>
          <div id="timer-status" class="timer-sub">Tap and hold the cat!</div>
        </div>
        <button id="btn-game-sound" class="btn btn-small" aria-label="Toggle sound">🔊</button>
      </div>

      <div class="stage-wrap">
        <canvas id="hanger-canvas" class="stage-canvas"></canvas>

        <div id="result-overlay" class="result-overlay hidden">
          <div class="result-card">
            <h3 id="result-title" style="margin:0;">Cat Dropped!</h3>
            <div id="result-time" class="result-time">0.00 s</div>
            <div id="result-badge" style="color:#34d399;font-weight:700;font-size:0.88rem;"></div>
            <div id="result-sub" style="color:var(--muted);font-size:0.8rem;"></div>
            <button id="btn-retry" class="btn btn-primary" style="height:46px;">Try Again</button>
            <button id="btn-result-hs" class="btn btn-secondary" style="height:42px;">🏆 Leaderboard</button>
            <button id="btn-result-menu" class="btn btn-small">🏠 Menu</button>
          </div>
        </div>
      </div>
    </section>

    <!-- LEADERBOARD SCREEN -->
    <section id="screen-highscores" class="screen hidden">
      <div class="top-nav">
        <button id="btn-hs-back" class="btn btn-small">← Back</button>
        <h2 id="hs-heading" class="screen-heading">Leaderboard</h2>
        <button id="btn-hs-refresh" class="btn btn-small">Refresh</button>
      </div>

      <div class="hs-mode-tabs">
        <button id="btn-hs-global" class="hs-mode-btn active" type="button">🌐 Global</button>
        <button id="btn-hs-local" class="hs-mode-btn" type="button">📱 Local</button>
      </div>

      <div class="hs-status-bar">
        <span id="hs-status-text">Connecting...</span>
      </div>

      <div id="hs-config-panel" class="hs-config-panel hidden">
        <p class="hs-config-help">Leaderboard API URL</p>
        <div class="hs-url-row">
          <input
            id="api-url-input"
            class="name-input"
            type="url"
            placeholder="https://..."
          />
          <button id="btn-save-api-url" class="btn btn-small" type="button">Save</button>
        </div>
      </div>

      <div id="hs-list" class="hs-list"></div>
    </section>

    <!-- PAUSE MODAL -->
    <div id="pause-modal" class="modal-backdrop hidden">
      <div class="modal-card">
        <h3 class="modal-title">⏸ Paused</h3>
        <p class="modal-sub">Catch your breath before the next wind gust!</p>
        <button id="btn-pause-resume" class="btn btn-primary" style="height:48px;">▶ Resume</button>
        <button id="btn-pause-options" class="btn btn-secondary">🐱 Cat Style</button>
        <button id="btn-pause-restart" class="btn btn-secondary">↻ Restart Run</button>
        <button id="btn-pause-quit" class="btn btn-danger">🚪 Quit to Menu</button>
      </div>
    </div>

    <!-- MORE GAMES MODAL -->
    <div id="more-games-modal" class="modal-backdrop hidden">
      <div class="modal-card">
        <h3 class="modal-title">✨ More Games by VaelNTN</h3>
        <p class="modal-sub">Handcrafted arcade games from VaelNTN Studios.</p>
        <div class="more-games-list">
          <a class="more-game-item featured" href="https://github.com/VaelNTN/starforge-survivors/releases/latest" target="_blank" rel="noopener noreferrer">
            <div>
              <div class="more-game-name">⭐ Starforge Survivors</div>
              <div class="more-game-desc">Flagship sci-fi roguelite — 6 heroes, 6 bosses & zero ads</div>
            </div>
            <span class="more-game-badge">FLAGSHIP</span>
          </a>
          <a class="more-game-item" href="https://github.com/VaelNTN/cat-climber/releases/latest" target="_blank" rel="noopener noreferrer">
            <div>
              <div class="more-game-name">🐈 Cat Climber</div>
              <div class="more-game-desc">Race up the sky vine with Glowing Fish & falling acorns</div>
            </div>
          </a>
          <a class="more-game-item" href="https://github.com/VaelNTN/dog-hanger/releases/latest" target="_blank" rel="noopener noreferrer">
            <div>
              <div class="more-game-name">🐶 Dog Hanger</div>
              <div class="more-game-desc">Hold on tight & catch flying frisbees over the park pool</div>
            </div>
          </a>
          <a class="more-game-item" href="https://github.com/VaelNTN/dog-climber/releases/latest" target="_blank" rel="noopener noreferrer">
            <div>
              <div class="more-game-name">🐕 Dog Climber</div>
              <div class="more-game-desc">Grab Golden Bones & dodge pinecones up the sky ladder</div>
            </div>
          </a>
        </div>
        <button id="btn-more-close" class="btn btn-secondary" style="height:44px;">Close</button>
      </div>
    </div>
  `;

  populateOptions();
  syncSoundButtons();
  wireEvents();
  refreshHome();
  startHomePreview();
}

function populateOptions(): void {
  const nameInput = document.getElementById('player-name-input') as HTMLInputElement;
  if (document.activeElement !== nameInput) {
    nameInput.value = state.playerName;
  }

  const grid = document.getElementById('cat-color-grid')!;
  grid.innerHTML = '';
  for (const c of CAT_COLORS) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `color-card${state.colorId === c.id ? ' selected' : ''}`;
    const cvs = document.createElement('canvas');
    renderCatThumb(cvs, c.id, 54);
    const lbl = document.createElement('span');
    lbl.className = 'color-card-name';
    lbl.textContent = c.name;
    card.appendChild(cvs);
    card.appendChild(lbl);
    card.addEventListener('click', () => {
      soundFX.playUiTap();
      state.colorId = c.id;
      saveHangerState(state);
      populateOptions();
    });
    grid.appendChild(card);
  }

  const eyeRow = document.getElementById('eye-chips')!;
  eyeRow.innerHTML = '';
  for (const e of EYE_COLORS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `chip-btn${state.eyeColor === e.id ? ' selected' : ''}`;
    btn.textContent = e.name;
    btn.addEventListener('click', () => {
      soundFX.playUiTap();
      state.eyeColor = e.id;
      saveHangerState(state);
      populateOptions();
    });
    eyeRow.appendChild(btn);
  }

  const accRow = document.getElementById('acc-chips')!;
  accRow.innerHTML = '';
  for (const a of ACCESSORIES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `chip-btn${state.accessory === a.id ? ' selected' : ''}`;
    btn.textContent = a.name;
    btn.addEventListener('click', () => {
      soundFX.playUiTap();
      state.accessory = a.id;
      saveHangerState(state);
      populateOptions();
    });
    accRow.appendChild(btn);
  }
}

function showScreen(target: ScreenName): void {
  currentScreen = target;
  closePauseModal(false);
  document.getElementById('more-games-modal')?.classList.add('hidden');
  const map: Record<ScreenName, HTMLElement> = {
    home: document.getElementById('screen-home')!,
    options: document.getElementById('screen-options')!,
    game: document.getElementById('screen-game')!,
    highscores: document.getElementById('screen-highscores')!,
  };
  (Object.keys(map) as ScreenName[]).forEach((k) => {
    map[k].classList.toggle('hidden', k !== target);
  });

  if (target === 'home') {
    stopHighscorePolling();
    stopGameStage();
    refreshHome();
    startHomePreview();
  } else if (target === 'options') {
    stopHighscorePolling();
    stopHomePreview();
    stopGameStage();
    populateOptions();
  } else if (target === 'game') {
    stopHighscorePolling();
    stopHomePreview();
    startGameStage();
  } else if (target === 'highscores') {
    stopHomePreview();
    stopGameStage();
    document.getElementById('hs-config-panel')?.classList.add('hidden');
    void loadHighscores();
    startHighscorePolling();
  }
}

function refreshHome(): void {
  syncSoundButtons();
  const pill = document.getElementById('home-best-pill')!;
  if (state.highscores.length > 0) {
    pill.textContent = `Best: ${state.highscores[0].timeSec.toFixed(2)} s`;
    pill.classList.remove('hidden');
  } else {
    pill.classList.add('hidden');
  }
}

function startHomePreview(): void {
  if (homeAnimId !== null) return;
  const canvas = document.getElementById('home-cat-canvas') as HTMLCanvasElement | null;
  if (!canvas) return;
  const size = 150;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let phase = 0;
  let last = performance.now();
  const tick = (now: number) => {
    if (currentScreen !== 'home') {
      homeAnimId = null;
      return;
    }
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    phase += dt * 2;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    drawCartoonCat(ctx, size / 2, size * 0.44, 34, {
      color: getCatColor(state.colorId),
      eyeColor: state.eyeColor,
      accessory: state.accessory,
      pose: 'hanging',
      phase,
    });
    homeAnimId = requestAnimationFrame(tick);
  };
  homeAnimId = requestAnimationFrame(tick);
}

function stopHomePreview(): void {
  if (homeAnimId !== null) {
    cancelAnimationFrame(homeAnimId);
    homeAnimId = null;
  }
}

function clearResultTimeout(): void {
  if (resultTimeoutId !== null) {
    window.clearTimeout(resultTimeoutId);
    resultTimeoutId = null;
  }
}

function resetGameHud(): void {
  clearResultTimeout();
  document.getElementById('result-overlay')!.classList.add('hidden');
  document.getElementById('timer-value')!.textContent = '0.00 s';
  const badge = document.getElementById('boost-badge')!;
  badge.textContent = '🐟 0';
  badge.classList.add('hidden');
  document.getElementById('timer-status')!.textContent = 'Tap and hold the cat!';
}

function startGameStage(): void {
  resetGameHud();
  syncSoundButtons();

  const canvas = document.getElementById('hanger-canvas') as HTMLCanvasElement;
  const appearance = {
    color: getCatColor(state.colorId),
    eyeColor: state.eyeColor,
    accessory: state.accessory,
  };

  if (stage) {
    stage.setCatAppearance(appearance);
    stage.resetRound();
    stage.start();
    return;
  }

  stage = new HangerStage(canvas, appearance, {
    onStartHold: () => {
      soundFX.playGrab();
      document.getElementById('timer-status')!.textContent = 'Hold tight! Hit rhythm boosts for grip!';
    },
    onTick: (elapsed, boostsHit, bonusScore) => {
      document.getElementById('timer-value')!.textContent = `${elapsed.toFixed(2)} s`;
      const badge = document.getElementById('boost-badge')!;
      if (boostsHit > 0) {
        badge.textContent = `🐟 ${boostsHit} (+${bonusScore})`;
        badge.classList.remove('hidden');
      }
    },
    onTreatBoost: (perfect, boostsHit, bonusScore) => {
      soundFX.playTreatBoost(perfect);
      const badge = document.getElementById('boost-badge')!;
      badge.textContent = `🐟 ${boostsHit} (+${bonusScore})`;
      badge.classList.remove('hidden');
      document.getElementById('timer-status')!.textContent = perfect
        ? 'Perfect rhythm boost! +34% Grip!'
        : 'Good boost! +20% Grip!';
    },
    onWindGust: (dir) => {
      soundFX.playWindGust();
      document.getElementById('timer-status')!.textContent =
        dir > 0 ? '💨 Wind gust pushing right!' : '💨 Wind gust pushing left!';
    },
    onMissTap: () => {
      document.getElementById('timer-status')!.textContent = 'Tap directly ON the cat and hold!';
    },
    onRelease: (elapsed, reason, boostsHit, bonusScore) => {
      soundFX.playFall();
      document.getElementById('timer-value')!.textContent = `${elapsed.toFixed(2)} s`;
      document.getElementById('timer-status')!.textContent =
        reason === 'stamina' ? 'Paws slipped! Refill grip with boosts!' : 'Whoa! Down you go!';
      const { isNewBest, entry } = recordHangerScore(state, elapsed);
      if (state.apiBaseUrl) {
        void submitGlobalHangerScore(state.apiBaseUrl, {
          deviceId: state.deviceId,
          playerName: state.playerName.trim() || 'Player',
          timeSec: entry.timeSec,
          colorId: state.colorId,
          eyeColor: state.eyeColor,
          accessory: state.accessory,
        });
      }
      clearResultTimeout();
      resultTimeoutId = window.setTimeout(() => {
        resultTimeoutId = null;
        if (currentScreen !== 'game') return;
        document.getElementById('result-title')!.textContent =
          reason === 'stamina' ? 'Grip Slipped!' : 'Cat Dropped!';
        document.getElementById('result-time')!.textContent = `${elapsed.toFixed(2)} s`;
        document.getElementById('result-badge')!.textContent = isNewBest
          ? '★ New Personal Best!'
          : '';
        document.getElementById('result-sub')!.textContent =
          boostsHit > 0
            ? `Rhythm Boosts: ${boostsHit} (+${bonusScore} bonus pts)`
            : 'Tip: Tap a 2nd finger or Space during the golden ring to refill grip!';
        document.getElementById('result-overlay')!.classList.remove('hidden');
      }, 650);
    },
  });
  stage.start();
}

function stopGameStage(): void {
  clearResultTimeout();
  stage?.stop();
}

async function loadHighscores(): Promise<void> {
  document.getElementById('btn-hs-global')!.classList.toggle('active', hsMode === 'global');
  document.getElementById('btn-hs-local')!.classList.toggle('active', hsMode === 'local');

  const statusEl = document.getElementById('hs-status-text')!;
  const apiInput = document.getElementById('api-url-input') as HTMLInputElement;
  apiInput.value = state.apiBaseUrl;

  if (hsMode === 'local') {
    statusEl.textContent = `Local Records (${state.highscores.length} saved)`;
    renderLocalHighscores();
    return;
  }

  if (!state.apiBaseUrl) {
    statusEl.textContent = 'Offline Mode — Local Records';
    renderLocalHighscores();
    return;
  }

  statusEl.textContent = 'Connecting...';
  try {
    const bestLocal = state.highscores[0];
    if (bestLocal && bestLocal.timeSec > 0) {
      await submitGlobalHangerScore(state.apiBaseUrl, {
        deviceId: state.deviceId,
        playerName: state.playerName.trim() || 'Player',
        timeSec: bestLocal.timeSec,
        colorId: bestLocal.colorId,
        eyeColor: bestLocal.eyeColor,
        accessory: bestLocal.accessory,
      });
    }
    const res = await fetchGlobalHangerHighscores(state.apiBaseUrl, state.deviceId, 50);
    statusEl.textContent = `Live • ${res.entries.length} players worldwide`;
    renderGlobalHighscores(res.entries);
  } catch {
    statusEl.textContent = 'Offline Mode — Local Records';
    renderLocalHighscores();
  }
}

function renderGlobalHighscores(entries: GlobalHangerEntry[]): void {
  const list = document.getElementById('hs-list')!;
  if (entries.length === 0) {
    list.innerHTML = `<div class="empty-msg">No global scores yet. Play a round to claim #1!</div>`;
    return;
  }

  list.innerHTML = '';
  entries.forEach((item) => {
    const row = document.createElement('div');
    const isMe = item.deviceId === state.deviceId;
    row.className = `hs-row${isMe ? ' is-me' : ''}`;

    const rank = document.createElement('div');
    rank.className = 'hs-rank';
    rank.textContent = `#${item.rank}`;

    const icon = document.createElement('canvas');
    icon.className = 'hs-icon';
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    icon.width = 38 * dpr;
    icon.height = 38 * dpr;
    const ctx = icon.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
      drawCartoonCat(ctx, 19, 17, 10, {
        color: getCatColor(item.colorId),
        eyeColor: item.eyeColor,
        accessory: item.accessory,
        pose: 'portrait',
      });
    }

    const info = document.createElement('div');
    info.className = 'hs-info';
    const name = document.createElement('div');
    name.className = 'hs-name';
    name.textContent = isMe ? `${item.playerName} (You)` : item.playerName;
    const sub = document.createElement('div');
    sub.className = 'hs-sub';
    sub.textContent = getCatColor(item.colorId).name;
    info.appendChild(name);
    info.appendChild(sub);

    const score = document.createElement('div');
    score.className = 'hs-score';
    score.textContent = `${item.timeSec.toFixed(2)} s`;

    row.appendChild(rank);
    row.appendChild(icon);
    row.appendChild(info);
    row.appendChild(score);
    list.appendChild(row);
  });
}

function renderLocalHighscores(): void {
  const list = document.getElementById('hs-list')!;
  if (state.highscores.length === 0) {
    list.innerHTML = `<div class="empty-msg">No scores yet. Play a round to set your record!</div>`;
    return;
  }

  list.innerHTML = '';
  state.highscores.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'hs-row';

    const rank = document.createElement('div');
    rank.className = 'hs-rank';
    rank.textContent = `#${idx + 1}`;

    const icon = document.createElement('canvas');
    icon.className = 'hs-icon';
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    icon.width = 38 * dpr;
    icon.height = 38 * dpr;
    const ctx = icon.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
      drawCartoonCat(ctx, 19, 17, 10, {
        color: getCatColor(item.colorId),
        eyeColor: item.eyeColor,
        accessory: item.accessory,
        pose: 'portrait',
      });
    }

    const info = document.createElement('div');
    info.className = 'hs-info';
    const name = document.createElement('div');
    name.className = 'hs-name';
    name.textContent = item.playerName;
    const sub = document.createElement('div');
    sub.className = 'hs-sub';
    sub.textContent = getCatColor(item.colorId).name;
    info.appendChild(name);
    info.appendChild(sub);

    const score = document.createElement('div');
    score.className = 'hs-score';
    score.textContent = `${item.timeSec.toFixed(2)} s`;

    row.appendChild(rank);
    row.appendChild(icon);
    row.appendChild(info);
    row.appendChild(score);
    list.appendChild(row);
  });
}

function startHighscorePolling(): void {
  stopHighscorePolling();
  hsPollInterval = window.setInterval(() => {
    if (currentScreen === 'highscores' && hsMode === 'global') {
      void loadHighscores();
    }
  }, 6000);
}

function stopHighscorePolling(): void {
  if (hsPollInterval !== null) {
    window.clearInterval(hsPollInterval);
    hsPollInterval = null;
  }
}

function wireEvents(): void {
  document.getElementById('btn-home-play')!.addEventListener('click', () => {
    soundFX.playUiTap();
    showScreen('game');
  });

  document.getElementById('btn-home-options')!.addEventListener('click', () => {
    soundFX.playUiTap();
    optionsFromPlay = false;
    showScreen('options');
  });

  document.getElementById('btn-home-highscores')!.addEventListener('click', () => {
    soundFX.playUiTap();
    showScreen('highscores');
  });

  document.getElementById('btn-home-sound')!.addEventListener('click', toggleSound);

  document.getElementById('btn-home-more')!.addEventListener('click', () => {
    soundFX.playUiTap();
    document.getElementById('more-games-modal')?.classList.remove('hidden');
  });

  document.getElementById('btn-more-close')!.addEventListener('click', () => {
    soundFX.playUiTap();
    document.getElementById('more-games-modal')?.classList.add('hidden');
  });

  document.getElementById('more-games-modal')!.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      document.getElementById('more-games-modal')?.classList.add('hidden');
    }
  });

  document.getElementById('btn-options-back')!.addEventListener('click', () => {
    soundFX.playUiTap();
    showScreen(optionsFromPlay ? 'game' : 'home');
  });

  document.getElementById('btn-options-start')!.addEventListener('click', () => {
    soundFX.playUiTap();
    showScreen('game');
  });

  document.getElementById('player-name-input')!.addEventListener('input', (ev) => {
    state.playerName = (ev.target as HTMLInputElement).value.slice(0, 20);
    saveHangerState(state);
  });

  document.getElementById('btn-game-pause')!.addEventListener('click', () => {
    soundFX.playUiTap();
    openPauseModal();
  });

  document.getElementById('btn-game-sound')!.addEventListener('click', toggleSound);

  document.getElementById('btn-pause-resume')!.addEventListener('click', () => {
    soundFX.playUiTap();
    closePauseModal(true);
  });

  document.getElementById('btn-pause-options')!.addEventListener('click', () => {
    soundFX.playUiTap();
    optionsFromPlay = true;
    showScreen('options');
  });

  document.getElementById('btn-pause-restart')!.addEventListener('click', () => {
    soundFX.playUiTap();
    closePauseModal(false);
    resetGameHud();
    stage?.resetRound();
  });

  document.getElementById('btn-pause-quit')!.addEventListener('click', () => {
    soundFX.playUiTap();
    const quitBtn = document.getElementById('btn-pause-quit')!;
    if (!confirmQuitArmed) {
      confirmQuitArmed = true;
      quitBtn.textContent = '⚠️ Confirm Quit?';
      quitBtn.classList.add('armed');
    } else {
      showScreen('home');
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && currentScreen === 'game') {
      const modal = document.getElementById('pause-modal');
      if (modal && !modal.classList.contains('hidden')) closePauseModal(true);
      else openPauseModal();
    }
  });

  document.getElementById('btn-retry')!.addEventListener('click', () => {
    soundFX.playUiTap();
    resetGameHud();
    stage?.resetRound();
  });

  document.getElementById('btn-result-hs')!.addEventListener('click', () => {
    soundFX.playUiTap();
    showScreen('highscores');
  });

  document.getElementById('btn-result-menu')!.addEventListener('click', () => {
    soundFX.playUiTap();
    showScreen('home');
  });

  document.getElementById('btn-hs-back')!.addEventListener('click', () => {
    soundFX.playUiTap();
    showScreen('home');
  });

  document.getElementById('btn-hs-refresh')!.addEventListener('click', () => {
    soundFX.playUiTap();
    void loadHighscores();
  });

  document.getElementById('btn-hs-global')!.addEventListener('click', () => {
    soundFX.playUiTap();
    hsMode = 'global';
    void loadHighscores();
  });

  document.getElementById('btn-hs-local')!.addEventListener('click', () => {
    soundFX.playUiTap();
    hsMode = 'local';
    void loadHighscores();
  });

  document.getElementById('hs-heading')!.addEventListener('click', () => {
    hsTapCount += 1;
    if (hsTapTimer !== null) window.clearTimeout(hsTapTimer);
    hsTapTimer = window.setTimeout(() => {
      hsTapCount = 0;
    }, 1500);
    if (hsTapCount >= 5) {
      hsTapCount = 0;
      soundFX.playUiTap();
      document.getElementById('hs-config-panel')!.classList.toggle('hidden');
    }
  });

  document.getElementById('btn-save-api-url')!.addEventListener('click', () => {
    soundFX.playUiTap();
    const input = document.getElementById('api-url-input') as HTMLInputElement;
    state.apiBaseUrl = input.value.trim().replace(/\/+$/, '');
    saveHangerState(state);
    document.getElementById('hs-config-panel')!.classList.add('hidden');
    hsMode = 'global';
    void loadHighscores();
  });
}

async function init(): Promise<void> {
  const deviceId = await resolveDeviceId();
  state = loadHangerState(deviceId);
  soundFX.enabled = state.soundEnabled;
  buildApp();
  showScreen('home');
}

void init();
