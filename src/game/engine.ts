import {
  GRID_SIZE,
  CELL_SIZE,
  CANVAS_SIZE,
  BASE_TICK_MS,
  MIN_TICK_MS,
  SPEED_DECREASE_PER_FOOD,
  COLORS,
  Direction,
  Point,
  DIR_VECTORS,
  OPPOSITE,
} from './constants';
import { ParticleSystem } from './particles';
import { ScreenShake } from './screenshake';
import { playEat, playDeath, playHighScore, initAudio } from './audio';

export type GameState = 'start' | 'playing' | 'paused' | 'gameover';

export interface GameCallbacks {
  onScoreChange: (score: number) => void;
  onStateChange: (state: GameState) => void;
  onHighScore: () => void;
}

export class SnakeGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private snake: Point[] = [];
  private food: Point = { x: 0, y: 0 };
  private direction: Direction = 'RIGHT';
  private directionQueue: Direction[] = [];
  private score = 0;
  private state: GameState = 'start';
  private tickMs = BASE_TICK_MS;
  private lastTick = 0;
  private particles: ParticleSystem;
  private shake: ScreenShake;
  private callbacks: GameCallbacks;
  private foodBob = 0;
  private foodPulse = 0;
  private moveProgress = 0;
  private prevSnake: Point[] = [];
  private eatAnimation = 0;
  private gridFlash = 0;
  private bestScore = 0;
  private newHighScore = false;
  private comboCount = 0;
  private comboTimer = 0;
  private scorePopups: { x: number; y: number; text: string; life: number; maxLife: number }[] = [];
  private frameCount = 0;
  private demoSnake: Point[] = [];
  private demoDir: Direction = 'RIGHT';
  private demoFood: Point = { x: 15, y: 10 };
  private demoLastTick = 0;
  private ambientParticleTimer = 0;

  constructor(canvas: HTMLCanvasElement, callbacks: GameCallbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.callbacks = callbacks;
    this.particles = new ParticleSystem();
    this.shake = new ScreenShake();
    this.canvas.width = CANVAS_SIZE;
    this.canvas.height = CANVAS_SIZE;
    this.initDemo();
  }

  private initDemo() {
    this.demoSnake = [];
    for (let i = 0; i < 6; i++) {
      this.demoSnake.push({ x: 10 - i, y: 10 });
    }
    this.demoDir = 'RIGHT';
    this.demoFood = { x: 15, y: 10 };
    this.demoLastTick = 0;
  }

  private tickDemo(now: number) {
    if (now - this.demoLastTick < 150) return;
    this.demoLastTick = now;

    const head = this.demoSnake[0];
    const fx = this.demoFood.x;
    const fy = this.demoFood.y;

    // Simple AI: move toward food, avoid self
    const dirs: Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
    let bestDir = this.demoDir;
    let bestDist = Infinity;

    for (const d of dirs) {
      if (d === OPPOSITE[this.demoDir]) continue;
      const v = DIR_VECTORS[d];
      const nx = (head.x + v.x + GRID_SIZE) % GRID_SIZE;
      const ny = (head.y + v.y + GRID_SIZE) % GRID_SIZE;
      if (this.demoSnake.some((s) => s.x === nx && s.y === ny)) continue;
      const dist = Math.abs(nx - fx) + Math.abs(ny - fy);
      if (dist < bestDist) {
        bestDist = dist;
        bestDir = d;
      }
    }
    this.demoDir = bestDir;

    const vec = DIR_VECTORS[this.demoDir];
    const newHead = {
      x: (head.x + vec.x + GRID_SIZE) % GRID_SIZE,
      y: (head.y + vec.y + GRID_SIZE) % GRID_SIZE,
    };
    this.demoSnake.unshift(newHead);

    if (newHead.x === this.demoFood.x && newHead.y === this.demoFood.y) {
      // Eat - spawn new food
      const px = this.demoFood.x * CELL_SIZE + CELL_SIZE / 2;
      const py = this.demoFood.y * CELL_SIZE + CELL_SIZE / 2;
      this.particles.burst(px, py, 12, COLORS.particleFood);
      this.demoFood = {
        x: Math.floor(Math.random() * GRID_SIZE),
        y: Math.floor(Math.random() * GRID_SIZE),
      };
      // Cap demo snake length
      if (this.demoSnake.length > 15) {
        this.demoSnake.pop();
      }
    } else {
      this.demoSnake.pop();
    }

    // Trail
    const hpx = newHead.x * CELL_SIZE + CELL_SIZE / 2;
    const hpy = newHead.y * CELL_SIZE + CELL_SIZE / 2;
    this.particles.trail(hpx, hpy, COLORS.particleSnake);
  }

  setBestScore(score: number) {
    this.bestScore = score;
  }

  getState() {
    return this.state;
  }

  getScore() {
    return this.score;
  }

  start() {
    initAudio();
    this.reset();
    this.state = 'playing';
    this.callbacks.onStateChange('playing');
    this.lastTick = performance.now();
  }

  private reset() {
    const mid = Math.floor(GRID_SIZE / 2);
    this.snake = [
      { x: mid, y: mid },
      { x: mid - 1, y: mid },
      { x: mid - 2, y: mid },
    ];
    this.prevSnake = this.snake.map((p) => ({ ...p }));
    this.direction = 'RIGHT';
    this.directionQueue = [];
    this.score = 0;
    this.tickMs = BASE_TICK_MS;
    this.eatAnimation = 0;
    this.gridFlash = 0;
    this.newHighScore = false;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.scorePopups = [];
    this.particles.clear();
    this.callbacks.onScoreChange(0);
    this.spawnFood();
  }

  pause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.callbacks.onStateChange('paused');
    }
  }

  resume() {
    if (this.state === 'paused') {
      this.state = 'playing';
      this.callbacks.onStateChange('playing');
      this.lastTick = performance.now();
    }
  }

  togglePause() {
    if (this.state === 'playing') this.pause();
    else if (this.state === 'paused') this.resume();
  }

  setDirection(dir: Direction) {
    // Queue up to 2 direction changes for responsive turning
    const lastQueued = this.directionQueue.length > 0
      ? this.directionQueue[this.directionQueue.length - 1]
      : this.direction;

    if (dir !== lastQueued && dir !== OPPOSITE[lastQueued]) {
      if (this.directionQueue.length < 2) {
        this.directionQueue.push(dir);
      }
    }
  }

  private spawnFood() {
    const occupied = new Set(this.snake.map((p) => `${p.x},${p.y}`));
    const free: Point[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let y = 0; y < GRID_SIZE; y++) {
        if (!occupied.has(`${x},${y}`)) {
          free.push({ x, y });
        }
      }
    }
    if (free.length === 0) return;
    this.food = free[Math.floor(Math.random() * free.length)];
    this.foodPulse = 1;
  }

  private tick() {
    // Process direction queue
    if (this.directionQueue.length > 0) {
      const next = this.directionQueue.shift()!;
      if (next !== OPPOSITE[this.direction]) {
        this.direction = next;
      }
    }

    this.prevSnake = this.snake.map((p) => ({ ...p }));

    const head = this.snake[0];
    const vec = DIR_VECTORS[this.direction];
    const newHead: Point = {
      x: (head.x + vec.x + GRID_SIZE) % GRID_SIZE,
      y: (head.y + vec.y + GRID_SIZE) % GRID_SIZE,
    };

    // Check self collision
    if (this.snake.some((p) => p.x === newHead.x && p.y === newHead.y)) {
      this.gameOver();
      return;
    }

    this.snake.unshift(newHead);

    // Check food
    if (newHead.x === this.food.x && newHead.y === this.food.y) {
      this.eatFood();
    } else {
      this.snake.pop();
      this.comboTimer--;
      if (this.comboTimer <= 0) {
        this.comboCount = 0;
      }
    }

    this.moveProgress = 0;

    // Trail particles on head
    const headPx = newHead.x * CELL_SIZE + CELL_SIZE / 2;
    const headPy = newHead.y * CELL_SIZE + CELL_SIZE / 2;
    this.particles.trail(headPx, headPy, COLORS.particleSnake);
  }

  private eatFood() {
    this.comboCount++;
    this.comboTimer = 8; // ticks to keep combo
    const points = 10 * this.comboCount;
    this.score += points;
    this.callbacks.onScoreChange(this.score);

    if (this.score > this.bestScore && !this.newHighScore) {
      this.newHighScore = true;
      this.callbacks.onHighScore();
      playHighScore();
    }

    playEat(this.comboCount);

    // Speed up
    this.tickMs = Math.max(MIN_TICK_MS, this.tickMs - SPEED_DECREASE_PER_FOOD);

    // Juice!
    const fx = this.food.x * CELL_SIZE + CELL_SIZE / 2;
    const fy = this.food.y * CELL_SIZE + CELL_SIZE / 2;
    this.particles.burst(fx, fy, 20, COLORS.particleFood);
    this.shake.shake(this.comboCount > 1 ? 5 : 3, 8);
    this.eatAnimation = 1;
    this.gridFlash = 1;

    // Score popup
    this.scorePopups.push({
      x: fx,
      y: fy,
      text: this.comboCount > 1 ? `+${points} x${this.comboCount}` : `+${points}`,
      life: 50,
      maxLife: 50,
    });

    this.spawnFood();
  }

  private gameOver() {
    this.state = 'gameover';
    this.callbacks.onStateChange('gameover');
    playDeath();

    // Death particles
    for (const seg of this.snake) {
      const px = seg.x * CELL_SIZE + CELL_SIZE / 2;
      const py = seg.y * CELL_SIZE + CELL_SIZE / 2;
      this.particles.emit(px, py, 4, COLORS.particleSnake, {
        speed: 3,
        size: 3,
        life: 50,
      });
    }
    this.shake.shake(8, 15);
    this.initDemo();
  }

  update(now: number) {
    this.frameCount++;
    this.foodBob = Math.sin(now * 0.004) * 2;
    this.foodPulse = Math.max(0, this.foodPulse - 0.03);
    this.eatAnimation = Math.max(0, this.eatAnimation - 0.05);
    this.gridFlash = Math.max(0, this.gridFlash - 0.04);

    // Update popups
    for (let i = this.scorePopups.length - 1; i >= 0; i--) {
      this.scorePopups[i].life--;
      this.scorePopups[i].y -= 0.8;
      if (this.scorePopups[i].life <= 0) {
        this.scorePopups.splice(i, 1);
      }
    }

    this.particles.update();
    this.shake.update();

    if (this.state === 'playing') {
      const elapsed = now - this.lastTick;
      this.moveProgress = Math.min(1, elapsed / this.tickMs);

      if (elapsed >= this.tickMs) {
        this.tick();
        this.lastTick = now;
      }
    }

    // Demo mode: run idle animation on start/gameover
    if (this.state === 'start' || this.state === 'gameover') {
      this.tickDemo(now);

      // Ambient floating particles
      this.ambientParticleTimer++;
      if (this.ambientParticleTimer % 8 === 0) {
        this.particles.emit(
          Math.random() * CANVAS_SIZE,
          Math.random() * CANVAS_SIZE,
          1,
          ['#00ff8822', '#00cc6a22'],
          { speed: 0.3, size: 2, life: 60, gravity: -0.01 }
        );
      }
    }
  }

  draw() {
    const ctx = this.ctx;
    const w = CANVAS_SIZE;
    const h = CANVAS_SIZE;

    ctx.save();

    // Screen shake
    if (this.shake.isShaking) {
      ctx.translate(this.shake.offsetX, this.shake.offsetY);
    }

    // Background
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(-10, -10, w + 20, h + 20);

    // Grid
    this.drawGrid(ctx, w, h);

    if (this.state === 'start' || this.state === 'gameover') {
      // Draw demo snake and food (dimmed)
      this.drawDemoFood(ctx);
      this.drawDemoSnake(ctx);
    } else {
      // Food
      this.drawFood(ctx);
      // Snake
      this.drawSnake(ctx);
    }

    // Particles (on top)
    this.particles.draw(ctx);

    // Score popups
    this.drawScorePopups(ctx);

    // Vignette overlay
    this.drawVignette(ctx, w, h);

    ctx.restore();
  }

  private drawDemoFood(ctx: CanvasRenderingContext2D) {
    const x = this.demoFood.x * CELL_SIZE + CELL_SIZE / 2;
    const y = this.demoFood.y * CELL_SIZE + CELL_SIZE / 2 + this.foodBob;
    const baseR = CELL_SIZE * 0.35;

    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.shadowColor = COLORS.food;
    ctx.shadowBlur = 10;
    ctx.fillStyle = COLORS.food;
    ctx.beginPath();
    ctx.arc(x, y, baseR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawDemoSnake(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.globalAlpha = 0.25;
    for (let i = this.demoSnake.length - 1; i >= 0; i--) {
      const seg = this.demoSnake[i];
      const drawX = seg.x * CELL_SIZE;
      const drawY = seg.y * CELL_SIZE;
      const t = i / Math.max(1, this.demoSnake.length - 1);
      const pad = 1 + t * 2;
      const radius = 3;

      ctx.fillStyle = i === 0 ? COLORS.snakeHead : COLORS.snakeBody;
      this.roundRect(ctx, drawX + pad, drawY + pad, CELL_SIZE - pad * 2, CELL_SIZE - pad * 2, radius);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
    // Subtle grid
    ctx.strokeStyle = this.gridFlash > 0
      ? `rgba(0, 255, 136, ${0.05 + this.gridFlash * 0.1})`
      : COLORS.gridLine;
    ctx.lineWidth = 0.5;

    for (let x = 0; x <= GRID_SIZE; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELL_SIZE, 0);
      ctx.lineTo(x * CELL_SIZE, h);
      ctx.stroke();
    }
    for (let y = 0; y <= GRID_SIZE; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL_SIZE);
      ctx.lineTo(w, y * CELL_SIZE);
      ctx.stroke();
    }

    // Border glow
    ctx.strokeStyle = COLORS.accentDim;
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, w, h);
  }

  private drawFood(ctx: CanvasRenderingContext2D) {
    const x = this.food.x * CELL_SIZE + CELL_SIZE / 2;
    const y = this.food.y * CELL_SIZE + CELL_SIZE / 2 + this.foodBob;
    const baseR = CELL_SIZE * 0.38;
    const pulseR = baseR + this.foodPulse * 8;

    // Glow
    ctx.save();
    ctx.shadowColor = COLORS.food;
    ctx.shadowBlur = 15 + Math.sin(this.frameCount * 0.1) * 5;

    // Pulse ring
    if (this.foodPulse > 0) {
      ctx.globalAlpha = this.foodPulse * 0.5;
      ctx.strokeStyle = COLORS.food;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, pulseR, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;

    // Outer
    ctx.fillStyle = COLORS.food;
    ctx.beginPath();
    ctx.arc(x, y, baseR, 0, Math.PI * 2);
    ctx.fill();

    // Inner highlight
    ctx.fillStyle = COLORS.foodInner;
    ctx.beginPath();
    ctx.arc(x - 2, y - 2, baseR * 0.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private drawSnake(ctx: CanvasRenderingContext2D) {
    const snake = this.snake;
    const len = snake.length;

    for (let i = len - 1; i >= 0; i--) {
      const seg = snake[i];
      let drawX = seg.x * CELL_SIZE;
      let drawY = seg.y * CELL_SIZE;

      // Smooth interpolation for head
      if (i === 0 && this.state === 'playing' && this.prevSnake.length > 0) {
        const prev = this.prevSnake[0];
        let dx = seg.x - prev.x;
        let dy = seg.y - prev.y;

        // Handle wrap-around
        if (dx > GRID_SIZE / 2) dx -= GRID_SIZE;
        if (dx < -GRID_SIZE / 2) dx += GRID_SIZE;
        if (dy > GRID_SIZE / 2) dy -= GRID_SIZE;
        if (dy < -GRID_SIZE / 2) dy += GRID_SIZE;

        const interpX = prev.x * CELL_SIZE + dx * CELL_SIZE * this.moveProgress;
        const interpY = prev.y * CELL_SIZE + dy * CELL_SIZE * this.moveProgress;
        drawX = interpX;
        drawY = interpY;
      }

      const t = i / Math.max(1, len - 1); // 0 = head, 1 = tail
      const pad = 1 + t * 2;
      const radius = 4 - t * 2;

      ctx.save();

      if (i === 0) {
        // Head
        const scale = 1 + this.eatAnimation * 0.2;
        ctx.fillStyle = COLORS.snakeHead;
        ctx.shadowColor = COLORS.snakeHead;
        ctx.shadowBlur = 10;

        const cx = drawX + CELL_SIZE / 2;
        const cy = drawY + CELL_SIZE / 2;
        const halfW = (CELL_SIZE / 2 - pad) * scale;
        const halfH = (CELL_SIZE / 2 - pad) * scale;

        this.roundRect(ctx, cx - halfW, cy - halfH, halfW * 2, halfH * 2, radius + 2);
        ctx.fill();

        // Eyes
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#003322';
        const eyeSize = 2.5;
        const vec = DIR_VECTORS[this.direction];
        const eyeOffX = vec.y * 4;
        const eyeOffY = vec.x * 4;
        const eyeFwdX = vec.x * 2;
        const eyeFwdY = vec.y * 2;
        ctx.beginPath();
        ctx.arc(cx + eyeOffX + eyeFwdX, cy + eyeOffY + eyeFwdY, eyeSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx - eyeOffX + eyeFwdX, cy - eyeOffY + eyeFwdY, eyeSize, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Body
        const colorMix = i % 2 === 0 ? COLORS.snakeBody : COLORS.snakeBodyAlt;
        ctx.fillStyle = colorMix;
        if (i === len - 1) {
          ctx.fillStyle = COLORS.snakeTail;
          ctx.globalAlpha = 0.8;
        }
        this.roundRect(ctx, drawX + pad, drawY + pad, CELL_SIZE - pad * 2, CELL_SIZE - pad * 2, Math.max(1, radius));
        ctx.fill();
      }

      ctx.restore();
    }
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  private drawScorePopups(ctx: CanvasRenderingContext2D) {
    for (const popup of this.scorePopups) {
      const alpha = popup.life / popup.maxLife;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = COLORS.gold;
      ctx.font = 'bold 14px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.shadowColor = COLORS.gold;
      ctx.shadowBlur = 8;
      ctx.fillText(popup.text, popup.x, popup.y);
      ctx.restore();
    }
  }

  private drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.75);
    gradient.addColorStop(0, 'transparent');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }

  destroy() {
    // cleanup
  }
}
