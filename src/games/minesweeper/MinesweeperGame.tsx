import { useState, useCallback, useRef, useEffect } from 'react';
import { HAPTIC, SFX, resumeAudio } from '../../utils/feedback';

// ── Types ──────────────────────────────────────────────────────
type Difficulty = 'easy' | 'medium' | 'hard';
type CellState  = 'hidden' | 'revealed' | 'flagged';
interface Cell { mine: boolean; adj: number; state: CellState; }
type MState = 'idle' | 'playing' | 'won' | 'lost';

// ── Config ─────────────────────────────────────────────────────
const CONFIGS: Record<Difficulty, { rows: number; cols: number; mines: number; cell: number }> = {
  easy:   { rows: 9,  cols: 9,  mines: 10, cell: 34 },
  medium: { rows: 12, cols: 12, mines: 25, cell: 26 },
  hard:   { rows: 16, cols: 16, mines: 45, cell: 20 },
};

// ── Number colors (neon retro) ─────────────────────────────────
const NUM_COLORS = ['', '#3b82f6','#00ff88','#ff4466','#a78bfa','#f59e0b','#06b6d4','#ff8c00','#e0e0ff'];

// ── Helpers ────────────────────────────────────────────────────
function makeBlankGrid(rows: number, cols: number): Cell[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ mine: false, adj: 0, state: 'hidden' as CellState }))
  );
}

function placeMines(grid: Cell[][], rows: number, cols: number, mines: number, sx: number, sy: number) {
  const safe = new Set<string>();
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) safe.add(`${sy + dr},${sx + dc}`);
  let placed = 0;
  while (placed < mines) {
    const r = Math.floor(Math.random() * rows), c = Math.floor(Math.random() * cols);
    if (!grid[r][c].mine && !safe.has(`${r},${c}`)) { grid[r][c].mine = true; placed++; }
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (grid[r][c].mine) continue;
    let count = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc].mine) count++;
    }
    grid[r][c].adj = count;
  }
}

function reveal(grid: Cell[][], rows: number, cols: number, r: number, c: number): Cell[][] {
  const g = grid.map(row => row.map(cell => ({ ...cell })));
  const stack = [[r, c]];
  while (stack.length > 0) {
    const [cr, cc] = stack.pop()!;
    if (cr < 0 || cr >= rows || cc < 0 || cc >= cols) continue;
    const cell = g[cr][cc];
    if (cell.state === 'revealed' || cell.state === 'flagged') continue;
    cell.state = 'revealed';
    if (cell.adj === 0 && !cell.mine) {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) stack.push([cr + dr, cc + dc]);
    }
  }
  return g;
}

function countFlags(grid: Cell[][]): number {
  return grid.flat().filter(c => c.state === 'flagged').length;
}

function checkWin(grid: Cell[][]): boolean {
  return grid.flat().every(c => c.mine ? (c.state === 'flagged' || c.state === 'hidden') : c.state === 'revealed');
}

// ── Component ──────────────────────────────────────────────────
interface Props { onBack: () => void; }

export default function MinesweeperGamePage({ onBack }: Props) {
  const [diff, setDiff]   = useState<Difficulty>('easy');
  const [grid, setGrid]   = useState<Cell[][]>([]);
  const [ms, setMs]       = useState<MState>('idle');
  const [time, setTime]   = useState(0);
  const [firstClick, setFirstClick] = useState(true);
  const [revealAnim, setRevealAnim] = useState<Set<string>>(new Set());
  const [best, setBest]   = useState<Record<Difficulty, number>>(() => {
    try { return JSON.parse(localStorage.getItem('minesweeper_best') || '{}'); } catch { return {}; }
  });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cfg = CONFIGS[diff];

  const resetGame = useCallback((d: Difficulty = diff) => {
    const c = CONFIGS[d];
    setGrid(makeBlankGrid(c.rows, c.cols));
    setMs('idle'); setTime(0); setFirstClick(true); setRevealAnim(new Set());
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, [diff]);

  useEffect(() => { resetGame(diff); }, [diff]); // eslint-disable-line
  useEffect(() => { resetGame(); }, []); // eslint-disable-line

  const startTimer = useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => setTime(t => t + 1), 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const handleReveal = useCallback((r: number, c: number) => {
    if (ms === 'won' || ms === 'lost') return;
    resumeAudio();
    setGrid(prev => {
      if (prev[r]?.[c]?.state !== 'hidden') return prev;
      let g = prev.map(row => row.map(cell => ({ ...cell })));

      if (firstClick) {
        setFirstClick(false);
        placeMines(g, cfg.rows, cfg.cols, cfg.mines, c, r);
        setMs('playing'); startTimer();
      }

      if (g[r][c].mine) {
        // Reveal all mines
        const ng = g.map(row => row.map(cell => ({ ...cell, state: cell.mine ? 'revealed' as CellState : cell.state })));
        setMs('lost'); stopTimer();
        SFX.mineBoom(); HAPTIC.fail();
        return ng;
      }

      SFX.mineReveal(); HAPTIC.tap();
      const newKey = `${r},${c}`;
      setRevealAnim(prev => new Set([...prev, newKey]));
      setTimeout(() => setRevealAnim(prev => { const n = new Set(prev); n.delete(newKey); return n; }), 250);

      g = reveal(g, cfg.rows, cfg.cols, r, c);
      if (checkWin(g)) {
        setMs('won'); stopTimer();
        SFX.mineWin(); HAPTIC.success();
        const t2 = time;
        setBest(prev2 => {
          const nb = { ...prev2 };
          if (!nb[diff] || t2 < nb[diff]) { nb[diff] = t2; localStorage.setItem('minesweeper_best', JSON.stringify(nb)); }
          return nb;
        });
      }
      return g;
    });
  }, [ms, firstClick, cfg, startTimer, stopTimer, diff, time]);

  const handleFlag = useCallback((e: React.MouseEvent | null, r: number, c: number) => {
    if (e) e.preventDefault();
    if (ms === 'won' || ms === 'lost' || ms === 'idle') return;
    SFX.mineFlag(); HAPTIC.soft();
    setGrid(prev => {
      if (prev[r]?.[c]?.state === 'revealed') return prev;
      const g = prev.map(row => row.map(cell => ({ ...cell })));
      g[r][c].state = g[r][c].state === 'flagged' ? 'hidden' : 'flagged';
      return g;
    });
  }, [ms]);

  // Long press for mobile flagging
  const onTouchStartCell = (r: number, c: number) => {
    resumeAudio();
    longPressRef.current = setTimeout(() => { HAPTIC.medium(); handleFlag(null, r, c); longPressRef.current = null; }, 500);
  };
  const onTouchEndCell = (r: number, c: number) => {
    if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; handleReveal(r, c); }
  };
  const onTouchMoveCell = () => { if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; } };

  const flags = countFlags(grid);
  const remaining = cfg.mines - flags;
  const A = '#ef4444';

  const cellStyle = (cell: Cell, r: number, c: number) => {
    const key = `${r},${c}`;
    if (cell.state === 'revealed') {
      const isMine = cell.mine;
      return {
        base: `flex items-center justify-center font-bold select-none cursor-default`,
        style: {
          background: isMine ? '#3a0000' : '#0f0f2a',
          color: cell.adj > 0 ? NUM_COLORS[cell.adj] : 'transparent',
          border: `1px solid ${isMine ? '#ff4466' : '#0a0a20'}`,
          fontSize: cfg.cell < 24 ? 9 : cfg.cell < 28 ? 11 : 13,
          fontFamily: '"JetBrains Mono",monospace',
          animation: revealAnim.has(key) ? 'cell-reveal 0.18s ease-out' : 'none',
        },
      };
    }
    if (cell.state === 'flagged') {
      return {
        base: `flex items-center justify-center select-none cursor-pointer`,
        style: { background: '#1a0a0a', border: `1px solid ${A}55`, fontSize: cfg.cell < 24 ? 10 : 13 },
      };
    }
    return {
      base: `flex items-center justify-center select-none cursor-pointer active:scale-90 transition-transform`,
      style: { background: '#0d0d22', border: '1px solid #1a1a3a' },
    };
  };

  return (
    <div className="flex flex-col items-center gap-3 p-3 w-full mx-auto animate-fade-in" style={{ maxWidth: Math.min(cfg.cols * cfg.cell + 32, 420) }}>
      {/* Header */}
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="flex items-center justify-center w-8 h-8 rounded-xl hover:scale-110 active:scale-95 transition-all"
            style={{ background: '#ffffff08', border: '1px solid #ffffff15' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8888bb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <span className="text-2xl">💣</span>
          <h1 className="text-xl font-bold tracking-wider" style={{ color: A, fontFamily: '"JetBrains Mono",monospace' }}>MINES</h1>
        </div>
        {/* Difficulty tabs */}
        <div className="flex gap-1">
          {(['easy','medium','hard'] as Difficulty[]).map(d => (
            <button key={d} onClick={() => setDiff(d)}
              className="px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all hover:scale-105 active:scale-95"
              style={{ background: diff === d ? `${A}33` : '#ffffff08', color: diff === d ? A : '#8888aa', border: `1px solid ${diff === d ? A + '55' : '#ffffff15'}` }}>
              {d.slice(0, 3)}
            </button>
          ))}
        </div>
      </div>

      {/* HUD */}
      <div className="flex w-full items-center justify-between rounded-xl px-4 py-2.5" style={{ background: '#0f0f2a', border: `1px solid ${A}33` }}>
        <div className="flex items-center gap-1.5">
          <span className="text-base">💣</span>
          <span className="text-lg font-bold tabular-nums" style={{ color: A, fontFamily: '"JetBrains Mono",monospace' }}>{remaining}</span>
        </div>
        <div>
          <button onClick={() => resetGame(diff)} className="text-base px-3 py-1 rounded-lg hover:scale-110 active:scale-95 transition-all"
            style={{ background: '#ffffff08', border: `1px solid ${A}33` }}>
            {ms === 'won' ? '🎉' : ms === 'lost' ? '😵' : ms === 'playing' ? '😮' : '🙂'}
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-base">⏱️</span>
          <span className="text-lg font-bold tabular-nums" style={{ color: '#e0e0ff', fontFamily: '"JetBrains Mono",monospace' }}>{time}</span>
        </div>
      </div>

      {/* Best times */}
      {Object.keys(best).length > 0 && (
        <div className="flex gap-3 w-full text-center">
          {(['easy','medium','hard'] as Difficulty[]).map(d => best[d] ? (
            <div key={d} className="flex-1 rounded-lg py-1" style={{ background: '#ffffff05', border: '1px solid #1a1a3a' }}>
              <div className="text-[8px] uppercase tracking-widest" style={{ color: '#555580' }}>{d.slice(0,3)}</div>
              <div className="text-xs font-bold" style={{ color: '#ffd700', fontFamily: '"JetBrains Mono",monospace' }}>{best[d]}s</div>
            </div>
          ) : null)}
        </div>
      )}

      {/* Game board */}
      <div className="relative rounded-2xl overflow-hidden p-2" style={{ background: '#080816', border: `1px solid ${A}22`, boxShadow: `0 0 20px ${A}11` }}>
        {grid.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cfg.cols}, ${cfg.cell}px)`, gap: '1px' }}>
            {grid.map((row, r) => row.map((cell, c) => {
              const cs = cellStyle(cell, r, c);
              return (
                <div key={`${r},${c}`} className={cs.base}
                  style={{ width: cfg.cell, height: cfg.cell, borderRadius: 3, ...cs.style }}
                  onClick={() => handleReveal(r, c)}
                  onContextMenu={(e) => handleFlag(e, r, c)}
                  onTouchStart={() => onTouchStartCell(r, c)}
                  onTouchEnd={() => onTouchEndCell(r, c)}
                  onTouchMove={onTouchMoveCell}>
                  {cell.state === 'revealed' && cell.mine && '💥'}
                  {cell.state === 'revealed' && !cell.mine && cell.adj > 0 && cell.adj}
                  {cell.state === 'flagged' && '🚩'}
                </div>
              );
            }))}
          </div>
        )}

        {/* Game over overlay */}
        {(ms === 'won' || ms === 'lost') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl"
            style={{ background: '#080816cc', backdropFilter: 'blur(6px)' }}>
            <div className="text-5xl">{ms === 'won' ? '🎉' : '💥'}</div>
            <h2 className="text-2xl font-black tracking-wider" style={{
              color: ms === 'won' ? '#00ff88' : '#ff4466', fontFamily: '"JetBrains Mono",monospace',
              textShadow: `0 0 20px ${ms === 'won' ? '#00ff8866' : '#ff446666'}`,
            }}>{ms === 'won' ? 'YOU WIN!' : 'BOOM!'}</h2>
            {ms === 'won' && <p className="text-sm" style={{ color: '#ffd700', fontFamily: '"JetBrains Mono",monospace' }}>⏱ {time}s {best[diff] === time ? '— NEW BEST! 🏆' : ''}</p>}
            <button onClick={() => resetGame(diff)}
              className="rounded-2xl px-8 py-3 text-base font-bold tracking-wider hover:scale-110 active:scale-95 transition-all"
              style={{ background: `linear-gradient(135deg, ${A}, #f87171)`, color: '#fff', boxShadow: `0 0 30px ${A}44` }}>
              🔄 PLAY AGAIN
            </button>
          </div>
        )}

        {/* Start hint */}
        {ms === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none rounded-2xl"
            style={{ background: '#080816aa', backdropFilter: 'blur(2px)' }}>
            <p className="text-sm font-bold" style={{ color: A, fontFamily: '"JetBrains Mono",monospace' }}>💣 Click any cell to start!</p>
            <p className="text-[10px] text-center" style={{ color: '#8888aa' }}>Right-click / long-press to flag</p>
          </div>
        )}
      </div>

      <p className="text-[10px]" style={{ color: '#555580' }}>
        Click to reveal · Right-click / long-press to flag 🚩
      </p>
    </div>
  );
}
