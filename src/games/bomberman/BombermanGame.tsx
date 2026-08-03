import React, { useEffect, useRef, useState, useCallback } from 'react';
import { BombermanEngine, GameState, COLORS, Direction } from './BombermanEngine';
import { HAPTIC, SFX, resumeAudio } from '../../utils/feedback';
import VirtualJoystick, { JoystickDirection } from '../../components/VirtualJoystick';
import { THEME } from '../../theme';

interface BombermanGameProps {
  onBack: () => void;
}

export default function BombermanGame({ onBack }: BombermanGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<BombermanEngine | null>(null);
  const rafRef = useRef<number>(0);
  
  const [gameState, setGameState] = useState<GameState>('start');
  const [score, setScore] = useState(0);
  
  const activeKeys = useRef<Record<string, boolean>>({});

  const startGame = useCallback(() => {
    resumeAudio();
    if (engineRef.current) {
      engineRef.current.start();
      SFX.gameStart();
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const engine = new BombermanEngine(canvas, {
      onScoreChange: setScore,
      onStateChange: (s) => {
        setGameState(s);
        if (s === 'gameover') { HAPTIC.fail(); SFX.snakeDie(); }
        if (s === 'won') { HAPTIC.success(); SFX.newBest(); }
      }
    });
    engineRef.current = engine;
    
    const loop = (time: number) => {
      engine.setKeys(activeKeys.current);
      engine.update(time);
      engine.draw();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    
    return () => {
      cancelAnimationFrame(rafRef.current);
      engine.destroy();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      activeKeys.current[e.key] = true;
      if (e.key === ' ') {
        e.preventDefault();
        resumeAudio();
        const s = engineRef.current?.getState();
        if (s === 'playing') {
          engineRef.current?.placeBomb();
          SFX.tick(); // temporary bomb sound
          HAPTIC.soft();
        } else if (s === 'start' || s === 'gameover' || s === 'won') {
          startGame();
        }
      }
      if (e.key === 'Escape') {
        const s = engineRef.current?.getState();
        if (s === 'playing' || s === 'paused') {
          engineRef.current?.togglePause();
          SFX.tick();
        } else {
          onBack();
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      activeKeys.current[e.key] = false;
    };
    
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [startGame, onBack]);

  const handleJoystickMove = useCallback((dx: number, dy: number, dir: JoystickDirection) => {
    resumeAudio();
    activeKeys.current['UP'] = dir === 'UP';
    activeKeys.current['DOWN'] = dir === 'DOWN';
    activeKeys.current['LEFT'] = dir === 'LEFT';
    activeKeys.current['RIGHT'] = dir === 'RIGHT';
  }, []);

  const handleJoystickEnd = useCallback(() => {
    activeKeys.current['UP'] = false;
    activeKeys.current['DOWN'] = false;
    activeKeys.current['LEFT'] = false;
    activeKeys.current['RIGHT'] = false;
  }, []);

  const handleBombTap = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    resumeAudio();
    const s = engineRef.current?.getState();
    if (s === 'playing') {
      engineRef.current?.placeBomb();
      SFX.tick();
      HAPTIC.soft();
    } else if (s === 'start' || s === 'gameover' || s === 'won') {
      startGame();
    }
  }, [startGame]);

  return (
    <div className="flex flex-col w-full h-[100dvh] animate-fade-in mx-auto justify-between" style={{ maxWidth: 600 }}>
      {/* Header */}
      <div className="flex w-full items-center justify-between p-3 shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="flex items-center justify-center w-8 h-8 rounded-xl hover:scale-110 active:scale-95 transition-all"
            style={{ background: '#ffffff08', border: '1px solid #ffffff15' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={THEME.textDim} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <span className="text-2xl">💣</span>
          <h1 className="text-xl font-bold tracking-wider" style={{ color: COLORS.player, fontFamily: THEME.fontMono }}>BOMBER</h1>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider" style={{ color: THEME.textDim }}>Score</div>
            <div className="text-lg font-bold tabular-nums" style={{ color: THEME.textPrimary, fontFamily: THEME.fontMono }}>{score}</div>
          </div>
        </div>
      </div>

      {/* Game Area */}
      <div className="relative w-full flex-1 flex flex-col items-center justify-center min-h-0 overflow-hidden">
        <div className="relative w-full max-w-[500px] aspect-[13/11]" style={{ boxShadow: `0 0 30px ${COLORS.player}22` }}>
          <canvas
            ref={canvasRef}
            className="w-full h-full object-contain bg-black rounded-lg"
            style={{ imageRendering: 'pixelated' }}
          />
          
          {gameState === 'start' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60 backdrop-blur-sm rounded-lg">
              <span className="text-5xl">💣</span>
              <button onClick={startGame} className="px-8 py-3 rounded-xl font-bold tracking-wider text-black transition-transform active:scale-95" style={{ background: COLORS.player }}>
                START GAME
              </button>
            </div>
          )}
          
          {gameState === 'gameover' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60 backdrop-blur-sm rounded-lg">
              <span className="text-5xl">💥</span>
              <h2 className="text-2xl font-bold text-red-500">GAME OVER</h2>
              <button onClick={startGame} className="px-8 py-3 rounded-xl font-bold tracking-wider text-black transition-transform active:scale-95" style={{ background: COLORS.player }}>
                TRY AGAIN
              </button>
            </div>
          )}
          
          {gameState === 'won' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60 backdrop-blur-sm rounded-lg">
              <span className="text-5xl">🏆</span>
              <h2 className="text-2xl font-bold text-yellow-400">YOU WIN!</h2>
              <button onClick={startGame} className="px-8 py-3 rounded-xl font-bold tracking-wider text-black transition-transform active:scale-95" style={{ background: COLORS.player }}>
                PLAY AGAIN
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Controls */}
      <div className="flex md:hidden items-center justify-between px-6 pb-8 pt-4 shrink-0">
        <VirtualJoystick 
          onMove={handleJoystickMove} 
          onEnd={handleJoystickEnd} 
          size={120} 
          stickColor={COLORS.player} 
        />
        <button
          onTouchStart={handleBombTap}
          onMouseDown={handleBombTap}
          className="w-[100px] h-[100px] rounded-full flex items-center justify-center text-4xl select-none active:scale-90 transition-transform shadow-lg"
          style={{ background: 'rgba(255, 51, 102, 0.2)', border: `3px solid ${COLORS.enemy}`, touchAction: 'none' }}
        >
          💣
        </button>
      </div>
    </div>
  );
}
