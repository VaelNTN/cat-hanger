import { AccessoryId, CatColor, EyeColorId } from '../data/cats';
import { drawCartoonCat } from './catRenderer';

export type HangerPhase = 'ready' | 'holding' | 'falling' | 'finished';

export interface HangerStageCallbacks {
  onStartHold: () => void;
  onTick?: (elapsedSeconds: number, boostsHit: number, bonusScore: number) => void;
  onTreatBoost?: (perfect: boolean, boostsHit: number, bonusScore: number) => void;
  onWindGust?: (dir: -1 | 1) => void;
  onRelease: (elapsedSeconds: number, reason: 'release' | 'stamina', boostsHit: number, bonusScore: number) => void;
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
  kind: 'confetti' | 'dust' | 'sweat' | 'star' | 'leaf';
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

interface FloatingPopup {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

interface RhythmTreat {
  progress: number; // 0 -> 1 shrinking toward sweet spot (~0.62..0.88)
  duration: number;
  resolved: boolean;
}

const CONFETTI_COLORS = ['#fbbf24', '#fb7185', '#38bdf8', '#34d399', '#c084fc', '#fde047'];
const LEAF_COLORS = ['#f472b6', '#fb923c', '#fda4af', '#fbbf24'];

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
  private paused = false;
  private resumeHoldPending = false;
  private rafId: number | null = null;
  private lastTime = 0;

  private phase: HangerPhase = 'ready';
  private animClock = 0;
  private holdStartMs = 0;
  private holdElapsed = 0;
  private stamina = 1;
  private boostsHit = 0;
  private bonusScore = 0;
  private activePointerId: number | null = null;
  private nextMilestoneSec = 5;

  // Dynamic wind gust state
  private windDir: -1 | 1 = 1;
  private windStrength = 0; // 0..1
  private windTimer = 0;
  private nextWindAt = 3.0;
  private windCalmTimer = 0;
  private leafSpawnTimer = 0;

  // Sweet-spot Rhythm Grip Boost / Treat Catch state
  private activeTreat: RhythmTreat | null = null;
  private nextTreatAt = 2.4;

  // Rope, bar flex & swing physics
  private anchorX = 0;
  private anchorY = 26;
  private barFlex = 0;
  private ropeLength = 150;
  private swingAngle = 0;
  private swingPhase = 0;

  // Cat position & fall physics
  private catX = 0;
  private catY = 0;
  private fallVx = 0;
  private fallVy = 0;
  private fallRot = 0;
  private fallSpin = 0;
  private catSize = 30;

  // Juice & particles
  private particles: SparkParticle[] = [];
  private rings: MilestoneRing[] = [];
  private popups: FloatingPopup[] = [];
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
    this.onKeyDown = this.onKeyDown.bind(this);
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

  public isPaused(): boolean {
    return this.paused;
  }

  public isFinished(): boolean {
    return this.phase === 'falling' || this.phase === 'finished';
  }

  public setPaused(next: boolean): void {
    if (this.paused === next) return;
    this.paused = next;
    if (next) {
      if (this.phase === 'holding') {
        this.releasePointerCaptureSafe();
        this.activePointerId = null;
        this.resumeHoldPending = true;
      }
    } else {
      this.lastTime = performance.now();
    }
  }

  public resetRound(): void {
    this.releasePointerCaptureSafe();
    this.paused = false;
    this.resumeHoldPending = false;
    this.phase = 'ready';
    this.holdElapsed = 0;
    this.stamina = 1;
    this.boostsHit = 0;
    this.bonusScore = 0;
    this.nextMilestoneSec = 5;
    this.windDir = 1;
    this.windStrength = 0;
    this.windTimer = 0;
    this.nextWindAt = 3.0;
    this.windCalmTimer = 0;
    this.activeTreat = null;
    this.nextTreatAt = 2.4;
    this.barFlex = 0;
    this.swingAngle = 0;
    this.swingPhase = 0;
    this.fallVx = 0;
    this.fallVy = 0;
    this.fallRot = 0;
    this.activePointerId = null;
    this.particles = [];
    this.rings = [];
    this.popups = [];
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
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('blur', this.onBlurOrHide);
    document.addEventListener('visibilitychange', this.onBlurOrHide);
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  public stop(): void {
    this.active = false;
    this.paused = false;
    this.resumeHoldPending = false;
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
    window.removeEventListener('keydown', this.onKeyDown);
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
      if (this.phase === 'holding' && !this.paused && !this.resumeHoldPending) {
        this.finishHold('release');
      }
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
    // Scale catSize and ropeLength so hanging cat stays 100% visible even on 360px height landscape screens
    this.catSize = Math.max(19, Math.min(36, Math.min(this.width * 0.088, this.height * 0.095)));
    const maxRopeLen = Math.max(42, this.height - this.anchorY - this.catSize * 2.95 - 18);
    this.ropeLength = Math.max(42, Math.min(205, Math.min(this.height * 0.36, maxRopeLen)));
    if (this.phase === 'ready' || this.phase === 'holding') {
      this.updateCatPosFromAngle(this.swingAngle);
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
    const hitR = Math.max(54, this.catSize * 2.05);
    return Math.hypot(dx, dy) <= hitR;
  }

  private tryTriggerGripBoost(): boolean {
    if (this.phase !== 'holding' || this.paused || this.resumeHoldPending) return false;
    if (!this.activeTreat || this.activeTreat.resolved) return false;

    const p = this.activeTreat.progress;
    this.activeTreat.resolved = true;
    this.activeTreat = null;

    const perfect = p >= 0.56 && p <= 0.92;
    const staminaGain = perfect ? 0.34 : 0.2;
    const secBonus = perfect ? 1.5 : 0.75;
    const pts = perfect ? 150 : 75;

    this.stamina = Math.min(1, this.stamina + staminaGain);
    this.holdElapsed += secBonus;
    this.boostsHit += 1;
    this.bonusScore += pts;
    this.windCalmTimer = 1.25;
    this.hitFlash = 0.85;

    this.spawnBurst(this.catX, this.catY, perfect ? 18 : 10, 'star');
    this.spawnBurst(this.catX, this.catY, 10, 'confetti');
    this.popups.push({
      x: Math.max(84, Math.min(this.width - 84, this.catX)),
      y: Math.max(48, this.catY - this.catSize * 1.1),
      text: perfect ? `✨ PERFECT GRIP! +${secBonus.toFixed(1)}s` : `🐟 GOOD BOOST! +${secBonus.toFixed(2)}s`,
      color: perfect ? '#fde047' : '#34d399',
      life: 1.15,
      maxLife: 1.15,
    });
    this.callbacks.onTreatBoost?.(perfect, this.boostsHit, this.bonusScore);
    this.callbacks.onTick?.(this.holdElapsed, this.boostsHit, this.bonusScore);
    return true;
  }

  private onKeyDown(ev: KeyboardEvent): void {
    if (this.paused) return;
    if (ev.code === 'Space' || ev.code === 'KeyF') {
      if (this.phase === 'holding' && !this.resumeHoldPending) {
        ev.preventDefault();
        this.tryTriggerGripBoost();
      }
    }
  }

  private onPointerDown(ev: PointerEvent): void {
    ev.preventDefault();
    if (this.paused) return;
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;

    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;

    // 2nd finger tap during hold triggers sweet-spot Grip Boost / Treat Catch
    if (this.phase === 'holding' && !this.resumeHoldPending && this.activePointerId !== null && ev.pointerId !== this.activePointerId) {
      this.tryTriggerGripBoost();
      return;
    }

    // Resume hold after Pause
    if (this.phase === 'holding' && this.resumeHoldPending && this.activePointerId === null) {
      if (!this.isPointOnCat(x, y)) {
        this.callbacks.onMissTap();
        return;
      }
      this.activePointerId = ev.pointerId;
      this.resumeHoldPending = false;
      try {
        this.canvas.setPointerCapture(ev.pointerId);
      } catch {
        // Ignore
      }
      this.hitFlash = 0.7;
      this.callbacks.onStartHold();
      return;
    }

    if (this.phase !== 'ready' || this.activePointerId !== null) return;

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
    this.stamina = 1;
    this.boostsHit = 0;
    this.bonusScore = 0;
    this.nextMilestoneSec = 5;
    this.nextWindAt = 3.0;
    this.nextTreatAt = 2.4;
    this.windStrength = 0;
    this.windTimer = 0;
    this.activeTreat = null;
    this.swingPhase = 0.25;
    this.hitFlash = 1;
    this.spawnBurst(this.catX, this.catY - this.catSize * 0.5, 10, 'dust');
    this.callbacks.onStartHold();
  }

  private onPointerUp(ev: PointerEvent): void {
    if (this.paused || this.resumeHoldPending) return;
    if (this.phase !== 'holding' || ev.pointerId !== this.activePointerId) return;
    this.finishHold('release');
  }

  private finishHold(reason: 'release' | 'stamina'): void {
    this.releasePointerCaptureSafe();
    this.activePointerId = null;
    this.resumeHoldPending = false;

    const frameFallback = Math.min(0.05, Math.max(0.01, (performance.now() - this.holdStartMs) / 1000));
    this.holdElapsed = Math.max(0.01, this.holdElapsed > 0 ? this.holdElapsed : frameFallback);
    this.phase = 'falling';

    const angularSpeed = Math.cos(this.swingPhase) * 2.5;
    this.fallVx = Math.cos(this.swingAngle) * angularSpeed * 120 + this.windDir * this.windStrength * 110;
    this.fallVy = -Math.abs(Math.sin(this.swingAngle)) * 60;
    this.fallRot = -this.swingAngle;
    this.fallSpin = (this.fallVx >= 0 ? 1 : -1) * 4.2;

    this.spawnBurst(this.catX, this.catY - this.catSize * 0.9, 14, 'dust');
    this.spawnBurst(this.catX, this.catY, 18, 'confetti');

    this.callbacks.onRelease(this.holdElapsed, reason, this.boostsHit, this.bonusScore);
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

  private spawnWindLeaf(): void {
    const startX = this.windDir > 0 ? -12 : this.width + 12;
    this.particles.push({
      x: startX,
      y: 36 + Math.random() * Math.max(60, this.height - 70),
      vx: this.windDir * (190 + Math.random() * 140),
      vy: 18 + (Math.random() - 0.5) * 45,
      size: 5 + Math.random() * 4,
      color: LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)],
      life: 2.2,
      maxLife: 2.2,
      kind: 'leaf',
      rot: Math.random() * Math.PI * 2,
      vRot: (Math.random() - 0.5) * 9,
    });
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
      maxRadius: this.catSize * 3.2,
      life: 0.9,
      maxLife: 0.9,
      label: `${sec}s!`,
    });
    this.spawnBurst(this.catX, this.catY, sec % 10 === 0 ? 22 : 12, 'confetti');
    this.spawnBurst(this.catX, this.catY - this.catSize * 0.4, 8, 'star');
  }

  private loop(now: number): void {
    if (!this.active) return;
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
    this.lastTime = now;

    if (!this.paused) {
      this.update(dt);
    }
    this.render();

    this.rafId = requestAnimationFrame(this.loop);
  }

  private update(dt: number): void {
    this.animClock += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 4);

    if (this.phase === 'ready' || this.resumeHoldPending) {
      this.swingAngle = Math.sin(this.animClock * 1.4) * 0.04;
      this.barFlex += (4 - this.barFlex) * Math.min(1, dt * 8);
      this.updateCatPosFromAngle(this.swingAngle);
    } else if (this.phase === 'holding') {
      this.holdElapsed += dt;

      // Dynamic Wind Gusts
      if (this.windCalmTimer > 0) {
        this.windCalmTimer = Math.max(0, this.windCalmTimer - dt);
        this.windStrength = Math.max(0, this.windStrength - dt * 1.4);
      } else if (this.windTimer > 0) {
        this.windTimer -= dt;
        const targetWind = this.windTimer > 0.5 ? 1 : this.windTimer / 0.5;
        this.windStrength += (targetWind - this.windStrength) * Math.min(1, dt * 5);
        this.leafSpawnTimer -= dt;
        if (this.leafSpawnTimer <= 0) {
          this.spawnWindLeaf();
          this.leafSpawnTimer = 0.09 + Math.random() * 0.07;
        }
      } else {
        this.windStrength = Math.max(0, this.windStrength - dt * 1.2);
        if (this.holdElapsed >= this.nextWindAt) {
          this.windDir = Math.random() > 0.5 ? 1 : -1;
          this.windTimer = 2.6 + Math.random() * 1.3;
          this.nextWindAt = this.holdElapsed + 4.4 + Math.random() * 2.2;
          this.callbacks.onWindGust?.(this.windDir);
        }
      }

      // Sweet-Spot Rhythm Grip Boost / Treat Catch
      if (!this.activeTreat && this.holdElapsed >= this.nextTreatAt) {
        this.activeTreat = {
          progress: 0,
          duration: 1.65,
          resolved: false,
        };
        this.nextTreatAt = this.holdElapsed + 3.4 + Math.random() * 1.4;
      }
      if (this.activeTreat && !this.activeTreat.resolved) {
        this.activeTreat.progress += dt / this.activeTreat.duration;
        if (this.activeTreat.progress >= 1) {
          this.activeTreat = null;
        }
      }

      // Grip stamina drains steadily (slightly faster during wind gusts)
      const drainRate = 0.042 + this.windStrength * 0.022 + Math.min(0.028, this.holdElapsed * 0.001);
      this.stamina = Math.max(0, this.stamina - drainRate * dt);
      this.callbacks.onTick?.(this.holdElapsed, this.boostsHit, this.bonusScore);

      if (this.stamina <= 0) {
        this.finishHold('stamina');
        return;
      }

      while (this.holdElapsed >= this.nextMilestoneSec) {
        this.triggerMilestone(this.nextMilestoneSec);
        this.nextMilestoneSec += 5;
      }

      const speed = 2.8 + Math.min(2.4, this.holdElapsed * 0.07);
      const maxAngle = Math.min(0.75, 0.36 + this.holdElapsed * 0.02);
      this.swingPhase += dt * speed;
      const windBias = this.windDir * this.windStrength * 0.36;
      this.swingAngle = Math.max(-0.92, Math.min(0.92, Math.sin(this.swingPhase) * maxAngle + windBias));

      const targetFlex = 6 + Math.abs(Math.cos(this.swingAngle)) * 4 + Math.min(4, this.holdElapsed * 0.14);
      this.barFlex += (targetFlex - this.barFlex) * Math.min(1, dt * 10);

      if (this.holdElapsed >= 3.5 || this.stamina < 0.42) {
        this.sweatTimer -= dt;
        if (this.sweatTimer <= 0) {
          this.spawnSweatDrop();
          this.sweatTimer = Math.max(0.18, 0.65 - (1 - this.stamina) * 0.4);
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

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      if (p.kind === 'confetti' || p.kind === 'sweat') {
        p.vy += 380 * dt;
      } else if (p.kind === 'leaf') {
        p.vy += Math.sin(this.animClock * 7 + p.rot) * 90 * dt;
      } else {
        p.vx *= Math.pow(0.25, dt);
        p.vy *= Math.pow(0.25, dt);
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vRot * dt;
    }

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

    for (let i = this.popups.length - 1; i >= 0; i--) {
      const pop = this.popups[i];
      pop.life -= dt;
      pop.y -= 36 * dt;
      if (pop.life <= 0) this.popups.splice(i, 1);
    }
  }

  private render(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    this.drawBackdrop(ctx);

    // Wind streaks across sky during gusts
    if (this.windStrength > 0.12) {
      ctx.save();
      ctx.strokeStyle = `rgba(253, 224, 71, ${this.windStrength * 0.25})`;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      for (let i = 0; i < 6; i++) {
        const y = 46 + ((i * 59) % Math.max(80, this.height - 70));
        const shift = ((this.animClock * 420 * this.windDir + i * 130) % (this.width + 120) + (this.width + 120)) % (this.width + 120) - 60;
        ctx.beginPath();
        ctx.moveTo(shift, y);
        ctx.lineTo(shift + this.windDir * 52 * this.windStrength, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Wooden pergola rafter at top
    const beamGrad = ctx.createLinearGradient(0, 0, 0, 16);
    beamGrad.addColorStop(0, '#92400e');
    beamGrad.addColorStop(0.55, '#78350f');
    beamGrad.addColorStop(1, '#451a03');
    ctx.fillStyle = beamGrad;
    ctx.fillRect(0, 0, this.width, 14);
    ctx.fillStyle = 'rgba(251, 191, 36, 0.28)';
    ctx.fillRect(0, 2, this.width, 2);

    ctx.fillStyle = '#334155';
    ctx.fillRect(8, 14, 16, 20);
    ctx.fillRect(this.width - 24, 14, 16, 20);
    ctx.fillStyle = '#64748b';
    ctx.fillRect(10, 16, 4, 16);
    ctx.fillRect(this.width - 22, 16, 4, 16);

    const barY = this.anchorY;
    const flexY = barY + this.barFlex;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(18, barY + 2);
    ctx.quadraticCurveTo(this.anchorX, flexY + 2, this.width - 18, barY + 2);
    ctx.stroke();

    const metalGrad = ctx.createLinearGradient(0, barY - 5, 0, flexY + 6);
    metalGrad.addColorStop(0, '#f8fafc');
    metalGrad.addColorStop(0.35, '#94a3b8');
    metalGrad.addColorStop(0.75, '#475569');
    metalGrad.addColorStop(1, '#cbd5e1');
    ctx.strokeStyle = metalGrad;
    ctx.lineWidth = 7.5;
    ctx.beginPath();
    ctx.moveTo(18, barY);
    ctx.quadraticCurveTo(this.anchorX, flexY, this.width - 18, barY);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(22, barY - 2);
    ctx.quadraticCurveTo(this.anchorX, flexY - 2, this.width - 22, barY - 2);
    ctx.stroke();
    ctx.restore();

    const clampedAnchorY = barY + this.barFlex * 0.5;
    ctx.fillStyle = '#fbbf24';
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(this.anchorX - 13, clampedAnchorY - 7, 26, 13, 6);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(this.anchorX, clampedAnchorY + 6, 7.5, 0, Math.PI * 2);
    ctx.fillStyle = '#fde68a';
    ctx.fill();
    ctx.strokeStyle = '#92400e';
    ctx.stroke();

    const ropeStartX = this.anchorX;
    const ropeStartY = clampedAnchorY + 9;
    const ropeEndX = this.anchorX + Math.sin(this.swingAngle) * this.ropeLength;
    const ropeEndY = clampedAnchorY + Math.cos(this.swingAngle) * this.ropeLength;
    this.drawBraidedRope(ctx, ropeStartX, ropeStartY, ropeEndX, ropeEndY);

    ctx.fillStyle = '#92400e';
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ropeEndX, ropeEndY, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(ropeEndX - 2, ropeEndY - 2, 2.3, 0, Math.PI * 2);
    ctx.fill();

    // Grip Stamina & Wind Indicator pills (positioned cleanly below pergola on left & right!)
    if (this.phase === 'holding') {
      this.drawStaminaMeter(ctx);
      if (this.windStrength > 0.15) {
        this.drawWindArrowPill(ctx);
      }
    }

    // Pulsing grab circle when ready or resuming from pause
    if (this.phase === 'ready' || this.resumeHoldPending) {
      const pulse = Math.sin(this.animClock * 4.5);
      ctx.strokeStyle = `rgba(251, 191, 36, ${0.6 + pulse * 0.22})`;
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

    // Sweet-Spot Rhythm Grip Boost Ring around cat
    if (this.phase === 'holding' && !this.resumeHoldPending && this.activeTreat && !this.activeTreat.resolved) {
      const p = this.activeTreat.progress;
      const inSweet = p >= 0.56 && p <= 0.92;
      const targetR = this.catSize * 1.5;
      const outerR = this.catSize * (3.1 - p * 1.85);
      const cy = this.catY + this.catSize * 0.25;

      ctx.save();
      // Fixed sweet-spot target circle
      ctx.strokeStyle = inSweet ? 'rgba(52, 211, 153, 0.95)' : 'rgba(251, 191, 36, 0.45)';
      ctx.lineWidth = inSweet ? 4.5 : 2.5;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.arc(this.catX, cy, targetR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Shrinking rhythm ring
      ctx.strokeStyle = inSweet ? '#fde047' : '#f472b6';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(this.catX, cy, Math.max(targetR * 0.72, outerR), 0, Math.PI * 2);
      ctx.stroke();

      // Prompt badge at bottom center of canvas
      const prompt = inSweet ? '✨ TAP 2ND FINGER / [SPACE] NOW!' : '🐟 Rhythm Boost incoming...';
      ctx.font = '900 12px system-ui, -apple-system, sans-serif';
      const tw = ctx.measureText(prompt).width;
      const bw = tw + 22;
      const bx = this.width * 0.5 - bw / 2;
      const by = this.height - 38;
      ctx.fillStyle = inSweet ? 'rgba(16, 185, 129, 0.92)' : 'rgba(24, 15, 34, 0.85)';
      ctx.strokeStyle = inSweet ? '#fde047' : '#f472b6';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, 25, 12);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = inSweet ? '#042f2e' : '#fce7f3';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(prompt, this.width * 0.5, by + 12.5);
      ctx.restore();
    }

    // Milestone rings
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

    // Cat
    if (this.phase !== 'finished') {
      const effort = this.phase === 'holding' ? Math.max(Math.min(1, this.holdElapsed / 14), 1 - this.stamina) : 0;
      const shakeAmp =
        this.phase === 'holding' && !this.resumeHoldPending && (this.holdElapsed > 5 || this.stamina < 0.35)
          ? Math.min(3.2, Math.max((this.holdElapsed - 5) * 0.22, (0.35 - this.stamina) * 8))
          : 0;
      const shakeX = shakeAmp > 0 ? Math.sin(this.animClock * 48) * shakeAmp : 0;
      const shakeY = shakeAmp > 0 ? Math.cos(this.animClock * 55) * shakeAmp * 0.6 : 0;

      if (this.phase === 'holding' && this.holdElapsed >= 10) {
        const auraPulse = 0.5 + 0.5 * Math.sin(this.animClock * 8);
        const auraGrad = ctx.createRadialGradient(
          this.catX,
          this.catY + this.catSize * 0.3,
          this.catSize * 0.4,
          this.catX,
          this.catY + this.catSize * 0.3,
          this.catSize * 2.1
        );
        auraGrad.addColorStop(0, `rgba(251, 191, 36, ${0.26 + auraPulse * 0.14})`);
        auraGrad.addColorStop(1, 'rgba(251, 191, 36, 0)');
        ctx.fillStyle = auraGrad;
        ctx.beginPath();
        ctx.arc(this.catX, this.catY + this.catSize * 0.3, this.catSize * 2.1, 0, Math.PI * 2);
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

    if (this.phase === 'holding' && Math.abs(Math.cos(this.swingPhase)) > 0.5) {
      ctx.save();
      ctx.strokeStyle = 'rgba(253, 224, 71, 0.38)';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      const dir = Math.cos(this.swingPhase) > 0 ? -1 : 1;
      for (let i = -1; i <= 1; i++) {
        const ly = this.catY + i * 20;
        const lx = this.catX + dir * 44;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx + dir * 28, ly);
        ctx.stroke();
      }
      ctx.restore();
    }

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
      } else if (p.kind === 'leaf') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size * 1.15, p.size * 0.5, 0, 0, Math.PI * 2);
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

    for (const pop of this.popups) {
      const alpha = Math.max(0, pop.life / pop.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = '900 16px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(20, 12, 28, 0.9)';
      ctx.strokeText(pop.text, pop.x, pop.y);
      ctx.fillStyle = pop.color;
      ctx.fillText(pop.text, pop.x, pop.y);
      ctx.restore();
    }

    if (this.hitFlash > 0) {
      ctx.fillStyle = `rgba(254, 240, 138, ${this.hitFlash * 0.08})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    ctx.restore();
  }

  private drawStaminaMeter(ctx: CanvasRenderingContext2D): void {
    const barW = 104;
    const barH = 11;
    const bx = 14;
    const by = this.anchorY + 18;
    const low = this.stamina < 0.28;
    const pulse = low ? 0.6 + 0.4 * Math.sin(this.animClock * 14) : 1;

    ctx.save();
    ctx.fillStyle = 'rgba(24, 15, 34, 0.82)';
    ctx.strokeStyle = low ? `rgba(248, 113, 113, ${pulse})` : 'rgba(251, 191, 36, 0.32)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(bx - 4, by - 4, barW + 44, barH + 8, 10);
    ctx.fill();
    ctx.stroke();

    ctx.font = '800 10px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = low ? '#fca5a5' : '#fde68a';
    ctx.textBaseline = 'middle';
    ctx.fillText('GRIP', bx + 2, by + barH / 2 + 0.5);

    const trackX = bx + 32;
    ctx.fillStyle = 'rgba(148, 163, 184, 0.26)';
    ctx.beginPath();
    ctx.roundRect(trackX, by, barW, barH, 6);
    ctx.fill();

    const fillW = Math.max(0, barW * this.stamina);
    if (fillW > 0) {
      ctx.fillStyle = this.stamina > 0.55 ? '#34d399' : this.stamina > 0.28 ? '#fbbf24' : '#f43f5e';
      ctx.beginPath();
      ctx.roundRect(trackX, by, fillW, barH, 6);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawWindArrowPill(ctx: CanvasRenderingContext2D): void {
    const label = this.windDir > 0 ? '💨 WIND ━━▶' : '◀━━ WIND 💨';
    ctx.save();
    ctx.font = '800 11.5px system-ui, -apple-system, sans-serif';
    const tw = ctx.measureText(label).width;
    const bw = tw + 18;
    const bx = this.width - bw - 14;
    const by = this.anchorY + 14;
    ctx.globalAlpha = Math.min(1, 0.35 + this.windStrength * 0.65);
    ctx.fillStyle = 'rgba(24, 15, 34, 0.85)';
    ctx.strokeStyle = '#f472b6';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, 23, 11);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fbcfe8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, bx + bw / 2, by + 11.5);
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

    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(len, 0);
    ctx.stroke();

    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(len, 0);
    ctx.stroke();

    ctx.strokeStyle = '#fde68a';
    ctx.lineWidth = 2.2;
    const step = 11;
    for (let d = 4; d < len - 6; d += step) {
      ctx.beginPath();
      ctx.moveTo(d, -3);
      ctx.lineTo(d + 6, 3);
      ctx.stroke();
    }

    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = 1.6;
    for (let d = 9; d < len - 6; d += step) {
      ctx.beginPath();
      ctx.moveTo(d, 3);
      ctx.lineTo(d + 5, -3);
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawBackdrop(ctx: CanvasRenderingContext2D): void {
    const grad = ctx.createLinearGradient(0, 0, 0, this.height);
    grad.addColorStop(0, '#120d26');
    grad.addColorStop(0.32, '#2d163c');
    grad.addColorStop(0.64, '#6b2243');
    grad.addColorStop(0.86, '#b44825');
    grad.addColorStop(1, '#311309');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.height);

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

    for (let i = 0; i < 24; i++) {
      const sx = ((i * 89 + 23) % 100) * 0.01 * this.width;
      const sy = 36 + ((i * 47) % 100) * 0.0044 * this.height;
      const pulse = 0.5 + 0.5 * Math.sin(this.animClock * (1.8 + (i % 3) * 0.5) + i);
      ctx.globalAlpha = 0.22 + pulse * 0.58;
      ctx.fillStyle = i % 4 === 0 ? '#bae6fd' : '#fef08a';
      const r = i % 3 === 0 ? 1.9 : 1.2;
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

    const moonX = this.width * 0.84;
    const moonY = Math.min(76, this.height * 0.24);
    const moonAura = ctx.createRadialGradient(moonX, moonY, 8, moonX, moonY, 40);
    moonAura.addColorStop(0, 'rgba(253, 224, 71, 0.32)');
    moonAura.addColorStop(1, 'rgba(253, 224, 71, 0)');
    ctx.fillStyle = moonAura;
    ctx.beginPath();
    ctx.arc(moonX, moonY, 40, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(254, 240, 138, 0.94)';
    ctx.beginPath();
    ctx.arc(moonX, moonY, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#251436';
    ctx.beginPath();
    ctx.arc(moonX + 6, moonY - 3, 13, 0, Math.PI * 2);
    ctx.fill();

    const sway = Math.sin(this.animClock * 1.5) * 4 + this.windDir * this.windStrength * 8;
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.38)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, 18);
    ctx.quadraticCurveTo(this.width * 0.25, 38 + sway, this.width * 0.5, 20);
    ctx.quadraticCurveTo(this.width * 0.75, 38 - sway, this.width, 18);
    ctx.stroke();

    for (let i = 1; i <= 7; i++) {
      const lx = (this.width / 8) * i;
      const t = (i % 4) / 4;
      const localSway = i < 4 ? sway : -sway;
      const ly = 19 + Math.sin(t * Math.PI) * (13 + localSway * 0.5);
      const glow = 0.72 + 0.28 * Math.sin(this.animClock * 3.2 + i * 1.1);

      const bulbAura = ctx.createRadialGradient(lx, ly, 1, lx, ly, 12);
      bulbAura.addColorStop(0, `rgba(253, 224, 71, ${0.48 * glow})`);
      bulbAura.addColorStop(1, 'rgba(251, 191, 36, 0)');
      ctx.fillStyle = bulbAura;
      ctx.beginPath();
      ctx.arc(lx, ly, 12, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(254, 249, 195, ${0.85 * glow})`;
      ctx.beginPath();
      ctx.arc(lx, ly, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Scale skyline height down on short landscape viewports so cat has open sky
    const skyScale = Math.min(1, this.height / 440);
    const baseY = this.height;
    ctx.fillStyle = 'rgba(30, 14, 34, 0.72)';
    const farTowers = [0.05, 0.14, 0.26, 0.36, 0.49, 0.61, 0.72, 0.85, 0.93];
    for (let i = 0; i < farTowers.length; i++) {
      const tx = farTowers[i] * this.width;
      const tw = this.width * 0.1;
      const th = (95 + ((i * 37) % 52)) * skyScale;
      ctx.fillRect(tx, baseY - th, tw, th);
    }

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
      const bh = b.h * skyScale;
      const by = baseY - bh;
      ctx.fillStyle = '#180c09';
      ctx.fillRect(bx, by, bw, bh);
      if (b.roof === 'gable') {
        ctx.beginPath();
        ctx.moveTo(bx - 4, by);
        ctx.lineTo(bx + bw / 2, by - 20 * skyScale);
        ctx.lineTo(bx + bw + 4, by);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillRect(bx + bw * 0.7, by - 11 * skyScale, 8, 11 * skyScale);
      }
      for (let wy = by + 12; wy < baseY - 20; wy += 20) {
        for (let wx = bx + 12; wx < bx + bw - 18; wx += 22) {
          if ((wx + wy + bi) % 3 !== 0) {
            ctx.fillStyle =
              (wx + bi) % 2 === 0
                ? 'rgba(251, 191, 36, 0.44)'
                : 'rgba(253, 186, 116, 0.3)';
            ctx.beginPath();
            ctx.roundRect(wx, wy, 9, 12, 2);
            ctx.fill();
          }
        }
      }
    }

    ctx.fillStyle = '#2e1005';
    ctx.fillRect(0, baseY - 12, this.width, 12);
    ctx.fillStyle = '#92400e';
    ctx.fillRect(0, baseY - 14, this.width, 3);
  }
}
