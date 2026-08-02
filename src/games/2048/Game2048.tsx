import { useState, useCallback, useEffect, useRef } from 'react';
import { HAPTIC, SFX, resumeAudio } from '../../utils/feedback';

// ── Types & constants ──────────────────────────────────────────
type Grid = (number | null)[][];
type Dir = 'up' | 'down' | 'left' | 'right';
type G2State = 'idle' | 'playing' | 'won' | 'lost';

// Tile color themes (neon dark)
const TILE_STYLES: Record<number, { bg: string; text: string; shadow: string }> = {
  0:    { bg: '#0d0d22', text: 'transparent',  shadow: 'none' },
  2:    { bg: '#1a1a3a', text: '#a0a0cc',       shadow: '#3b82f622' },
  4:    { bg: '#1e1e44', text: '#c0c0dd',       shadow: '#3b82f633' },
  8:    { bg: '#1a2a1a', text: '#00ff88',       shadow: '#00ff8844' },
  16:   { bg: '#1c3020', text: '#00ff88',       shadow: '#00ff8866' },
  32:   { bg: '#2a1a10', text: '#ff8c00',       shadow: '#ff8c0055' },
  64:   { bg: '#3a1510', text: '#ff4466',       shadow: '#ff446666' },
  128:  { bg: '#2a2200', text: '#ffd700',       shadow: '#ffd70066' },
  256:  { bg: '#2a2800', text: '#ffe44d',       shadow: '#ffd70088' },
  512:  { bg: '#0e2a2a', text: '#00e5ff',       shadow: '#00e5ff66' },
  1024: { bg: '#1a1030', text: '#c084fc',       shadow: '#c084fc66' },
  2048: { bg: '#1e0a2e', text: '#e879f9',       shadow: '#e879f988' },
};

const getTileStyle = (v: number | null) => {
  if (!v) return TILE_STYLES[0];
  return TILE_STYLES[v] ?? { bg: '#0a0020', text: '#f5f0ff', shadow: '#ffffff55' };
};

// ── Grid logic ─────────────────────────────────────────────────
const mkGrid = (): Grid => Array.from({ length: 4 }, () => Array(4).fill(null));

function addTile(g: Grid): Grid {
  const empty: [number, number][] = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (!g[r][c]) empty.push([r, c]);
  if (!empty.length) return g;
  const ng = g.map(row => [...row]);
  const [r, c] = empty[Math.floor(Math.random() * empty.length)];
  ng[r][c] = Math.random() < 0.85 ? 2 : 4;
  return ng;
}

interface MoveResult { grid: Grid; score: number; moved: boolean; mergedAt: Set<string>; }

function slideRow(row: (number | null)[]): { row: (number | null)[]; score: number; mergedAt: number[] } {
  const vals = row.filter(v => v !== null) as number[];
  let score = 0; const mergedAt: number[] = [];
  for (let i = 0; i < vals.length - 1; i++) {
    if (vals[i] === vals[i + 1]) {
      vals[i] *= 2; score += vals[i]; mergedAt.push(i); vals.splice(i + 1, 1);
    }
  }
  while (vals.length < 4) vals.push(null as unknown as number);
  return { row: vals as (number | null)[], score, mergedAt };
}

function moveGrid(g: Grid, dir: Dir): MoveResult {
  let score = 0; let moved = false;
  const mergedAt = new Set<string>();
  const ng = g.map(r => [...r]) as Grid;

  const processRow = (row: (number | null)[], rIdx: number, reverse: boolean) => {
    const orig = [...row];
    const { row: slid, score: s, mergedAt: ma } = slideRow(reverse ? [...row].reverse() : row);
    const final = reverse ? [...slid].reverse() : slid;
    for (let c = 0; c < 4; c++) {
      if (orig[c] !== final[c]) moved = true;
    }
    for (const mi of ma) {
      const ci = reverse ? 3 - mi : mi;
      mergedAt.add(`${rIdx},${ci}`);
    }
    score += s;
    return final;
  };

  if (dir === 'left') {
    for (let r = 0; r < 4; r++) ng[r] = processRow(ng[r], r, false);
  } else if (dir === 'right') {
    for (let r = 0; r < 4; r++) ng[r] = processRow(ng[r], r, true);
  } else if (dir === 'up') {
    for (let c = 0; c < 4; c++) {
      const col = ng.map(r => r[c]);
      const { row: slid, score: s, mergedAt: ma } = slideRow(col);
      for (let r = 0; r < 4; r++) { if (ng[r][c] !== slid[r]) moved = true; ng[r][c] = slid[r]; }
      for (const mi of ma) mergedAt.add(`${mi},${c}`);
      score += s;
    }
  } else { // down
    for (let c = 0; c < 4; c++) {
      const col = ng.map(r => r[c]).reverse();
      const { row: slid, score: s, mergedAt: ma } = slideRow(col);
      const final = [...slid].reverse();
      for (let r = 0; r < 4; r++) { if (ng[r][c] !== final[r]) moved = true; ng[r][c] = final[r]; }
      for (const mi of ma) mergedAt.add(`${3 - mi},${c}`);
      score += s;
    }
  }
  return { grid: ng, score, moved, mergedAt };
}

function hasWon(g: Grid): boolean { return g.flat().some(v => v === 2048); }
function canMove(g: Grid): boolean {
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    if (!g[r][c]) return true;
    if (c < 3 && g[r][c] === g[r][c + 1]) return true;
    if (r < 3 && g[r][c] === g[r + 1][c]) return true;
  }
  return false;
}

// ── Component ──────────────────────────────────────────────────
interface Props { onBack: () => void; }

export default function Game2048Page({ onBack }: Props) {
  const [grid, setGrid]   = useState<Grid>(mkGrid());
  const [gs, setGs]       = useState<G2State>('idle');
  const [score, setScore] = useState(0);
  const [wonShown, setWonShown] = useState(false);
  const [mergedCells, setMergedCells] = useState<Set<string>>(new Set());
  const [newCells, setNewCells] = useState<Set<string>>(new Set());
  const [best, setBest]   = useState(() => { try { return +(localStorage.getItem('game2048_best') || '0'); } catch { return 0; } });
  const touchRef = useRef<{ x: number; y: number } | null>(null);

  const startGame = useCallback(() => {
    resumeAudio();
    SFX.gameStart(); HAPTIC.soft();
    let g = mkGrid(); g = addTile(g); g = addTile(g);
    setGrid(g); setScore(0); setGs('playing'); setWonShown(false); setMergedCells(new Set()); setNewCells(new Set());
  }, []);

  const doMove = useCallback((dir: Dir) => {
    setGrid(prev => {
      if (gs !== 'playing') return prev;
      const { grid: ng, score: pts, moved, mergedAt } = moveGrid(prev, dir);
      if (!moved) { SFX.tileNoMove(); return prev; }
      const withNew = addTile(ng);
      const nc = new Set<string>();
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        if (withNew[r][c] && !ng[r][c]) nc.add(`${r},${c}`);
      }
      setMergedCells(mergedAt);
      setNewCells(nc);
      setTimeout(() => { setMergedCells(new Set()); setNewCells(new Set()); }, 180);

      if (mergedAt.size > 0) { SFX.tileMerge(); HAPTIC.tap(); } else { SFX.tileMove(); }

      const newScore = score + pts;
      setScore(newScore);
      setBest(p => { if (newScore > p) { localStorage.setItem('game2048_best', String(newScore)); SFX.newBest(); HAPTIC.success(); return newScore; } return p; });

      if (hasWon(withNew) && !wonShown) { setGs('won'); setWonShown(true); SFX.tile2048(); HAPTIC.hard(); }
      else if (!canMove(withNew)) { setGs('lost'); SFX.gameOver(); HAPTIC.fail(); }

      return withNew;
    });
  }, [gs, score, wonShown]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, Dir> = { ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right', w:'up', s:'down', a:'left', d:'right' };
      if (map[e.key]) { e.preventDefault(); doMove(map[e.key]); }
      if ((e.key === 'Enter' || e.key === ' ') && (gs === 'idle' || gs === 'lost')) startGame();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doMove, gs, startGame]);

  // Touch/swipe
  const onTS = (e: React.TouchEvent) => { resumeAudio(); const t = e.touches[0]; touchRef.current = { x: t.clientX, y: t.clientY }; };
  const onTE = (e: React.TouchEvent) => {
    if (!touchRef.current) return;
    const t = e.changedTouches[0]; const dx = t.clientX - touchRef.current.x; const dy = t.clientY - touchRef.current.y;
    if (Math.hypot(dx, dy) < 20) { touchRef.current = null; return; }
    HAPTIC.direction();
    if (Math.abs(dx) > Math.abs(dy)) doMove(dx > 0 ? 'right' : 'left');
    else doMove(dy > 0 ? 'down' : 'up');
    touchRef.current = null;
  };

  const A = '#a78bfa';
  const CELL_SIZE = 80;
  const GAP = 8;

  const fontSize = (v: number | null) => {
    if (!v) return 24;
    if (v >= 1024) return 16;
    if (v >= 128) return 20;
    return 24;
  };

  const overlay = (children: React.ReactNode) => (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-2xl"
      style={{ background: '#080816dd', backdropFilter: 'blur(8px)' }}>{children}</div>
  );

  return (
    <div className="flex flex-col items-center gap-3 p-3 w-full max-w-[420px] mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="flex items-center justify-center w-8 h-8 rounded-xl hover:scale-110 active:scale-95 transition-all"
            style={{ background: '#ffffff08', border: '1px solid #ffffff15' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8888bb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <span className="text-2xl">🔢</span>
          <h1 className="text-xl font-bold tracking-wider" style={{ color: A, fontFamily: '"JetBrains Mono",monospace' }}>2048</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[9px] uppercase tracking-widest" style={{ color: '#8888aa' }}>Score</div>
            <div className="text-xl font-bold tabular-nums" style={{ color: A, fontFamily: '"JetBrains Mono",monospace' }}>{score}</div>
          </div>
          <div className="text-right">
            <div className="text-[9px] uppercase tracking-widest" style={{ color: '#8888aa' }}>Best</div>
            <div className="text-xl font-bold tabular-nums" style={{ color: '#ffd700', fontFamily: '"JetBrains Mono",monospace' }}>{best}</div>
          </div>
          {gs === 'playing' && (
            <button onClick={startGame} className="rounded-lg px-2.5 py-1.5 text-xs font-bold hover:scale-105 active:scale-95 transition-all"
              style={{ color: '#8888aa', border: '1px solid #8888aa33', background: '#ffffff08' }}>NEW</button>
          )}
        </div>
      </div>

      {/* Board */}
      <div className="relative rounded-2xl p-2 select-none mx-auto w-full max-w-[400px]"
        style={{
          background: '#0a0a1a', border: `1px solid ${A}33`,
          boxShadow: `0 0 30px ${A}11, 0 4px 24px rgba(0,0,0,0.6)`,
          aspectRatio: '1/1'
        }}
        onTouchStart={onTS} onTouchEnd={onTE}>

        {/* Grid */}
        <div className="w-full h-full" style={{ display: 'grid', gridTemplateColumns: `repeat(4, 1fr)`, gap: '2%', padding: '1%' }}>
          {grid.map((row, r) => row.map((val, c) => {
            const key = `${r},${c}`;
            const ts = getTileStyle(val);
            const isMerged = mergedCells.has(key);
            const isNew = newCells.has(key);
            return (
              <div key={key}
                className={isNew ? 'animate-tile-appear' : isMerged ? 'animate-tile-merge' : ''}
                style={{
                  width: '100%', height: '100%',
                  background: ts.bg, borderRadius: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: fontSize(val), fontWeight: 900,
                  color: ts.text,
                  fontFamily: '"JetBrains Mono",monospace',
                  boxShadow: val ? `0 0 12px ${ts.shadow}, inset 0 0 8px rgba(255,255,255,0.03)` : 'none',
                  border: val ? `1px solid ${ts.text}22` : '1px solid #1a1a3a',
                  transition: 'background 0.12s, box-shadow 0.12s',
                  textShadow: val && val >= 64 ? `0 0 12px ${ts.text}88` : 'none',
                }}>
                {val}
              </div>
            );
          }))}
        </div>

        {/* Overlays */}
        {gs === 'idle' && overlay(<>
          <div className="text-6xl animate-bounce">🔢</div>
          <h2 className="text-3xl font-black tracking-wider" style={{ color: A, fontFamily: '"JetBrains Mono",monospace', textShadow: `0 0 20px ${A}66` }}>2048</h2>
          <p className="text-sm text-center" style={{ color: '#8888aa' }}>Merge tiles to reach <strong style={{ color: A }}>2048!</strong></p>
          <button onClick={startGame} className="rounded-2xl px-10 py-4 text-lg font-bold tracking-wider hover:scale-110 active:scale-95 transition-all"
            style={{ background: `linear-gradient(135deg, ${A}, #7c3aed)`, color: '#fff', boxShadow: `0 0 30px ${A}44` }}>▶ PLAY</button>
        </>)}

        {gs === 'won' && overlay(<>
          <div className="text-5xl">🏆</div>
          <h2 className="text-3xl font-black tracking-wider" style={{ color: '#ffd700', fontFamily: '"JetBrains Mono",monospace', textShadow: '0 0 20px #ffd70066' }}>2048!</h2>
          <p className="text-sm" style={{ color: '#e0e0ff' }}>You reached 2048! 🎉</p>
          <div className="flex gap-3">
            <button onClick={() => setGs('playing')} className="rounded-xl px-5 py-2.5 text-sm font-bold hover:scale-110 active:scale-95 transition-all"
              style={{ background: '#ffffff15', color: '#e0e0ff', border: '1px solid #ffffff22' }}>Keep Going</button>
            <button onClick={startGame} className="rounded-xl px-5 py-2.5 text-sm font-bold hover:scale-110 active:scale-95 transition-all"
              style={{ background: `linear-gradient(135deg, #ffd700, ${A})`, color: '#000' }}>New Game</button>
          </div>
        </>)}

        {gs === 'lost' && overlay(<>
          <div className="text-5xl">😢</div>
          <h2 className="text-3xl font-black" style={{ color: '#ff4466', fontFamily: '"JetBrains Mono",monospace', textShadow: '0 0 20px #ff446666' }}>NO MOVES!</h2>
          <div className="rounded-xl px-6 py-3 text-center" style={{ background: '#ffffff08', border: '1px solid #ffffff15' }}>
            <p className="text-[10px] uppercase tracking-widest" style={{ color: '#8888aa' }}>Final Score</p>
            <p className="text-4xl font-black" style={{ color: score >= best && score > 0 ? '#ffd700' : A, fontFamily: '"JetBrains Mono",monospace' }}>{score}</p>
            {score > 0 && score >= best && <p className="text-xs mt-1" style={{ color: '#ffd700' }}>🎉 NEW BEST!</p>}
          </div>
          <button onClick={startGame} className="rounded-2xl px-9 py-3.5 text-base font-bold hover:scale-110 active:scale-95 transition-all"
            style={{ background: `linear-gradient(135deg, ${A}, #7c3aed)`, color: '#fff', boxShadow: `0 0 30px ${A}44` }}>🔄 TRY AGAIN</button>
        </>)}
      </div>

      {/* Arrow controls for mobile */}
      <div className="grid grid-cols-3 gap-2 mt-1 md:hidden" style={{ width: 180 }}>
        <div />
        <button onTouchStart={(e) => { e.preventDefault(); resumeAudio(); HAPTIC.direction(); doMove('up'); }}
          className="flex items-center justify-center rounded-2xl text-2xl active:scale-90 transition-transform select-none"
          style={{ background: '#ffffff0f', border: `2px solid ${A}33`, color: A, height: 60, touchAction: 'none' }}>↑</button>
        <div />
        <button onTouchStart={(e) => { e.preventDefault(); resumeAudio(); HAPTIC.direction(); doMove('left'); }}
          className="flex items-center justify-center rounded-2xl text-2xl active:scale-90 transition-transform select-none"
          style={{ background: '#ffffff0f', border: `2px solid ${A}33`, color: A, height: 60, touchAction: 'none' }}>←</button>
        <button onTouchStart={(e) => { e.preventDefault(); resumeAudio(); HAPTIC.direction(); doMove('down'); }}
          className="flex items-center justify-center rounded-2xl text-2xl active:scale-90 transition-transform select-none"
          style={{ background: '#ffffff0f', border: `2px solid ${A}33`, color: A, height: 60, touchAction: 'none' }}>↓</button>
        <button onTouchStart={(e) => { e.preventDefault(); resumeAudio(); HAPTIC.direction(); doMove('right'); }}
          className="flex items-center justify-center rounded-2xl text-2xl active:scale-90 transition-transform select-none"
          style={{ background: '#ffffff0f', border: `2px solid ${A}33`, color: A, height: 60, touchAction: 'none' }}>→</button>
      </div>

      <p className="text-[10px]" style={{ color: '#555580' }}>
        Swipe or use arrow keys to merge tiles · Reach 2048!
      </p>
    </div>
  );
}
