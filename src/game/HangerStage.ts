import { AccessoryId, CatColor, EyeColorId } from '../data/cats';
import { drawCartoonCat } from './catRenderer';

export type HangerPhase = 'ready' | 'holding' | 'falling' | 'finished';

export interface HangerStageCallbacks {
  onStartHold: () => void;
  onTick?: (elapsedSeconds: number) => void;
  onRelease: (elapsedSeconds: number) => void;
  onMissTap: () => void;
}

interface SparkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
  kind: 'confetti' | 'dust' | 'sweat' | 'star';
  rot: number;
  vRot: number;
}

interface MilestoneRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
  label: string;
}

const CONFETTI_COLORS = ['#fbbf24', '#fb7185', '#38bdf8', '#34d399', '#c084fc', '#fde047'];

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
  private nextMilestoneSec = 5;

  // Rope, bar flex & swing physics
  private anchorX = 0;
  private anchorY = 30;
  private barFlex = 0;
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

  // Juice & particles
  private particles: SparkParticle[] = [];
  private rings: MilestoneRing[] = [];
  private sweatTimer = 0;
  private hitFlash = 0;

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
    this.onContextMenu = this.onContextMenu.bind(this);
    this.onBlurOrHide = this.onBlurOrHide.bind(this);
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
    this.releasePointerCaptureSafe();
    this.phase = 'ready';
    this.holdElapsed = 0;
    this.nextMilestoneSec = 5;
    this.barFlex = 0;
    this.swingAngle = 0;
    this.swingPhase = 0;
    this.fallVx = 0;
    this.fallVy = 0;
    this.fallRot = 0;
    this.activePointerId = null;
    this.particles = [];
    this.rings = [];
    this.sweatTimer = 0;
    this.hitFlash = 0;
    this.updateCatPosFromAngle(0);
  }

  public start(): void {
    if (this.active) return;
    this.active = true;
    this.handleResize();
    window.addEventListener('resize', this.handleResize);
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    window.addEventListener('blur', this.onBlurOrHide);
    document.addEventListener('visibilitychange', this.onBlurOrHide);
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  public stop(): void {
    this.active = false;
    this.releasePointerCaptureSafe();
    this.activePointerId = null;
    if (this.phase === 'holding') {
      this.phase = 'ready';
    }
    window.removeEventListener('resize', this.handleResize);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    window.removeEventListener('blur', this.onBlurOrHide);
    document.removeEventListener('visibilitychange', this.onBlurOrHide);
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private releasePointerCaptureSafe(): void {
    if (this.activePointerId !== null) {
      try {
        if (this.canvas.hasPointerCapture?.(this.activePointerId)) {
          this.canvas.releasePointerCapture(this.activePointerId);
        }
      } catch {
        // Ignore if pointer already inactive
      }
    }
  }

  private onContextMenu(ev: Event): void {
    ev.preventDefault();
  }

  private onBlurOrHide(): void {
    if (document.hidden || !document.hasFocus()) {
      this.forceReleaseIfHolding();
    }
  }

  private forceReleaseIfHolding(): void {
    if (this.phase !== 'holding') return;
    const pid = this.activePointerId;
    this.finishHold(pid);
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
    this.anchorY = 30;
    this.catSize = Math.max(26, Math.min(38, Math.min(this.width, this.height) * 0.085));
    this.ropeLength = Math.max(115, Math.min(this.height * 0.42, 230));
    if (this.phase === 'ready') {
      this.updateCatPosFromAngle(0);
    }
  }

  private updateCatPosFromAngle(angle: number): void {
    const totalLen = this.ropeLength + this.catSize * 1.32;
    this.catX = this.anchorX + Math.sin(angle) * totalLen;
    this.catY = this.anchorY + this.barFlex + Math.cos(angle) * totalLen;
  }

  private isPointOnCat(x: number, y: number): boolean {
    const dx = x - this.catX;
    const dy = y - (this.catY + this.catSize * 0.35);
    const hitR = this.catSize * 1.95;
    return Math.hypot(dx, dy) <= hitR;
  }

  private onPointerDown(ev: PointerEvent): void {
    ev.preventDefault();
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    if (this.phase !== 'ready' || this.activePointerId !== null) return;

    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;

    if (!this.isPointOnCat(x, y)) {
      this.callbacks.onMissTap();
      return;
    }

    this.activePointerId = ev.pointerId;
    try {
      this.canvas.setPointerCapture(ev.pointerId);
    } catch {
      // Ignore unsupported capture
    }

    this.phase = 'holding';
    this.holdStartMs = performance.now();
    this.holdElapsed = 0;
    this.nextMilestoneSec = 5;
    this.swingPhase = 0.25;
    this.hitFlash = 1;
    this.spawnBurst(this.catX, this.catY - this.catSize * 0.5, 10, 'dust');
    this.callbacks.onStartHold();
  }

  private onPointerUp(ev: PointerEvent): void {
    if (this.phase !== 'holding' || ev.pointerId !== this.activePointerId) return;
    this.finishHold(ev.pointerId);
  }

  private finishHold(_pointerId: number | null): void {
    this.releasePointerCaptureSafe();
    this.activePointerId = null;

    // Combine clamped accumulated time with sub-frame fallback so quick taps work
    const frameFallback = Math.min(0.05, Math.max(0.01, (performance.now() - this.holdStartMs) / 1000));
    this.holdElapsed = Math.max(0.01, this.holdElapsed > 0 ? this.holdElapsed : frameFallback);
    this.phase = 'falling';

    // Launch cat with tangential swing velocity + gravity
    const angularSpeed = Math.cos(this.swingPhase) * 2.5;
    this.fallVx = Math.cos(this.swingAngle) * angularSpeed * 120;
    this.fallVy = -Math.abs(Math.sin(this.swingAngle)) * 60;
    this.fallRot = -this.swingAngle;
    this.fallSpin = (this.fallVx >= 0 ? 1 : -1) * 4.2;

    // Playful dust & confetti burst on release
    this.spawnBurst(this.catX, this.catY - this.catSize * 0.9, 14, 'dust');
    this.spawnBurst(this.catX, this.catY, 18, 'confetti');

    this.callbacks.onRelease(this.holdElapsed);
  }

  private spawnBurst(
    x: number,
    y: number,
    count: number,
    kind: SparkParticle['kind']
  ): void {
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const spd = kind === 'confetti' ? 95 + Math.random() * 190 : 45 + Math.random() * 110;
      const maxLife = kind === 'confetti' ? 0.7 + Math.random() * 0.5 : 0.4 + Math.random() * 0.35;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 14,
        y: y + (Math.random() - 0.5) * 14,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - (kind === 'confetti' ? 75 : 20),
        size: kind === 'confetti' ? 4 + Math.random() * 4 : 3.5 + Math.random() * 4.5,
        color:
          kind === 'dust'
            ? 'rgba(254, 243, 199, 0.85)'
            : kind === 'star'
            ? '#fde047'
            : CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        life: maxLife,
        maxLife,
        kind,
        rot: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 10,
      });
    }
  }

  private spawnSweatDrop(): void {
    const side = Math.random() > 0.5 ? 1 : -1;
    this.particles.push({
      x: this.catX + side * (this.catSize * 0.85),
      y: this.catY - this.catSize * 0.35,
      vx: side * (35 + Math.random() * 45),
      vy: -45 - Math.random() * 40,
      size: 4 + Math.random() * 2.5,
      color: '#7dd3fc',
      life: 0.55,
      maxLife: 0.55,
      kind: 'sweat',
      rot: 0,
      vRot: 0,
    });
  }

  private triggerMilestone(sec: number): void {
    this.rings.push({
      x: this.catX,
      y: this.catY + this.catSize * 0.3,
      radius: this.catSize * 0.7,
      maxRadius: this.catSize * 3.4,
      life: 0.9,
      maxLife: 0.9,
      label: `${sec}s!`,
    });
    this.spawnBurst(this.catX, this.catY, sec % 10 === 0 ? 24 : 14, 'confetti');
    this.spawnBurst(this.catX, this.catY - this.catSize * 0.4, 8, 'star');
  }

  private loop(now: number): void {
    if (!this.active) return;
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
    this.lastTime = now;

    this.update(dt);
    this.render();

    this.rafId = requestAnimationFrame(this.loop);
  }

  private update(dt: number): void {
    this.animClock += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 4);

    if (this.phase === 'ready') {
      this.swingAngle = Math.sin(this.animClock * 1.4) * 0.04;
      this.barFlex += (4 - this.barFlex) * Math.min(1, dt * 8);
      this.updateCatPosFromAngle(this.swingAngle);
    } else if (this.phase === 'holding') {
      this.holdElapsed += dt;
      this.callbacks.onTick?.(this.holdElapsed);

      while (this.holdElapsed >= this.nextMilestoneSec) {
        this.triggerMilestone(this.nextMilestoneSec);
        this.nextMilestoneSec += 5;
      }

      const speed = 2.9 + Math.min(2.8, this.holdElapsed * 0.08);
      const maxAngle = Math.min(0.85, 0.42 + this.holdElapsed * 0.025);
      this.swingPhase += dt * speed;
      this.swingAngle = Math.sin(this.swingPhase) * maxAngle;

      // Bar flexes slightly under dynamic swing load
      const targetFlex = 7 + Math.abs(Math.cos(this.swingAngle)) * 4 + Math.min(4, this.holdElapsed * 0.15);
      this.barFlex += (targetFlex - this.barFlex) * Math.min(1, dt * 10);

      // Sweat drops appear as seconds climb
      if (this.holdElapsed >= 4) {
        this.sweatTimer -= dt;
        if (this.sweatTimer <= 0) {
          this.spawnSweatDrop();
          this.sweatTimer = Math.max(0.18, 0.72 - this.holdElapsed * 0.02);
        }
      }

      this.updateCatPosFromAngle(this.swingAngle);
    } else if (this.phase === 'falling') {
      this.fallVy += 1450 * dt;
      this.catX += this.fallVx * dt;
      this.catY += this.fallVy * dt;
      this.fallRot += this.fallSpin * dt;
      this.swingAngle *= Math.pow(0.15, dt);
      this.barFlex += (0 - this.barFlex) * Math.min(1, dt * 12);

      if (this.catY > this.height + this.catSize * 3) {
        this.phase = 'finished';
      }
    } else {
      this.swingAngle *= Math.pow(0.15, dt);
      this.barFlex += (0 - this.barFlex) * Math.min(1, dt * 10);
    }

    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      if (p.kind === 'confetti' || p.kind === 'sweat') {
        p.vy += 380 * dt;
      } else {
        p.vx *= Math.pow(0.25, dt);
        p.vy *= Math.pow(0.25, dt);
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vRot * dt;
    }

    // Update milestone rings
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) {
        this.rings.splice(i, 1);
        continue;
      }
      const prog = 1 - r.life / r.maxLife;
      r.radius = this.catSize * 0.7 + (r.maxRadius - this.catSize * 0.7) * (1 - Math.pow(1 - prog, 2));
    }
  }

  private render(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    // Rich sunset rooftop & terrace backdrop
    this.drawBackdrop(ctx);

    // Wooden pergola rafter at very top
    const beamGrad = ctx.createLinearGradient(0, 0, 0, 18);
    beamGrad.addColorStop(0, '#92400e');
    beamGrad.addColorStop(0.55, '#78350f');
    beamGrad.addColorStop(1, '#451a03');
    ctx.fillStyle = beamGrad;
    ctx.fillRect(0, 0, this.width, 16);
    ctx.fillStyle = 'rgba(251, 191, 36, 0.28)';
    ctx.fillRect(0, 2, this.width, 2);

    // Side mounting brackets for metallic bar
    ctx.fillStyle = '#334155';
    ctx.fillRect(8, 16, 18, 22);
    ctx.fillRect(this.width - 26, 16, 18, 22);
    ctx.fillStyle = '#64748b';
    ctx.fillRect(10, 18, 5, 18);
    ctx.fillRect(this.width - 24, 18, 5, 18);

    // Shiny metallic bar that flexes slightly under weight!
    const barY = 26;
    const flexY = barY + this.barFlex;
    ctx.save();
    ctx.lineCap = 'round';
    // Bar shadow
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(18, barY + 2);
    ctx.quadraticCurveTo(this.anchorX, flexY + 2, this.width - 18, barY + 2);
    ctx.stroke();

    // Metallic body gradient
    const metalGrad = ctx.createLinearGradient(0, barY - 5, 0, flexY + 6);
    metalGrad.addColorStop(0, '#f8fafc');
    metalGrad.addColorStop(0.35, '#94a3b8');
    metalGrad.addColorStop(0.75, '#475569');
    metalGrad.addColorStop(1, '#cbd5e1');
    ctx.strokeStyle = metalGrad;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(18, barY);
    ctx.quadraticCurveTo(this.anchorX, flexY, this.width - 18, barY);
    ctx.stroke();

    // Top specular highlight along metallic bar
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(22, barY - 2);
    ctx.quadraticCurveTo(this.anchorX, flexY - 2, this.width - 22, barY - 2);
    ctx.stroke();
    ctx.restore();

    // Anchor clamp & brass swivel ring at center flex point
    const clampedAnchorY = barY + this.barFlex * 0.5;
    ctx.fillStyle = '#fbbf24';
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.roundRect(this.anchorX - 14, clampedAnchorY - 8, 28, 14, 6);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(this.anchorX, clampedAnchorY + 6, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#fde68a';
    ctx.fill();
    ctx.strokeStyle = '#92400e';
    ctx.stroke();

    // Thick braided rope from swivel ring to paw grip knot
    const ropeStartX = this.anchorX;
    const ropeStartY = clampedAnchorY + 10;
    const ropeEndX = this.anchorX + Math.sin(this.swingAngle) * this.ropeLength;
    const ropeEndY = clampedAnchorY + Math.cos(this.swingAngle) * this.ropeLength;
    this.drawBraidedRope(ctx, ropeStartX, ropeStartY, ropeEndX, ropeEndY);

    // Knot
    ctx.fillStyle = '#92400e';
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ropeEndX, ropeEndY, 8.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(ropeEndX - 2, ropeEndY - 2, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Pulsing grab circle when ready
    if (this.phase === 'ready') {
      const pulse = Math.sin(this.animClock * 4.5);
      ctx.strokeStyle = `rgba(251, 191, 36, ${0.58 + pulse * 0.2})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(
        this.catX,
        this.catY + this.catSize * 0.35,
        this.catSize * 1.65 + pulse * 5,
        0,
        Math.PI * 2
      );
      ctx.stroke();
    }

    // Milestone golden rings & text
    for (const r of this.rings) {
      const alpha = Math.max(0, r.life / r.maxLife);
      ctx.save();
      ctx.strokeStyle = `rgba(253, 224, 71, ${alpha * 0.9})`;
      ctx.lineWidth = 4 * alpha + 1.5;
      ctx.shadowColor = '#fbbf24';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.font = '800 20px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(254, 240, 138, ${alpha})`;
      ctx.fillText(r.label, r.x, r.y - r.radius * 0.72 - 6);
      ctx.restore();
    }

    // Cat with effort tremor & glow at high seconds
    if (this.phase !== 'finished') {
      const effort = this.phase === 'holding' ? Math.min(1, this.holdElapsed / 14) : 0;
      const shakeAmp = this.phase === 'holding' && this.holdElapsed > 5 ? Math.min(3.2, (this.holdElapsed - 5) * 0.25) : 0;
      const shakeX = shakeAmp > 0 ? Math.sin(this.animClock * 48) * shakeAmp : 0;
      const shakeY = shakeAmp > 0 ? Math.cos(this.animClock * 55) * shakeAmp * 0.6 : 0;

      // Golden milestone aura at >= 10s
      if (this.phase === 'holding' && this.holdElapsed >= 10) {
        const auraPulse = 0.5 + 0.5 * Math.sin(this.animClock * 8);
        const auraGrad = ctx.createRadialGradient(
          this.catX,
          this.catY + this.catSize * 0.3,
          this.catSize * 0.4,
          this.catX,
          this.catY + this.catSize * 0.3,
          this.catSize * 2.2
        );
        auraGrad.addColorStop(0, `rgba(251, 191, 36, ${0.26 + auraPulse * 0.14})`);
        auraGrad.addColorStop(1, 'rgba(251, 191, 36, 0)');
        ctx.fillStyle = auraGrad;
        ctx.beginPath();
        ctx.arc(this.catX, this.catY + this.catSize * 0.3, this.catSize * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.save();
      ctx.translate(this.catX + shakeX, this.catY + shakeY);
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
        effort,
      });
      ctx.restore();
    }

    // Wind / motion lines while swinging
    if (this.phase === 'holding' && Math.abs(Math.cos(this.swingPhase)) > 0.5) {
      ctx.save();
      ctx.strokeStyle = 'rgba(253, 224, 71, 0.38)';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      const dir = Math.cos(this.swingPhase) > 0 ? -1 : 1;
      for (let i = -1; i <= 1; i++) {
        const ly = this.catY + i * 24;
        const lx = this.catX + dir * 48;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx + dir * 32, ly);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Render all particles (sweat drops, dust, confetti, stars)
    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      if (p.kind === 'sweat') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(0, -p.size * 1.2);
        ctx.quadraticCurveTo(p.size * 0.85, p.size * 0.3, 0, p.size);
        ctx.quadraticCurveTo(-p.size * 0.85, p.size * 0.3, 0, -p.size * 1.2);
        ctx.fill();
      } else if (p.kind === 'confetti') {
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size * 0.65, -p.size * 0.35, p.size * 1.3, p.size * 0.7);
      } else if (p.kind === 'star') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        for (let k = 0; k < 4; k++) {
          const a = (k * Math.PI) / 2;
          ctx.lineTo(Math.cos(a) * p.size * 1.4, Math.sin(a) * p.size * 1.4);
          ctx.lineTo(Math.cos(a + Math.PI / 4) * p.size * 0.45, Math.sin(a + Math.PI / 4) * p.size * 0.45);
        }
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, p.size * (0.5 + 0.5 * alpha), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Subtle grab flash
    if (this.hitFlash > 0) {
      ctx.fillStyle = `rgba(254, 240, 138, ${this.hitFlash * 0.08})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    ctx.restore();
  }

  private drawBraidedRope(
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;
    const angle = Math.atan2(dy, dx);

    ctx.save();
    ctx.translate(x1, y1);
    ctx.rotate(angle);

    // Outer rope shadow & base
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 10.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(len, 0);
    ctx.stroke();

    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 7.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(len, 0);
    ctx.stroke();

    // Braided diagonal weave highlights
    ctx.strokeStyle = '#fde68a';
    ctx.lineWidth = 2.4;
    const step = 11;
    for (let d = 4; d < len - 6; d += step) {
      ctx.beginPath();
      ctx.moveTo(d, -3);
      ctx.lineTo(d + 6, 3);
      ctx.stroke();
    }

    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = 1.8;
    for (let d = 9; d < len - 6; d += step) {
      ctx.beginPath();
      ctx.moveTo(d, 3);
      ctx.lineTo(d + 5, -3);
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawBackdrop(ctx: CanvasRenderingContext2D): void {
    // Rich sunset-to-twilight sky gradient
    const grad = ctx.createLinearGradient(0, 0, 0, this.height);
    grad.addColorStop(0, '#120d26');
    grad.addColorStop(0.32, '#2d163c');
    grad.addColorStop(0.64, '#6b2243');
    grad.addColorStop(0.86, '#b44825');
    grad.addColorStop(1, '#311309');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.height);

    // Warm sunset horizon glow
    const sunGlow = ctx.createRadialGradient(
      this.width * 0.35,
      this.height * 0.82,
      10,
      this.width * 0.35,
      this.height * 0.82,
      this.width * 0.72
    );
    sunGlow.addColorStop(0, 'rgba(251, 146, 60, 0.34)');
    sunGlow.addColorStop(0.55, 'rgba(244, 63, 94, 0.12)');
    sunGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = sunGlow;
    ctx.fillRect(0, 0, this.width, this.height);

    // Twinkling stars with occasional cross-sparkles
    for (let i = 0; i < 24; i++) {
      const sx = ((i * 89 + 23) % 100) * 0.01 * this.width;
      const sy = 36 + ((i * 47) % 100) * 0.0044 * this.height;
      const pulse = 0.5 + 0.5 * Math.sin(this.animClock * (1.8 + (i % 3) * 0.5) + i);
      ctx.globalAlpha = 0.22 + pulse * 0.58;
      ctx.fillStyle = i % 4 === 0 ? '#bae6fd' : '#fef08a';
      const r = (i % 3 === 0 ? 1.9 : 1.2);
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
      if (i % 5 === 0 && pulse > 0.65) {
        ctx.strokeStyle = 'rgba(254, 240, 138, 0.65)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx - 4, sy);
        ctx.lineTo(sx + 4, sy);
        ctx.moveTo(sx, sy - 4);
        ctx.lineTo(sx, sy + 4);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // Warm crescent moon with soft halo
    const moonX = this.width * 0.82;
    const moonY = 76;
    const moonAura = ctx.createRadialGradient(moonX, moonY, 10, moonX, moonY, 44);
    moonAura.addColorStop(0, 'rgba(253, 224, 71, 0.32)');
    moonAura.addColorStop(1, 'rgba(253, 224, 71, 0)');
    ctx.fillStyle = moonAura;
    ctx.beginPath();
    ctx.arc(moonX, moonY, 44, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(254, 240, 138, 0.94)';
    ctx.beginPath();
    ctx.arc(moonX, moonY, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#251436';
    ctx.beginPath();
    ctx.arc(moonX + 7, moonY - 4, 15, 0, Math.PI * 2);
    ctx.fill();

    // Gently swaying warm string lights draped under pergola
    const sway = Math.sin(this.animClock * 1.5) * 4;
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.38)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, 20);
    ctx.quadraticCurveTo(this.width * 0.25, 44 + sway, this.width * 0.5, 22);
    ctx.quadraticCurveTo(this.width * 0.75, 44 - sway, this.width, 20);
    ctx.stroke();

    for (let i = 1; i <= 7; i++) {
      const lx = (this.width / 8) * i;
      const t = (i % 4) / 4;
      const localSway = i < 4 ? sway : -sway;
      const ly = 21 + Math.sin(t * Math.PI) * (15 + localSway * 0.6);
      const glow = 0.72 + 0.28 * Math.sin(this.animClock * 3.2 + i * 1.1);

      const bulbAura = ctx.createRadialGradient(lx, ly, 1, lx, ly, 14);
      bulbAura.addColorStop(0, `rgba(253, 224, 71, ${0.48 * glow})`);
      bulbAura.addColorStop(1, 'rgba(251, 191, 36, 0)');
      ctx.fillStyle = bulbAura;
      ctx.beginPath();
      ctx.arc(lx, ly, 14, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(254, 249, 195, ${0.85 * glow})`;
      ctx.beginPath();
      ctx.arc(lx, ly, 3.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Distant city skyline silhouette
    const baseY = this.height;
    ctx.fillStyle = 'rgba(30, 14, 34, 0.72)';
    const farTowers = [0.05, 0.14, 0.26, 0.36, 0.49, 0.61, 0.72, 0.85, 0.93];
    for (let i = 0; i < farTowers.length; i++) {
      const tx = farTowers[i] * this.width;
      const tw = this.width * 0.1;
      const th = 95 + ((i * 37) % 52);
      ctx.fillRect(tx, baseY - th, tw, th);
    }

    // Foreground cozy rooftop silhouettes with glowing warm windows & chimneys
    const bldgs = [
      { x: 0, w: 0.22, h: 92, roof: 'gable' },
      { x: 0.2, w: 0.24, h: 68, roof: 'flat' },
      { x: 0.42, w: 0.2, h: 104, roof: 'gable' },
      { x: 0.6, w: 0.22, h: 74, roof: 'flat' },
      { x: 0.8, w: 0.22, h: 90, roof: 'gable' },
    ];
    for (let bi = 0; bi < bldgs.length; bi++) {
      const b = bldgs[bi];
      const bx = b.x * this.width;
      const bw = b.w * this.width + 4;
      const by = baseY - b.h;
      ctx.fillStyle = '#180c09';
      ctx.fillRect(bx, by, bw, b.h);
      if (b.roof === 'gable') {
        ctx.beginPath();
        ctx.moveTo(bx - 4, by);
        ctx.lineTo(bx + bw / 2, by - 22);
        ctx.lineTo(bx + bw + 4, by);
        ctx.closePath();
        ctx.fill();
      } else {
        // Chimney silhouette
        ctx.fillRect(bx + bw * 0.7, by - 12, 8, 12);
      }
      // Warm lit cozy windows
      for (let wy = by + 14; wy < baseY - 24; wy += 22) {
        for (let wx = bx + 12; wx < bx + bw - 18; wx += 22) {
          if ((wx + wy + bi) % 3 !== 0) {
            ctx.fillStyle =
              (wx + bi) % 2 === 0
                ? 'rgba(251, 191, 36, 0.44)'
                : 'rgba(253, 186, 116, 0.3)';
            ctx.beginPath();
            ctx.roundRect(wx, wy, 10, 14, 2);
            ctx.fill();
          }
        }
      }
    }

    // Cozy terrace railing & sill at bottom
    ctx.fillStyle = '#2e1005';
    ctx.fillRect(0, baseY - 14, this.width, 14);
    ctx.fillStyle = '#92400e';
    ctx.fillRect(0, baseY - 16, this.width, 3);
  }
}
