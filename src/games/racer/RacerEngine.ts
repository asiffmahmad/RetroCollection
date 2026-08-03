export type GameState = 'start' | 'playing' | 'paused' | 'gameover';

interface Callbacks {
  onScoreChange: (score: number) => void;
  onSpeedChange: (speed: number) => void;
  onStateChange: (state: GameState) => void;
}

const ROAD_WIDTH = 2000;
const SEGMENT_LENGTH = 200;
const RUMBLE_LENGTH = 3;
const CAMERA_HEIGHT = 1000;
const CAMERA_DEPTH = 1 / Math.tan((100 / 2) * Math.PI / 180);
const DRAW_DISTANCE = 300;
const MAX_SPEED = SEGMENT_LENGTH * 60;
const ACCEL = MAX_SPEED / 50;
const BREAKING = -MAX_SPEED;
const DECEL = -MAX_SPEED / 50;
const OFF_ROAD_DECEL = -MAX_SPEED / 2;
const OFF_ROAD_LIMIT = MAX_SPEED / 4;
const CENTRIFUGAL = 0.3;

interface Point {
  world: { x: number; y: number; z: number };
  camera: { x: number; y: number; z: number };
  screen: { x: number; y: number; w: number; scale: number };
}

interface Sprite {
  offset: number;
  type: string;
  speed?: number;
  z?: number;
}

interface Segment {
  index: number;
  p1: Point;
  p2: Point;
  curve: number;
  sprites: Sprite[];
  color: { road: string; grass: string; rumble: string; lane: string };
  looped?: boolean;
  fog?: number;
}

const COLORS = {
  LIGHT: { road: '#6b6b6b', grass: '#10aa10', rumble: '#555555', lane: '#cccccc' },
  DARK: { road: '#696969', grass: '#009a00', rumble: '#bb1111', lane: '#696969' },
};

export class RacerEngine {
  private ctx: CanvasRenderingContext2D;
  private cbs: Callbacks;
  private cw: number;
  private ch: number;
  
  private state: GameState = 'start';
  
  private segments: Segment[] = [];
  private trackLength = 0;
  
  private position = 0;
  private speed = 0;
  private playerX = 0;
  private playerZ = 0;
  
  public keyUp = false;
  public keyDown = false;
  public keyLeft = false;
  public keyRight = false;
  
  private score = 0;
  private skyOffset = 0;
  
  constructor(canvas: HTMLCanvasElement, cbs: Callbacks) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.cbs = cbs;
    this.cw = canvas.width;
    this.ch = canvas.height;
    
    this.resetRoad();
  }

  public getState() { return this.state; }
  
  public start() {
    this.position = 0;
    this.speed = 0;
    this.playerX = 0;
    this.score = 0;
    this.cbs.onScoreChange(0);
    this.cbs.onSpeedChange(0);
    this.resetRoad();
    this.setState('playing');
  }
  
  private setState(s: GameState) {
    this.state = s;
    this.cbs.onStateChange(s);
  }
  
  public togglePause() {
    if (this.state === 'playing') this.setState('paused');
    else if (this.state === 'paused') this.setState('playing');
  }

  private addSegment(curve: number, y: number) {
    const n = this.segments.length;
    this.segments.push({
      index: n,
      p1: { world: { x: 0, y: n === 0 ? 0 : this.segments[n-1].p2.world.y, z: n * SEGMENT_LENGTH }, camera: {x:0,y:0,z:0}, screen: {x:0,y:0,w:0,scale:0} },
      p2: { world: { x: 0, y, z: (n + 1) * SEGMENT_LENGTH }, camera: {x:0,y:0,z:0}, screen: {x:0,y:0,w:0,scale:0} },
      curve,
      sprites: [],
      color: Math.floor(n / RUMBLE_LENGTH) % 2 ? COLORS.DARK : COLORS.LIGHT
    });
  }

  private addRoad(enter: number, hold: number, leave: number, curve: number, y: number) {
    const startY = this.segments.length === 0 ? 0 : this.segments[this.segments.length - 1].p2.world.y;
    const endY = startY + (Math.floor(y) * SEGMENT_LENGTH);
    const total = enter + hold + leave;
    
    for (let n = 0; n < enter; n++) this.addSegment(this.easeIn(0, curve, n / enter), this.easeInOut(startY, endY, n / total));
    for (let n = 0; n < hold; n++) this.addSegment(curve, this.easeInOut(startY, endY, (enter + n) / total));
    for (let n = 0; n < leave; n++) this.addSegment(this.easeInOut(curve, 0, n / leave), this.easeInOut(startY, endY, (enter + hold + n) / total));
  }

  private easeIn(a: number, b: number, percent: number) { return a + (b - a) * Math.pow(percent, 2); }
  private easeInOut(a: number, b: number, percent: number) { return a + (b - a) * ((-Math.cos(percent * Math.PI) / 2) + 0.5); }

  private resetRoad() {
    this.segments = [];
    
    const LENGTH = { NONE: 0, SHORT: 25, MEDIUM: 50, LONG: 100 };
    const CURVE = { NONE: 0, EASY: 2, MEDIUM: 4, HARD: 6 };
    const HILL = { NONE: 0, LOW: 20, MEDIUM: 40, HIGH: 60 };

    this.addRoad(LENGTH.SHORT, LENGTH.SHORT, LENGTH.SHORT, CURVE.NONE, HILL.NONE);
    this.addRoad(LENGTH.MEDIUM, LENGTH.MEDIUM, LENGTH.MEDIUM, CURVE.EASY, HILL.LOW);
    this.addRoad(LENGTH.LONG, LENGTH.LONG, LENGTH.LONG, -CURVE.MEDIUM, -HILL.LOW);
    this.addRoad(LENGTH.SHORT, LENGTH.SHORT, LENGTH.SHORT, CURVE.HARD, HILL.HIGH);
    this.addRoad(LENGTH.LONG, LENGTH.MEDIUM, LENGTH.LONG, -CURVE.EASY, -HILL.MEDIUM);
    this.addRoad(LENGTH.MEDIUM, LENGTH.LONG, LENGTH.MEDIUM, CURVE.MEDIUM, HILL.LOW);
    
    for(let i=0; i<100; i++) {
      const c = (Math.random() - 0.5) * 12;
      const h = (Math.random() - 0.5) * 100;
      this.addRoad(LENGTH.MEDIUM, LENGTH.MEDIUM, LENGTH.MEDIUM, c, h);
    }

    this.trackLength = this.segments.length * SEGMENT_LENGTH;
    
    for (let i = 0; i < 200; i++) {
      const segment = this.segments[Math.floor(Math.random() * this.segments.length)];
      if (segment.index > 50) {
        segment.sprites.push({
          type: 'car',
          offset: Math.random() > 0.5 ? 0.4 : -0.4,
          speed: (MAX_SPEED / 4) + (Math.random() * MAX_SPEED / 2),
          z: 0
        });
      }
    }
    
    for (let i = 0; i < this.segments.length; i += 5) {
      if (Math.random() > 0.3) {
        this.segments[i].sprites.push({
          type: 'palm',
          offset: Math.random() > 0.5 ? 1.5 : -1.5,
        });
      }
    }
  }

  private findSegment(z: number): Segment {
    return this.segments[Math.floor(z / SEGMENT_LENGTH) % this.segments.length];
  }

  public update(dt: number) {
    if (this.state !== 'playing') return;
    
    const dtSeconds = dt / 1000;
    const playerSegment = this.findSegment(this.position + this.playerZ);
    const speedPercent = this.speed / MAX_SPEED;
    
    const dx = dtSeconds * 2 * speedPercent;
    if (this.keyLeft) this.playerX = this.playerX - dx;
    else if (this.keyRight) this.playerX = this.playerX + dx;
    
    this.playerX = this.playerX - (dx * speedPercent * playerSegment.curve * CENTRIFUGAL);
    
    if (this.keyUp) this.speed += ACCEL * dtSeconds;
    else if (this.keyDown) this.speed += BREAKING * dtSeconds;
    else this.speed += DECEL * dtSeconds;
    
    if (this.playerX < -1 || this.playerX > 1) {
      if (this.speed > OFF_ROAD_LIMIT) this.speed += OFF_ROAD_DECEL * dtSeconds;
      if (this.speed > 0) this.playerX += (Math.random() - 0.5) * 0.05;
    }
    
    this.speed = Math.max(0, Math.min(MAX_SPEED, this.speed));
    this.position = this.position + (this.speed * dtSeconds);
    
    if (this.position >= this.trackLength) {
      this.position -= this.trackLength;
    }
    
    if (this.speed > 0) {
      this.score += Math.floor((this.speed * dtSeconds) / 100);
      this.cbs.onScoreChange(this.score);
      this.skyOffset = (this.skyOffset + playerSegment.curve * speedPercent * dtSeconds * 0.1) % 1;
    }
    
    this.cbs.onSpeedChange(Math.floor(this.speed / 100));
    
    for (let n = 0; n < DRAW_DISTANCE; n++) {
      const segment = this.segments[(playerSegment.index + n) % this.segments.length];
      for (let i = 0; i < segment.sprites.length; i++) {
        const sprite = segment.sprites[i];
        if (sprite.type === 'car') {
          const zOffset = sprite.z || 0;
          sprite.z = zOffset + (sprite.speed! * dtSeconds);
          if (sprite.z > SEGMENT_LENGTH) {
            const nextSegment = this.segments[(segment.index + 1) % this.segments.length];
            nextSegment.sprites.push(sprite);
            segment.sprites.splice(i, 1);
            i--;
            sprite.z -= SEGMENT_LENGTH;
          }
          
          if (segment.index === playerSegment.index) {
            const overlapX = Math.abs(this.playerX - sprite.offset) < 0.3;
            const overlapZ = (this.playerZ > (sprite.z! - 200)) && (this.playerZ < (sprite.z! + 200));
            if (overlapX && overlapZ) {
              this.speed = Math.max(0, this.speed * 0.5);
              this.playerX += (this.playerX < sprite.offset) ? -0.1 : 0.1;
            }
          }
        }
      }
    }
  }

  private project(p: Point, cameraX: number, cameraY: number, cameraZ: number, cameraDepth: number, width: number, height: number, roadWidth: number) {
    p.camera.x = (p.world.x || 0) - cameraX;
    p.camera.y = (p.world.y || 0) - cameraY;
    p.camera.z = (p.world.z || 0) - cameraZ;
    if (p.camera.z <= 0) return false;
    p.screen.scale = cameraDepth / p.camera.z;
    p.screen.x = Math.round((width / 2) + (p.screen.scale * p.camera.x * width / 2));
    p.screen.y = Math.round((height / 2) - (p.screen.scale * p.camera.y * height / 2));
    p.screen.w = Math.round((p.screen.scale * roadWidth * width / 2));
    return true;
  }

  private drawPolygon(x1: number, y1: number, w1: number, x2: number, y2: number, w2: number, color: string) {
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.moveTo(x1 - w1, y1);
    this.ctx.lineTo(x2 - w2, y2);
    this.ctx.lineTo(x2 + w2, y2);
    this.ctx.lineTo(x1 + w1, y1);
    this.ctx.fill();
  }
  
  private drawSegment(s: Segment) {
    const x1 = s.p1.screen.x;
    const y1 = s.p1.screen.y;
    const w1 = s.p1.screen.w;
    const x2 = s.p2.screen.x;
    const y2 = s.p2.screen.y;
    const w2 = s.p2.screen.w;
    
    this.ctx.fillStyle = s.color.grass;
    this.ctx.fillRect(0, y2, this.cw, y1 - y2);
    
    const r1 = w1 / Math.max(6, 2 * 6);
    const r2 = w2 / Math.max(6, 2 * 6);
    this.drawPolygon(x1, y1, w1 + r1, x2, y2, w2 + r2, s.color.rumble);
    
    this.drawPolygon(x1, y1, w1, x2, y2, w2, s.color.road);
    
    if (s.color.lane) {
      const l1 = w1 / 32;
      const l2 = w2 / 32;
      const lanew1 = w1 * 2 / 3;
      const lanew2 = w2 * 2 / 3;
      const lanew1_2 = w1 / 3;
      const lanew2_2 = w2 / 3;
      
      this.drawPolygon(x1 - lanew1, y1, l1, x2 - lanew2, y2, l2, s.color.lane);
      this.drawPolygon(x1 + lanew1, y1, l1, x2 + lanew2, y2, l2, s.color.lane);
      this.drawPolygon(x1 - lanew1_2, y1, l1, x2 - lanew2_2, y2, l2, s.color.lane);
      this.drawPolygon(x1 + lanew1_2, y1, l1, x2 + lanew2_2, y2, l2, s.color.lane);
    }
  }

  private drawSprite(sprite: Sprite, segment: Segment) {
    const scale = segment.p1.screen.scale;
    const destX = segment.p1.screen.x + (scale * sprite.offset * ROAD_WIDTH * this.cw / 2);
    const destY = segment.p1.screen.y;
    
    this.ctx.save();
    
    if (sprite.type === 'car') {
      const w = 150 * scale * this.cw / 2;
      const h = 100 * scale * this.cw / 2;
      this.ctx.fillStyle = '#ff4444';
      this.ctx.fillRect(destX - w/2, destY - h, w, h);
      this.ctx.fillStyle = '#000000';
      this.ctx.fillRect(destX - w/3, destY - h + h*0.2, w*2/3, h*0.3);
      this.ctx.fillStyle = '#111';
      this.ctx.fillRect(destX - w/2 - w*0.1, destY - h*0.3, w*0.2, h*0.3);
      this.ctx.fillRect(destX + w/2 - w*0.1, destY - h*0.3, w*0.2, h*0.3);
    } else if (sprite.type === 'palm') {
      const w = 200 * scale * this.cw / 2;
      const h = 400 * scale * this.cw / 2;
      this.ctx.fillStyle = '#8B4513';
      this.ctx.fillRect(destX - w*0.1, destY - h, w*0.2, h);
      this.ctx.fillStyle = '#228B22';
      this.ctx.beginPath();
      this.ctx.arc(destX, destY - h, w*0.6, 0, Math.PI*2);
      this.ctx.fill();
    }
    
    this.ctx.restore();
  }

  private drawPlayer(cameraDepth: number, playerY: number) {
    const scale = cameraDepth / CAMERA_HEIGHT;
    const destX = this.cw / 2;
    const destY = this.ch - 30;
    
    const bounce = (this.speed > 0) ? Math.sin(performance.now() / 50) * 2 : 0;
    
    const w = 160;
    const h = 80;
    
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
    this.ctx.fillRect(destX - w/2, destY - h/4 + bounce, w, h/2);
    
    this.ctx.fillStyle = '#00ccff';
    this.ctx.fillRect(destX - w/2, destY - h + bounce, w, h);
    
    this.ctx.fillStyle = this.keyDown ? '#ff0000' : '#880000';
    this.ctx.fillRect(destX - w/2 + 10, destY - h + 20 + bounce, 30, 20);
    this.ctx.fillRect(destX + w/2 - 40, destY - h + 20 + bounce, 30, 20);
    
    this.ctx.fillStyle = '#111';
    this.ctx.fillRect(destX - w/2 - 10, destY - h + 40 + bounce, 20, 40);
    this.ctx.fillRect(destX + w/2 - 10, destY - h + 40 + bounce, 20, 40);
    
    this.ctx.restore();
  }

  public draw() {
    this.ctx.clearRect(0, 0, this.cw, this.ch);
    
    const sky = this.ctx.createLinearGradient(0, 0, 0, this.ch / 2);
    sky.addColorStop(0, '#000033');
    sky.addColorStop(1, '#ff3366');
    this.ctx.fillStyle = sky;
    this.ctx.fillRect(0, 0, this.cw, this.ch / 2);
    
    const sunX = this.cw / 2 - (this.skyOffset * this.cw * 2) + this.cw;
    this.ctx.fillStyle = '#ffcc00';
    this.ctx.beginPath();
    this.ctx.arc(sunX % this.cw, this.ch / 2, 80, Math.PI, Math.PI * 2);
    this.ctx.fill();

    const baseSegment = this.findSegment(this.position);
    const basePercent = (this.position % SEGMENT_LENGTH) / SEGMENT_LENGTH;
    
    let playerY = baseSegment.p1.world.y + (baseSegment.p2.world.y - baseSegment.p1.world.y) * basePercent;
    
    let maxy = this.ch;
    let x = 0;
    let dx = -(baseSegment.curve * basePercent);
    
    const drawQ: Segment[] = [];
    
    for (let n = 0; n < DRAW_DISTANCE; n++) {
      const segment = this.segments[(baseSegment.index + n) % this.segments.length];
      segment.looped = segment.index < baseSegment.index;
      segment.fog = Math.min(1, (DRAW_DISTANCE - n) / DRAW_DISTANCE);
      
      const cameraX = this.playerX * ROAD_WIDTH + x;
      const cameraY = CAMERA_HEIGHT + playerY;
      const cameraZ = this.position - (segment.looped ? this.trackLength : 0);
      
      const p1Visible = this.project(segment.p1, cameraX, cameraY, cameraZ, CAMERA_DEPTH, this.cw, this.ch, ROAD_WIDTH);
      const p2Visible = this.project(segment.p2, cameraX - dx, cameraY, cameraZ, CAMERA_DEPTH, this.cw, this.ch, ROAD_WIDTH);
      
      x = x + dx;
      dx = dx + segment.curve;
      
      if (!p1Visible || !p2Visible || segment.p1.camera.z <= CAMERA_DEPTH || segment.p2.screen.y >= maxy) {
        continue;
      }
      
      drawQ.push(segment);
      maxy = segment.p1.screen.y;
    }
    
    for (let n = drawQ.length - 1; n >= 0; n--) {
      const s = drawQ[n];
      this.drawSegment(s);
      
      for (const sprite of s.sprites) {
        this.drawSprite(sprite, s);
      }
    }
    
    this.drawPlayer(CAMERA_DEPTH, playerY);
  }
}
