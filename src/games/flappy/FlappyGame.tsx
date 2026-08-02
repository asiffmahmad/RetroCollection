import { useEffect, useRef, useState, useCallback } from 'react';
import { HAPTIC, SFX, resumeAudio } from '../../utils/feedback';

// ── Constants ─────────────────────────────────────────────────
const CW = 320, CH = 540;
const GRAVITY = 0.38;
const JUMP_VEL = -8.5;
const PIPE_W = 54, PIPE_GAP = 145, PIPE_SPEED = 2.4;
const BIRD_X = 75, BIRD_R = 14;
const GROUND_H = 50;

// ── Parallax star layers ───────────────────────────────────────
interface StarLayer { stars: { x: number; y: number; r: number }[]; speed: number; alpha: number; }
interface Pipe { x: number; gapY: number; scored: boolean; }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; ml: number; color: string; size: number; }

type FState = 'idle' | 'playing' | 'dead';
interface FlappyCbs { onScore(s: number): void; onState(s: FState): void; }

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

class FlappyEngine {
  private canvas: HTMLCanvasElement; private ctx: CanvasRenderingContext2D;
  private cbs: FlappyCbs;
  private state: FState = 'idle';
  private birdY = CH / 2; private birdVY = 0;
  private birdRot = 0; private birdWing = 0;
  private pipes: Pipe[] = [];
  private particles: Particle[] = [];
  private score = 0;
  private pipeTimer = 0;
  private groundScroll = 0;
  private layers: StarLayer[] = [];
  private shakeX = 0; private shakeY = 0; private shakeLife = 0;
  private deathTimer = 0;

  constructor(canvas: HTMLCanvasElement, cbs: FlappyCbs) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d')!;
    this.cbs = cbs; canvas.width = CW; canvas.height = CH;
    this.initLayers();
  }

  private initLayers() {
    this.layers = [
      { speed: 0.1, alpha: 0.3, stars: Array.from({ length: 60 }, () => ({ x: Math.random() * CW, y: Math.random() * (CH - GROUND_H), r: Math.random() * 1 + 0.3 })) },
      { speed: 0.25, alpha: 0.6, stars: Array.from({ length: 30 }, () => ({ x: Math.random() * CW, y: Math.random() * (CH - GROUND_H), r: Math.random() * 1.5 + 0.5 })) },
    ];
  }

  getState() { return this.state; }

  flap() {
    if (this.state === 'idle') {
      this.state = 'playing'; this.cbs.onState('playing');
      this.birdVY = JUMP_VEL; this.pipeTimer = 60;
      return;
    }
    if (this.state === 'playing') {
      this.birdVY = JUMP_VEL;
      // Wing flap particles
      for (let i = 0; i < 5; i++) this.particles.push({
        x: BIRD_X - 5, y: this.birdY, vx: -1 - Math.random() * 2, vy: (Math.random() - 0.5) * 3,
        life: 20, ml: 20, color: '#ffd700', size: 2,
      });
    }
  }

  private die() {
    this.state = 'dead'; this.cbs.onState('dead');
    this.deathTimer = 30; this.shakeX = 8; this.shakeY = 8; this.shakeLife = 20;
    // Death burst
    for (let i = 0; i < 25; i++) {
      const angle = Math.random() * Math.PI * 2; const spd = 2 + Math.random() * 6;
      this.particles.push({ x: BIRD_X, y: this.birdY, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd - 2,
        life: 40 + Math.random() * 30, ml: 70, color: ['#ffd700','#ff8c00','#ff4466','#fff'][Math.floor(Math.random() * 4)], size: 3 + Math.random() * 4 });
    }
  }

  reset() {
    this.birdY = CH / 2; this.birdVY = 0; this.birdRot = 0;
    this.pipes = []; this.score = 0; this.pipeTimer = 80;
    this.particles = []; this.shakeX = 0; this.shakeY = 0; this.shakeLife = 0;
    this.cbs.onScore(0); this.state = 'idle'; this.cbs.onState('idle');
  }

  update() {
    // Scroll layers
    for (const layer of this.layers) for (const s of layer.stars) { s.x -= layer.speed; if (s.x < 0) s.x = CW; }
    this.groundScroll = (this.groundScroll + (this.state === 'playing' ? PIPE_SPEED : 0)) % 40;

    // Screen shake
    if (this.shakeLife > 0) { this.shakeLife--; this.shakeX *= 0.8; this.shakeY *= 0.8; }

    // Particles
    this.particles = this.particles.filter(p => p.life > 0);
    for (const p of this.particles) { p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life--; }

    if (this.state === 'dead') {
      // Let bird fall off screen after death
      if (this.deathTimer > 0) { this.deathTimer--; this.birdVY = Math.min(this.birdVY + GRAVITY, 12); this.birdY += this.birdVY; }
      return;
    }
    if (this.state !== 'playing') return;

    // Bird physics
    this.birdVY = Math.min(this.birdVY + GRAVITY, 12);
    this.birdY += this.birdVY;
    this.birdRot = Math.max(-0.4, Math.min(1.2, this.birdVY * 0.07));
    this.birdWing += 0.3;

    // Pipe spawning
    this.pipeTimer--;
    if (this.pipeTimer <= 0) {
      const gapY = GROUND_H + PIPE_GAP / 2 + 40 + Math.random() * (CH - GROUND_H - PIPE_GAP - 100);
      this.pipes.push({ x: CW + PIPE_W, gapY, scored: false });
      this.pipeTimer = Math.max(60, 95 - this.score * 2);
    }

    // Move pipes
    for (const pipe of this.pipes) pipe.x -= PIPE_SPEED;
    this.pipes = this.pipes.filter(p => p.x > -PIPE_W - 10);

    // Score
    for (const pipe of this.pipes) {
      if (!pipe.scored && pipe.x + PIPE_W < BIRD_X) {
        pipe.scored = true; this.score++; this.cbs.onScore(this.score);
        // Score particle
        this.particles.push({ x: BIRD_X, y: this.birdY - 20, vx: 0, vy: -2, life: 30, ml: 30, color: '#ffd700', size: 4 });
      }
    }

    // Collision: ground/ceiling
    if (this.birdY + BIRD_R >= CH - GROUND_H || this.birdY - BIRD_R <= 0) { this.die(); return; }

    // Collision: pipes
    for (const pipe of this.pipes) {
      const bx = BIRD_X, by = this.birdY;
      if (bx + BIRD_R > pipe.x && bx - BIRD_R < pipe.x + PIPE_W) {
        const topPipeBottom = pipe.gapY - PIPE_GAP / 2;
        const botPipeTop = pipe.gapY + PIPE_GAP / 2;
        if (by - BIRD_R < topPipeBottom || by + BIRD_R > botPipeTop) { this.die(); return; }
      }
    }
  }

  draw() {
    const ctx = this.ctx;
    ctx.save();
    if (this.shakeLife > 0) ctx.translate(this.shakeX * (Math.random() - 0.5) * 2, this.shakeY * (Math.random() - 0.5) * 2);

    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, CH - GROUND_H);
    sky.addColorStop(0, '#020210'); sky.addColorStop(0.6, '#050520'); sky.addColorStop(1, '#0a0a30');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, CW, CH);

    // Stars
    for (const layer of this.layers) {
      for (const s of layer.stars) {
        ctx.save(); ctx.globalAlpha = layer.alpha + Math.sin(Date.now() * 0.001 + s.x) * 0.1;
        ctx.fillStyle = '#e0e0ff'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
    }

    // Pipes (neon green)
    for (const pipe of this.pipes) {
      const topH = pipe.gapY - PIPE_GAP / 2;
      const botY = pipe.gapY + PIPE_GAP / 2;
      const botH = CH - GROUND_H - botY;
      ctx.save();
      // Pipe gradient
      const pg = ctx.createLinearGradient(pipe.x, 0, pipe.x + PIPE_W, 0);
      pg.addColorStop(0, '#006622'); pg.addColorStop(0.3, '#00ff88'); pg.addColorStop(1, '#006622');
      ctx.fillStyle = pg; ctx.shadowColor = '#00ff88'; ctx.shadowBlur = 12;
      // Top pipe
      rrect(ctx, pipe.x, 0, PIPE_W, topH, 3); ctx.fill();
      // Top cap
      rrect(ctx, pipe.x - 4, topH - 14, PIPE_W + 8, 14, 4); ctx.fill();
      // Bottom pipe
      rrect(ctx, pipe.x, botY, PIPE_W, botH, 3); ctx.fill();
      // Bottom cap
      rrect(ctx, pipe.x - 4, botY, PIPE_W + 8, 14, 4); ctx.fill();
      ctx.restore();
    }

    // Ground
    const gc = ctx.createLinearGradient(0, CH - GROUND_H, 0, CH);
    gc.addColorStop(0, '#0d2800'); gc.addColorStop(1, '#020a00');
    ctx.fillStyle = gc; ctx.fillRect(0, CH - GROUND_H, CW, GROUND_H);
    // Ground stripe
    ctx.strokeStyle = '#00ff8844'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, CH - GROUND_H + 1); ctx.lineTo(CW, CH - GROUND_H + 1); ctx.stroke();
    // Moving ground stripes
    ctx.strokeStyle = '#00ff8822'; ctx.lineWidth = 1;
    for (let x = -this.groundScroll; x < CW; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, CH - GROUND_H + 5); ctx.lineTo(x + 20, CH - GROUND_H + 5); ctx.stroke();
    }

    // Bird (only visible if not fallen off)
    if (this.birdY < CH + 50) {
      ctx.save();
      ctx.translate(BIRD_X, this.birdY);
      ctx.rotate(this.birdRot);
      // Body
      const bodyG = ctx.createRadialGradient(-3, -3, 2, 0, 0, BIRD_R);
      bodyG.addColorStop(0, '#fff7aa'); bodyG.addColorStop(0.5, '#ffd700'); bodyG.addColorStop(1, '#ff8c00');
      ctx.fillStyle = bodyG; ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 15;
      ctx.beginPath(); ctx.ellipse(0, 0, BIRD_R, BIRD_R * 0.82, 0, 0, Math.PI * 2); ctx.fill();
      // Wing
      ctx.shadowBlur = 0;
      ctx.save(); ctx.translate(-3, 2);
      const wingY = Math.sin(this.birdWing) * 4;
      ctx.fillStyle = '#ff8c00';
      ctx.beginPath(); ctx.ellipse(0, wingY, 7, 4, -0.3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // Eye
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(5, -3, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(6, -3, 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(7, -4, 0.8, 0, Math.PI * 2); ctx.fill();
      // Beak
      ctx.fillStyle = '#ff6600';
      ctx.beginPath(); ctx.moveTo(BIRD_R - 2, -1); ctx.lineTo(BIRD_R + 6, 0); ctx.lineTo(BIRD_R - 2, 4); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    // Particles
    for (const p of this.particles) {
      ctx.save(); ctx.globalAlpha = Math.max(0, p.life / p.ml);
      ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }

    // Border glow
    ctx.strokeStyle = '#06b6d444'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, CW - 2, CH - 2);
    ctx.restore();
  }

  destroy() {}
}

// ── React Component ────────────────────────────────────────────
interface Props { onBack: () => void; }

export default function FlappyGamePage({ onBack }: Props) {
  const cvRef  = useRef<HTMLCanvasElement>(null);
  const engRef = useRef<FlappyEngine | null>(null);
  const rafRef = useRef<number>(0);
  const [gs, setGs]       = useState<FState>('idle');
  const [score, setScore] = useState(0);
  const [best, setBest]   = useState(() => { try { return +(localStorage.getItem('flappy_best') || '0'); } catch { return 0; } });
  const [showScore, setShowScore] = useState(false);

  const doFlap = useCallback(() => {
    resumeAudio();
    const eng = engRef.current; if (!eng) return;
    if (eng.getState() === 'dead') { eng.reset(); setScore(0); setShowScore(false); SFX.gameStart(); return; }
    HAPTIC.tap(); SFX.flappyFlap();
    eng.flap();
  }, []);

  useEffect(() => {
    const eng = new FlappyEngine(cvRef.current!, {
      onScore: (s) => {
        setScore(s);
        SFX.flappyScore();
        if (s % 5 === 0) HAPTIC.soft();
        setBest(prev => { if (s > prev) { localStorage.setItem('flappy_best', String(s)); SFX.newBest(); HAPTIC.success(); return s; } return prev; });
      },
      onState: (s) => {
        setGs(s);
        if (s === 'dead') { setShowScore(true); SFX.flappyDie(); HAPTIC.fail(); }
      },
    });
    engRef.current = eng;
    const loop = () => { eng.update(); eng.draw(); rafRef.current = requestAnimationFrame(loop); };
    rafRef.current = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(rafRef.current); eng.destroy(); };
  }, []);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === ' ' || e.key === 'ArrowUp') { e.preventDefault(); doFlap(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doFlap]);

  const A = '#06b6d4';

  return (
    <div className="flex flex-col items-center gap-3 p-3 w-full max-w-[400px] mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex w-full items-center justify-between" style={{ maxWidth: CW }}>
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="flex items-center justify-center w-8 h-8 rounded-xl hover:scale-110 active:scale-95 transition-all"
            style={{ background: '#ffffff08', border: '1px solid #ffffff15' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8888bb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <span className="text-2xl">🐦</span>
          <h1 className="text-xl font-bold tracking-wider" style={{ color: A, fontFamily: '"JetBrains Mono",monospace' }}>FLAPPY</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[9px] uppercase tracking-widest" style={{ color: '#8888aa' }}>Best</div>
            <div className="text-base font-bold" style={{ color: '#ffd700', fontFamily: '"JetBrains Mono",monospace' }}>{best}</div>
          </div>
        </div>
      </div>

      {/* Canvas — click/tap to flap */}
      <div className="relative rounded-2xl overflow-hidden w-full cursor-pointer select-none"
        style={{ maxWidth: CW, aspectRatio: `${CW}/${CH}`, boxShadow: `0 0 30px ${A}22, 0 4px 24px rgba(0,0,0,0.6)` }}
        onClick={doFlap} onTouchStart={(e) => { e.preventDefault(); doFlap(); }}>
        <canvas ref={cvRef} width={CW} height={CH} className="block w-full h-full" />

        {/* Live score */}
        {gs === 'playing' && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 text-3xl font-black tabular-nums"
            style={{ color: '#ffffff', fontFamily: '"JetBrains Mono",monospace', textShadow: `0 0 15px ${A}88, 0 2px 4px rgba(0,0,0,0.8)` }}>
            {score}
          </div>
        )}

        {/* Idle overlay */}
        {gs === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4"
            style={{ background: '#020210aa', backdropFilter: 'blur(4px)' }}>
            <div className="text-5xl" style={{ filter: 'drop-shadow(0 0 12px #ffd700)' }}>🐦</div>
            <h2 className="text-3xl font-black tracking-wider" style={{ color: A, fontFamily: '"JetBrains Mono",monospace', textShadow: `0 0 20px ${A}66` }}>FLAPPY</h2>
            <div className="flex flex-col items-center gap-1">
              <p className="text-base font-bold animate-bounce" style={{ color: '#ffd700' }}>Tap to start!</p>
              <p className="text-[11px]" style={{ color: '#8888aa' }}>Space / tap to flap</p>
            </div>
          </div>
        )}

        {/* Death score overlay */}
        {showScore && gs === 'dead' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3"
            style={{ background: '#020210bb', backdropFilter: 'blur(6px)' }}>
            <div className="text-4xl">💀</div>
            <h2 className="text-2xl font-black" style={{ color: '#ff4466', fontFamily: '"JetBrains Mono",monospace', textShadow: '0 0 20px #ff446666' }}>GAME OVER</h2>
            <div className="rounded-xl px-6 py-3 text-center" style={{ background: '#ffffff08', border: '1px solid #ffffff15' }}>
              <p className="text-[10px] uppercase tracking-widest" style={{ color: '#8888aa' }}>Score</p>
              <p className="text-4xl font-black" style={{ color: score >= best && score > 0 ? '#ffd700' : A, fontFamily: '"JetBrains Mono",monospace' }}>{score}</p>
              {score > 0 && score >= best && <p className="text-xs mt-1" style={{ color: '#ffd700' }}>🏆 NEW BEST!</p>}
            </div>
            <p className="text-sm font-bold animate-pulse" style={{ color: A }}>Tap to restart</p>
          </div>
        )}
      </div>

      <p className="text-[10px]" style={{ color: '#555580' }}>
        Tap canvas · Space / ↑ key to flap • Avoid the pipes!
      </p>
    </div>
  );
}
