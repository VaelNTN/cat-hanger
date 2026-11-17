import { AccessoryId, CatColor, EyeColorId } from '../data/cats';
import { drawCartoonCat } from './catRenderer';

export type HangerPhase = 'ready' | 'holding' | 'falling' | 'finished';

export interface HangerStageCallbacks {
  onStartHold: () => void;
  onTick?: (elapsedSeconds: number) => void;
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
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  public stop(): void {
    this.active = false;
    window.removeEventListener('resize', this.handleResize);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
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
    this.anchorY = 26;
    this.catSize = Math.max(26, Math.min(38, Math.min(this.width, this.height) * 0.085));
    this.ropeLength = Math.max(120, Math.min(this.height * 0.42, 230));
    if (this.phase === 'ready') {
      this.updateCatPosFromAngle(0);
    }
  }

  private updateCatPosFromAngle(angle: number): void {
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
    this.phase = 'holding';
    this.holdStartMs = performance.now();
    this.holdElapsed = 0;
    this.swingPhase = 0.25;
    this.callbacks.onStartHold();
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
      this.swingAngle = Math.sin(this.animClock * 1.4) * 0.04;
      this.updateCatPosFromAngle(this.swingAngle);
    } else if (this.phase === 'holding') {
      this.holdElapsed = (now - this.holdStartMs) / 1000;
      this.callbacks.onTick?.(this.holdElapsed);
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

    // Warm cozy twilight rooftop & room beam backdrop
    this.drawBackdrop(ctx);

    // Wooden pergola / rafter beam spanning the top with brackets
    const beamGrad = ctx.createLinearGradient(0, 0, 0, 24);
    beamGrad.addColorStop(0, '#92400e');
    beamGrad.addColorStop(0.5, '#78350f');
    beamGrad.addColorStop(1, '#451a03');
    ctx.fillStyle = beamGrad;
    ctx.fillRect(0, 0, this.width, 22);
    ctx.fillStyle = '#b45309';
    ctx.fillRect(0, 3, this.width, 3);
    ctx.strokeStyle = '#290f02';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 22);
    ctx.lineTo(this.width, 22);
    ctx.stroke();

    // Cozy side wall/beam brackets
    ctx.fillStyle = '#572408';
    ctx.fillRect(10, 22, 16, 26);
    ctx.fillRect(this.width - 26, 22, 16, 26);

    // Brass hook & anchor ring
    ctx.fillStyle = '#fbbf24';
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(this.anchorX - 18, 6, 36, 16, 6);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(this.anchorX, this.anchorY, 9, 0, Math.PI * 2);
    ctx.fillStyle = '#fde68a';
    ctx.fill();
    ctx.strokeStyle = '#92400e';
    ctx.stroke();

    // Rope from brass anchor to paw grip point
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

    // Pulsing grab circle when ready
    if (this.phase === 'ready') {
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.72)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(
        this.catX,
        this.catY + this.catSize * 0.35,
        this.catSize * 1.65 + Math.sin(this.animClock * 4.5) * 5,
        0,
        Math.PI * 2
      );
      ctx.stroke();
    }

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
      ctx.strokeStyle = 'rgba(253, 224, 71, 0.32)';
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

    ctx.restore();
  }

  private drawBackdrop(ctx: CanvasRenderingContext2D): void {
    // Warm cozy twilight sky gradient
    const grad = ctx.createLinearGradient(0, 0, 0, this.height);
    grad.addColorStop(0, '#1e132b');
    grad.addColorStop(0.45, '#431932');
    grad.addColorStop(0.82, '#7c2d12');
    grad.addColorStop(1, '#2a1208');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.height);

    // Subtle twinkling stars in upper sky
    ctx.fillStyle = 'rgba(254, 240, 138, 0.45)';
    for (let i = 0; i < 18; i++) {
      const sx = ((i * 89 + 23) % 100) * 0.01 * this.width;
      const sy = 40 + ((i * 47) % 100) * 0.004 * this.height;
      const pulse = 0.5 + 0.5 * Math.sin(this.animClock * 2 + i);
      ctx.globalAlpha = 0.25 + pulse * 0.45;
      ctx.beginPath();
      ctx.arc(sx, sy, (i % 2) + 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Warm crescent moon
    const moonX = this.width * 0.82;
    const moonY = 74;
    ctx.fillStyle = 'rgba(253, 224, 71, 0.88)';
    ctx.beginPath();
    ctx.arc(moonX, moonY, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b152d';
    ctx.beginPath();
    ctx.arc(moonX + 7, moonY - 4, 15, 0, Math.PI * 2);
    ctx.fill();

    // Cozy warm string lights draped under the pergola beam
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.28)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 24);
    ctx.quadraticCurveTo(this.width * 0.25, 44, this.width * 0.5, 24);
    ctx.quadraticCurveTo(this.width * 0.75, 44, this.width, 24);
    ctx.stroke();
    for (let i = 1; i <= 7; i++) {
      const lx = (this.width / 8) * i;
      const t = (i % 4) / 4;
      const ly = 24 + Math.sin(t * Math.PI) * 14;
      ctx.fillStyle = 'rgba(253, 224, 71, 0.75)';
      ctx.beginPath();
      ctx.arc(lx, ly, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Cozy rooftop silhouettes with warm glowing windows at bottom
    const baseY = this.height;
    const bldgs = [
      { x: 0, w: 0.22, h: 96, roof: 'gable' },
      { x: 0.2, w: 0.24, h: 72, roof: 'flat' },
      { x: 0.42, w: 0.2, h: 108, roof: 'gable' },
      { x: 0.6, w: 0.22, h: 78, roof: 'flat' },
      { x: 0.8, w: 0.22, h: 94, roof: 'gable' },
    ];
    for (let bi = 0; bi < bldgs.length; bi++) {
      const b = bldgs[bi];
      const bx = b.x * this.width;
      const bw = b.w * this.width + 4;
      const by = baseY - b.h;
      ctx.fillStyle = '#1c0f0a';
      ctx.fillRect(bx, by, bw, b.h);
      if (b.roof === 'gable') {
        ctx.beginPath();
        ctx.moveTo(bx - 4, by);
        ctx.lineTo(bx + bw / 2, by - 22);
        ctx.lineTo(bx + bw + 4, by);
        ctx.closePath();
        ctx.fill();
      }
      // Warm lit cozy windows
      ctx.fillStyle = 'rgba(251, 191, 36, 0.34)';
      for (let wy = by + 16; wy < baseY - 24; wy += 24) {
        for (let wx = bx + 12; wx < bx + bw - 18; wx += 22) {
          if ((wx + wy + bi) % 3 !== 0) {
            ctx.beginPath();
            ctx.roundRect(wx, wy, 10, 14, 2);
            ctx.fill();
          }
        }
      }
    }

    // Cozy warm cushioned sill / roof ledge at very bottom
    ctx.fillStyle = '#451a03';
    ctx.fillRect(0, baseY - 12, this.width, 12);
    ctx.fillStyle = '#92400e';
    ctx.fillRect(0, baseY - 14, this.width, 3);
  }
}
