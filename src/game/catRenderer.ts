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
  /** Effort/strain level (0..1) for intense hanging moments */
  effort?: number;
}

function shadeHex(hex: string, amount: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const num = parseInt(clean, 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 255) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 255) + amount));
  const b = Math.min(255, Math.max(0, (num & 255) + amount));
  return `rgb(${r}, ${g}, ${b})`;
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
  const { color, eyeColor, accessory, pose, phase = 0, climbStep = 0, effort = 0 } = opts;
  const s = size;
  const lineW = Math.max(1.8, s * 0.08);
  const eyeHex = getEyeHex(eyeColor);

  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Tail behind body
  drawTail(ctx, s, lineW, color, pose, phase, effort);

  // Legs / Hind paws
  drawLegs(ctx, s, lineW, color, pose, climbStep, phase);

  // Torso with 3D fur gradient
  ctx.save();
  const torsoGrad = ctx.createRadialGradient(-s * 0.2, s * 0.55, s * 0.1, 0, s * 0.95, s * 0.95);
  torsoGrad.addColorStop(0, shadeHex(color.body, 26));
  torsoGrad.addColorStop(0.6, color.body);
  torsoGrad.addColorStop(1, shadeHex(color.body, -26));
  ctx.fillStyle = torsoGrad;
  ctx.strokeStyle = color.outline;
  ctx.lineWidth = lineW;
  ctx.beginPath();
  ctx.ellipse(0, s * 0.92, s * 0.66, s * 0.78, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Subtle side tabby markings on torso
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, s * 0.92, s * 0.63, s * 0.75, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = color.stripe;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = s * 0.075;
  for (const side of [-1, 1]) {
    for (const sy of [0.68, 0.92, 1.16]) {
      ctx.beginPath();
      ctx.moveTo(side * s * 0.68, s * sy);
      ctx.quadraticCurveTo(side * s * 0.5, s * (sy + 0.05), side * s * 0.42, s * (sy + 0.02));
      ctx.stroke();
    }
  }
  ctx.restore();

  // Belly patch with soft chest fluff
  const bellyGrad = ctx.createRadialGradient(0, s * 0.78, s * 0.06, 0, s * 0.96, s * 0.62);
  bellyGrad.addColorStop(0, shadeHex(color.belly, 12));
  bellyGrad.addColorStop(1, color.belly);
  ctx.fillStyle = bellyGrad;
  ctx.beginPath();
  ctx.ellipse(0, s * 0.96, s * 0.43, s * 0.57, 0, 0, Math.PI * 2);
  ctx.fill();

  // Soft chest fur tuft
  ctx.fillStyle = color.belly;
  ctx.beginPath();
  ctx.moveTo(-s * 0.18, s * 0.48);
  ctx.lineTo(-s * 0.08, s * 0.64);
  ctx.lineTo(0, s * 0.52);
  ctx.lineTo(s * 0.08, s * 0.64);
  ctx.lineTo(s * 0.18, s * 0.48);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Front arms / paws
  drawArms(ctx, s, lineW, color, pose, climbStep);

  // Accessory on neck (collar / bell / bowtie)
  if (accessory === 'collar' || accessory === 'bell' || accessory === 'bowtie') {
    drawNeckAccessory(ctx, s, lineW, accessory, phase);
  }

  // Head
  const headTilt =
    pose === 'falling'
      ? Math.sin(phase * 6) * 0.14
      : pose === 'swinging'
      ? Math.sin(phase) * (0.06 + effort * 0.05)
      : Math.sin(phase * 0.7) * 0.025;
  ctx.save();
  ctx.rotate(headTilt);

  // Periodic cute ear twitch
  const twitchWave = Math.sin(phase * 1.9) * Math.sin(phase * 0.47);
  const rightEarTwitch = twitchWave > 0.86 ? (twitchWave - 0.86) * 1.8 : 0;
  const leftEarTwitch = twitchWave < -0.88 ? (-twitchWave - 0.88) * 1.5 : 0;

  // Ears with shaded outer fur & layered inner-ear highlight
  for (const side of [-1, 1]) {
    const earRot = side === 1 ? rightEarTwitch : -leftEarTwitch;
    ctx.save();
    ctx.translate(side * s * 0.55, -s * 0.55);
    ctx.rotate(earRot);
    ctx.translate(-side * s * 0.55, s * 0.55);

    const outerEarBase = color.id === 4 ? color.stripe : color.body;
    const earGrad = ctx.createLinearGradient(side * s * 0.4, -s * 1.15, side * s * 0.9, -s * 0.3);
    earGrad.addColorStop(0, shadeHex(outerEarBase, 20));
    earGrad.addColorStop(1, shadeHex(outerEarBase, -18));

    ctx.beginPath();
    ctx.moveTo(side * s * 0.28, -s * 0.54);
    ctx.quadraticCurveTo(side * s * 0.56, -s * 1.02, side * s * 0.88, -s * 1.18);
    ctx.quadraticCurveTo(side * s * 0.98, -s * 0.7, side * s * 0.92, -s * 0.24);
    ctx.closePath();
    ctx.fillStyle = earGrad;
    ctx.fill();
    ctx.strokeStyle = color.outline;
    ctx.lineWidth = lineW;
    ctx.stroke();

    // Inner ear gradient
    const innerGrad = ctx.createLinearGradient(side * s * 0.5, -s * 0.95, side * s * 0.78, -s * 0.36);
    innerGrad.addColorStop(0, shadeHex(color.earInner, 18));
    innerGrad.addColorStop(1, shadeHex(color.earInner, -22));
    ctx.beginPath();
    ctx.moveTo(side * s * 0.43, -s * 0.56);
    ctx.lineTo(side * s * 0.79, -s * 0.98);
    ctx.lineTo(side * s * 0.8, -s * 0.34);
    ctx.closePath();
    ctx.fillStyle = innerGrad;
    ctx.fill();

    // Delicate inner-ear rim highlight & fur tuft
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
    ctx.lineWidth = Math.max(1, s * 0.032);
    ctx.beginPath();
    ctx.moveTo(side * s * 0.49, -s * 0.58);
    ctx.lineTo(side * s * 0.74, -s * 0.89);
    ctx.stroke();

    ctx.strokeStyle = color.belly;
    ctx.lineWidth = Math.max(1.2, s * 0.045);
    ctx.beginPath();
    ctx.moveTo(side * s * 0.42, -s * 0.52);
    ctx.lineTo(side * s * 0.55, -s * 0.6);
    ctx.stroke();
    ctx.restore();
  }

  // Head silhouette with cute cheek tufts & radial fur shading
  const headBase = color.body;
  const headGrad = ctx.createRadialGradient(-s * 0.28, -s * 0.38, s * 0.12, 0, -s * 0.04, s * 1.05);
  headGrad.addColorStop(0, shadeHex(headBase, 26));
  headGrad.addColorStop(0.58, headBase);
  headGrad.addColorStop(1, shadeHex(headBase, -24));

  ctx.beginPath();
  ctx.ellipse(0, -s * 0.06, s * 0.96, s * 0.84, 0, 0, Math.PI * 2);
  ctx.fillStyle = headGrad;
  ctx.fill();
  ctx.strokeStyle = color.outline;
  ctx.lineWidth = lineW;
  ctx.stroke();

  // Fluffy cheek fur tufts
  for (const side of [-1, 1]) {
    ctx.fillStyle = shadeHex(headBase, -6);
    ctx.strokeStyle = color.outline;
    ctx.lineWidth = lineW * 0.8;
    ctx.beginPath();
    ctx.moveTo(side * s * 0.91, -s * 0.06);
    ctx.lineTo(side * s * 1.04, s * 0.04);
    ctx.lineTo(side * s * 0.92, s * 0.12);
    ctx.lineTo(side * s * 1.0, s * 0.22);
    ctx.lineTo(side * s * 0.85, s * 0.26);
    ctx.fill();
    ctx.stroke();
  }

  // Siamese darker face mask
  if (color.id === 4) {
    ctx.fillStyle = 'rgba(92, 64, 51, 0.28)';
    ctx.beginPath();
    ctx.ellipse(0, s * 0.04, s * 0.56, s * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Soft crown fur sheen
  ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.beginPath();
  ctx.ellipse(-s * 0.24, -s * 0.5, s * 0.34, s * 0.15, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // Forehead & cheek tabby stripes
  ctx.strokeStyle = color.stripe;
  ctx.lineWidth = Math.max(1.5, s * 0.085);
  for (const dx of [-0.22, 0, 0.22]) {
    ctx.beginPath();
    ctx.moveTo(dx * s, -s * 0.84);
    ctx.lineTo(dx * s * 0.85, -s * 0.56);
    ctx.stroke();
  }
  ctx.lineWidth = Math.max(1.2, s * 0.06);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * s * 0.86, -s * 0.14);
    ctx.lineTo(side * s * 0.66, -s * 0.08);
    ctx.moveTo(side * s * 0.84, s * 0.02);
    ctx.lineTo(side * s * 0.67, s * 0.04);
    ctx.stroke();
  }

  // Cute rosy cheeks (always subtle, stronger when swinging hard)
  const cheekAlpha = Math.max(0.16, Math.min(0.48, effort * 0.48));
  ctx.fillStyle = `rgba(251, 113, 133, ${cheekAlpha})`;
  ctx.beginPath();
  ctx.ellipse(-s * 0.54, s * 0.16, s * 0.16, s * 0.09, 0, 0, Math.PI * 2);
  ctx.ellipse(s * 0.54, s * 0.16, s * 0.16, s * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();

  // Cute muzzle cheeks with soft shading
  ctx.fillStyle = color.belly;
  ctx.beginPath();
  ctx.ellipse(-s * 0.17, s * 0.2, s * 0.24, s * 0.17, 0, 0, Math.PI * 2);
  ctx.ellipse(s * 0.17, s * 0.2, s * 0.24, s * 0.17, 0, 0, Math.PI * 2);
  ctx.fill();

  // Tiny whisker follicle dots on muzzle
  ctx.fillStyle = shadeHex(color.outline, 40);
  for (const side of [-1, 1]) {
    for (const [fx, fy] of [
      [0.14, 0.19],
      [0.24, 0.22],
      [0.18, 0.26],
    ]) {
      ctx.beginPath();
      ctx.arc(side * s * fx, s * fy, Math.max(0.8, s * 0.022), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Glossy layered eyes
  const blinking = pose === 'hanging' && Math.sin(phase * 0.7) > 0.96;
  const straining = pose === 'swinging' && effort > 0.55;
  for (const side of [-1, 1]) {
    const ex = side * s * 0.36;
    const ey = -s * 0.1;
    if (blinking) {
      ctx.strokeStyle = color.outline;
      ctx.lineWidth = lineW;
      ctx.beginPath();
      ctx.arc(ex, ey + s * 0.04, s * 0.14, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    } else if (straining) {
      // Determined >< eyes with effort brow
      ctx.strokeStyle = color.outline;
      ctx.lineWidth = lineW * 1.1;
      ctx.beginPath();
      if (side === -1) {
        ctx.moveTo(ex - s * 0.12, ey - s * 0.1);
        ctx.lineTo(ex + s * 0.1, ey);
        ctx.lineTo(ex - s * 0.12, ey + s * 0.1);
      } else {
        ctx.moveTo(ex + s * 0.12, ey - s * 0.1);
        ctx.lineTo(ex - s * 0.1, ey);
        ctx.lineTo(ex + s * 0.12, ey + s * 0.1);
      }
      ctx.stroke();
    } else {
      const eyeR = pose === 'falling' ? s * 0.21 : s * 0.18;
      // Sclera
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex, ey, eyeR, 0, Math.PI * 2);
      ctx.fill();

      // Subtle upper eyelid shadow inside sclera
      ctx.save();
      ctx.beginPath();
      ctx.arc(ex, ey, eyeR, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.12)';
      ctx.fillRect(ex - eyeR, ey - eyeR, eyeR * 2, eyeR * 0.45);
      ctx.restore();

      ctx.strokeStyle = color.outline;
      ctx.lineWidth = lineW * 0.72;
      ctx.beginPath();
      ctx.arc(ex, ey, eyeR, 0, Math.PI * 2);
      ctx.stroke();

      // Layered iris gradient
      const irisR = eyeR * 0.72;
      const irisGrad = ctx.createRadialGradient(
        ex - irisR * 0.2,
        ey - irisR * 0.2,
        irisR * 0.1,
        ex,
        ey,
        irisR
      );
      irisGrad.addColorStop(0, shadeHex(eyeHex, 36));
      irisGrad.addColorStop(0.65, eyeHex);
      irisGrad.addColorStop(1, shadeHex(eyeHex, -42));
      ctx.fillStyle = irisGrad;
      ctx.beginPath();
      ctx.arc(ex, ey, irisR, 0, Math.PI * 2);
      ctx.fill();

      // Deep pupil
      ctx.fillStyle = '#09090b';
      const pupilR = pose === 'falling' ? eyeR * 0.28 : eyeR * 0.42;
      ctx.beginPath();
      ctx.arc(ex, ey, pupilR, 0, Math.PI * 2);
      ctx.fill();

      // Dual glossy catchlights
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex - eyeR * 0.27, ey - eyeR * 0.27, eyeR * 0.23, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex + eyeR * 0.24, ey + eyeR * 0.24, eyeR * 0.1, 0, Math.PI * 2);
      ctx.fill();

      // Subtle curved upper lash line
      ctx.strokeStyle = color.outline;
      ctx.lineWidth = Math.max(1.4, lineW * 0.9);
      ctx.beginPath();
      ctx.arc(ex, ey, eyeR * 1.03, Math.PI * 1.12, Math.PI * 1.88);
      ctx.stroke();
    }
  }

  // Sunglasses accessory with gold frame & diagonal glass glare
  if (accessory === 'glasses') {
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = Math.max(1.6, s * 0.065);
    for (const side of [-1, 1]) {
      const lx = side * s * 0.36 - s * 0.25;
      const ly = -s * 0.27;
      const lw = s * 0.5;
      const lh = s * 0.33;
      const lensGrad = ctx.createLinearGradient(lx, ly, lx + lw, ly + lh);
      lensGrad.addColorStop(0, 'rgba(30, 41, 59, 0.94)');
      lensGrad.addColorStop(1, 'rgba(2, 6, 23, 0.96)');
      ctx.fillStyle = lensGrad;
      ctx.beginPath();
      ctx.roundRect(lx, ly, lw, lh, s * 0.09);
      ctx.fill();
      ctx.stroke();

      // Diagonal reflection streak
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(lx, ly, lw, lh, s * 0.09);
      ctx.clip();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.26)';
      ctx.beginPath();
      ctx.moveTo(lx + lw * 0.14, ly);
      ctx.lineTo(lx + lw * 0.36, ly);
      ctx.lineTo(lx + lw * 0.12, ly + lh);
      ctx.lineTo(lx - lw * 0.08, ly + lh);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.moveTo(-s * 0.11, -s * 0.12);
    ctx.quadraticCurveTo(0, -s * 0.17, s * 0.11, -s * 0.12);
    ctx.stroke();
  }

  // Glossy shaded pink nose
  const noseGrad = ctx.createRadialGradient(-s * 0.02, s * 0.09, s * 0.01, 0, s * 0.12, s * 0.12);
  noseGrad.addColorStop(0, '#fda4af');
  noseGrad.addColorStop(1, '#e11d48');
  ctx.fillStyle = noseGrad;
  ctx.beginPath();
  ctx.moveTo(0, s * 0.17);
  ctx.quadraticCurveTo(-s * 0.11, s * 0.07, -s * 0.08, s * 0.05);
  ctx.quadraticCurveTo(0, s * 0.03, s * 0.08, s * 0.05);
  ctx.quadraticCurveTo(s * 0.11, s * 0.07, 0, s * 0.17);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
  ctx.beginPath();
  ctx.ellipse(-s * 0.03, s * 0.08, s * 0.03, s * 0.016, -0.3, 0, Math.PI * 2);
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
    ctx.fillStyle = '#fb7185';
    ctx.beginPath();
    ctx.ellipse(0, s * 0.4, s * 0.07, s * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (straining) {
    ctx.beginPath();
    ctx.moveTo(-s * 0.18, s * 0.27);
    ctx.lineTo(-s * 0.06, s * 0.22);
    ctx.lineTo(s * 0.06, s * 0.27);
    ctx.lineTo(s * 0.18, s * 0.22);
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
  ctx.lineWidth = Math.max(1, s * 0.042);
  for (const side of [-1, 1]) {
    for (const wy of [0.1, 0.2, 0.3]) {
      ctx.beginPath();
      ctx.moveTo(side * s * 0.45, s * wy);
      ctx.quadraticCurveTo(side * s * 0.78, s * (wy - 0.03), side * s * 1.1, s * (wy + (wy - 0.2) * 0.45));
      ctx.stroke();
    }
  }

  ctx.restore(); // head
  ctx.restore(); // root
}

function drawPawPads(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  angle = 0
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.fillStyle = '#fda4af';
  // Main pad
  ctx.beginPath();
  ctx.ellipse(0, r * 0.14, r * 0.32, r * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();
  // 3 little toe beans
  for (const [bx, by] of [
    [-0.3, -0.24],
    [0, -0.34],
    [0.3, -0.24],
  ]) {
    ctx.beginPath();
    ctx.ellipse(r * bx, r * by, r * 0.13, r * 0.16, bx * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawTail(
  ctx: CanvasRenderingContext2D,
  s: number,
  lineW: number,
  color: CatColor,
  pose: CatPose,
  phase: number,
  effort: number
): void {
  const speed = pose === 'swinging' ? 2.6 + effort * 2.2 : pose === 'falling' ? 5.5 : 1.8;
  const amp = pose === 'swinging' ? 0.52 + effort * 0.32 : pose === 'falling' ? 0.7 : 0.28;
  const wag = Math.sin(phase * speed) * amp;
  const wagTip = Math.sin(phase * speed - 0.7) * amp * 1.2;
  const p0x = s * 0.45;
  const p0y = s * 1.35;
  const c1x = s * (1.2 + wag * 0.45);
  const c1y = s * 1.25;
  const c2x = s * (1.38 + wagTip * 0.75);
  const c2y = s * 0.55;
  const p3x = s * (0.95 + wagTip * 0.9);
  const p3y = s * 0.34;

  ctx.save();
  ctx.strokeStyle = color.outline;
  ctx.lineWidth = s * 0.3;
  ctx.beginPath();
  ctx.moveTo(p0x, p0y);
  ctx.bezierCurveTo(c1x, c1y, c2x, c2y, p3x, p3y);
  ctx.stroke();

  const tailGrad = ctx.createLinearGradient(p0x, p0y, p3x, p3y);
  tailGrad.addColorStop(0, shadeHex(color.body, -14));
  tailGrad.addColorStop(0.7, color.body);
  tailGrad.addColorStop(1, color.id === 1 || color.id === 4 ? color.belly : shadeHex(color.body, 18));
  ctx.strokeStyle = tailGrad;
  ctx.lineWidth = s * 0.3 - lineW * 1.4;
  ctx.stroke();

  // Subtle tail highlight stripe & tip rings
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = Math.max(1, s * 0.05);
  ctx.beginPath();
  ctx.moveTo(p0x + s * 0.05, p0y - s * 0.04);
  ctx.bezierCurveTo(c1x - s * 0.04, c1y - s * 0.04, c2x - s * 0.05, c2y, p3x - s * 0.02, p3y + s * 0.02);
  ctx.stroke();

  // Striped ring bands along tail
  ctx.fillStyle = color.stripe;
  ctx.globalAlpha = 0.55;
  for (const t of [0.34, 0.56, 0.78]) {
    const mt = 1 - t;
    const bx = mt * mt * mt * p0x + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * p3x;
    const by = mt * mt * mt * p0y + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t * t * t * p3y;
    ctx.beginPath();
    ctx.ellipse(bx, by, s * 0.1, s * 0.055, 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
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
    const baseColor = color.id === 4 ? color.stripe : color.body;
    const legGrad = ctx.createRadialGradient(lx - s * 0.05, ly - s * 0.08, s * 0.02, lx, ly, s * 0.3);
    legGrad.addColorStop(0, shadeHex(baseColor, 18));
    legGrad.addColorStop(1, shadeHex(baseColor, -20));
    ctx.fillStyle = legGrad;
    ctx.strokeStyle = color.outline;
    ctx.lineWidth = lineW;
    ctx.beginPath();
    ctx.ellipse(lx, ly, s * 0.21, s * 0.28, side * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Cute toe beans on hind paws
    drawPawPads(ctx, lx, ly + s * 0.04, s * 0.18, side * 0.15);
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

    const startX = side * s * 0.52;
    const startY = s * 0.55;
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

    const armColor = color.id === 4 ? color.stripe : color.body;
    ctx.strokeStyle = armColor;
    ctx.lineWidth = s * 0.34 - lineW * 1.3;
    ctx.stroke();

    // Shaded paw with cute pink toe beans
    const pawColor = color.id === 1 ? '#f8fafc' : color.body;
    const pawGrad = ctx.createRadialGradient(endX - s * 0.05, endY - s * 0.05, s * 0.02, endX, endY, s * 0.2);
    pawGrad.addColorStop(0, shadeHex(pawColor, 20));
    pawGrad.addColorStop(1, shadeHex(pawColor, -18));
    ctx.fillStyle = pawGrad;
    ctx.strokeStyle = color.outline;
    ctx.lineWidth = lineW;
    ctx.beginPath();
    ctx.arc(endX, endY, s * 0.19, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (pose === 'falling' || pose === 'portrait') {
      drawPawPads(ctx, endX, endY, s * 0.17, pose === 'falling' ? side * 0.6 : 0);
    } else {
      // Gripping toe creases & pad peek
      drawPawPads(ctx, endX, endY + s * 0.02, s * 0.14, 0);
      ctx.strokeStyle = color.outline;
      ctx.lineWidth = Math.max(1, lineW * 0.5);
      for (const tx of [-0.07, 0.07]) {
        ctx.beginPath();
        ctx.moveTo(endX + tx * s, endY - s * 0.17);
        ctx.lineTo(endX + tx * s, endY - s * 0.08);
        ctx.stroke();
      }
    }

    ctx.restore();
  }
}

function drawNeckAccessory(
  ctx: CanvasRenderingContext2D,
  s: number,
  lineW: number,
  accessory: AccessoryId,
  phase: number
): void {
  ctx.save();
  // Shaded leather collar strap
  const strapGrad = ctx.createLinearGradient(0, s * 0.56, 0, s * 0.8);
  strapGrad.addColorStop(0, '#ef4444');
  strapGrad.addColorStop(1, '#991b1b');
  ctx.strokeStyle = '#450a0a';
  ctx.lineWidth = Math.max(3, s * 0.18);
  ctx.beginPath();
  ctx.moveTo(-s * 0.52, s * 0.62);
  ctx.quadraticCurveTo(0, s * 0.78, s * 0.52, s * 0.62);
  ctx.stroke();

  ctx.strokeStyle = strapGrad;
  ctx.lineWidth = Math.max(2, s * 0.12);
  ctx.stroke();

  // Metallic collar studs
  ctx.fillStyle = '#fde047';
  for (const [sx, sy] of [
    [-0.36, 0.67],
    [-0.18, 0.71],
    [0.18, 0.71],
    [0.36, 0.67],
  ]) {
    ctx.beginPath();
    ctx.arc(s * sx, s * sy, Math.max(1, s * 0.026), 0, Math.PI * 2);
    ctx.fill();
  }

  if (accessory === 'bell') {
    const jingle = Math.sin(phase * 3.2) * s * 0.02;
    const bellGrad = ctx.createRadialGradient(-s * 0.05 + jingle, s * 0.79, s * 0.02, jingle, s * 0.84, s * 0.17);
    bellGrad.addColorStop(0, '#fef08a');
    bellGrad.addColorStop(0.55, '#f59e0b');
    bellGrad.addColorStop(1, '#92400e');
    ctx.fillStyle = bellGrad;
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = lineW * 0.75;
    ctx.beginPath();
    ctx.arc(jingle, s * 0.84, s * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Bell clapper slit & highlight dot
    ctx.fillStyle = '#451a03';
    ctx.beginPath();
    ctx.arc(jingle, s * 0.89, s * 0.036, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.arc(jingle - s * 0.05, s * 0.78, s * 0.038, 0, Math.PI * 2);
    ctx.fill();
  } else if (accessory === 'bowtie') {
    const bowGrad = ctx.createLinearGradient(-s * 0.28, s * 0.58, s * 0.28, s * 0.9);
    bowGrad.addColorStop(0, '#7dd3fc');
    bowGrad.addColorStop(0.5, '#0ea5e9');
    bowGrad.addColorStop(1, '#0369a1');
    ctx.fillStyle = bowGrad;
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

    // Center knot
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.roundRect(-s * 0.07, s * 0.67, s * 0.14, s * 0.14, s * 0.04);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
