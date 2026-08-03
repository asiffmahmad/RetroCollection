import { useEffect, useRef, useState, useCallback } from 'react';
import { HAPTIC, SFX, resumeAudio } from '../../utils/feedback';

// Engine also needs SFX directly
import * as _FB from '../../utils/feedback';
const _SFX = _FB.SFX;

// ── Constants ─────────────────────────────────────────────────
const CW = 320;
const getCH = () => {
  if (typeof window === 'undefined') return 500;
  const ratio = window.innerHeight / window.innerWidth;
  return Math.floor(Math.max(450, Math.min(750, CW * ratio * 0.9))); // 0.9 to account for UI headers
};
const CH = getCH();
const PADDLE_H = 10, PADDLE_Y = CH - 40;
const BALL_R = 7;
const BRICK_COLS = 10, BRICK_ROWS = 7;
const BRICK_W = CW / BRICK_COLS;    // 32
const BRICK_H = 18;
const BRICK_TOP = 60;
const BRICK_GAP = 2;
const MAX_LIVES = 3;

// Brick colors by HP
const HP_COLORS = ['', '#ff4466', '#ff8c00', '#ffd700', '#00ff88', '#3b82f6', '#c084fc'];
const HP_DARKS  = ['', '#aa1133', '#a05500', '#aa8800', '#009944', '#1155bb', '#7c22aa'];
// Row HP assignments (bottom row = hp 1, going up increases)
const ROW_HP = [1, 1, 2, 2, 3, 3, 2]; // 7 rows (index 0 = top)

interface Brick { x: number; y: number; hp: number; maxHp: number; alive: boolean; }
interface Ball  { x: number; y: number; vx: number; vy: number; speed: number; }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; ml: number; color: string; size: number; }
interface PowerUp { x: number; y: number; vy: number; type: 'wide' | 'slow'; }

type BState = 'idle' | 'playing' | 'paused' | 'gameover' | 'won';
interface BrkCbs { onScore(s: number): void; onLives(l: number): void; onState(s: BState): void; }

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

class BreakoutEngine {
  private canvas: HTMLCanvasElement; private ctx: CanvasRenderingContext2D;
  private cbs: BrkCbs;
  private bricks: Brick[] = [];
  private balls: Ball[] = [];
  private paddle = { x: CW / 2, w: 75, targetX: CW / 2 };
  private lives = MAX_LIVES; private score = 0;
  private state: BState = 'idle';
  private particles: Particle[] = [];
  private powerups: PowerUp[] = [];
  private wideTimer = 0; private slowTimer = 0;
  private prevTime = 0; private dt = 0;
  private shakeX = 0; private shakeY = 0; private shakeLife = 0;

  constructor(canvas: HTMLCanvasElement, cbs: BrkCbs) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d')!;
    this.cbs = cbs; canvas.width = CW; canvas.height = CH;
  }

  getState() { return this.state; }

  start() {
    this.score = 0; this.lives = MAX_LIVES;
    this.wideTimer = 0; this.slowTimer = 0; this.particles = []; this.powerups = [];
    this.paddle = { x: CW / 2, w: 75, targetX: CW / 2 };
    this.cbs.onScore(0); this.cbs.onLives(MAX_LIVES);
    this.buildBricks(); this.spawnBall();
    this.state = 'playing'; this.cbs.onState('playing');
  }

  togglePause() {
    if (this.state === 'playing') { this.state = 'paused'; this.cbs.onState('paused'); }
    else if (this.state === 'paused') { this.state = 'playing'; this.cbs.onState('playing'); this.prevTime = performance.now(); }
  }

  private buildBricks() {
    this.bricks = [];
    for (let row = 0; row < BRICK_ROWS; row++) {
      const hp = ROW_HP[row] ?? 1;
      for (let col = 0; col < BRICK_COLS; col++) {
        this.bricks.push({
          x: col * BRICK_W, y: BRICK_TOP + row * (BRICK_H + BRICK_GAP),
          hp, maxHp: hp, alive: true,
        });
      }
    }
  }

  private spawnBall() {
    const angle = (-Math.PI / 2) + (Math.random() - 0.5) * 0.6;
    const spd = 4;
    this.balls = [{ x: CW / 2, y: PADDLE_Y - BALL_R - 2, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd, speed: spd }];
  }

  setPaddleTarget(x: number) { this.paddle.targetX = x; }

  private shake(amt: number) { this.shakeX = (Math.random() - 0.5) * amt * 2; this.shakeY = (Math.random() - 0.5) * amt * 2; this.shakeLife = 10; }

  private burst(x: number, y: number, color: string, n = 12) {
    for (let i = 0; i < n; i++) {
      const angle = Math.random() * Math.PI * 2; const spd = 2 + Math.random() * 5;
      this.particles.push({ x, y, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd - 1, life: 35 + Math.random() * 25, ml: 60, color, size: 2 + Math.random() * 3 });
    }
  }

  update(now: number) {
    if (this.state !== 'playing') return;
    this.dt = Math.min(now - this.prevTime, 32); this.prevTime = now;

    // Timers
    if (this.wideTimer > 0) { this.wideTimer--; if (this.wideTimer <= 0) this.paddle.w = 75; }
    if (this.slowTimer > 0) { this.slowTimer--; if (this.slowTimer <= 0) for (const b of this.balls) { const ratio = b.speed / Math.hypot(b.vx, b.vy); b.vx *= ratio; b.vy *= ratio; } }
    if (this.shakeLife > 0) { this.shakeLife--; this.shakeX *= 0.8; this.shakeY *= 0.8; }

    // Paddle
    const pp = this.paddle.x;
    this.paddle.x += (this.paddle.targetX - pp) * 0.22;
    this.paddle.x = Math.max(this.paddle.w / 2, Math.min(CW - this.paddle.w / 2, this.paddle.x));

    // Particles
    this.particles = this.particles.filter(p => p.life > 0);
    for (const p of this.particles) { p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life--; }

    // Power-ups
    this.powerups = this.powerups.filter(pu => pu.y < CH + 20);
    for (const pu of this.powerups) {
      pu.y += 2;
      const padL = this.paddle.x - this.paddle.w / 2, padR = this.paddle.x + this.paddle.w / 2;
      if (pu.y > PADDLE_Y - 15 && pu.y < PADDLE_Y + 15 && pu.x > padL && pu.x < padR) {
        if (pu.type === 'wide') { this.paddle.w = 120; this.wideTimer = 600; }
        if (pu.type === 'slow') { for (const b of this.balls) { b.vx *= 0.65; b.vy *= 0.65; } this.slowTimer = 480; }
        pu.y = CH + 100;
      }
    }

    // Balls
    const toRemove: number[] = [];
    for (let bi = 0; bi < this.balls.length; bi++) {
      const ball = this.balls[bi];
      const spd = this.slowTimer > 0 ? ball.speed * 0.65 : ball.speed;
      const ratio = spd / Math.hypot(ball.vx, ball.vy);
      const vx = ball.vx * ratio, vy = ball.vy * ratio;

      ball.x += vx; ball.y += vy;

      // Wall bounces
      if (ball.x - BALL_R < 0) { ball.x = BALL_R; ball.vx = Math.abs(ball.vx); }
      if (ball.x + BALL_R > CW) { ball.x = CW - BALL_R; ball.vx = -Math.abs(ball.vx); }
      if (ball.y - BALL_R < 0) { ball.y = BALL_R; ball.vy = Math.abs(ball.vy); }

      // Lost ball
      if (ball.y > CH + 20) { toRemove.push(bi); continue; }

      // Paddle collision
      const padL = this.paddle.x - this.paddle.w / 2, padR = this.paddle.x + this.paddle.w / 2;
      if (ball.y + BALL_R >= PADDLE_Y && ball.y + BALL_R <= PADDLE_Y + PADDLE_H + 4 && ball.x >= padL && ball.x <= padR && ball.vy > 0) {
        const hit = (ball.x - this.paddle.x) / (this.paddle.w / 2);
        const angle = hit * (Math.PI / 3) - Math.PI / 2;
        const spd2 = Math.min(ball.speed + 0.05, 9);
        ball.vx = Math.cos(angle) * spd2; ball.vy = Math.sin(angle) * spd2; ball.speed = spd2;
        ball.y = PADDLE_Y - BALL_R - 1;
        _SFX.brkPaddle();
      }

      // Brick collisions
      for (const brick of this.bricks) {
        if (!brick.alive) continue;
        const bx = brick.x + BRICK_GAP / 2, bw = BRICK_W - BRICK_GAP;
        const by = brick.y + BRICK_GAP / 2, bh = BRICK_H - BRICK_GAP;
        if (ball.x + BALL_R < bx || ball.x - BALL_R > bx + bw || ball.y + BALL_R < by || ball.y - BALL_R > by + bh) continue;
        // Which face?
        const overL = ball.x + BALL_R - bx, overR = bx + bw - (ball.x - BALL_R);
        const overT = ball.y + BALL_R - by, overB = by + bh - (ball.y - BALL_R);
        const minOver = Math.min(overL, overR, overT, overB);
        if (minOver === overL || minOver === overR) ball.vx = -ball.vx;
        else {
          // Damaged but not destroyed
          _SFX.brkHardBrick();
          ball.vy = -ball.vy;
        }

        brick.hp--;
        const col = HP_COLORS[brick.maxHp];
        this.burst(brick.x + BRICK_W / 2, brick.y + BRICK_H / 2, col, brick.hp === 0 ? 18 : 6);
        if (brick.hp <= 0) {
          brick.alive = false;
          this.score += brick.maxHp * 15;
          this.cbs.onScore(this.score);
          this.shake(4);
          _SFX.brkBrick();
          // Power-up drop 25%
          if (Math.random() < 0.25) {
            this.powerups.push({ x: brick.x + BRICK_W / 2, y: brick.y + BRICK_H, vy: 2, type: Math.random() < 0.5 ? 'wide' : 'slow' });
          }
        }
      }
    }

    // Remove lost balls
    for (let i = toRemove.length - 1; i >= 0; i--) this.balls.splice(toRemove[i], 1);
    if (this.balls.length === 0) {
      this.lives--; this.cbs.onLives(this.lives);
      this.shake(8);
      if (this.lives <= 0) { this.state = 'gameover'; this.cbs.onState('gameover'); }
      else { setTimeout(() => { if (this.state === 'playing') this.spawnBall(); }, 500); }
    }

    // Win check
    if (this.bricks.every(b => !b.alive)) { this.state = 'won'; this.cbs.onState('won'); }
  }

  draw() {
    const ctx = this.ctx;
    ctx.save();
    if (this.shakeLife > 0) ctx.translate(this.shakeX, this.shakeY);

    // Background gradient
    const bg = ctx.createLinearGradient(0, 0, 0, CH);
    bg.addColorStop(0, '#050510'); bg.addColorStop(1, '#0a0a20');
    ctx.fillStyle = bg; ctx.fillRect(-10, -10, CW + 20, CH + 20);

    // Subtle grid
    ctx.strokeStyle = '#1a1a3a33'; ctx.lineWidth = 0.5;
    for (let x = 0; x < CW; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CH); ctx.stroke(); }
    for (let y = 0; y < CH; y += 18) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CW, y); ctx.stroke(); }

    // Bricks
    for (const b of this.bricks) {
      if (!b.alive) continue;
      const col = HP_COLORS[b.maxHp]; const dark = HP_DARKS[b.maxHp];
      const alpha = 0.4 + (b.hp / b.maxHp) * 0.6;
      ctx.save(); ctx.globalAlpha = alpha;
      const g = ctx.createLinearGradient(b.x, b.y, b.x + BRICK_W, b.y + BRICK_H);
      g.addColorStop(0, col); g.addColorStop(1, dark);
      ctx.fillStyle = g; ctx.shadowColor = col; ctx.shadowBlur = 6;
      rrect(ctx, b.x + BRICK_GAP, b.y + BRICK_GAP, BRICK_W - BRICK_GAP * 2, BRICK_H - BRICK_GAP * 2, 3);
      ctx.fill();
      // Highlight
      ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,0.15)';
      rrect(ctx, b.x + BRICK_GAP + 2, b.y + BRICK_GAP + 2, BRICK_W - BRICK_GAP * 2 - 4, 3, 1); ctx.fill();
      ctx.restore();
    }

    // Power-ups
    for (const pu of this.powerups) {
      ctx.save();
      ctx.fillStyle = pu.type === 'wide' ? '#00ff88' : '#06b6d4';
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(pu.x, pu.y, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(pu.type === 'wide' ? 'W' : 'S', pu.x, pu.y);
      ctx.restore();
    }

    // Paddle
    ctx.save();
    const padX = this.paddle.x - this.paddle.w / 2;
    const pg = ctx.createLinearGradient(padX, PADDLE_Y, padX + this.paddle.w, PADDLE_Y + PADDLE_H);
    pg.addColorStop(0, this.wideTimer > 0 ? '#00ff88' : '#a78bfa');
    pg.addColorStop(1, this.wideTimer > 0 ? '#00aa55' : '#7c3aed');
    ctx.fillStyle = pg; ctx.shadowColor = this.wideTimer > 0 ? '#00ff88' : '#a78bfa'; ctx.shadowBlur = 12;
    rrect(ctx, padX, PADDLE_Y, this.paddle.w, PADDLE_H, 5); ctx.fill();
    ctx.restore();

    // Balls
    for (const ball of this.balls) {
      ctx.save();
      ctx.fillStyle = '#e0e0ff'; ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 15;
      ctx.beginPath(); ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.arc(ball.x - 2, ball.y - 2, BALL_R * 0.35, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // Particles
    for (const p of this.particles) {
      ctx.save(); ctx.globalAlpha = Math.max(0, p.life / p.ml);
      ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }

    // HUD: lives dots
    for (let i = 0; i < MAX_LIVES; i++) {
      ctx.save();
      ctx.fillStyle = i < this.lives ? '#a78bfa' : '#1a1a3a'; ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = i < this.lives ? 8 : 0;
      ctx.beginPath(); ctx.arc(10 + i * 18, CH - 12, 6, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }

    // Border
    ctx.strokeStyle = '#a78bfa44'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, CW - 2, CH - 2);
    ctx.restore();
  }

  destroy() {}
}

// ── React Component ────────────────────────────────────────────
interface Props { onBack: () => void; }

export default function BreakoutGamePage({ onBack }: Props) {
  const cvRef  = useRef<HTMLCanvasElement>(null);
  const engRef = useRef<BreakoutEngine | null>(null);
  const rafRef = useRef<number>(0);
  const [gs, setGs]       = useState<BState>('idle');
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(MAX_LIVES);
  const [best, setBest]   = useState(() => { try { return +(localStorage.getItem('breakout_best') || '0'); } catch { return 0; } });

  const startGame   = useCallback(() => { resumeAudio(); SFX.gameStart(); HAPTIC.soft(); engRef.current?.start(); }, []);
  const togglePause = useCallback(() => { HAPTIC.tap(); engRef.current?.togglePause(); }, []);

  useEffect(() => {
    const eng = new BreakoutEngine(cvRef.current!, {
      onScore: (s) => { setScore(s); setBest(p => { if (s > p) { localStorage.setItem('breakout_best', String(s)); SFX.newBest(); HAPTIC.success(); return s; } return p; }); },
      onLives: setLives,
      onState: (s) => {
        setGs(s);
        if (s === 'gameover') { SFX.brkDie(); HAPTIC.fail(); }
        if (s === 'won') { SFX.brkWin(); HAPTIC.success(); }
      },
    });
    engRef.current = eng;
    let prev = performance.now();
    const loop = (now: number) => { eng.update(now); eng.draw(); prev = now; rafRef.current = requestAnimationFrame(loop); };
    rafRef.current = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(rafRef.current); eng.destroy(); };
  }, []);

  // Mouse control
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const scaleX = CW / rect.width;
    engRef.current?.setPaddleTarget((e.clientX - rect.left) * scaleX);
  };

  // Touch control
  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const scaleX = CW / rect.width;
    engRef.current?.setPaddleTarget((e.touches[0].clientX - rect.left) * scaleX);
  };

  // Tap to start
  const handleTap = () => {
    resumeAudio();
    const s = engRef.current?.getState();
    if (s === 'idle' || s === 'gameover' || s === 'won') startGame();
    else if (s === 'playing' || s === 'paused') togglePause();
  };

  const A = '#8b5cf6';
  const overlay = (children: React.ReactNode) => (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-4"
      style={{ background: '#050510dd', backdropFilter: 'blur(6px)' }}>{children}</div>
  );

  return (
    <div className="flex flex-col w-full h-[100dvh] sm:h-auto sm:w-auto animate-fade-in mx-auto justify-between" style={{ maxWidth: 450 }}>
      {/* Header */}
      <div className="flex w-full items-center justify-between p-3 shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="flex items-center justify-center w-8 h-8 rounded-xl hover:scale-110 active:scale-95 transition-all"
            style={{ background: '#ffffff08', border: '1px solid #ffffff15' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8888bb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <span className="text-2xl">🏓</span>
          <h1 className="text-xl font-bold tracking-wider" style={{ color: A, fontFamily: '"JetBrains Mono",monospace' }}>BREAKOUT</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-col items-end">
            <span className="text-[9px] uppercase tracking-widest" style={{ color: '#8888aa' }}>Score</span>
            <span className="text-lg font-bold" style={{ color: A, fontFamily: '"JetBrains Mono",monospace' }}>{score}</span>
          </div>
          {gs === 'playing' && <button onClick={togglePause} className="rounded-lg px-2.5 py-1.5 text-sm hover:scale-105 active:scale-95 transition-all"
            style={{ color: '#8888aa', border: '1px solid #8888aa44', background: '#ffffff08' }}>⏸</button>}
        </div>
      </div>

      {/* Score bar */}
      <div className="flex w-full items-center justify-between rounded-xl px-4 py-2" style={{ maxWidth: CW, background: '#0f0f2a', border: `1px solid ${A}33` }}>
        <div><span className="text-[9px] uppercase tracking-widest" style={{ color: '#8888aa' }}>Best </span><span className="text-sm font-bold" style={{ color: '#ffd700', fontFamily: '"JetBrains Mono",monospace' }}>{best}</span></div>
        <div className="flex items-center gap-1">
          {Array.from({ length: MAX_LIVES }).map((_, i) => (
            <div key={i} className="w-3 h-3 rounded-full transition-all" style={{ background: i < lives ? A : '#1a1a3a', boxShadow: i < lives ? `0 0 6px ${A}88` : 'none' }} />
          ))}
        </div>
        <div><span className="text-[9px] uppercase tracking-widest" style={{ color: '#8888aa' }}>Lives</span></div>
      </div>

      {/* Canvas */}
      <div className="relative rounded-2xl overflow-hidden w-full cursor-none"
        style={{ maxWidth: 450, aspectRatio: `${CW}/${CH}`, boxShadow: `0 0 30px ${A}22, 0 4px 24px rgba(0,0,0,0.6)` }}
        onMouseMove={handleMouseMove} onTouchMove={handleTouchMove} onTouchStart={(e) => { e.preventDefault(); handleTap(); }} onClick={handleTap}>
        <canvas ref={cvRef} width={CW} height={CH} className="block w-full h-full object-contain" />
        {gs === 'idle' && overlay(<>
          <div className="text-5xl animate-bounce">🏓</div>
          <h2 className="text-3xl font-black tracking-wider" style={{ color: A, fontFamily: '"JetBrains Mono",monospace', textShadow: `0 0 20px ${A}66` }}>BREAKOUT</h2>
          <button onClick={startGame} className="rounded-2xl px-9 py-3.5 text-base font-bold tracking-wider hover:scale-110 active:scale-95 transition-all"
            style={{ background: `linear-gradient(135deg, ${A}, #fbbf24)`, color: '#000', boxShadow: `0 0 30px ${A}44` }}>▶ PLAY</button>
          <p className="text-[11px] text-center" style={{ color: '#8888aa' }}>🖱️ Mouse / 👆 Touch to move paddle</p>
        </>)}
        {gs === 'paused' && overlay(<>
          <div className="text-5xl">⏸️</div>
          <h2 className="text-3xl font-black" style={{ color: '#e0e0ff', fontFamily: '"JetBrains Mono",monospace' }}>PAUSED</h2>
          <button onClick={togglePause} className="rounded-2xl px-9 py-3.5 text-base font-bold hover:scale-110 active:scale-95 transition-all"
            style={{ background: `linear-gradient(135deg, ${A}, #fbbf24)`, color: '#000', boxShadow: `0 0 30px ${A}44` }}>▶ RESUME</button>
        </>)}
        {(gs === 'gameover') && overlay(<>
          <div className="text-5xl">💀</div>
          <h2 className="text-3xl font-black" style={{ color: '#ff4466', fontFamily: '"JetBrains Mono",monospace', textShadow: '0 0 20px #ff446666' }}>GAME OVER</h2>
          <div className="rounded-xl px-6 py-3 text-center" style={{ background: '#ffffff08', border: '1px solid #ffffff15' }}>
            <p className="text-[10px] uppercase tracking-widest" style={{ color: '#8888aa' }}>Score</p>
            <p className="text-4xl font-black" style={{ color: score >= best && score > 0 ? '#ffd700' : A, fontFamily: '"JetBrains Mono",monospace' }}>{score}</p>
            {score > 0 && score >= best && <p className="text-xs mt-1" style={{ color: '#ffd700' }}>🎉 NEW BEST!</p>}
          </div>
          <button onClick={startGame} className="rounded-2xl px-9 py-3.5 text-base font-bold hover:scale-110 active:scale-95 transition-all"
            style={{ background: `linear-gradient(135deg, ${A}, #fbbf24)`, color: '#000', boxShadow: `0 0 30px ${A}44` }}>🔄 RESTART</button>
        </>)}
        {gs === 'won' && overlay(<>
          <div className="text-6xl">🎉</div>
          <h2 className="text-3xl font-black tracking-wider" style={{ color: '#ffd700', fontFamily: '"JetBrains Mono",monospace', textShadow: '0 0 20px #ffd70066' }}>YOU WIN!</h2>
          <p className="text-2xl font-bold" style={{ color: A, fontFamily: '"JetBrains Mono",monospace' }}>{score} pts</p>
          <button onClick={startGame} className="rounded-2xl px-9 py-3.5 text-base font-bold hover:scale-110 active:scale-95 transition-all"
            style={{ background: `linear-gradient(135deg, #ffd700, ${A})`, color: '#000', boxShadow: '0 0 30px #ffd70044' }}>▶ PLAY AGAIN</button>
        </>)}
      </div>

      <div className="p-3 shrink-0 text-center text-[10px]" style={{ color: '#555580' }}>
        🖱️ Move mouse over canvas · 📱 Touch and drag paddle · W=wide paddle · S=slow ball
      </div>
    </div>
  );
}
