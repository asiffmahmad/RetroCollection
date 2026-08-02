import { useState, useEffect, useRef } from 'react';
import { THEME, GAMES, GameMeta } from '../theme';
import { getTopScore } from '../game/highscores';

interface DashboardProps {
  onSelectGame: (gameId: string) => void;
}

function getBestForGame(game: GameMeta): number {
  if (!game.bestScoreKey) return 0;
  try {
    const raw = localStorage.getItem(game.bestScoreKey);
    if (!raw) return 0;
    const scores = JSON.parse(raw);
    return scores.length > 0 ? scores[0].score : 0;
  } catch {
    return 0;
  }
}

function getTotalGamesPlayed(): number {
  try {
    const raw = localStorage.getItem('snake_arcade_highscores');
    if (!raw) return 0;
    return JSON.parse(raw).length;
  } catch {
    return 0;
  }
}

// Animated floating particles background
function BackgroundCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    let w = window.innerWidth;
    let h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;

    const colors = ['#7c3aed', '#00ff88', '#ff3366', '#3b82f6', '#fbbf24', '#06b6d4'];
    const particles: { x: number; y: number; vx: number; vy: number; size: number; alpha: number; color: string }[] = [];

    for (let i = 0; i < 40; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 2 + 0.5,
        alpha: Math.random() * 0.25 + 0.05,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    let raf: number;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    const handleResize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w;
      canvas.height = h;
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }} />;
}

// --- Stat Card ---
function StatCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div
      className="flex flex-col items-center gap-0.5 rounded-xl px-2 py-2.5 sm:flex-row sm:items-center sm:gap-3 sm:px-4 sm:py-3"
      style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}` }}
    >
      <span className="text-lg sm:text-2xl leading-none">{icon}</span>
      <div className="flex flex-col items-center sm:items-start">
        <span
          className="text-[8px] sm:text-[10px] uppercase tracking-widest leading-tight"
          style={{ color: THEME.textDim, fontFamily: THEME.fontMono }}
        >
          {label}
        </span>
        <span
          className="text-base sm:text-xl font-bold tabular-nums leading-tight"
          style={{ color: THEME.textPrimary, fontFamily: THEME.fontMono }}
        >
          {value}
        </span>
      </div>
    </div>
  );
}

// --- Game Card ---
function GameCard({ game, onPlay }: { game: GameMeta; onPlay: () => void }) {
  const best = getBestForGame(game);
  const isPlayable = game.status === 'playable';
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="group relative rounded-2xl overflow-hidden transition-all duration-300"
      style={{
        background: THEME.bgCard,
        border: `1px solid ${hovered && isPlayable ? game.color + '66' : THEME.border}`,
        boxShadow: hovered && isPlayable
          ? `0 0 30px ${game.colorGlow}, 0 8px 32px rgba(0,0,0,0.4)`
          : '0 2px 12px rgba(0,0,0,0.2)',
        transform: hovered && isPlayable ? 'translateY(-4px) scale(1.02)' : 'translateY(0) scale(1)',
        opacity: isPlayable ? 1 : 0.55,
        cursor: isPlayable ? 'pointer' : 'default',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => isPlayable && onPlay()}
    >
      {/* Accent top bar */}
      <div
        className="h-1 w-full transition-all duration-300"
        style={{
          background: isPlayable
            ? `linear-gradient(90deg, transparent, ${game.color}, transparent)`
            : `linear-gradient(90deg, transparent, ${THEME.textDim}44, transparent)`,
          opacity: hovered ? 1 : 0.5,
        }}
      />

      <div className="p-4 sm:p-5">
        {/* Top row */}
        <div className="flex items-start justify-between mb-2 sm:mb-3">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div
              className="flex-shrink-0 flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-xl text-xl sm:text-2xl transition-transform duration-300"
              style={{
                background: `${game.color}15`,
                border: `1px solid ${game.color}33`,
                transform: hovered ? 'scale(1.1) rotate(-3deg)' : 'scale(1)',
              }}
            >
              {game.emoji}
            </div>
            <div className="min-w-0">
              <h3
                className="text-base sm:text-lg font-bold tracking-wide truncate"
                style={{ color: THEME.textPrimary, fontFamily: THEME.fontMono }}
              >
                {game.title}
              </h3>
              <div className="flex flex-wrap gap-1.5 mt-0.5">
                {game.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[9px] sm:text-[10px] uppercase tracking-wider px-1.5 sm:px-2 py-0.5 rounded-full whitespace-nowrap"
                    style={{ color: game.color, background: `${game.color}15`, border: `1px solid ${game.color}22` }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {!isPlayable && (
            <span
              className="flex-shrink-0 text-[9px] sm:text-[10px] uppercase tracking-wider px-2 py-1 rounded-full font-medium ml-2"
              style={{ color: THEME.textDim, background: '#ffffff08', border: `1px solid ${THEME.border}` }}
            >
              Soon
            </span>
          )}
        </div>

        {/* Description */}
        <p
          className="text-xs sm:text-sm leading-relaxed mb-3 sm:mb-4 line-clamp-2"
          style={{ color: THEME.textSecondary }}
        >
          {game.description}
        </p>

        {/* Bottom row */}
        <div className="flex items-center justify-between">
          {isPlayable && best > 0 ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xs">🏆</span>
              <span
                className="text-xs sm:text-sm font-bold tabular-nums"
                style={{ color: THEME.gold, fontFamily: THEME.fontMono }}
              >
                {best}
              </span>
            </div>
          ) : (
            <div />
          )}

          {isPlayable ? (
            <button
              className="flex items-center gap-1.5 rounded-xl px-4 py-2 sm:px-5 sm:py-2.5 text-xs sm:text-sm font-bold tracking-wider transition-all hover:scale-105 active:scale-95"
              style={{
                background: `linear-gradient(135deg, ${game.color}, ${game.color}cc)`,
                color: '#000',
                boxShadow: `0 0 20px ${game.colorGlow}`,
              }}
              onClick={(e) => { e.stopPropagation(); onPlay(); }}
            >
              ▶ PLAY
            </button>
          ) : (
            <div
              className="flex items-center gap-1.5 rounded-xl px-4 py-2 sm:px-5 sm:py-2.5 text-xs sm:text-sm font-medium"
              style={{ color: THEME.textDim, background: '#ffffff05', border: `1px solid ${THEME.border}` }}
            >
              🔒 Coming Soon
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Dashboard ---
export default function Dashboard({ onSelectGame }: DashboardProps) {
  const topScore = getTopScore();
  const gamesPlayed = getTotalGamesPlayed();
  const playableCount = GAMES.filter((g) => g.status === 'playable').length;

  return (
    <div
      className="relative min-h-screen min-h-dvh"
      style={{
        background: `linear-gradient(180deg, ${THEME.bgPrimary} 0%, #080820 50%, ${THEME.bgPrimary} 100%)`,
      }}
    >
      <BackgroundCanvas />

      <div className="relative z-10 w-full max-w-4xl mx-auto px-3 sm:px-4 py-6 sm:py-8 md:py-12">
        {/* Hero */}
        <div className="text-center mb-7 sm:mb-10 md:mb-14 animate-fade-in">
          <div className="flex items-center justify-center mb-3 sm:mb-4">
            <div
              className="flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-2xl text-2xl sm:text-3xl"
              style={{
                background: `linear-gradient(135deg, ${THEME.accent}, ${THEME.accentLight})`,
                boxShadow: `0 0 30px ${THEME.accentGlow}`,
              }}
            >
              🎮
            </div>
          </div>
          <h1
            className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight mb-1.5 sm:mb-2"
            style={{
              fontFamily: THEME.fontMono,
              background: `linear-gradient(135deg, ${THEME.textPrimary}, ${THEME.accentLight})`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            ARCADE HUB
          </h1>
          <p
            className="text-sm sm:text-base md:text-lg"
            style={{ color: THEME.textSecondary }}
          >
            Pick a game and start playing
          </p>
        </div>

        {/* Stats */}
        <div
          className="grid grid-cols-3 gap-2 sm:gap-3 mb-6 sm:mb-8 md:mb-10 animate-fade-in"
          style={{ animationDelay: '0.1s' }}
        >
          <StatCard label="Best" value={topScore || '—'} icon="🏆" />
          <StatCard label="Played" value={gamesPlayed || '—'} icon="🎯" />
          <StatCard label="Games" value={`${playableCount}/${GAMES.length}`} icon="🕹️" />
        </div>

        {/* Section divider */}
        <div
          className="flex items-center gap-3 mb-4 sm:mb-5 animate-fade-in"
          style={{ animationDelay: '0.15s' }}
        >
          <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${THEME.border}, transparent)` }} />
          <span
            className="text-[10px] sm:text-xs uppercase tracking-[0.2em] font-medium px-3"
            style={{ color: THEME.textDim, fontFamily: THEME.fontMono }}
          >
            Games
          </span>
          <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, transparent, ${THEME.border})` }} />
        </div>

        {/* Game grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-8 sm:mb-10">
          {GAMES.map((game, idx) => (
            <div
              key={game.id}
              className="animate-fade-in"
              style={{ animationDelay: `${0.2 + idx * 0.05}s` }}
            >
              <GameCard game={game} onPlay={() => onSelectGame(game.id)} />
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="text-center pb-6 sm:pb-8 animate-fade-in" style={{ animationDelay: '0.5s' }}>
          <p className="text-[10px] sm:text-xs" style={{ color: THEME.textDim }}>
            🎮 Built with React + Canvas · More games coming soon!
          </p>
        </div>
      </div>
    </div>
  );
}
