import React from 'react';
import { HAPTIC, resumeAudio } from '../utils/feedback';

export type DPadDirection = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

interface DPadProps {
  onDirectionStart: (dir: DPadDirection) => void;
  onDirectionEnd?: (dir: DPadDirection) => void;
  className?: string;
  size?: number; // Size of each individual button (default 60)
}

export default function DPad({ onDirectionStart, onDirectionEnd, className = '', size = 60 }: DPadProps) {
  const createBtn = (dir: DPadDirection, icon: string) => {
    return (
      <button
        onTouchStart={(e) => { e.preventDefault(); resumeAudio(); HAPTIC.soft(); onDirectionStart(dir); }}
        onTouchEnd={(e) => { e.preventDefault(); if(onDirectionEnd) onDirectionEnd(dir); }}
        onMouseDown={(e) => { e.preventDefault(); resumeAudio(); HAPTIC.soft(); onDirectionStart(dir); }}
        onMouseUp={(e) => { e.preventDefault(); if(onDirectionEnd) onDirectionEnd(dir); }}
        onMouseLeave={(e) => { e.preventDefault(); if(onDirectionEnd) onDirectionEnd(dir); }}
        className="flex items-center justify-center rounded-xl text-3xl font-bold select-none active:translate-y-1 transition-transform"
        style={{
          width: size,
          height: size,
          background: 'rgba(255,255,255,0.1)',
          border: '2px solid rgba(255,255,255,0.3)',
          borderBottomWidth: '6px',
          color: '#fff',
          touchAction: 'none'
        }}
      >
        {icon}
      </button>
    );
  };

  return (
    <div className={`grid grid-cols-3 grid-rows-3 gap-2 pointer-events-auto ${className}`}>
      <div />
      {createBtn('UP', '↑')}
      <div />
      {createBtn('LEFT', '←')}
      <div />
      {createBtn('RIGHT', '→')}
      <div />
      {createBtn('DOWN', '↓')}
      <div />
    </div>
  );
}
