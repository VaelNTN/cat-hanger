import { AccessoryId, CatColor, EyeColorId, getEyeHex } from '../data/cats';

export type CatPose = 'hanging' | 'swinging' | 'falling' | 'climbing' | 'portrait';

export interface CatRenderOptions {
  color: CatColor;
  eyeColor: EyeColorId;
  accessory: AccessoryId;
  pose: CatPose;
  /** Animation phase in radians */
  phase?: number;
  /** Used for climbing alternating paw reach (-1..1) */
  climbStep?: number;
}

/**
 * Draws the shared Cartoon Cat centered near (0, 0).
 * Scale `size` roughly equals the cat's head radius (~32px default).
 */
export function drawCartoonCat(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  opts: CatRenderOptions
): void {
  const { color, eyeColor, accessory, pose, phase = 0, climbStep = 0 } = opts;
  const s = size;
  const lineW = Math.max(1.8, s * 0.08);
  const eyeHex = getEyeHex(eyeColor);

  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Tail behind body
  drawTail(ctx, s, lineW, color, pose, phase);

  // Legs / Hind paws
  drawLegs(ctx, s, lineW, color, pose, climbStep, phase);

  // Torso
  ctx.save();
  ctx.fillStyle = color.body;
  ctx.strokeStyle = color.outline;
  ctx.lineWidth = lineW;
  ctx.beginPath();
  ctx.ellipse(0, s * 0.92, s * 0.66, s * 0.78, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Belly patch
  ctx.fillStyle = color.belly;
  ctx.beginPath();
  ctx.ellipse(0, s * 0.96, s * 0.42, s * 0.56, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Front arms / paws
  drawArms(ctx, s, lineW, color, pose, climbStep);

  // Accessory on neck (collar / bell / bowtie)
  if (accessory === 'collar' || accessory === 'bell' || accessory === 'bowtie') {
    drawNeckAccessory(ctx, s, lineW, accessory);
  }

  // Head
  const headTilt = pose === 'falling' ? Math.sin(phase * 6) * 0.14 : pose === 'swinging' ? Math.sin(phase) * 0.06 : 0;
  ctx.save();
  ctx.rotate(headTilt);

  // Ears
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * s * 0.3, -s * 0.55);
    ctx.lineTo(side * s * 0.88, -s * 1.18);
    ctx.lineTo(side * s * 0.92, -s * 0.25);
    ctx.closePath();
    ctx.fillStyle = color.id === 4 ? color.stripe : color.body;
    ctx.fill();
    ctx.strokeStyle = color.outline;
    ctx.lineWidth = lineW;
    ctx.stroke();

    // Inner ear
    ctx.beginPath();
    ctx.moveTo(side * s * 0.44, -s * 0.56);
    ctx.lineTo(side * s * 0.78, -s * 0.96);
    ctx.lineTo(side * s * 0.78, -s * 0.36);
    ctx.closePath();
    ctx.fillStyle = color.earInner;
    ctx.fill();
  }

  // Head circle
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.06, s * 0.96, s * 0.84, 0, 0, Math.PI * 2);
  ctx.fillStyle = color.body;
  ctx.fill();
  ctx.strokeStyle = color.outline;
  ctx.lineWidth = lineW;
  ctx.stroke();

  // Forehead tabby stripes
  ctx.strokeStyle = color.stripe;
  ctx.lineWidth = Math.max(1.5, s * 0.085);
  for (const dx of [-0.22, 0, 0.22]) {
    ctx.beginPath();
    ctx.moveTo(dx * s, -s * 0.84);
    ctx.lineTo(dx * s * 0.85, -s * 0.58);
    ctx.stroke();
  }

  // Cute muzzle cheeks
  ctx.fillStyle = color.belly;
  ctx.beginPath();
  ctx.ellipse(-s * 0.18, s * 0.2, s * 0.24, s * 0.17, 0, 0, Math.PI * 2);
  ctx.ellipse(s * 0.18, s * 0.2, s * 0.24, s * 0.17, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  const blinking = pose === 'hanging' && Math.sin(phase * 0.7) > 0.96;
  for (const side of [-1, 1]) {
    const ex = side * s * 0.36;
    const ey = -s * 0.1;
    if (blinking) {
      ctx.strokeStyle = color.outline;
      ctx.lineWidth = lineW;
      ctx.beginPath();
      ctx.moveTo(ex - s * 0.14, ey);
      ctx.lineTo(ex + s * 0.14, ey);
      ctx.stroke();
    } else {
      const eyeR = pose === 'falling' ? s * 0.2 : s * 0.17;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex, ey, eyeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = color.outline;
      ctx.lineWidth = lineW * 0.7;
      ctx.stroke();

      // Iris
      ctx.fillStyle = eyeHex;
      ctx.beginPath();
      ctx.arc(ex, ey, eyeR * 0.68, 0, Math.PI * 2);
      ctx.fill();

      // Pupil
      ctx.fillStyle = '#09090b';
      const pupilR = pose === 'falling' ? eyeR * 0.28 : eyeR * 0.42;
      ctx.beginPath();
      ctx.arc(ex, ey, pupilR, 0, Math.PI * 2);
      ctx.fill();

      // Catchlight
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex - eyeR * 0.24, ey - eyeR * 0.24, eyeR * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Sunglasses accessory
  if (accessory === 'glasses') {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = Math.max(1.5, s * 0.06);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.roundRect(
        side * s * 0.36 - s * 0.25,
        -s * 0.26,
        s * 0.5,
        s * 0.32,
        s * 0.08
      );
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-s * 0.11, -s * 0.12);
    ctx.lineTo(s * 0.11, -s * 0.12);
    ctx.stroke();
  }

  // Nose
  ctx.fillStyle = '#fb7185';
  ctx.beginPath();
  ctx.moveTo(0, s * 0.06);
  ctx.lineTo(-s * 0.1, s * 0.16);
  ctx.lineTo(s * 0.1, s * 0.16);
  ctx.closePath();
  ctx.fill();

  // Mouth
  ctx.strokeStyle = color.outline;
  ctx.lineWidth = lineW * 0.85;
  if (pose === 'falling') {
    ctx.fillStyle = '#9f1239';
    ctx.beginPath();
    ctx.ellipse(0, s * 0.33, s * 0.12, s * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(0, s * 0.16);
    ctx.quadraticCurveTo(-s * 0.1, s * 0.28, -s * 0.2, s * 0.22);
    ctx.moveTo(0, s * 0.16);
    ctx.quadraticCurveTo(s * 0.1, s * 0.28, s * 0.2, s * 0.22);
    ctx.stroke();
  }

  // Whiskers
  ctx.strokeStyle = color.outline;
  ctx.lineWidth = Math.max(1, s * 0.045);
  for (const side of [-1, 1]) {
    for (const wy of [0.1, 0.2, 0.3]) {
      ctx.beginPath();
      ctx.moveTo(side * s * 0.45, s * wy);
      ctx.lineTo(side * s * 1.08, s * (wy + (wy - 0.2) * 0.45));
      ctx.stroke();
    }
  }

  ctx.restore(); // head
  ctx.restore(); // root
}

function drawTail(
  ctx: CanvasRenderingContext2D,
  s: number,
  lineW: number,
  color: CatColor,
  pose: CatPose,
  phase: number
): void {
  const wag = pose === 'swinging' ? Math.sin(phase * 2.2) * 0.45 : Math.sin(phase * 1.8) * 0.25;
  ctx.save();
  ctx.strokeStyle = color.outline;
  ctx.lineWidth = s * 0.3;
  ctx.beginPath();
  ctx.moveTo(s * 0.45, s * 1.35);
  ctx.bezierCurveTo(
    s * (1.2 + wag * 0.4),
    s * 1.25,
    s * (1.35 + wag * 0.7),
    s * 0.55,
    s * (0.95 + wag * 0.8),
    s * 0.38
  );
  ctx.stroke();

  ctx.strokeStyle = color.body;
  ctx.lineWidth = s * 0.3 - lineW * 1.4;
  ctx.stroke();
  ctx.restore();
}

function drawLegs(
  ctx: CanvasRenderingContext2D,
  s: number,
  lineW: number,
  color: CatColor,
  pose: CatPose,
  climbStep: number,
  phase: number
): void {
  const kick = pose === 'falling' ? Math.sin(phase * 10) * 0.25 : 0;
  for (const side of [-1, 1]) {
    const climbOffset = pose === 'climbing' ? side * climbStep * s * 0.22 : 0;
    const lx = side * s * 0.36;
    const ly = s * 1.68 + climbOffset + side * kick * s;
    ctx.save();
    ctx.fillStyle = color.id === 4 ? color.stripe : color.body;
    ctx.strokeStyle = color.outline;
    ctx.lineWidth = lineW;
    ctx.beginPath();
    ctx.ellipse(lx, ly, s * 0.2, s * 0.28, side * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function drawArms(
  ctx: CanvasRenderingContext2D,
  s: number,
  lineW: number,
  color: CatColor,
  pose: CatPose,
  climbStep: number
): void {
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.strokeStyle = color.outline;
    ctx.lineWidth = s * 0.34;

    let startX = side * s * 0.52;
    let startY = s * 0.55;
    let endX = side * s * 0.22;
    let endY = -s * 1.32; // reaching up to rope

    if (pose === 'falling') {
      endX = side * s * 1.15;
      endY = s * 0.15;
    } else if (pose === 'portrait') {
      endX = side * s * 0.56;
      endY = s * 1.18;
    } else if (pose === 'climbing') {
      const reach = side * climbStep;
      endX = side * s * 0.28;
      endY = -s * 1.15 - reach * s * 0.35;
    }

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    ctx.strokeStyle = color.id === 4 ? color.stripe : color.body;
    ctx.lineWidth = s * 0.34 - lineW * 1.3;
    ctx.stroke();

    // Cute paw circle
    ctx.fillStyle = color.id === 1 ? '#f8fafc' : color.body;
    ctx.strokeStyle = color.outline;
    ctx.lineWidth = lineW;
    ctx.beginPath();
    ctx.arc(endX, endY, s * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }
}

function drawNeckAccessory(
  ctx: CanvasRenderingContext2D,
  s: number,
  lineW: number,
  accessory: AccessoryId
): void {
  ctx.save();
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = Math.max(2.5, s * 0.16);
  ctx.beginPath();
  ctx.moveTo(-s * 0.52, s * 0.62);
  ctx.quadraticCurveTo(0, s * 0.78, s * 0.52, s * 0.62);
  ctx.stroke();

  if (accessory === 'bell') {
    ctx.fillStyle = '#fbbf24';
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = lineW * 0.7;
    ctx.beginPath();
    ctx.arc(0, s * 0.84, s * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (accessory === 'bowtie') {
    ctx.fillStyle = '#38bdf8';
    ctx.strokeStyle = '#0c4a6e';
    ctx.lineWidth = lineW * 0.7;
    ctx.beginPath();
    ctx.moveTo(0, s * 0.74);
    ctx.lineTo(-s * 0.28, s * 0.58);
    ctx.lineTo(-s * 0.28, s * 0.9);
    ctx.closePath();
    ctx.moveTo(0, s * 0.74);
    ctx.lineTo(s * 0.28, s * 0.58);
    ctx.lineTo(s * 0.28, s * 0.9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
