import { AccessoryId, CatColor, EyeColorId } from '../data/cats';
import { drawCartoonCat } from './catRenderer';

export type HangerPhase = 'ready' | 'holding' | 'falling' | 'finished';

export interface HangerStageCallbacks {
  onStartHold: () => void;
  onRelease: (elapsedSeconds: number) => void;
  onMissTap: () => void;
}

export class HangerStage {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private color: CatColor;
  private eyeColor: EyeColorId;
  private accessory: AccessoryId;
  private callbacks: HangerStageCallbacks;

  private width = 0;
  private height = 0;
  private dpr = 1;
  private active = false;
  private rafId: number | null = null;
  private lastTime = 0;

  private phase: HangerPhase = 'ready';
  private animClock = 0;
  private holdStartMs = 0;
  private holdElapsed = 0;
  private pointerX = 0;
  private pointerY = 0;
  private activePointerId: number | null = null;

  // Rope & swing physics
  private anchorX = 0;
  private anchorY = 0;
  private ropeLength = 190;
  private swingAngle = 0;
  private swingPhase = 0;

  // Cat position & fall physics
  private catX = 0;
  private catY = 0;
  private fallVx = 0;
  private fallVy = 0;
  private fallRot = 0;
  private fallSpin = 0;
  private catSize = 32;

  constructor(
    canvas: HTMLCanvasElement,
    opts: { color: CatColor; eyeColor: EyeColorId; accessory: AccessoryId },
    callbacks: HangerStageCallbacks
  ) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D unavailable');
    this.ctx = context;
    this.color = opts.color;
    this.eyeColor = opts.eyeColor;
    this.accessory = opts.accessory;
    this.callbacks = callbacks;

    this.handleResize = this.handleResize.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.loop = this.loop.bind(this);
  }

  public setCatAppearance(opts: {
    color: CatColor;
    eyeColor: EyeColorId;
    accessory: AccessoryId;
  }): void {
    this.color = opts.color;
    this.eyeColor = opts.eyeColor;
    this.accessory = opts.accessory;
  }

  public resetRound(): void {
    this.phase = 'ready';
    this.holdElapsed = 0;
    this.swingAngle = 0;
    this.swingPhase = 0;
    this.fallVx = 0;
    this.fallVy = 0;
    this.fallRot = 0;
    this.activePointerId = null;
    this.updateCatPosFromAngle(0);
  }

  public start(): void {
    if (this.active) return;
    this.active = true;
    this.handleResize();
    window.addEventListener('resize', this.handleResize);
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  public stop(): void {
    this.active = false;
    window.removeEventListener('resize', this.handleResize);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private handleResize(): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);

    this.anchorX = this.width * 0.5;
    this.anchorY = 18;
    this.catSize = Math.max(26, Math.min(38, Math.min(this.width, this.height) * 0.085));
    this.ropeLength = Math.max(130, Math.min(this.height * 0.44, 240));
    if (this.phase === 'ready') {
      this.updateCatPosFromAngle(0);
    }
  }

  private updateCatPosFromAngle(angle: number): void {
    // Rope end is where cat paws grip (-1.32 * catSize from cat head center)
    const totalLen = this.ropeLength + this.catSize * 1.32;
    this.catX = this.anchorX + Math.sin(angle) * totalLen;
    this.catY = this.anchorY + Math.cos(angle) * totalLen;
  }

  private isPointOnCat(x: number, y: number): boolean {
    const dx = x - this.catX;
    const dy = y - (this.catY + this.catSize * 0.35);
    const hitR = this.catSize * 1.95;
    return Math.hypot(dx, dy) <= hitR;
  }

  private onPointerDown(ev: PointerEvent): void {
    ev.preventDefault();
    if (this.phase !== 'ready') return;

    const rect = this.canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;

    if (!this.isPointOnCat(x, y)) {
      this.callbacks.onMissTap();
      return;
    }

    this.activePointerId = ev.pointerId;
    this.pointerX = x;
    this.pointerY = y;
    this.phase = 'holding';
    this.holdStartMs = performance.now();
    this.holdElapsed = 0;
    this.swingPhase = 0.25;
    this.callbacks.onStartHold();
  }

  private onPointerMove(ev: PointerEvent): void {
    if (this.phase !== 'holding' || ev.pointerId !== this.activePointerId) return;
    const rect = this.canvas.getBoundingClientRect();
    this.pointerX = Math.max(36, Math.min(this.width - 36, ev.clientX - rect.left));
    this.pointerY = Math.max(36, Math.min(this.height - 80, ev.clientY - rect.top));
  }

  private onPointerUp(ev: PointerEvent): void {
    if (this.phase !== 'holding' || ev.pointerId !== this.activePointerId) return;
    this.activePointerId = null;
    this.holdElapsed = Math.max(0.01, (performance.now() - this.holdStartMs) / 1000);
    this.phase = 'falling';

    // Launch cat with tangential swing velocity + gravity
    const angularSpeed = Math.cos(this.swingPhase) * 2.5;
    this.fallVx = Math.cos(this.swingAngle) * angularSpeed * 120;
    this.fallVy = -Math.abs(Math.sin(this.swingAngle)) * 60;
    this.fallRot = -this.swingAngle;
    this.fallSpin = (this.fallVx >= 0 ? 1 : -1) * 4.2;

    this.callbacks.onRelease(this.holdElapsed);
  }

  private loop(now: number): void {
    if (!this.active) return;
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
    this.lastTime = now;

    this.update(dt, now);
    this.render();

    this.rafId = requestAnimationFrame(this.loop);
  }

  private update(dt: number, now: number): void {
    this.animClock += dt;

    if (this.phase === 'ready') {
      // Gentle idle dangle
      this.swingAngle = Math.sin(this.animClock * 1.4) * 0.04;
      this.updateCatPosFromAngle(this.swingAngle);
    } else if (this.phase === 'holding') {
      this.holdElapsed = (now - this.holdStartMs) / 1000;
      // Swinging intensifies over time while holding
      const speed = 2.9 + Math.min(2.8, this.holdElapsed * 0.08);
      const maxAngle = Math.min(0.85, 0.42 + this.holdElapsed * 0.025);
      this.swingPhase += dt * speed;
      this.swingAngle = Math.sin(this.swingPhase) * maxAngle;
      this.updateCatPosFromAngle(this.swingAngle);
    } else if (this.phase === 'falling') {
      this.fallVy += 1450 * dt;
      this.catX += this.fallVx * dt;
      this.catY += this.fallVy * dt;
      this.fallRot += this.fallSpin * dt;
      // Rope swings back gently alone
      this.swingAngle *= Math.pow(0.15, dt);

      if (this.catY > this.height + this.catSize * 3) {
        this.phase = 'finished';
      }
    } else {
      this.swingAngle *= Math.pow(0.15, dt);
    }
  }

  private render(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.clearRect(0, 0, this.width, this.height);

    // Subtle sky/clouds backdrop
    this.drawBackdrop(ctx);

    // Beam / branch at top
    ctx.fillStyle = '#78350f';
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(this.anchorX - 75, 0, 150, 22, 10);
    ctx.fill();
    ctx.stroke();

    // Rope from beam to paw grip point
    const ropeEndX = this.anchorX + Math.sin(this.swingAngle) * this.ropeLength;
    const ropeEndY = this.anchorY + Math.cos(this.swingAngle) * this.ropeLength;

    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(this.anchorX, this.anchorY);
    ctx.lineTo(ropeEndX, ropeEndY);
    ctx.stroke();

    ctx.strokeStyle = '#fde68a';
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 7]);
    ctx.beginPath();
    ctx.moveTo(this.anchorX, this.anchorY);
    ctx.lineTo(ropeEndX, ropeEndY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Knot
    ctx.fillStyle = '#b45309';
    ctx.beginPath();
    ctx.arc(ropeEndX, ropeEndY, 7, 0, Math.PI * 2);
    ctx.fill();

    // Cat
    if (this.phase !== 'finished') {
      ctx.save();
      ctx.translate(this.catX, this.catY);
      if (this.phase === 'falling') {
        ctx.rotate(this.fallRot);
      } else {
        ctx.rotate(-this.swingAngle * 0.9);
      }

      const pose =
        this.phase === 'falling'
          ? 'falling'
          : this.phase === 'holding'
          ? 'swinging'
          : 'hanging';

      drawCartoonCat(ctx, 0, 0, this.catSize, {
        color: this.color,
        eyeColor: this.eyeColor,
        accessory: this.accessory,
        pose,
        phase: this.animClock * 2.2,
      });
      ctx.restore();
    }

    // Wind / motion lines while swinging
    if (this.phase === 'holding' && Math.abs(Math.cos(this.swingPhase)) > 0.5) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 2;
      const dir = Math.cos(this.swingPhase) > 0 ? -1 : 1;
      for (let i = -1; i <= 1; i++) {
        const ly = this.catY + i * 24;
        const lx = this.catX + dir * 48;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx + dir * 28, ly);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Live timer directly under the player's finger while holding!
    if (this.phase === 'holding') {
      this.drawFingerTimer(ctx, this.pointerX, this.pointerY + 46, this.holdElapsed);
    }

    ctx.restore();
  }

  private drawBackdrop(ctx: CanvasRenderingContext2D): void {
    const grad = ctx.createLinearGradient(0, 0, 0, this.height);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(0.55, '#1e293b');
    grad.addColorStop(1, '#09111f');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.height);

    // Subtle soft clouds
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    const drift = (this.animClock * 12) % (this.width + 180);
    for (let i = 0; i < 3; i++) {
      const cx = ((drift + i * 190) % (this.width + 180)) - 90;
      const cy = 110 + i * 115;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 62, 22, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawFingerTimer(
    ctx: CanvasRenderingContext2D,
    tx: number,
    ty: number,
    seconds: number
  ): void {
    const clampedX = Math.max(66, Math.min(this.width - 66, tx));
    const clampedY = Math.max(40, Math.min(this.height - 34, ty));
    const text = `${seconds.toFixed(2)} s`;

    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(clampedX - 58, clampedY - 22, 116, 44, 22);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fde047';
    ctx.font = '700 20px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, clampedX, clampedY + 1);
    ctx.restore();
  }
}
