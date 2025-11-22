
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
  pos: Vector2;
  vel: Vector2;
  width: number;
  height: number;
  isGrounded: boolean;
}

export interface Button {
  id: number;
  triggerGateId: number; // ID of the gate this button opens
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

export interface LevelData {
  id: number;
  name: string;
  startPos: Vector2;
  companionPos: Vector2;
  platforms: Platform[];
  crates: Crate[];
  buttons: Button[];
  monsters: Monster[];
  inkLimit: number;
  noInkZones?: Zone[];
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}
