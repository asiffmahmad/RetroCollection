import React, { useEffect, useRef, useState, useCallback } from 'react';
import { RacerEngine, GameState } from './RacerEngine';
import { HAPTIC, SFX, resumeAudio } from '../../utils/feedback';
import { THEME } from '../../theme';

interface RacerGameProps {
  onBack: () => void;
}

export default function RacerGame({ onBack }: RacerGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<RacerEngine | null>(null);
  const rafRef = useRef<number>(0);
  
  const [gameState, setGameState] = useState<GameState>('start');
  const [score, setScore] = useState(0);
  const [speed, setSpeed] = useState(0);
  
  const [bestScore, setBestScore] = useState(() => parseInt(localStorage.getItem('racer_best') || '0', 10));

  const startGame = useCallback(() => {
    resumeAudio();
    if (engineRef.current) {
      engineRef.current.start();
      SFX.gameStart();
    }
  }, []);

  useEffect(() => {
    if (score > bestScore) {
      setBestScore(score);
      localStorage.setItem('racer_best', score.toString());
    }
  }, [score, bestScore]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    canvas.width = window.innerWidth > 800 ? 800 : window.innerWidth;
    canvas.height = window.innerHeight > 600 ? 600 : window.innerHeight;
    
    const engine = new RacerEngine(canvas, {
      onScoreChange: setScore,
      onSpeedChange: setSpeed,
      onStateChange: (s) => {
        setGameState(s);
        if (s === 'gameover') { HAPTIC.fail(); SFX.snakeDie(); }
      }
    });
    engineRef.current = engine;
    
    let lastTime = performance.now();
    
    const loop = (time: number) => {
      const dt = time - lastTime;
      lastTime = time;
      engine.update(dt);
      engine.draw();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    
    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!engineRef.current) return;
      if (e.key === 'ArrowUp' || e.key === 'w') engineRef.current.keyUp = true;
      if (e.key === 'ArrowDown' || e.key === 's') engineRef.current.keyDown = true;
      if (e.key === 'ArrowLeft' || e.key === 'a') engineRef.current.keyLeft = true;
      if (e.key === 'ArrowRight' || e.key === 'd') engineRef.current.keyRight = true;
      
      if (e.key === ' ') {
        e.preventDefault();
        resumeAudio();
        const s = engineRef.current.getState();
        if (s === 'start' || s === 'gameover') startGame();
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
      if (!engineRef.current) return;
      if (e.key === 'ArrowUp' || e.key === 'w') engineRef.current.keyUp = false;
      if (e.key === 'ArrowDown' || e.key === 's') engineRef.current.keyDown = false;
      if (e.key === 'ArrowLeft' || e.key === 'a') engineRef.current.keyLeft = false;
      if (e.key === 'ArrowRight' || e.key === 'd') engineRef.current.keyRight = false;
    };
    
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [startGame, onBack]);

  const handleLeftStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    resumeAudio();
    if (engineRef.current) engineRef.current.keyLeft = true;
    HAPTIC.soft();
  }, []);

  const handleLeftEnd = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (engineRef.current) engineRef.current.keyLeft = false;
  }, []);

  const handleRightStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    resumeAudio();
    if (engineRef.current) engineRef.current.keyRight = true;
    HAPTIC.soft();
  }, []);

  const handleRightEnd = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (engineRef.current) engineRef.current.keyRight = false;
  }, []);

  const handleGasStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    resumeAudio();
    if (engineRef.current) engineRef.current.keyUp = true;
    HAPTIC.soft();
  }, []);
  
  const handleGasEnd = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (engineRef.current) engineRef.current.keyUp = false;
  }, []);

  const handleBrakeStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    resumeAudio();
    if (engineRef.current) engineRef.current.keyDown = true;
    HAPTIC.soft();
  }, []);
  
  const handleBrakeEnd = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (engineRef.current) engineRef.current.keyDown = false;
  }, []);

  return (
    <div className="flex flex-col w-full h-[100dvh] animate-fade-in relative bg-black">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ imageRendering: 'pixelated' }}
      />
      
      <div className="absolute top-0 left-0 w-full flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent pointer-events-none z-10">
        <div className="flex items-center gap-2 pointer-events-auto">
          <button onClick={onBack} className="flex items-center justify-center w-8 h-8 rounded-xl hover:scale-110 active:scale-95 transition-all"
            style={{ background: '#ffffff08', border: '1px solid #ffffff15' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={THEME.textDim} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <span className="text-2xl">🏎️</span>
          <h1 className="text-xl font-bold tracking-wider" style={{ color: '#00ccff', fontFamily: THEME.fontMono }}>OUTRUN</h1>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider" style={{ color: THEME.textDim }}>Score</div>
            <div className="text-lg font-bold tabular-nums" style={{ color: THEME.textPrimary, fontFamily: THEME.fontMono }}>{score}</div>
          </div>
          <div className="text-right hidden sm:block">
            <div className="text-[10px] uppercase tracking-wider" style={{ color: THEME.gold }}>Best</div>
            <div className="text-lg font-bold tabular-nums" style={{ color: THEME.gold, fontFamily: THEME.fontMono }}>{bestScore}</div>
          </div>
        </div>
      </div>
      
      <div className="absolute bottom-[100px] md:bottom-8 right-6 text-right pointer-events-none z-10">
        <div className="text-[10px] uppercase tracking-wider" style={{ color: THEME.textDim }}>Speed</div>
        <div className="text-4xl font-bold italic tabular-nums" style={{ color: speed > 100 ? '#ff3366' : '#00ccff', fontFamily: THEME.fontMono, textShadow: '0 0 10px currentColor' }}>
          {speed} <span className="text-sm font-normal text-white">MPH</span>
        </div>
      </div>

      {gameState === 'start' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60 backdrop-blur-sm z-20">
          <span className="text-6xl mb-4">🏎️</span>
          <button onClick={startGame} className="px-10 py-4 rounded-xl font-bold tracking-wider text-black text-xl transition-transform active:scale-95" style={{ background: '#00ccff', boxShadow: '0 0 30px #00ccff55' }}>
            INSERT COIN
          </button>
        </div>
      )}
      
      {gameState === 'paused' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60 backdrop-blur-sm z-20">
          <h2 className="text-3xl font-bold text-white tracking-widest">PAUSED</h2>
          <button onClick={() => engineRef.current?.togglePause()} className="px-8 py-3 rounded-xl font-bold tracking-wider text-black transition-transform active:scale-95 mt-4" style={{ background: '#00ccff' }}>
            RESUME
          </button>
        </div>
      )}

      <div className="absolute bottom-0 left-0 w-full flex md:hidden items-end justify-between p-4 z-10 pointer-events-none">
        
        {/* Left/Right Retro D-Pad */}
        <div className="flex gap-2 pointer-events-auto mb-2">
          <button
            onTouchStart={handleLeftStart}
            onTouchEnd={handleLeftEnd}
            onMouseDown={handleLeftStart}
            onMouseUp={handleLeftEnd}
            onMouseLeave={handleLeftEnd}
            className="w-[65px] h-[65px] flex items-center justify-center rounded-xl text-3xl font-bold select-none active:translate-y-1 transition-transform"
            style={{ 
              background: 'rgba(255,255,255,0.1)', 
              border: `2px solid rgba(255,255,255,0.3)`, 
              borderBottomWidth: '6px',
              color: '#fff', 
              touchAction: 'none' 
            }}
          >
            ←
          </button>
          
          <button
            onTouchStart={handleRightStart}
            onTouchEnd={handleRightEnd}
            onMouseDown={handleRightStart}
            onMouseUp={handleRightEnd}
            onMouseLeave={handleRightEnd}
            className="w-[65px] h-[65px] flex items-center justify-center rounded-xl text-3xl font-bold select-none active:translate-y-1 transition-transform"
            style={{ 
              background: 'rgba(255,255,255,0.1)', 
              border: `2px solid rgba(255,255,255,0.3)`, 
              borderBottomWidth: '6px',
              color: '#fff', 
              touchAction: 'none' 
            }}
          >
            →
          </button>
        </div>
        <div className="flex gap-3 pointer-events-auto">
          <button
            onTouchStart={handleBrakeStart}
            onTouchEnd={handleBrakeEnd}
            onMouseDown={handleBrakeStart}
            onMouseUp={handleBrakeEnd}
            onMouseLeave={handleBrakeEnd}
            className="w-[65px] h-[65px] rounded-xl flex items-center justify-center text-lg font-bold select-none active:translate-y-1 transition-transform mt-4"
            style={{ 
              background: 'rgba(255, 51, 102, 0.2)', 
              border: `2px solid #ff3366`, 
              borderBottomWidth: '6px',
              color: '#ff3366', 
              touchAction: 'none' 
            }}
          >
            BRK
          </button>
          
          <button
            onTouchStart={handleGasStart}
            onTouchEnd={handleGasEnd}
            onMouseDown={handleGasStart}
            onMouseUp={handleGasEnd}
            onMouseLeave={handleGasEnd}
            className="w-[85px] h-[85px] rounded-xl flex items-center justify-center text-xl font-bold select-none active:translate-y-1 transition-transform"
            style={{ 
              background: 'rgba(0, 204, 255, 0.2)', 
              border: `2px solid #00ccff`, 
              borderBottomWidth: '8px',
              color: '#00ccff', 
              touchAction: 'none' 
            }}
          >
            GAS
          </button>
        </div>
      </div>
    </div>
  );
}
