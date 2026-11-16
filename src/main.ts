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
  ctx.scale(dpr, dpr);
  drawCartoonCat(ctx, size / 2, size * 0.42, size * 0.24, {
    color: getCatColor(colorId),
    eyeColor: state.eyeColor,
    accessory: state.accessory,
    pose: 'portrait',
  });
}

function buildApp(): void {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <!-- HOME SCREEN -->
    <section id="screen-home" class="screen home-screen">
      <div class="home-hero">
        <canvas id="home-cat-canvas" class="cat-preview-canvas"></canvas>
        <h1 class="game-title">Cat Hanger</h1>
        <p class="game-subtitle">
          Druk op de kat en houd je vinger vast terwijl hij zwiert. Laat los en bekijk je tijd!
        </p>
        <div id="home-best-pill" class="best-pill hidden"></div>
      </div>
      <div class="home-actions">
        <button id="btn-home-play" class="btn btn-primary">Play</button>
        <button id="btn-home-options" class="btn btn-secondary">Katopties</button>
        <button id="btn-home-highscores" class="btn btn-secondary">Highscores</button>
      </div>
    </section>

    <!-- KATOPTIES / KATKLEUR SCREEN -->
    <section id="screen-options" class="screen hidden">
      <div class="top-nav">
        <button id="btn-options-back" class="btn btn-small">← Terug</button>
        <h2 id="options-heading" class="screen-heading">Kies je Katkleur</h2>
        <span style="width:60px"></span>
      </div>

      <div class="options-scroll">
        <div>
          <p class="section-label">Jouw Naam (voor Highscores)</p>
          <input id="player-name-input" class="name-input" type="text" maxlength="20" placeholder="Kattenbaas" />
        </div>

        <div>
          <p class="section-label">Katkleur (kies om te spelen)</p>
          <div id="cat-color-grid" class="color-grid"></div>
        </div>

        <div>
          <p class="section-label">Oogkleur</p>
          <div id="eye-chips" class="chip-row"></div>
        </div>

        <div>
          <p class="section-label">Accessoire</p>
          <div id="acc-chips" class="chip-row"></div>
        </div>

        <button id="btn-options-start" class="btn btn-primary" style="margin-top:6px;">Start Spelen</button>
      </div>
    </section>

    <!-- GAME SCREEN -->
    <section id="screen-game" class="screen game-screen hidden">
      <div class="game-top-bar">
        <button id="btn-game-menu" class="btn btn-small">← Menu</button>
        <div style="display:flex;gap:8px;">
          <button id="btn-game-options" class="btn btn-small">Katopties</button>
          <button id="btn-game-sound" class="btn btn-small">Geluid: Aan</button>
        </div>
      </div>

      <div id="game-hint" class="hint-banner">Druk op de kat en houd vast!</div>

      <div class="stage-wrap">
        <canvas id="hanger-canvas" class="stage-canvas"></canvas>

        <div id="result-overlay" class="result-overlay hidden">
          <div class="result-card">
            <h3 id="result-title" style="margin:0;">De kat viel!</h3>
            <div id="result-time" class="result-time">0.00 s</div>
            <div id="result-badge" style="color:#34d399;font-weight:700;font-size:0.9rem;"></div>
            <button id="btn-retry" class="btn btn-primary">Opnieuw</button>
            <button id="btn-result-hs" class="btn btn-secondary">Highscores</button>
            <button id="btn-result-menu" class="btn btn-small">Terug naar Menu</button>
          </div>
        </div>
      </div>
    </section>

    <!-- HIGHSCORES SCREEN -->
    <section id="screen-highscores" class="screen hidden">
      <div class="top-nav">
        <button id="btn-hs-back" class="btn btn-small">← Terug</button>
        <h2 class="screen-heading">Highscores</h2>
        <button id="btn-hs-refresh" class="btn btn-small">Vernieuw</button>
      </div>

      <div class="hs-mode-tabs">
        <button id="btn-hs-global" class="hs-mode-btn active" type="button">🌐 Wereldwijd</button>
        <button id="btn-hs-local" class="hs-mode-btn" type="button">📱 Mijn Scores</button>
      </div>

      <div class="hs-status-bar">
        <span id="hs-status-text">Verbinden met globale server...</span>
        <button id="btn-hs-config" class="btn btn-small" type="button">Server</button>
      </div>

      <div id="hs-config-panel" class="hs-config-panel hidden">
        <p class="hs-config-help">
          Vul de URL van je gedeelde Arcade Highscores Worker in om scores met andere telefoons te delen.
        </p>
        <div class="hs-url-row">
          <input
            id="api-url-input"
            class="name-input"
            type="url"
            placeholder="https://arcade-highscores-api.workers.dev"
          />
          <button id="btn-save-api-url" class="btn btn-small" type="button">Opslaan</button>
        </div>
      </div>

      <div id="hs-list" class="hs-list"></div>
    </section>
  `;

  populateOptions();
  wireEvents();
  refreshHome();
  startHomePreview();
}

function populateOptions(): void {
  const nameInput = document.getElementById('player-name-input') as HTMLInputElement;
  nameInput.value = state.playerName;

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
      if (optionsFromPlay) {
        showScreen('game');
      }
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
    document.getElementById('options-heading')!.textContent = optionsFromPlay
      ? 'Kies je Katkleur'
      : 'Katopties';
  } else if (target === 'game') {
    stopHighscorePolling();
    stopHomePreview();
    startGameStage();
  } else if (target === 'highscores') {
    stopHomePreview();
    stopGameStage();
    void loadHighscores();
    startHighscorePolling();
  }
}

function refreshHome(): void {
  const pill = document.getElementById('home-best-pill')!;
  if (state.highscores.length > 0) {
    pill.textContent = `Record: ${state.highscores[0].timeSec.toFixed(2)} s`;
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
    const dt = (now - last) / 1000;
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

function startGameStage(): void {
  document.getElementById('result-overlay')!.classList.add('hidden');
  document.getElementById('game-hint')!.textContent = 'Druk op de kat en houd vast!';
  document.getElementById('btn-game-sound')!.textContent = state.soundEnabled
    ? 'Geluid: Aan'
    : 'Geluid: Uit';

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
      document.getElementById('game-hint')!.textContent = 'Blijf vasthouden... hij zwiert!';
    },
    onMissTap: () => {
      document.getElementById('game-hint')!.textContent = 'Tik precies OP de kat en houd vast!';
    },
    onRelease: (elapsed) => {
      soundFX.playFall();
      document.getElementById('game-hint')!.textContent = 'Oh nee, losgelaten!';
      const { isNewBest, entry } = recordHangerScore(state, elapsed);
      if (state.apiBaseUrl) {
        void submitGlobalHangerScore(state.apiBaseUrl, {
          deviceId: state.deviceId,
          playerName: state.playerName,
          timeSec: entry.timeSec,
          colorId: state.colorId,
          eyeColor: state.eyeColor,
          accessory: state.accessory,
        });
      }
      window.setTimeout(() => {
        if (currentScreen !== 'game') return;
        document.getElementById('result-time')!.textContent = `${elapsed.toFixed(2)} s`;
        document.getElementById('result-badge')!.textContent = isNewBest
          ? '★ Nieuw Persoonlijk Record!'
          : '';
        document.getElementById('result-overlay')!.classList.remove('hidden');
      }, 650);
    },
  });
  stage.start();
}

function stopGameStage(): void {
  stage?.stop();
}

async function loadHighscores(): Promise<void> {
  document.getElementById('btn-hs-global')!.classList.toggle('active', hsMode === 'global');
  document.getElementById('btn-hs-local')!.classList.toggle('active', hsMode === 'local');

  const statusEl = document.getElementById('hs-status-text')!;
  const apiInput = document.getElementById('api-url-input') as HTMLInputElement;
  apiInput.value = state.apiBaseUrl;

  if (hsMode === 'local') {
    statusEl.textContent = `Lokale geschiedenis (${state.highscores.length} scores op dit toestel)`;
    renderLocalHighscores();
    return;
  }

  if (!state.apiBaseUrl) {
    statusEl.textContent = 'Geen server ingesteld (tik Server om URL in te vullen)';
    renderLocalHighscores();
    return;
  }

  statusEl.textContent = 'Wereldwijde scores laden...';
  try {
    const bestLocal = state.highscores[0];
    if (bestLocal && bestLocal.timeSec > 0) {
      await submitGlobalHangerScore(state.apiBaseUrl, {
        deviceId: state.deviceId,
        playerName: state.playerName,
        timeSec: bestLocal.timeSec,
        colorId: bestLocal.colorId,
        eyeColor: bestLocal.eyeColor,
        accessory: bestLocal.accessory,
      });
    }
    const res = await fetchGlobalHangerHighscores(state.apiBaseUrl, state.deviceId, 50);
    statusEl.textContent = `Live verbonden • ${res.entries.length} spelers wereldwijd`;
    renderGlobalHighscores(res.entries);
  } catch {
    statusEl.textContent = 'Server niet bereikbaar (offline weergave)';
    renderLocalHighscores();
  }
}

function renderGlobalHighscores(entries: GlobalHangerEntry[]): void {
  const list = document.getElementById('hs-list')!;
  if (entries.length === 0) {
    list.innerHTML = `<div class="empty-msg">Nog geen online scores! Speel een potje Cat Hanger om als eerste bovenaan te staan.</div>`;
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
    name.textContent = isMe ? `${item.playerName} (Jij)` : item.playerName;
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
    list.innerHTML = `<div class="empty-msg">Nog geen scores! Speel een potje Cat Hanger om je tijd vast te leggen.</div>`;
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
    optionsFromPlay = true;
    showScreen('options');
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

  document.getElementById('btn-options-back')!.addEventListener('click', () => {
    soundFX.playUiTap();
    showScreen('home');
  });

  document.getElementById('btn-options-start')!.addEventListener('click', () => {
    soundFX.playUiTap();
    showScreen('game');
  });

  document.getElementById('player-name-input')!.addEventListener('input', (ev) => {
    state.playerName = (ev.target as HTMLInputElement).value;
    saveHangerState(state);
  });

  document.getElementById('btn-game-menu')!.addEventListener('click', () => {
    soundFX.playUiTap();
    showScreen('home');
  });

  document.getElementById('btn-game-options')!.addEventListener('click', () => {
    soundFX.playUiTap();
    optionsFromPlay = false;
    showScreen('options');
  });

  document.getElementById('btn-game-sound')!.addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    soundFX.enabled = state.soundEnabled;
    saveHangerState(state);
    soundFX.playUiTap();
    document.getElementById('btn-game-sound')!.textContent = state.soundEnabled
      ? 'Geluid: Aan'
      : 'Geluid: Uit';
  });

  document.getElementById('btn-retry')!.addEventListener('click', () => {
    soundFX.playUiTap();
    document.getElementById('result-overlay')!.classList.add('hidden');
    document.getElementById('game-hint')!.textContent = 'Druk op de kat en houd vast!';
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

  document.getElementById('btn-hs-config')!.addEventListener('click', () => {
    soundFX.playUiTap();
    document.getElementById('hs-config-panel')!.classList.toggle('hidden');
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
