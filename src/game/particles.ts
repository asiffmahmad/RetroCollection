export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  decay: number;
  gravity: number;
  friction: number;
}

export class ParticleSystem {
  particles: Particle[] = [];

  emit(
    x: number,
    y: number,
    count: number,
    colors: string[],
    opts: {
      speed?: number;
      size?: number;
      life?: number;
      gravity?: number;
      spread?: number;
    } = {}
  ) {
    const {
      speed = 4,
      size = 4,
      life = 40,
      gravity = 0.08,
      spread = Math.PI * 2,
    } = opts;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * spread - spread / 2;
      const spd = speed * (0.3 + Math.random() * 0.7);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life,
        maxLife: life,
        size: size * (0.5 + Math.random() * 0.5),
        color: colors[Math.floor(Math.random() * colors.length)],
        decay: 1,
        gravity,
        friction: 0.96,
      });
    }
  }

  burst(x: number, y: number, count: number, colors: string[]) {
    this.emit(x, y, count, colors, { speed: 6, size: 5, life: 35 });
  }

  trail(x: number, y: number, colors: string[]) {
    this.emit(x, y, 2, colors, {
      speed: 1.5,
      size: 3,
      life: 20,
      gravity: 0,
    });
  }

  update() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.vx *= p.friction;
      p.vy *= p.friction;
      p.vy += p.gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const p of this.particles) {
      const alpha = p.life / p.maxLife;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  clear() {
    this.particles = [];
  }
}
