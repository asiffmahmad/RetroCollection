import React, { useRef, useEffect, useState, useCallback } from 'react';

export type JoystickDirection = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | null;

interface VirtualJoystickProps {
  onMove: (dx: number, dy: number, dir: JoystickDirection) => void;
  onEnd: () => void;
  size?: number;
  baseColor?: string;
  stickColor?: string;
  className?: string;
}

export default function VirtualJoystick({
  onMove,
  onEnd,
  size = 120,
  baseColor = 'rgba(255, 255, 255, 0.1)',
  stickColor = 'rgba(255, 255, 255, 0.5)',
  className = ''
}: VirtualJoystickProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [stickPos, setStickPos] = useState({ x: 0, y: 0 });
  
  const handleTouch = useCallback((e: TouchEvent | MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    let clientX, clientY;
    if ('touches' in e) {
      // Find the touch that is interacting with this joystick
      // For simplicity, just use the first changed touch
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const distance = Math.hypot(dx, dy);
    
    const maxDist = size / 2.5;
    const ratio = distance > maxDist ? maxDist / distance : 1;
    
    const constrainedX = dx * ratio;
    const constrainedY = dy * ratio;
    
    setStickPos({ x: constrainedX, y: constrainedY });
    
    // Normalize to -1.0 to 1.0 range
    const normX = constrainedX / maxDist;
    const normY = constrainedY / maxDist;
    
    // Determine 4-way direction
    let dir: JoystickDirection = null;
    if (distance > maxDist * 0.3) {
      if (Math.abs(normX) > Math.abs(normY)) {
        dir = normX > 0 ? 'RIGHT' : 'LEFT';
      } else {
        dir = normY > 0 ? 'DOWN' : 'UP';
      }
    }
    
    onMove(normX, normY, dir);
  }, [size, onMove]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    
    const onStart = (e: TouchEvent | MouseEvent) => {
      e.preventDefault(); // Prevent scrolling
      setActive(true);
      handleTouch(e);
    };
    
    const onMoveEvent = (e: TouchEvent | MouseEvent) => {
      if (!active) return;
      e.preventDefault();
      handleTouch(e);
    };
    
    const onEndEvent = (e: TouchEvent | MouseEvent) => {
      if (!active) return;
      e.preventDefault();
      setActive(false);
      setStickPos({ x: 0, y: 0 });
      onEnd();
    };
    
    el.addEventListener('touchstart', onStart, { passive: false });
    window.addEventListener('touchmove', onMoveEvent, { passive: false });
    window.addEventListener('touchend', onEndEvent);
    
    // Mouse fallback for desktop testing
    el.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMoveEvent);
    window.addEventListener('mouseup', onEndEvent);
    
    return () => {
      el.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMoveEvent);
      window.removeEventListener('touchend', onEndEvent);
      el.removeEventListener('mousedown', onStart);
      window.removeEventListener('mousemove', onMoveEvent);
      window.removeEventListener('mouseup', onEndEvent);
    };
  }, [active, handleTouch, onEnd]);

  return (
    <div 
      ref={containerRef}
      className={`relative rounded-full select-none ${className}`}
      style={{ 
        width: size, 
        height: size, 
        background: baseColor,
        border: '2px solid rgba(255,255,255,0.15)',
        boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)',
        touchAction: 'none'
      }}
    >
      <div 
        className="absolute rounded-full transition-transform duration-75 ease-out"
        style={{
          width: size * 0.4,
          height: size * 0.4,
          background: stickColor,
          left: '50%',
          top: '50%',
          marginLeft: -(size * 0.4) / 2,
          marginTop: -(size * 0.4) / 2,
          transform: `translate(${stickPos.x}px, ${stickPos.y}px) ${active ? 'scale(0.95)' : 'scale(1)'}`,
          boxShadow: '0 4px 10px rgba(0,0,0,0.4), inset 0 0 10px rgba(255,255,255,0.2)',
        }}
      />
    </div>
  );
}
