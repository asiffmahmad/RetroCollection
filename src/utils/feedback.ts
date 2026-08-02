/**
 * feedback.ts — Shared haptics + synthesized sound effects
 * Uses Web Audio API (no assets needed, works offline / in Vercel)
 */

// ── Haptic vibration ───────────────────────────────────────────
type PatternMs = number | number[];

export function vibrate(pattern: PatternMs = 8) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch { /* silently ignore on desktop */ }
}

// Presets
export const HAPTIC = {
  tap:       () => vibrate(8),
  soft:      () => vibrate(12),
  medium:    () => vibrate([15, 5, 15]),
  hard:      () => vibrate([20, 10, 20, 10, 20]),
  success:   () => vibrate([10, 30, 60]),
  fail:      () => vibrate([60, 20, 40, 20, 80]),
  direction: () => vibrate(10),
  eat:       () => vibrate([5, 5, 10]),
  score:     () => vibrate([8, 15, 8]),
} as const;

// ── Web Audio context (lazy init) ──────────────────────────────
let _ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (_ctx) return _ctx;
  try {
    _ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    return _ctx;
  } catch { return null; }
}

/** Resume context after user gesture (required by browsers) */
export function resumeAudio() {
  const ctx = getCtx();
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

// ── Low-level tone synthesizer ─────────────────────────────────
interface ToneOpts {
  freq?: number;          // Hz
  freq2?: number;         // sweep end Hz (undefined = no sweep)
  type?: OscillatorType;
  vol?: number;           // 0–1
  attack?: number;        // s
  decay?: number;         // s
  sustain?: number;       // 0–1 level
  release?: number;       // s
  duration?: number;      // total s
  detune?: number;        // cents
  distortion?: boolean;
  delay?: number;         // start after Xs
}

function tone(opts: ToneOpts): void {
  const ctx = getCtx();
  if (!ctx) return;

  const now = ctx.currentTime + (opts.delay ?? 0);
  const {
    freq = 440, freq2, type = 'square',
    vol = 0.18, attack = 0.005, decay = 0.08, sustain = 0.0, release = 0.05,
    duration = 0.15, detune = 0, distortion = false,
  } = opts;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  // Distortion waveshaper for crunch
  if (distortion) {
    const ws = ctx.createWaveShaper();
    const n = 256; const curve = new Float32Array(n);
    const k = 100;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((Math.PI + k) * x) / (Math.PI + k * Math.abs(x));
    }
    ws.curve = curve;
    osc.connect(ws); ws.connect(gain);
  } else {
    osc.connect(gain);
  }
  gain.connect(ctx.destination);

  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (freq2 !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freq2), now + duration);
  osc.detune.setValueAtTime(detune, now);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(vol, now + attack);
  gain.gain.linearRampToValueAtTime(vol * sustain, now + attack + decay);
  gain.gain.setValueAtTime(vol * sustain, now + duration - release);
  gain.gain.linearRampToValueAtTime(0.0001, now + duration);

  osc.start(now);
  osc.stop(now + duration + 0.01);
}

// ── Noise burst (crash/explosion) ─────────────────────────────
function noise(duration = 0.1, vol = 0.15, delay = 0) {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime + delay;
  const bufSize = Math.floor(ctx.sampleRate * duration);
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

  const src = ctx.createBufferSource();
  src.buffer = buf;

  // Band-pass filter for "thud"
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass'; filter.frequency.value = 120; filter.Q.value = 0.8;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  src.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
  src.start(now); src.stop(now + duration + 0.01);
}

// ── Game sound presets ─────────────────────────────────────────
export const SFX = {
  // ── Universal ──────────────────────────────────────────────
  uiClick:   () => tone({ freq: 880, type: 'sine', vol: 0.10, duration: 0.06, decay: 0.05 }),
  uiBack:    () => tone({ freq: 440, freq2: 220, type: 'sine', vol: 0.10, duration: 0.10 }),
  gameStart: () => {
    tone({ freq: 440, vol: 0.18, duration: 0.08, delay: 0.00 });
    tone({ freq: 550, vol: 0.18, duration: 0.08, delay: 0.09 });
    tone({ freq: 660, vol: 0.22, duration: 0.14, delay: 0.18 });
  },
  gameOver:  () => {
    tone({ freq: 330, freq2: 110, type: 'sawtooth', vol: 0.20, duration: 0.25, delay: 0.00 });
    tone({ freq: 220, freq2: 80,  type: 'sawtooth', vol: 0.18, duration: 0.30, delay: 0.20 });
    noise(0.18, 0.12, 0.10);
  },
  newBest: () => {
    [0, 0.10, 0.20, 0.30].forEach((d, i) =>
      tone({ freq: [523, 659, 784, 1047][i], vol: 0.18, duration: 0.12, delay: d })
    );
  },

  // ── Snake ──────────────────────────────────────────────────
  snakeEat:   () => tone({ freq: 660, freq2: 880, type: 'square', vol: 0.14, duration: 0.08, decay: 0.06 }),
  snakeMove:  () => tone({ freq: 220, type: 'square', vol: 0.05, duration: 0.04 }),
  snakeDie:   () => {
    tone({ freq: 200, freq2: 50, type: 'sawtooth', vol: 0.20, duration: 0.3, distortion: true });
    noise(0.2, 0.15);
  },
  snakeCombo: () => {
    tone({ freq: 880, vol: 0.18, duration: 0.06, delay: 0 });
    tone({ freq: 1100, vol: 0.22, duration: 0.09, delay: 0.07 });
  },

  // ── Tetris ─────────────────────────────────────────────────
  tetMove:   () => tone({ freq: 180, type: 'square', vol: 0.06, duration: 0.04 }),
  tetRotate: () => tone({ freq: 360, type: 'square', vol: 0.10, duration: 0.06 }),
  tetDrop:   () => tone({ freq: 120, freq2: 60, type: 'square', vol: 0.14, duration: 0.08 }),
  tetLine:   () => {
    tone({ freq: 440, vol: 0.18, duration: 0.08, delay: 0.00 });
    tone({ freq: 660, vol: 0.20, duration: 0.10, delay: 0.09 });
  },
  tetTetris: () => {
    [0, 0.08, 0.16, 0.24].forEach((d, i) =>
      tone({ freq: [330, 440, 550, 880][i], vol: 0.20, duration: 0.12, delay: d })
    );
  },
  tetLock:   () => tone({ freq: 200, type: 'square', vol: 0.10, duration: 0.07 }),
  tetHold:   () => tone({ freq: 300, type: 'sine', vol: 0.10, duration: 0.08 }),

  // ── Breakout ───────────────────────────────────────────────
  brkPaddle: () => tone({ freq: 440, freq2: 550, type: 'square', vol: 0.12, duration: 0.06 }),
  brkBrick:  () => tone({ freq: 330, freq2: 280, type: 'square', vol: 0.14, duration: 0.07 }),
  brkHardBrick: () => tone({ freq: 200, type: 'square', vol: 0.16, duration: 0.09, distortion: true }),
  brkPower:  () => {
    tone({ freq: 660, vol: 0.16, duration: 0.08, delay: 0 });
    tone({ freq: 880, vol: 0.18, duration: 0.10, delay: 0.09 });
  },
  brkDie:    () => { tone({ freq: 150, freq2: 60, type: 'sawtooth', vol: 0.18, duration: 0.3 }); noise(0.2, 0.15); },
  brkWin:    () => {
    [0, 0.10, 0.20, 0.32].forEach((d, i) =>
      tone({ freq: [523, 784, 1047, 1319][i], vol: 0.18, duration: 0.14, delay: d })
    );
  },

  // ── Minesweeper ────────────────────────────────────────────
  mineReveal: () => tone({ freq: 500, type: 'sine', vol: 0.08, duration: 0.05, attack: 0.002 }),
  mineFlag:   () => tone({ freq: 700, freq2: 900, type: 'square', vol: 0.10, duration: 0.06 }),
  mineBoom:   () => {
    noise(0.4, 0.25);
    tone({ freq: 80, freq2: 30, type: 'sawtooth', vol: 0.22, duration: 0.4, distortion: true });
  },
  mineWin:    () => {
    [0, 0.12, 0.24, 0.36].forEach((d, i) =>
      tone({ freq: [440, 550, 660, 880][i], vol: 0.18, duration: 0.14, delay: d })
    );
  },

  // ── Flappy ────────────────────────────────────────────────
  flappyFlap:  () => tone({ freq: 400, freq2: 600, type: 'square', vol: 0.12, duration: 0.07 }),
  flappyScore: () => tone({ freq: 880, freq2: 1200, type: 'sine', vol: 0.14, duration: 0.09 }),
  flappyDie:   () => {
    tone({ freq: 300, freq2: 80, type: 'sawtooth', vol: 0.20, duration: 0.3 });
    noise(0.25, 0.18, 0.05);
  },

  // ── 2048 ─────────────────────────────────────────────────
  tileMove:  () => tone({ freq: 220, type: 'sine', vol: 0.06, duration: 0.05 }),
  tileMerge: () => tone({ freq: 550, freq2: 700, type: 'sine', vol: 0.14, duration: 0.10 }),
  tile2048:  () => {
    [0, 0.10, 0.20, 0.32].forEach((d, i) =>
      tone({ freq: [440, 660, 880, 1320][i], vol: 0.20, duration: 0.14, delay: d })
    );
  },
  tileNoMove: () => tone({ freq: 160, type: 'square', vol: 0.08, duration: 0.05 }),
} as const;
