// Shared theme constants for the entire arcade dashboard
export const THEME = {
  // Core palette
  bgPrimary: '#050510',
  bgSecondary: '#0a0a1a',
  bgCard: '#0f0f2a',
  bgCardHover: '#14143a',
  bgOverlay: '#0a0a1acc',

  // Accent
  accent: '#7c3aed',       // violet-600
  accentLight: '#a78bfa',  // violet-400
  accentGlow: '#7c3aed44',
  accentBg: '#7c3aed15',

  // Neon highlights
  neonGreen: '#00ff88',
  neonPink: '#ff3366',
  neonBlue: '#3b82f6',
  neonYellow: '#fbbf24',
  neonCyan: '#06b6d4',

  // Text
  textPrimary: '#e0e0ff',
  textSecondary: '#8888bb',
  textDim: '#555580',

  // Medals
  gold: '#ffd700',
  silver: '#c0c0c0',
  bronze: '#cd7f32',

  // Borders
  border: '#1a1a3a',
  borderLight: '#2a2a4a',

  // Font
  fontMono: '"JetBrains Mono", ui-monospace, monospace',
  fontSans: '"Inter", system-ui, -apple-system, sans-serif',
};

// Game registry types
export interface GameMeta {
  id: string;
  title: string;
  emoji: string;
  description: string;
  color: string;      // accent color for this game
  colorGlow: string;
  tags: string[];
  status: 'playable' | 'coming-soon';
  bestScoreKey?: string;
}

export const GAMES: GameMeta[] = [
  {
    id: 'snake',
    title: 'Snake',
    emoji: '🐍',
    description: 'Classic arcade snake with combos, screen shake, and particles. Eat, grow, survive!',
    color: '#00ff88',
    colorGlow: '#00ff8844',
    tags: ['Classic', 'Arcade'],
    status: 'playable',
    bestScoreKey: 'snake_arcade_highscores',
  },
  {
    id: 'tetris',
    title: 'Tetris',
    emoji: '🧱',
    description: 'Stack blocks, clear lines, and chase the perfect Tetris. Coming soon!',
    color: '#3b82f6',
    colorGlow: '#3b82f644',
    tags: ['Puzzle', 'Classic'],
    status: 'coming-soon',
  },
  {
    id: 'breakout',
    title: 'Breakout',
    emoji: '🏓',
    description: 'Bounce the ball, break all bricks. Power-ups and boss levels ahead!',
    color: '#f59e0b',
    colorGlow: '#f59e0b44',
    tags: ['Arcade', 'Action'],
    status: 'coming-soon',
  },
  {
    id: 'minesweeper',
    title: 'Minesweeper',
    emoji: '💣',
    description: 'Logic-based mine hunting. Flag the bombs, reveal safe squares.',
    color: '#ef4444',
    colorGlow: '#ef444444',
    tags: ['Puzzle', 'Strategy'],
    status: 'coming-soon',
  },
  {
    id: 'flappy',
    title: 'Flappy Bird',
    emoji: '🐦',
    description: 'One-tap flying through pipes. Simple controls, brutal difficulty.',
    color: '#06b6d4',
    colorGlow: '#06b6d444',
    tags: ['Arcade', 'Casual'],
    status: 'coming-soon',
  },
  {
    id: '2048',
    title: '2048',
    emoji: '🔢',
    description: 'Slide tiles, merge numbers, reach 2048. A modern puzzle classic.',
    color: '#a78bfa',
    colorGlow: '#a78bfa44',
    tags: ['Puzzle', 'Math'],
    status: 'coming-soon',
  },
];
