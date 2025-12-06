
export enum GameState {
  MENU = 'MENU',
  PLAYING = 'PLAYING',
  LEVEL_COMPLETE = 'LEVEL_COMPLETE',
  GAME_OVER = 'GAME_OVER'
}

export interface Vector2 {
  x: number;
  y: number;
}

export interface Entity {
  pos: Vector2;
  vel: Vector2;
  width: number;
  height: number;
  isGrounded: boolean;
  color: string;
}

export interface Platform {
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'ground' | 'hazard' | 'goal' | 'gate';
  // Moving platform properties
  moving?: {
    rangeX: number;
    rangeY: number;
    speed: number;
    initialX: number;
    initialY: number;
    offset: number; // 0 to 2PI for phase
  };
  // Gate properties
  gateId?: number;
  isOpen?: boolean;
}

export interface Crate {
  id: number;
  type: 'wood' | 'bomb';
  pos: Vector2;
  vel: Vector2;
  width: number;
  height: number;
  isGrounded: boolean;
}

export interface Button {
  id: number;
  triggerGateId?: number; // ID of the gate this button opens
  triggerSpawnerId?: number; // ID of the spawner this button activates
  x: number;
  y: number;
  width: number;
  height: number;
  isPressed: boolean;
}

export interface Monster {
  id: number;
  pos: Vector2;
  vel: Vector2;
  width: number;
  height: number;
  patrolStart: number;
  patrolEnd: number;
}

export interface BridgeSegment {
  p1: Vector2;
  p2: Vector2;
  life: number;
}

export interface Zone {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Boss {
  x: number;
  y: number;
  width: number;
  height: number;
  hp: number;
  maxHp: number;
  phase: 1 | 2;
  attackTimer: number;
  shotCount: number; // Tracks bullets fired in current volley
  invulnerableTimer: number;
  state: 'idle' | 'attack' | 'cooldown' | 'move';
}

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  life: number;
}

export interface Spawner {
  id: number;
  x: number;
  y: number;
  itemType: 'bomb';
  cooldown: number;
}

export interface LevelData {
  id: number;
  name: string;
  startPos: Vector2;
  companionPos: Vector2;
  platforms: Platform[];
  crates: Crate[];
  buttons: Button[];
  monsters: Monster[];
  boss?: Boss;
  spawners?: Spawner[];
  inkLimit: number;
  noInkZones?: Zone[];
  autoScrollSpeed?: number; // Pixels per frame
  playerMaxHp?: number; // Optional custom max HP for specific levels
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}
