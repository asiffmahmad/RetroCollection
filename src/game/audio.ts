let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (!audioCtx) {
    try {
      audioCtx = new AudioContext();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

function playTone(
  freq: number,
  duration: number,
  type: OscillatorType = 'square',
  volume = 0.1,
  freqEnd?: number
) {
  const ctx = getCtx();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  if (freqEnd) {
    osc.frequency.exponentialRampToValueAtTime(freqEnd, ctx.currentTime + duration);
  }
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

export function playEat(combo: number) {
  const baseFreq = 440 + combo * 60;
  playTone(baseFreq, 0.12, 'square', 0.08);
  setTimeout(() => playTone(baseFreq * 1.5, 0.08, 'square', 0.06), 50);
}

export function playDeath() {
  playTone(300, 0.3, 'sawtooth', 0.1, 80);
}

export function playMove() {
  playTone(200, 0.03, 'sine', 0.02);
}

export function playHighScore() {
  const notes = [523, 659, 784, 1047];
  notes.forEach((n, i) => {
    setTimeout(() => playTone(n, 0.15, 'square', 0.06), i * 80);
  });
}

export function initAudio() {
  getCtx();
}
