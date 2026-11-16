import { AccessoryId, EyeColorId } from '../data/cats';

const SAVE_KEY = 'cat_hanger_save_v1';

export interface HangerHighscore {
  id: string;
  playerName: string;
  timeSec: number;
  colorId: number;
  eyeColor: EyeColorId;
  accessory: AccessoryId;
  createdAt: string;
}

export interface HangerState {
  colorId: number;
  eyeColor: EyeColorId;
  accessory: AccessoryId;
  playerName: string;
  soundEnabled: boolean;
  highscores: HangerHighscore[];
}

export function loadHangerState(): HangerState {
  const base: HangerState = {
    colorId: 0,
    eyeColor: 'amber',
    accessory: 'none',
    playerName: 'Kattenbaas',
    soundEnabled: true,
    highscores: [],
  };

  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<HangerState>;
    return {
      colorId: typeof parsed.colorId === 'number' ? parsed.colorId : 0,
      eyeColor: parsed.eyeColor || 'amber',
      accessory: parsed.accessory || 'none',
      playerName: typeof parsed.playerName === 'string' && parsed.playerName.trim() ? parsed.playerName.trim() : 'Kattenbaas',
      soundEnabled: parsed.soundEnabled !== false,
      highscores: Array.isArray(parsed.highscores) ? parsed.highscores : [],
    };
  } catch {
    return base;
  }
}

export function saveHangerState(state: HangerState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota issues
  }
}

export function recordHangerScore(
  state: HangerState,
  timeSec: number
): { isNewBest: boolean; entry: HangerHighscore } {
  const prevBest = state.highscores.length > 0 ? state.highscores[0].timeSec : 0;
  const entry: HangerHighscore = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    playerName: state.playerName.trim() || 'Kattenbaas',
    timeSec: Math.round(timeSec * 100) / 100,
    colorId: state.colorId,
    eyeColor: state.eyeColor,
    accessory: state.accessory,
    createdAt: new Date().toISOString(),
  };

  state.highscores = [...state.highscores, entry]
    .sort((a, b) => b.timeSec - a.timeSec)
    .slice(0, 50);

  saveHangerState(state);
  return {
    isNewBest: entry.timeSec > prevBest && entry.timeSec > 0,
    entry,
  };
}
