export type GameState = 'start' | 'playing' | 'paused' | 'gameover' | 'won';
export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

const CELL_SIZE = 32;
const COLS = 13;
const ROWS = 11;
const CW = COLS * CELL_SIZE;
const CH = ROWS * CELL_SIZE;

export const COLORS = {
  bg: '#1a1a2e',
  solid: '#4a4e69',
  soft: '#9a8c98',
  player: '#00ff88',
  enemy: '#ff3366',
  bomb: '#22223b',
  explosion: '#ff9900',
  powerupFire: '#ff5500',
  powerupBomb: '#00ccff',
  powerupSpeed: '#ffff00',
};

interface Callbacks {
  onScoreChange: (score: number) => void;
  onStateChange: (state: GameState) => void;
}

enum CellType {
  EMPTY = 0,
  SOLID = 1,
  SOFT = 2,
}

interface Bomb {
  id: number;
  r: number;
  c: number;
  timer: number;
  range: number;
  ownerId: number;
}

interface Explosion {
  r: number;
  c: number;
  timer: number;
}

interface Enemy {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  type: number;
  dir: Direction;
}

interface PowerUp {
  r: number;
  c: number;
  type: 'FIRE' | 'BOMB' | 'SPEED';
}

export class BombermanEngine {
  private ctx: CanvasRenderingContext2D;
  private cbs: Callbacks;
  private state: GameState = 'start';
  private score = 0;
  
  private grid: CellType[][] = [];
  private bombs: Bomb[] = [];
  private explosions: Explosion[] = [];
  private enemies: Enemy[] = [];
  private powerups: PowerUp[] = [];
  
  private pX = CELL_SIZE * 1.5;
  private pY = CELL_SIZE * 1.5;
  private pSpeed = 1.8;
  private maxBombs = 1;
  private fireRange = 2;
  private bombsPlaced = 0;
  
  private keys: Record<string, boolean> = {};
  private nextBombId = 1;
  private nextEnemyId = 1;
  
  constructor(canvas: HTMLCanvasElement, cbs: Callbacks) {
    this.ctx = canvas.getContext('2d')!;
    this.cbs = cbs;
    canvas.width = CW;
    canvas.height = CH;
    this.generateMap();
  }

  public getState() { return this.state; }
  public getScore() { return this.score; }
  public setKeys(keys: Record<string, boolean>) { this.keys = keys; }
  
  public start() {
    this.generateMap();
    this.pX = CELL_SIZE * 1.5;
    this.pY = CELL_SIZE * 1.5;
    this.pSpeed = 1.8;
    this.maxBombs = 1;
    this.fireRange = 2;
    this.bombsPlaced = 0;
    this.score = 0;
    this.bombs = [];
    this.explosions = [];
    this.powerups = [];
    this.keys = {};
    
    this.enemies = [
      { id: this.nextEnemyId++, x: CELL_SIZE * 11.5, y: CELL_SIZE * 1.5, vx: 0, vy: 0, speed: 1.0, type: 1, dir: 'DOWN' },
      { id: this.nextEnemyId++, x: CELL_SIZE * 1.5, y: CELL_SIZE * 9.5, vx: 0, vy: 0, speed: 1.0, type: 1, dir: 'RIGHT' },
      { id: this.nextEnemyId++, x: CELL_SIZE * 11.5, y: CELL_SIZE * 9.5, vx: 0, vy: 0, speed: 1.2, type: 2, dir: 'UP' },
    ];
    
    this.setState('playing');
  }
  
  public togglePause() {
    if (this.state === 'playing') this.setState('paused');
    else if (this.state === 'paused') this.setState('playing');
  }
  
  private setState(s: GameState) {
    this.state = s;
    this.cbs.onStateChange(s);
  }
  
  private generateMap() {
    this.grid = [];
    for (let r = 0; r < ROWS; r++) {
      const row: CellType[] = [];
      for (let c = 0; c < COLS; c++) {
        if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1 || (r % 2 === 0 && c % 2 === 0)) {
          row.push(CellType.SOLID);
        } else {
          if ((r === 1 && c === 1) || (r === 1 && c === 2) || (r === 2 && c === 1)) {
            row.push(CellType.EMPTY);
          } else {
            row.push(Math.random() > 0.4 ? CellType.SOFT : CellType.EMPTY);
          }
        }
      }
      this.grid.push(row);
    }
  }

  public placeBomb() {
    if (this.state !== 'playing') return;
    if (this.bombsPlaced >= this.maxBombs) return;
    
    const r = Math.floor(this.pY / CELL_SIZE);
    const c = Math.floor(this.pX / CELL_SIZE);
    
    if (this.bombs.some(b => b.r === r && b.c === c)) return;
    
    this.bombs.push({
      id: this.nextBombId++,
      r, c,
      timer: 180,
      range: this.fireRange,
      ownerId: 0
    });
    this.bombsPlaced++;
  }

  public update(time: number) {
    if (this.state !== 'playing') return;
    
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      b.timer--;
      if (b.timer <= 0) {
        this.explode(b);
        this.bombs.splice(i, 1);
        if (b.ownerId === 0) this.bombsPlaced--;
      }
    }
    
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      this.explosions[i].timer--;
      if (this.explosions[i].timer <= 0) {
        this.explosions.splice(i, 1);
      }
    }
    
    this.updatePlayer();
    this.updateEnemies();
    this.checkCollisions();
  }
  
  private explode(b: Bomb) {
    const dirs = [[0,0], [1,0], [-1,0], [0,1], [0,-1]];
    
    for (const [dr, dc] of dirs) {
      for (let i = 0; i <= b.range; i++) {
        if (dr === 0 && dc === 0 && i > 0) continue;
        
        const r = b.r + dr * i;
        const c = b.c + dc * i;
        
        if (this.grid[r][c] === CellType.SOLID) break;
        
        this.explosions.push({ r, c, timer: 30 });
        
        if (this.grid[r][c] === CellType.SOFT) {
          this.grid[r][c] = CellType.EMPTY;
          this.score += 10;
          this.cbs.onScoreChange(this.score);
          
          if (Math.random() < 0.25) {
            const types: ('FIRE' | 'BOMB' | 'SPEED')[] = ['FIRE', 'BOMB', 'SPEED'];
            this.powerups.push({ r, c, type: types[Math.floor(Math.random() * types.length)] });
          }
          break;
        }
      }
    }
  }

  private isSolid(r: number, c: number) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return true;
    if (this.grid[r][c] !== CellType.EMPTY) return true;
    if (this.bombs.some(b => b.r === r && b.c === c)) return true;
    return false;
  }

  private getBounds(x: number, y: number, size: number) {
    return {
      left: x - size/2,
      right: x + size/2,
      top: y - size/2,
      bottom: y + size/2
    };
  }

  private checkWallCollision(x: number, y: number, size: number) {
    const b = this.getBounds(x, y, size);
    
    const r1 = Math.floor(b.top / CELL_SIZE);
    const r2 = Math.floor(b.bottom / CELL_SIZE);
    const c1 = Math.floor(b.left / CELL_SIZE);
    const c2 = Math.floor(b.right / CELL_SIZE);
    
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        if (this.isSolid(r, c)) return true;
      }
    }
    return false;
  }

  private updatePlayer() {
    let vx = 0;
    let vy = 0;
    
    if (this.keys['ArrowUp'] || this.keys['w'] || this.keys['UP']) vy = -this.pSpeed;
    if (this.keys['ArrowDown'] || this.keys['s'] || this.keys['DOWN']) vy = this.pSpeed;
    if (this.keys['ArrowLeft'] || this.keys['a'] || this.keys['LEFT']) vx = -this.pSpeed;
    if (this.keys['ArrowRight'] || this.keys['d'] || this.keys['RIGHT']) vx = this.pSpeed;
    
    if (vx !== 0 && vy !== 0) {
      const inv = 1 / Math.sqrt(2);
      vx *= inv;
      vy *= inv;
    }
    
    const size = CELL_SIZE * 0.7;
    
    if (vx !== 0) {
      if (!this.checkWallCollision(this.pX + vx, this.pY, size)) {
        this.pX += vx;
      } else {
        const r = Math.floor(this.pY / CELL_SIZE);
        const cy = r * CELL_SIZE + CELL_SIZE/2;
        if (this.pY < cy && !this.checkWallCollision(this.pX + vx, this.pY + 1, size)) this.pY += 1.5;
        if (this.pY > cy && !this.checkWallCollision(this.pX + vx, this.pY - 1, size)) this.pY -= 1.5;
      }
    }
    
    if (vy !== 0) {
      if (!this.checkWallCollision(this.pX, this.pY + vy, size)) {
        this.pY += vy;
      } else {
        const c = Math.floor(this.pX / CELL_SIZE);
        const cx = c * CELL_SIZE + CELL_SIZE/2;
        if (this.pX < cx && !this.checkWallCollision(this.pX + 1, this.pY + vy, size)) this.pX += 1.5;
        if (this.pX > cx && !this.checkWallCollision(this.pX - 1, this.pY + vy, size)) this.pX -= 1.5;
      }
    }
  }

  private updateEnemies() {
    const size = CELL_SIZE * 0.8;
    for (const e of this.enemies) {
      let vx = 0, vy = 0;
      if (e.dir === 'UP') vy = -e.speed;
      if (e.dir === 'DOWN') vy = e.speed;
      if (e.dir === 'LEFT') vx = -e.speed;
      if (e.dir === 'RIGHT') vx = e.speed;
      
      if (!this.checkWallCollision(e.x + vx, e.y + vy, size)) {
        e.x += vx;
        e.y += vy;
      } else {
        const dirs: Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
        e.dir = dirs[Math.floor(Math.random() * 4)];
        e.x = Math.floor(e.x / CELL_SIZE) * CELL_SIZE + CELL_SIZE/2;
        e.y = Math.floor(e.y / CELL_SIZE) * CELL_SIZE + CELL_SIZE/2;
      }
    }
  }

  private checkCollisions() {
    const pr = Math.floor(this.pY / CELL_SIZE);
    const pc = Math.floor(this.pX / CELL_SIZE);
    
    if (this.explosions.some(ex => ex.r === pr && ex.c === pc)) {
      this.setState('gameover');
      return;
    }
    
    for (const e of this.enemies) {
      const dist = Math.hypot(this.pX - e.x, this.pY - e.y);
      if (dist < CELL_SIZE * 0.7) {
        this.setState('gameover');
        return;
      }
    }
    
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const pu = this.powerups[i];
      if (pu.r === pr && pu.c === pc) {
        if (pu.type === 'FIRE') this.fireRange++;
        if (pu.type === 'BOMB') this.maxBombs++;
        if (pu.type === 'SPEED') this.pSpeed = Math.min(this.pSpeed + 0.2, 3.0);
        this.score += 50;
        this.cbs.onScoreChange(this.score);
        this.powerups.splice(i, 1);
      }
    }
    
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const er = Math.floor(e.y / CELL_SIZE);
      const ec = Math.floor(e.x / CELL_SIZE);
      if (this.explosions.some(ex => ex.r === er && ex.c === ec)) {
        this.score += 100 * e.type;
        this.cbs.onScoreChange(this.score);
        this.enemies.splice(i, 1);
      }
    }
    
    if (this.enemies.length === 0) {
      this.setState('won');
    }
  }

  public draw() {
    this.ctx.fillStyle = COLORS.bg;
    this.ctx.fillRect(0, 0, CW, CH);
    
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = c * CELL_SIZE;
        const y = r * CELL_SIZE;
        
        if (this.grid[r][c] === CellType.SOLID) {
          this.ctx.fillStyle = COLORS.solid;
          this.ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
        } else if (this.grid[r][c] === CellType.SOFT) {
          this.ctx.fillStyle = COLORS.soft;
          this.ctx.fillRect(x + 2, y + 2, CELL_SIZE - 4, CELL_SIZE - 4);
        }
      }
    }
    
    for (const pu of this.powerups) {
      this.ctx.fillStyle = pu.type === 'FIRE' ? COLORS.powerupFire : pu.type === 'BOMB' ? COLORS.powerupBomb : COLORS.powerupSpeed;
      this.ctx.beginPath();
      this.ctx.arc(pu.c * CELL_SIZE + CELL_SIZE/2, pu.r * CELL_SIZE + CELL_SIZE/2, CELL_SIZE*0.3, 0, Math.PI*2);
      this.ctx.fill();
    }
    
    for (const b of this.bombs) {
      this.ctx.fillStyle = COLORS.bomb;
      this.ctx.beginPath();
      const pulse = Math.sin(b.timer * 0.2) * 2;
      this.ctx.arc(b.c * CELL_SIZE + CELL_SIZE/2, b.r * CELL_SIZE + CELL_SIZE/2, CELL_SIZE*0.35 + pulse, 0, Math.PI*2);
      this.ctx.fill();
    }
    
    this.ctx.fillStyle = COLORS.explosion;
    for (const ex of this.explosions) {
      this.ctx.fillRect(ex.c * CELL_SIZE + 2, ex.r * CELL_SIZE + 2, CELL_SIZE - 4, CELL_SIZE - 4);
    }
    
    for (const e of this.enemies) {
      this.ctx.fillStyle = COLORS.enemy;
      this.ctx.beginPath();
      this.ctx.arc(e.x, e.y, CELL_SIZE*0.4, 0, Math.PI*2);
      this.ctx.fill();
    }
    
    if (this.state !== 'gameover') {
      this.ctx.fillStyle = COLORS.player;
      this.ctx.beginPath();
      this.ctx.arc(this.pX, this.pY, CELL_SIZE*0.35, 0, Math.PI*2);
      this.ctx.fill();
    }
  }
  
  public destroy() {
  }
}
