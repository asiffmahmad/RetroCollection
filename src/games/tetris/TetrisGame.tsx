import { useEffect, useRef, useState, useCallback } from 'react';

// ── Constants ─────────────────────────────────────────────────
const COLS = 10;
const ROWS = 20;
const CELL = 24;
const CW = COLS * CELL; // 240
const CH = ROWS * CELL; // 480
const MINI_W = 96;
const MINI_H = 76;
const SPEEDS = [800, 700, 600, 500, 400, 300, 240, 180, 120, 90, 70]; // ms/drop per level
const SCORE_TABLE = [0, 100, 300, 500, 800];

// ── Piece colors ───────────────────────────────────────────────
const PC: Record<string, string> = {
  I: '#00e5ff', O: '#ffd700', T: '#c084fc',
  S: '#00ff88', Z: '#ff4466', J: '#3b82f6', L: '#fb923c',
};
const PD: Record<string, string> = {
  I: '#009aaa', O: '#a08200', T: '#7c22aa',
  S: '#009944', Z: '#aa1133', J: '#1155bb', L: '#a05500',
};

// ── 4×4 shape grids (all 4 rotations per piece) ───────────────
const SHAPES: Record<string, number[][][]> = {
  I: [
    [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    [[0,0,1,0],[0,0,1,0],[0,0,1,0],[0,0,1,0]],
    [[0,0,0,0],[0,0,0,0],[1,1,1,1],[0,0,0,0]],
    [[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]],
  ],
  O: [
    [[0,0,0,0],[0,1,1,0],[0,1,1,0],[0,0,0,0]],
    [[0,0,0,0],[0,1,1,0],[0,1,1,0],[0,0,0,0]],
    [[0,0,0,0],[0,1,1,0],[0,1,1,0],[0,0,0,0]],
    [[0,0,0,0],[0,1,1,0],[0,1,1,0],[0,0,0,0]],
  ],
  T: [
    [[0,0,0,0],[0,1,0,0],[1,1,1,0],[0,0,0,0]],
    [[0,0,0,0],[0,1,0,0],[0,1,1,0],[0,1,0,0]],
    [[0,0,0,0],[0,0,0,0],[1,1,1,0],[0,1,0,0]],
    [[0,0,0,0],[0,1,0,0],[1,1,0,0],[0,1,0,0]],
  ],
  S: [
    [[0,0,0,0],[0,1,1,0],[1,1,0,0],[0,0,0,0]],
    [[0,0,0,0],[0,1,0,0],[0,1,1,0],[0,0,1,0]],
    [[0,0,0,0],[0,0,0,0],[0,1,1,0],[1,1,0,0]],
    [[0,0,0,0],[1,0,0,0],[1,1,0,0],[0,1,0,0]],
  ],
  Z: [
    [[0,0,0,0],[1,1,0,0],[0,1,1,0],[0,0,0,0]],
    [[0,0,0,0],[0,0,1,0],[0,1,1,0],[0,1,0,0]],
    [[0,0,0,0],[0,0,0,0],[1,1,0,0],[0,1,1,0]],
    [[0,0,0,0],[0,1,0,0],[1,1,0,0],[1,0,0,0]],
  ],
  J: [
    [[0,0,0,0],[1,0,0,0],[1,1,1,0],[0,0,0,0]],
    [[0,0,0,0],[0,1,1,0],[0,1,0,0],[0,1,0,0]],
    [[0,0,0,0],[0,0,0,0],[1,1,1,0],[0,0,1,0]],
    [[0,0,0,0],[0,1,0,0],[0,1,0,0],[1,1,0,0]],
  ],
  L: [
    [[0,0,0,0],[0,0,1,0],[1,1,1,0],[0,0,0,0]],
    [[0,0,0,0],[0,1,0,0],[0,1,0,0],[0,1,1,0]],
    [[0,0,0,0],[0,0,0,0],[1,1,1,0],[1,0,0,0]],
    [[0,0,0,0],[1,1,0,0],[0,1,0,0],[0,1,0,0]],
  ],
};
const PTYPES = Object.keys(SHAPES);

// ── Types ──────────────────────────────────────────────────────
type TState = 'idle' | 'playing' | 'paused' | 'gameover';
type Grid = (string | null)[][];
interface Piece { type: string; rot: number; x: number; y: number; }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; ml: number; color: string; size: number; }
interface TetCbs { onScore(s: number): void; onLines(l: number): void; onLevel(lv: number): void; onState(s: TState): void; }

// ── Helpers ────────────────────────────────────────────────────
const mkGrid = (): Grid => Array.from({ length: ROWS }, () => Array(COLS).fill(null));
const shape = (p: Piece) => SHAPES[p.type][p.rot];
const randPiece = (): Piece => ({ type: PTYPES[Math.floor(Math.random() * PTYPES.length)], rot: 0, x: 3, y: -2 });

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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

// ── TetrisEngine class ─────────────────────────────────────────
class TetrisEngine {
  private canvas: HTMLCanvasElement; private ctx: CanvasRenderingContext2D;
  private nextCv: HTMLCanvasElement; private nextCtx: CanvasRenderingContext2D;
  private holdCv: HTMLCanvasElement; private holdCtx: CanvasRenderingContext2D;
  private cbs: TetCbs;
  private grid: Grid = mkGrid();
  private cur: Piece | null = null;
  private next: Piece = randPiece();
  private hold: Piece | null = null;
  private holdUsed = false;
  private state: TState = 'idle';
  private score = 0; private lines = 0; private level = 0;
  private lastDrop = 0;
  private flashRows: number[] = []; private flashTimer = 0;
  private locked = false;
  private particles: Particle[] = [];
  private flashTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(canvas: HTMLCanvasElement, nc: HTMLCanvasElement, hc: HTMLCanvasElement, cbs: TetCbs) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d')!;
    this.nextCv = nc; this.nextCtx = nc.getContext('2d')!;
    this.holdCv = hc; this.holdCtx = hc.getContext('2d')!;
    this.cbs = cbs;
    canvas.width = CW; canvas.height = CH;
    nc.width = MINI_W; nc.height = MINI_H;
    hc.width = MINI_W; hc.height = MINI_H;
  }

  getState() { return this.state; }

  start() {
    if (this.flashTimeout) { clearTimeout(this.flashTimeout); this.flashTimeout = null; }
    this.grid = mkGrid(); this.score = 0; this.lines = 0; this.level = 0;
    this.hold = null; this.holdUsed = false; this.next = randPiece();
    this.particles = []; this.flashRows = []; this.flashTimer = 0; this.locked = false;
    this.cbs.onScore(0); this.cbs.onLines(0); this.cbs.onLevel(0);
    this.state = 'playing'; this.cbs.onState('playing');
    this.spawn(); this.lastDrop = performance.now();
  }

  togglePause() {
    if (this.state === 'playing') { this.state = 'paused'; this.cbs.onState('paused'); }
    else if (this.state === 'paused') { this.state = 'playing'; this.cbs.onState('playing'); this.lastDrop = performance.now(); }
  }

  private spawn() {
    this.cur = { ...this.next, x: 3, y: -2 }; this.next = randPiece(); this.holdUsed = false;
    if (!this.valid(this.cur, 0, 2)) { this.state = 'gameover'; this.cbs.onState('gameover'); this.cur = null; }
  }

  private valid(p: Piece, dx = 0, dy = 0, rot?: number): boolean {
    const sh = rot !== undefined ? SHAPES[p.type][((rot % 4) + 4) % 4] : shape(p);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      if (!sh[r][c]) continue;
      const nx = p.x + c + dx, ny = p.y + r + dy;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return false;
      if (ny >= 0 && this.grid[ny][nx] !== null) return false;
    }
    return true;
  }

  private lock() {
    if (this.locked) return;
    this.locked = true;
    const p = this.cur!; const sh = shape(p);
    const newGrid = this.grid.map(r => [...r]);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      if (!sh[r][c]) continue;
      const ny = p.y + r;
      if (ny >= 0 && ny < ROWS) newGrid[ny][p.x + c] = p.type;
    }
    const full = newGrid.reduce<number[]>((acc, row, i) => row.every(v => v) ? [...acc, i] : acc, []);
    if (full.length > 0) {
      this.grid = newGrid; this.flashRows = full; this.flashTimer = 14;
      for (const row of full) for (let c = 0; c < COLS; c++) {
        const col = PC[this.grid[row][c]!] || '#fff';
        for (let i = 0; i < 5; i++) this.particles.push({
          x: (c + 0.5) * CELL, y: (row + 0.5) * CELL,
          vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 7 - 2,
          life: 45 + Math.random() * 25, ml: 70, color: col, size: 2 + Math.random() * 3,
        });
      }
      this.flashTimeout = setTimeout(() => {
        const kept = newGrid.filter((_, i) => !full.includes(i));
        while (kept.length < ROWS) kept.unshift(Array(COLS).fill(null));
        this.grid = kept; this.flashRows = [];
        const pts = SCORE_TABLE[full.length] * (this.level + 1);
        this.score += pts; this.lines += full.length;
        this.level = Math.min(10, Math.floor(this.lines / 10));
        this.cbs.onScore(this.score); this.cbs.onLines(this.lines); this.cbs.onLevel(this.level);
        this.locked = false; this.spawn();
      }, 200);
    } else {
      this.grid = newGrid; this.locked = false; this.spawn();
    }
  }

  private ghost(): Piece {
    const p = this.cur!; let dy = 0;
    while (this.valid(p, 0, dy + 1)) dy++;
    return { ...p, y: p.y + dy };
  }

  moveLeft()  { if (!this.cur || this.state !== 'playing' || this.locked) return; if (this.valid(this.cur, -1)) this.cur.x--; }
  moveRight() { if (!this.cur || this.state !== 'playing' || this.locked) return; if (this.valid(this.cur, 1)) this.cur.x++; }
  moveDown()  {
    if (!this.cur || this.state !== 'playing' || this.locked) return;
    if (this.valid(this.cur, 0, 1)) { this.cur.y++; this.lastDrop = performance.now(); } else this.lock();
  }
  hardDrop() {
    if (!this.cur || this.state !== 'playing' || this.locked) return;
    const g = this.ghost(); this.score += (g.y - this.cur.y) * 2;
    this.cbs.onScore(this.score); this.cur = g; this.lock();
  }
  rotate(dir: 1 | -1 = 1) {
    if (!this.cur || this.state !== 'playing' || this.locked) return;
    const p = this.cur; const nr = ((p.rot + dir) % 4 + 4) % 4;
    for (const dx of [0, -1, 1, -2, 2]) {
      if (this.valid(p, dx, 0, nr)) { this.cur = { ...p, rot: nr, x: p.x + dx }; return; }
    }
  }
  holdPiece() {
    if (!this.cur || this.holdUsed || this.state !== 'playing' || this.locked) return;
    const old = this.hold; this.hold = { type: this.cur.type, rot: 0, x: 3, y: -2 }; this.holdUsed = true;
    if (old) { this.cur = { ...old, x: 3, y: -2 }; if (!this.valid(this.cur, 0, 2)) { this.state = 'gameover'; this.cbs.onState('gameover'); } }
    else { this.cur = null; this.spawn(); }
  }

  update(now: number) {
    this.particles = this.particles.filter(p => p.life > 0);
    for (const p of this.particles) { p.x += p.vx; p.y += p.vy; p.vy += 0.18; p.life--; }
    if (this.flashTimer > 0) this.flashTimer--;
    if (this.state !== 'playing' || this.locked) return;
    if (now - this.lastDrop >= SPEEDS[this.level]) { this.moveDown(); }
  }

  private drawCell(ctx: CanvasRenderingContext2D, cx: number, cy: number, type: string, cs: number, alpha = 1) {
    const px = cx * cs, py = cy * cs;
    ctx.save(); ctx.globalAlpha = alpha;
    const g = ctx.createLinearGradient(px, py, px + cs, py + cs);
    g.addColorStop(0, PC[type]); g.addColorStop(1, PD[type]);
    ctx.fillStyle = g; ctx.shadowColor = PC[type]; ctx.shadowBlur = 8;
    rrect(ctx, px + 1, py + 1, cs - 2, cs - 2, 3); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,0.18)';
    rrect(ctx, px + 3, py + 3, cs - 6, 4, 2); ctx.fill();
    ctx.restore();
  }

  private drawMini(ctx: CanvasRenderingContext2D, p: Piece | null, w: number, h: number) {
    ctx.fillStyle = '#0a0a1a'; ctx.fillRect(0, 0, w, h);
    if (!p) return;
    const sh = SHAPES[p.type][0]; const cs = 18;
    let minR = 4, maxR = 0, minC = 4, maxC = 0;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (sh[r][c]) {
      minR = Math.min(minR, r); maxR = Math.max(maxR, r); minC = Math.min(minC, c); maxC = Math.max(maxC, c);
    }
    const pw = (maxC - minC + 1) * cs, ph = (maxR - minR + 1) * cs;
    const ox = (w - pw) / 2, oy = (h - ph) / 2;
    for (let r = minR; r <= maxR; r++) for (let c = minC; c <= maxC; c++) {
      if (!sh[r][c]) continue;
      const px = ox + (c - minC) * cs, py = oy + (r - minR) * cs;
      ctx.save();
      const g = ctx.createLinearGradient(px, py, px + cs, py + cs);
      g.addColorStop(0, PC[p.type]); g.addColorStop(1, PD[p.type]);
      ctx.fillStyle = g; ctx.shadowColor = PC[p.type]; ctx.shadowBlur = 5;
      rrect(ctx, px + 1, py + 1, cs - 2, cs - 2, 2); ctx.fill();
      ctx.restore();
    }
  }

  draw() {
    const ctx = this.ctx;
    ctx.fillStyle = '#080816'; ctx.fillRect(0, 0, CW, CH);
    ctx.strokeStyle = '#1a1a3a'; ctx.lineWidth = 0.5;
    for (let c = 0; c <= COLS; c++) { ctx.beginPath(); ctx.moveTo(c * CELL, 0); ctx.lineTo(c * CELL, CH); ctx.stroke(); }
    for (let r = 0; r <= ROWS; r++) { ctx.beginPath(); ctx.moveTo(0, r * CELL); ctx.lineTo(CW, r * CELL); ctx.stroke(); }

    for (let r = 0; r < ROWS; r++) {
      const fl = this.flashRows.includes(r);
      for (let c = 0; c < COLS; c++) {
        const cell = this.grid[r][c];
        if (!cell) continue;
        if (fl && this.flashTimer > 0) {
          ctx.save(); ctx.globalAlpha = 0.5 + Math.sin(this.flashTimer * 0.9) * 0.5;
          ctx.fillStyle = '#ffffff'; ctx.fillRect(c * CELL + 1, r * CELL + 1, CELL - 2, CELL - 2); ctx.restore();
        } else { this.drawCell(ctx, c, r, cell, CELL); }
      }
    }

    if (this.cur && this.state === 'playing') {
      const g = this.ghost(); const gsh = shape(g);
      ctx.save(); ctx.globalAlpha = 0.18; ctx.strokeStyle = PC[this.cur.type]; ctx.lineWidth = 1.5;
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        if (!gsh[r][c]) continue; const gy = g.y + r; if (gy < 0) continue;
        rrect(ctx, (g.x + c) * CELL + 2, gy * CELL + 2, CELL - 4, CELL - 4, 3); ctx.stroke();
      }
      ctx.restore();
      const csh = shape(this.cur);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        if (!csh[r][c]) continue; const cy = this.cur.y + r; if (cy < 0) continue;
        this.drawCell(ctx, this.cur.x + c, cy, this.cur.type, CELL);
      }
    }

    for (const p of this.particles) {
      ctx.save(); ctx.globalAlpha = Math.max(0, p.life / p.ml);
      ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }

    ctx.strokeStyle = '#3b82f655'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, CW - 2, CH - 2);
    this.drawMini(this.nextCtx, this.next, MINI_W, MINI_H);
    this.drawMini(this.holdCtx, this.hold, MINI_W, MINI_H);
  }

  destroy() { if (this.flashTimeout) clearTimeout(this.flashTimeout); }
}

// ── React component ────────────────────────────────────────────
import { HAPTIC, SFX, resumeAudio } from '../../utils/feedback';
interface Props { onBack: () => void; }

export default function TetrisGamePage({ onBack }: Props) {
  const cvRef   = useRef<HTMLCanvasElement>(null);
  const nextRef = useRef<HTMLCanvasElement>(null);
  const holdRef = useRef<HTMLCanvasElement>(null);
  const engRef  = useRef<TetrisEngine | null>(null);
  const rafRef  = useRef<number>(0);
  const [gs, setGs]       = useState<TState>('idle');
  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [level, setLevel] = useState(0);
  const [best, setBest]   = useState(() => { try { return +(localStorage.getItem('tetris_best') || '0'); } catch { return 0; } });

  const startGame   = useCallback(() => { resumeAudio(); SFX.gameStart(); HAPTIC.soft(); engRef.current?.start(); }, []);
  const togglePause = useCallback(() => { HAPTIC.tap(); engRef.current?.togglePause(); }, []);

  useEffect(() => {
    const eng = new TetrisEngine(cvRef.current!, nextRef.current!, holdRef.current!, {
      onScore: (s) => { setScore(s); setBest(prev => { if (s > prev) { localStorage.setItem('tetris_best', String(s)); SFX.newBest(); HAPTIC.success(); return s; } return prev; }); },
      onLines: (l) => { setLines(l); },
      onLevel: setLevel,
      onState: (s) => { setGs(s); if (s === 'gameover') { SFX.gameOver(); HAPTIC.fail(); } },
    });
    engRef.current = eng;
    const loop = (now: number) => { eng.update(now); eng.draw(); rafRef.current = requestAnimationFrame(loop); };
    rafRef.current = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(rafRef.current); eng.destroy(); };
  }, []);

  // Keyboard with DAS (delayed auto shift)
  useEffect(() => {
    type T = ReturnType<typeof setTimeout>;
    const tos: Record<string, T | null> = {};
    const ivs: Record<string, T | null> = {};
    const rep = (k: string, fn: () => void) => { fn(); tos[k] = setTimeout(() => { ivs[k] = setInterval(fn, 38); }, 165); };
    const stop = (k: string) => { clearTimeout(tos[k]!); clearInterval(ivs[k]!); tos[k] = ivs[k] = null; };

    const dn = (e: KeyboardEvent) => {
      const eng = engRef.current; if (!eng) return;
      const s = eng.getState();
      if ((e.key === 'Enter' || e.key === ' ') && (s === 'idle' || s === 'gameover')) { e.preventDefault(); startGame(); return; }
      if ((e.key === 'p' || e.key === 'P' || e.key === 'Escape') && (s === 'playing' || s === 'paused')) { e.preventDefault(); togglePause(); return; }
      if (s !== 'playing') return;
      e.preventDefault();
      if (e.key === 'ArrowLeft'  || e.key === 'a') rep('l', () => { eng.moveLeft(); SFX.tetMove(); });
      if (e.key === 'ArrowRight' || e.key === 'd') rep('r', () => { eng.moveRight(); SFX.tetMove(); });
      if (e.key === 'ArrowDown'  || e.key === 's') rep('dn', () => eng.moveDown());
      if (e.key === 'ArrowUp'    || e.key === 'w' || e.key === 'x') { eng.rotate(1); SFX.tetRotate(); }
      if (e.key === 'z') { eng.rotate(-1); SFX.tetRotate(); }
      if (e.key === ' ') { eng.hardDrop(); SFX.tetDrop(); }
      if (e.key === 'c' || e.key === 'Shift') { eng.holdPiece(); SFX.tetHold(); }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft'  || e.key === 'a') stop('l');
      if (e.key === 'ArrowRight' || e.key === 'd') stop('r');
      if (e.key === 'ArrowDown'  || e.key === 's') stop('dn');
    };
    window.addEventListener('keydown', dn); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); ['l','r','dn'].forEach(stop); };
  }, [startGame, togglePause]);

  // Touch swipe on canvas
  const ts = useRef<{ x: number; y: number; t: number } | null>(null);
  const onTS = (e: React.TouchEvent) => { resumeAudio(); const t = e.touches[0]; ts.current = { x: t.clientX, y: t.clientY, t: Date.now() }; };
  const onTE = (e: React.TouchEvent) => {
    if (!ts.current) return;
    const t = e.changedTouches[0]; const dx = t.clientX - ts.current.x; const dy = t.clientY - ts.current.y;
    const dist = Math.hypot(dx, dy); const dt = Date.now() - ts.current.t;
    const eng = engRef.current; if (!eng) return;
    const s = eng.getState();
    if (s === 'idle' || s === 'gameover') { if (dist < 25 && dt < 300) startGame(); ts.current = null; return; }
    if (s !== 'playing') { ts.current = null; return; }
    if (dist < 15 && dt < 200) { eng.rotate(1); SFX.tetRotate(); HAPTIC.tap(); }
    else if (Math.abs(dx) > Math.abs(dy)) { dx > 0 ? eng.moveRight() : eng.moveLeft(); HAPTIC.direction(); SFX.tetMove(); }
    else { if (dy > 0) { eng.hardDrop(); SFX.tetDrop(); HAPTIC.medium(); } else { eng.holdPiece(); SFX.tetHold(); HAPTIC.soft(); } }
    ts.current = null;
  };

  const A = '#3b82f6';
  const mBtn = (label: string, fn: () => void, h = 56, accent = false) => (
    <button onTouchStart={(e) => { e.preventDefault(); resumeAudio(); HAPTIC.direction(); fn(); }}
      className="flex items-center justify-center rounded-2xl text-xl font-bold active:scale-90 transition-transform select-none"
      style={{ background: accent ? `${A}22` : '#ffffff0f', border: `2px solid ${A}${accent ? '66' : '22'}`, color: A, height: h, touchAction: 'none' }}>
      {label}
    </button>
  );

  const overlay = (children: React.ReactNode) => (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-4"
      style={{ background: '#080816dd', backdropFilter: 'blur(6px)' }}>
      {children}
    </div>
  );

  return (
    <div className="flex flex-col items-center gap-3 p-3 w-full max-w-[420px] mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="flex items-center justify-center w-8 h-8 rounded-xl transition-all hover:scale-110 active:scale-95"
            style={{ background: '#ffffff08', border: '1px solid #ffffff15' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8888bb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <span className="text-2xl">🧱</span>
          <h1 className="text-xl font-bold tracking-wider" style={{ color: A, fontFamily: '"JetBrains Mono",monospace' }}>TETRIS</h1>
        </div>
        {gs === 'playing' && <button onClick={togglePause} className="rounded-lg px-3 py-1.5 text-sm font-medium hover:scale-105 active:scale-95 transition-all"
          style={{ color: '#8888aa', border: '1px solid #8888aa44', background: '#ffffff08' }}>⏸</button>}
      </div>

      {/* Game area */}
      <div className="flex gap-2 w-full justify-center">
        {/* Canvas */}
        <div className="relative rounded-2xl overflow-hidden"
          style={{ width: '68%', maxWidth: CW, aspectRatio: `${CW}/${CH}`, boxShadow: `0 0 30px ${A}22, 0 4px 24px rgba(0,0,0,0.6)` }}
          onTouchStart={onTS} onTouchEnd={onTE}>
          <canvas ref={cvRef} width={CW} height={CH} className="block w-full h-full object-contain" />
          {gs === 'idle' && overlay(<>
            <div className="text-5xl animate-bounce">🧱</div>
            <h2 className="text-3xl font-black tracking-wider" style={{ color: A, fontFamily: '"JetBrains Mono",monospace', textShadow: `0 0 20px ${A}66` }}>TETRIS</h2>
            <button onClick={startGame} className="rounded-2xl px-9 py-3.5 text-base font-bold tracking-wider hover:scale-110 active:scale-95 transition-all"
              style={{ background: `linear-gradient(135deg, ${A}, #60a5fa)`, color: '#fff', boxShadow: `0 0 30px ${A}44` }}>▶ PLAY</button>
            <p className="text-[10px] text-center leading-relaxed" style={{ color: '#8888aa' }}>← → move · ↑/X rotate · ↓ soft drop<br/>Space = hard drop · C = hold</p>
          </>)}
          {gs === 'paused' && overlay(<>
            <div className="text-5xl">⏸️</div>
            <h2 className="text-3xl font-black" style={{ color: '#e0e0ff', fontFamily: '"JetBrains Mono",monospace' }}>PAUSED</h2>
            <button onClick={togglePause} className="rounded-2xl px-9 py-3.5 text-base font-bold tracking-wider hover:scale-110 active:scale-95 transition-all"
              style={{ background: `linear-gradient(135deg, ${A}, #60a5fa)`, color: '#fff', boxShadow: `0 0 30px ${A}44` }}>▶ RESUME</button>
          </>)}
          {gs === 'gameover' && overlay(<>
            <div className="text-5xl">💀</div>
            <h2 className="text-3xl font-black" style={{ color: '#ff4466', fontFamily: '"JetBrains Mono",monospace', textShadow: '0 0 20px #ff446666' }}>GAME OVER</h2>
            <div className="rounded-xl px-6 py-3 text-center" style={{ background: '#ffffff08', border: '1px solid #ffffff15' }}>
              <p className="text-[10px] uppercase tracking-widest" style={{ color: '#8888aa' }}>Score</p>
              <p className="text-4xl font-black" style={{ color: score > 0 && score >= best ? '#ffd700' : A, fontFamily: '"JetBrains Mono",monospace' }}>{score}</p>
              {score > 0 && score >= best && <p className="text-xs mt-1" style={{ color: '#ffd700' }}>🎉 NEW BEST!</p>}
            </div>
            <button onClick={startGame} className="rounded-2xl px-9 py-3.5 text-base font-bold tracking-wider hover:scale-110 active:scale-95 transition-all"
              style={{ background: `linear-gradient(135deg, ${A}, #60a5fa)`, color: '#fff', boxShadow: `0 0 30px ${A}44` }}>🔄 RESTART</button>
          </>)}
        </div>

        {/* Side panel */}
        <div className="flex flex-col gap-2 flex-1 min-w-0" style={{ maxWidth: 120 }}>
          <div className="rounded-xl p-2.5" style={{ background: '#0f0f2a', border: '1px solid #1a1a3a' }}>
            <div className="text-[9px] uppercase tracking-widest" style={{ color: '#8888aa', fontFamily: '"JetBrains Mono",monospace' }}>Score</div>
            <div className="text-lg font-bold tabular-nums leading-tight" style={{ color: A, fontFamily: '"JetBrains Mono",monospace' }}>{score}</div>
            <div className="text-[9px] uppercase tracking-widest mt-1.5" style={{ color: '#8888aa', fontFamily: '"JetBrains Mono",monospace' }}>Best</div>
            <div className="text-base font-bold tabular-nums" style={{ color: '#ffd700', fontFamily: '"JetBrains Mono",monospace' }}>{best}</div>
          </div>
          <div className="rounded-xl p-2.5" style={{ background: '#0f0f2a', border: '1px solid #1a1a3a' }}>
            <div className="text-[9px] uppercase tracking-widest" style={{ color: '#8888aa', fontFamily: '"JetBrains Mono",monospace' }}>Lv</div>
            <div className="text-xl font-bold" style={{ color: '#e0e0ff', fontFamily: '"JetBrains Mono",monospace' }}>{level}</div>
            <div className="text-[9px] uppercase tracking-widest mt-1" style={{ color: '#8888aa', fontFamily: '"JetBrains Mono",monospace' }}>Lines</div>
            <div className="text-lg font-bold" style={{ color: '#e0e0ff', fontFamily: '"JetBrains Mono",monospace' }}>{lines}</div>
          </div>
          <div className="rounded-xl p-2" style={{ background: '#0f0f2a', border: '1px solid #1a1a3a' }}>
            <div className="text-[9px] uppercase tracking-widest text-center mb-1" style={{ color: '#8888aa', fontFamily: '"JetBrains Mono",monospace' }}>Next</div>
            <canvas ref={nextRef} width={MINI_W} height={MINI_H} className="block w-full rounded" />
          </div>
          <div className="rounded-xl p-2" style={{ background: '#0f0f2a', border: '1px solid #1a1a3a' }}>
            <div className="text-[9px] uppercase tracking-widest text-center mb-1" style={{ color: '#8888aa', fontFamily: '"JetBrains Mono",monospace' }}>Hold</div>
            <canvas ref={holdRef} width={MINI_W} height={MINI_H} className="block w-full rounded" />
          </div>
        </div>
      </div>

      {/* Mobile controls — large touch targets */}
      <div className="w-full grid grid-cols-5 gap-2 md:hidden">
        {mBtn('🤝', () => { engRef.current?.holdPiece(); SFX.tetHold(); })}
        {mBtn('←', () => { engRef.current?.moveLeft(); SFX.tetMove(); })}
        {mBtn('↺', () => { engRef.current?.rotate(1); SFX.tetRotate(); })}
        {mBtn('→', () => { engRef.current?.moveRight(); SFX.tetMove(); })}
        {mBtn('⬇', () => { engRef.current?.hardDrop(); SFX.tetDrop(); HAPTIC.medium(); }, 56, true)}
      </div>
      <button className="w-full rounded-2xl text-sm font-medium md:hidden active:scale-95 transition-transform select-none"
        style={{ background: '#ffffff08', border: '1px solid #ffffff15', color: '#8888aa', height: 44, touchAction: 'none' }}
        onTouchStart={(e) => { e.preventDefault(); resumeAudio(); HAPTIC.tap(); engRef.current?.moveDown(); }}>
        ↓ Soft Drop
      </button>
    </div>
  );
}
