import { AccessoryId, EyeColorId } from '../data/cats';

export interface GlobalHangerEntry {
  rank: number;
  deviceId: string;
  playerName: string;
  timeSec: number;
  colorId: number;
  eyeColor: EyeColorId;
  accessory: AccessoryId;
  updatedAt: string;
}

export interface GlobalHangerResponse {
  ok: boolean;
  entries: GlobalHangerEntry[];
  player: GlobalHangerEntry | null;
}

function cleanUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

export async function fetchGlobalHangerHighscores(
  baseUrl: string,
  deviceId: string,
  limit = 50
): Promise<GlobalHangerResponse> {
  const base = cleanUrl(baseUrl);
  if (!base) throw new Error('NO_BACKEND_URL');
  const res = await fetch(
    `${base}/api/cat-hanger/highscores?limit=${limit}&deviceId=${encodeURIComponent(deviceId)}`,
    { method: 'GET' }
  );
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  return (await res.json()) as GlobalHangerResponse;
}

export async function submitGlobalHangerScore(
  baseUrl: string,
  payload: {
    deviceId: string;
    playerName: string;
    timeSec: number;
    colorId: number;
    eyeColor: EyeColorId;
    accessory: AccessoryId;
  }
): Promise<void> {
  const base = cleanUrl(baseUrl);
  if (!base || payload.timeSec <= 0) return;

  try {
    await fetch(`${base}/api/cat-hanger/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: payload.deviceId,
        playerName: payload.playerName.trim() || 'Kattenbaas',
        timeSec: payload.timeSec,
        colorId: payload.colorId,
        eyeColor: payload.eyeColor,
        accessory: payload.accessory,
      }),
    });
  } catch {
    // Offline fallback stays silent
  }
}
