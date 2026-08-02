// Grid & sizing
export const GRID_SIZE = 20;
export const CELL_SIZE = 24;
export const CANVAS_SIZE = GRID_SIZE * CELL_SIZE; // 480

// Timing
export const BASE_TICK_MS = 110; // starting speed
export const MIN_TICK_MS = 55; // fastest speed
export const SPEED_DECREASE_PER_FOOD = 1.2; // ms faster per food

// Colors — neon retro theme
export const COLORS = {
  bg: '#0a0a1a',
  grid: '#12122a',
  gridLine: '#1a1a3a',
  snakeHead: '#00ff88',
  snakeBody: '#00cc6a',
  snakeBodyAlt: '#00b85e',
  snakeTail: '#009944',
  food: '#ff3366',
  foodGlow: '#ff336644',
  foodInner: '#ff6699',
  text: '#e0e0ff',
  textDim: '#8888aa',
  accent: '#00ff88',
  accentDim: '#00cc6a88',
  danger: '#ff3366',
  overlay: '#0a0a1acc',
  gold: '#ffd700',
  silver: '#c0c0c0',
  bronze: '#cd7f32',
  particleFood: ['#ff3366', '#ff6699', '#ff99bb', '#ffccdd', '#ff0044'],
  particleSnake: ['#00ff88', '#00cc6a', '#88ffcc', '#00ffaa', '#44ffaa'],
};

// Directions
export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
export type Point = { x: number; y: number };

export const DIR_VECTORS: Record<Direction, Point> = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
};

export const OPPOSITE: Record<Direction, Direction> = {
  UP: 'DOWN',
  DOWN: 'UP',
  LEFT: 'RIGHT',
  RIGHT: 'LEFT',
};
