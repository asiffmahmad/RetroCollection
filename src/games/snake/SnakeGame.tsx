import { useEffect, useRef, useState, useCallback } from 'react';
import { SnakeGame, GameState } from '../../game/engine';
import { CANVAS_SIZE, Direction, COLORS } from '../../game/constants';
import { getHighScores, saveHighScore, getTopScore, HighScoreEntry } from '../../game/highscores';
import { HAPTIC, SFX, resumeAudio } from '../../utils/feedback';
import DPad, { DPadDirection } from '../../components/DPad';

interface SnakeGamePageProps {
  onBack: () => void;
}

export default function SnakeGamePage({ onBack }: SnakeGamePageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<SnakeGame | null>(null);
  const rafRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const [gameState, setGameState] = useState<GameState>('start');
  const [score, setScore] = useState(0);
  const [highScores, setHighScores] = useState<HighScoreEntry[]>(getHighScores());
  const [topScore, setTopScore] = useState(getTopScore());
  const [showHighScores, setShowHighScores] = useState(false);
  const [newHighScoreFlash, setNewHighScoreFlash] = useState(false);

  const startGame = useCallback(() => {
    resumeAudio();
    const game = gameRef.current;
    if (game) {
      game.setBestScore(topScore);
      game.start();
      SFX.gameStart();
      setNewHighScoreFlash(false);
      setShowHighScores(false);
    }
  }, [topScore]);

  const handleStateChange = useCallback((state: GameState) => {
    setGameState(state);
    if (state === 'gameover') {
      SFX.snakeDie();
      HAPTIC.fail();
      const game = gameRef.current;
      if (game) {
        const finalScore = game.getScore();
        saveHighScore(finalScore);
        setHighScores(getHighScores());
        setTopScore(getTopScore());
      }
    }
  }, []);

  const handleHighScore = useCallback(() => {
    setNewHighScoreFlash(true);
    SFX.newBest();
    HAPTIC.success();
    setTimeout(() => setNewHighScoreFlash(false), 2000);
  }, []);

  // Init canvas game
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const game = new SnakeGame(canvas, {
      onScoreChange: setScore,
      onStateChange: handleStateChange,
      onHighScore: handleHighScore,
    });
    gameRef.current = game;

    const loop = (now: number) => {
      game.update(now);
      game.draw();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      game.destroy();
    };
  }, [handleStateChange, handleHighScore]);

  // Keyboard
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const game = gameRef.current;
      if (!game) return;
      const state = game.getState();

      const dirMap: Record<string, Direction> = {
        ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
        w: 'UP', s: 'DOWN', a: 'LEFT', d: 'RIGHT',
        W: 'UP', S: 'DOWN', A: 'LEFT', D: 'RIGHT',
      };

      if (dirMap[e.key]) {
        e.preventDefault();
        if (state === 'playing') { game.setDirection(dirMap[e.key]); SFX.snakeMove(); }
      }

      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (state === 'start' || state === 'gameover') startGame();
        else if (state === 'playing' || state === 'paused') game.togglePause();
      }

      if (e.key === 'Escape') {
        if (state === 'playing' || state === 'paused') game.togglePause();
        else if (state === 'start') onBack();
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [startGame, onBack]);

  const handleDPadMove = useCallback((dir: DPadDirection) => {
    resumeAudio();
    const game = gameRef.current;
    if (!game || game.getState() !== 'playing') return;
    
    if (dir === 'UP') game.setDirection('UP');
    else if (dir === 'DOWN') game.setDirection('DOWN');
    else if (dir === 'LEFT') game.setDirection('LEFT');
    else if (dir === 'RIGHT') game.setDirection('RIGHT');
    SFX.snakeMove();
  }, []);

  // Touch / Swipe on the canvas container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let touchStartX = 0, touchStartY = 0, touchStartTime = 0;

    const handleTouchStart = (e: TouchEvent) => {
      resumeAudio();
      const t = e.touches[0];
      touchStartX = t.clientX;
      touchStartY = t.clientY;
      touchStartTime = Date.now();
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const game = gameRef.current;
      if (!game) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStartX;
      const dy = t.clientY - touchStartY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const elapsed = Date.now() - touchStartTime;
      const state = game.getState();

      if (dist < 20 && elapsed < 300) {
        if (state === 'start' || state === 'gameover') {
          e.preventDefault();
          startGame();
          return;
        }
      }
      if (dist > 25 && state === 'playing') {
        e.preventDefault();
        if (Math.abs(dx) > Math.abs(dy)) game.setDirection(dx > 0 ? 'RIGHT' : 'LEFT');
        else game.setDirection(dy > 0 ? 'DOWN' : 'UP');
        HAPTIC.direction();
        SFX.snakeMove();
      }
    };

    const handleTouchMove = (e: TouchEvent) => e.preventDefault();

    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchmove', handleTouchMove);
    };
  }, [startGame]);

  const medalColor = (i: number) =>
    i === 0 ? COLORS.gold : i === 1 ? COLORS.silver : i === 2 ? COLORS.bronze : COLORS.textDim;
  const medalEmoji = (i: number) =>
    i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;

  return (
    <div className="flex flex-col items-center gap-3 sm:gap-4 p-3 sm:p-4 w-full max-w-[540px] mx-auto animate-fade-in">

      {/* ── Header ── */}
      <div className="flex w-full items-center justify-between" style={{ maxWidth: CANVAS_SIZE }}>
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => {
              const game = gameRef.current;
              if (game && game.getState() === 'playing') game.pause();
              onBack();
            }}
            className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-xl transition-all hover:scale-110 active:scale-95"
            style={{ background: '#ffffff08', border: '1px solid #ffffff15' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8888bb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <span className="text-xl sm:text-2xl">🐍</span>
          <h1
            className="text-lg sm:text-xl font-bold tracking-wider"
            style={{ color: COLORS.accent, fontFamily: '"JetBrains Mono", monospace' }}
          >
            SNAKE
          </h1>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          {gameState === 'playing' && (
            <button
              onClick={() => gameRef.current?.togglePause()}
              className="rounded-lg px-2.5 py-1 sm:px-3 sm:py-1.5 text-sm font-medium transition-all hover:scale-105 active:scale-95"
              style={{ color: COLORS.textDim, border: `1px solid ${COLORS.textDim}44`, background: '#ffffff08' }}
            >
              ⏸
            </button>
          )}
          <button
            onClick={() => setShowHighScores(!showHighScores)}
            className="rounded-lg px-2.5 py-1 sm:px-3 sm:py-1.5 text-sm font-medium transition-all hover:scale-105 active:scale-95"
            style={{ color: COLORS.gold, border: `1px solid ${COLORS.gold}44`, background: '#ffffff08' }}
          >
            🏆
          </button>
        </div>
      </div>

      {/* ── Score bar ── */}
      <div
        className="flex w-full items-center justify-between rounded-xl px-4 py-2 sm:px-5 sm:py-2.5"
        style={{ maxWidth: CANVAS_SIZE, background: '#0f0f2a', border: `1px solid ${COLORS.accentDim}` }}
      >
        <div className="flex flex-col">
          <span className="text-[9px] sm:text-[10px] uppercase tracking-widest" style={{ color: COLORS.textDim }}>
            Score
          </span>
          <span
            className="text-xl sm:text-2xl font-bold tabular-nums"
            style={{
              color: newHighScoreFlash ? COLORS.gold : COLORS.accent,
              fontFamily: '"JetBrains Mono", monospace',
              transition: 'color 0.3s, transform 0.3s',
              transform: newHighScoreFlash ? 'scale(1.15)' : 'scale(1)',
              display: 'inline-block',
            }}
          >
            {score}
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[9px] sm:text-[10px] uppercase tracking-widest" style={{ color: COLORS.textDim }}>
            Best
          </span>
          <span
            className="text-xl sm:text-2xl font-bold tabular-nums"
            style={{ color: COLORS.gold, fontFamily: '"JetBrains Mono", monospace' }}
          >
            {topScore}
          </span>
        </div>
      </div>

      {/* ── Canvas ── */}
      <div
        className="relative rounded-2xl overflow-hidden w-full aspect-square max-w-[450px]"
        style={{
          boxShadow: `0 0 40px ${COLORS.accent}22, 0 4px 24px rgba(0,0,0,0.4)`,
        }}
        ref={containerRef}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          className="block w-full h-full object-contain"
        />

        {/* Start overlay */}
        {gameState === 'start' && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 sm:gap-5 px-4"
            style={{ background: COLORS.overlay, backdropFilter: 'blur(4px)' }}
          >
            <div className="text-5xl sm:text-6xl animate-bounce">🐍</div>
            <h2
              className="text-3xl sm:text-4xl font-black tracking-wider"
              style={{
                color: COLORS.accent,
                fontFamily: '"JetBrains Mono", monospace',
                textShadow: `0 0 20px ${COLORS.accent}66`,
              }}
            >
              SNAKE
            </h2>
            <p className="text-xs sm:text-sm" style={{ color: COLORS.textDim }}>Arcade Edition</p>
            <button
              onClick={startGame}
              className="rounded-2xl px-8 py-3 sm:px-10 sm:py-4 text-base sm:text-lg font-bold tracking-wider transition-all hover:scale-110 active:scale-95"
              style={{
                background: `linear-gradient(135deg, ${COLORS.accent}, #00cc6a)`,
                color: '#000',
                boxShadow: `0 0 30px ${COLORS.accent}44`,
              }}
            >
              ▶ PLAY
            </button>
            <div className="flex flex-col items-center gap-0.5 sm:gap-1">
              <p className="text-[10px] sm:text-xs" style={{ color: COLORS.textDim }}>
                ⌨️ Arrow keys / WASD · 📱 Swipe
              </p>
              <p className="text-[10px] sm:text-xs" style={{ color: COLORS.textDim }}>
                Space to pause
              </p>
            </div>
          </div>
        )}

        {/* Paused */}
        {gameState === 'paused' && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 sm:gap-4 px-4"
            style={{ background: COLORS.overlay, backdropFilter: 'blur(4px)' }}
          >
            <div className="text-4xl sm:text-5xl">⏸️</div>
            <h2
              className="text-2xl sm:text-3xl font-black tracking-wider"
              style={{ color: COLORS.text, fontFamily: '"JetBrains Mono", monospace' }}
            >
              PAUSED
            </h2>
            <button
              onClick={() => gameRef.current?.resume()}
              className="mt-2 rounded-2xl px-7 py-2.5 sm:px-8 sm:py-3 text-base sm:text-lg font-bold tracking-wider transition-all hover:scale-110 active:scale-95"
              style={{
                background: `linear-gradient(135deg, ${COLORS.accent}, #00cc6a)`,
                color: '#000',
                boxShadow: `0 0 30px ${COLORS.accent}44`,
              }}
            >
              ▶ RESUME
            </button>
            <p className="text-[10px] sm:text-xs mt-1" style={{ color: COLORS.textDim }}>
              Press Space or Esc
            </p>
          </div>
        )}

        {/* Game over */}
        {gameState === 'gameover' && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 sm:gap-3 px-4"
            style={{ background: COLORS.overlay, backdropFilter: 'blur(4px)' }}
          >
            <div className="text-4xl sm:text-5xl">💀</div>
            <h2
              className="text-2xl sm:text-3xl font-black tracking-wider"
              style={{
                color: COLORS.danger,
                fontFamily: '"JetBrains Mono", monospace',
                textShadow: `0 0 20px ${COLORS.danger}66`,
              }}
            >
              GAME OVER
            </h2>
            <div
              className="rounded-xl px-5 py-2.5 sm:px-6 sm:py-3 text-center"
              style={{ background: '#ffffff08', border: `1px solid ${COLORS.textDim}33` }}
            >
              <p className="text-[10px] sm:text-xs uppercase tracking-widest" style={{ color: COLORS.textDim }}>
                Final Score
              </p>
              <p
                className="text-3xl sm:text-4xl font-black"
                style={{
                  color: score >= topScore && score > 0 ? COLORS.gold : COLORS.accent,
                  fontFamily: '"JetBrains Mono", monospace',
                }}
              >
                {score}
              </p>
              {score >= topScore && score > 0 && (
                <p className="text-[10px] sm:text-xs mt-0.5" style={{ color: COLORS.gold }}>
                  🎉 NEW HIGH SCORE! 🎉
                </p>
              )}
            </div>
            <button
              onClick={startGame}
              className="mt-1 rounded-2xl px-8 py-3 sm:px-10 sm:py-4 text-base sm:text-lg font-bold tracking-wider transition-all hover:scale-110 active:scale-95"
              style={{
                background: `linear-gradient(135deg, ${COLORS.accent}, #00cc6a)`,
                color: '#000',
                boxShadow: `0 0 30px ${COLORS.accent}44`,
              }}
            >
              🔄 RESTART
            </button>
            <p className="text-[10px] sm:text-xs" style={{ color: COLORS.textDim }}>
              Press Space or Enter
            </p>
          </div>
        )}
      </div>

      {/* ── Mobile Controls ── */}
      <div className="flex md:hidden items-end justify-between px-6 pb-6 w-full shrink-0" style={{ maxWidth: CANVAS_SIZE }}>
        <DPad onDirectionStart={handleDPadMove} size={55} />
        <button
          onTouchStart={(e) => {
            e.preventDefault(); resumeAudio(); HAPTIC.soft();
            const game = gameRef.current;
            if (!game) return;
            const s = game.getState();
            if (s === 'start' || s === 'gameover') startGame();
            else if (s === 'playing' || s === 'paused') game.togglePause();
          }}
          className="flex items-center justify-center rounded-xl text-2xl font-bold active:translate-y-1 transition-transform select-none mb-2"
          style={{ 
            width: 80, height: 80, 
            background: 'rgba(255,255,255,0.1)', 
            border: `2px solid ${COLORS.accentDim}`, 
            borderBottomWidth: '6px',
            color: COLORS.textDim, 
            touchAction: 'none' 
          }}
        >
          ⏸
        </button>
      </div>

      {/* ── High Scores Panel ── */}
      {showHighScores && (
        <div
          className="w-full rounded-2xl p-4 sm:p-5 animate-fade-in"
          style={{ maxWidth: CANVAS_SIZE, background: '#0f0f2a', border: `1px solid ${COLORS.gold}33` }}
        >
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h3
              className="text-base sm:text-lg font-bold tracking-wider"
              style={{ color: COLORS.gold, fontFamily: '"JetBrains Mono", monospace' }}
            >
              🏆 HIGH SCORES
            </h3>
            <button
              onClick={() => setShowHighScores(false)}
              className="text-sm px-2 py-1 rounded hover:bg-white/5 transition-colors"
              style={{ color: COLORS.textDim }}
            >
              ✕
            </button>
          </div>
          {highScores.length === 0 ? (
            <p className="text-center py-4 text-xs sm:text-sm" style={{ color: COLORS.textDim }}>
              No scores yet. Play a game!
            </p>
          ) : (
            <div className="space-y-1">
              {highScores.map((entry, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg px-2.5 py-1.5 sm:px-3 sm:py-2"
                  style={{
                    background: i < 3 ? '#ffffff05' : 'transparent',
                    borderLeft: `3px solid ${medalColor(i)}`,
                  }}
                >
                  <div className="flex items-center gap-2 sm:gap-3">
                    <span className="text-xs sm:text-sm w-5 sm:w-6" style={{ color: medalColor(i) }}>
                      {medalEmoji(i)}
                    </span>
                    <span
                      className="text-base sm:text-lg font-bold tabular-nums"
                      style={{
                        color: i === 0 ? COLORS.gold : COLORS.text,
                        fontFamily: '"JetBrains Mono", monospace',
                      }}
                    >
                      {entry.score}
                    </span>
                  </div>
                  <span className="text-[10px] sm:text-xs" style={{ color: COLORS.textDim }}>
                    {entry.date}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
