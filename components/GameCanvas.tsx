
import React, { useEffect, useRef, useCallback } from 'react';
import { GameState, LevelData, Entity, Platform, BridgeSegment, Vector2, Particle, Crate, Monster, Button, Zone, Boss, Projectile, Spawner } from '../types';
import { audioService } from '../services/audioService';

interface GameCanvasProps {
  gameState: GameState;
  currentLevel: LevelData;
  onLevelComplete: (bridges: number) => void;
  onGameOver: () => void;
  inkLeft: number;
  setInkLeft: (val: number) => void;
  setPlayerHp: (val: number) => void;
}

// --- Physics Constants ---
const GRAVITY = 0.5;
const GUIDE_SPEED = 2.2; 
const JUMP_FORCE = -11;
const FRICTION = 0.75;
const TETHER_LENGTH = 70; 
const RECONNECT_DIST = 100; // Max distance to reconnect
const TETHER_STRENGTH = 0.05;
const COMPANION_DRAG = 0.9;
const COMPANION_WEIGHT = 0.8;
const WOOD_FRICTION = 0.7;
const BOMB_FRICTION = 0.99; // Very slippery/rolling

const GameCanvas: React.FC<GameCanvasProps> = ({ 
  gameState, 
  currentLevel,
  onLevelComplete,
  onGameOver,
  inkLeft,
  setInkLeft,
  setPlayerHp
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number | null>(null);
  
  // Inputs
  const keys = useRef<{ [key: string]: boolean }>({});
  const mouse = useRef<{ x: number, y: number, isDown: boolean }>({ x: 0, y: 0, isDown: false });
  const toggleCooldown = useRef(false); // Prevent rapid toggling

  // Game State Logic
  const physicsRef = useRef({
    guide: { pos: {x:0, y:0}, vel: {x:0, y:0}, width: 30, height: 30, isGrounded: false, color: '#60a5fa', hp: 5, maxHp: 5, invulnerableTimer: 0 } as Entity & { hp?: number, maxHp?: number, invulnerableTimer?: number },
    companion: { pos: {x:0, y:0}, vel: {x:0, y:0}, width: 30, height: 30, isGrounded: false, color: '#ef4444', hp: 5, maxHp: 5, invulnerableTimer: 0 } as Entity & { hp?: number, maxHp?: number, invulnerableTimer?: number },
    bridges: [] as BridgeSegment[],
    particles: [] as Particle[],
    // Local state copies for physics simulation
    platforms: [] as Platform[], 
    crates: [] as Crate[],
    buttons: [] as Button[],
    monsters: [] as Monster[],
    noInkZones: [] as Zone[],
    boss: null as Boss | null,
    projectiles: [] as Projectile[],
    spawners: [] as Spawner[],
    bridgeCount: 0,
    lastMousePos: null as Vector2 | null,
    cameraX: 0,
    time: 0,
    isTethered: true 
  });

  // Start BGM on mount
  useEffect(() => {
    // We can't start BGM immediately due to autoplay policy, 
    // but audioService.resume() is called on input interactions which will unblock it.
    audioService.startBGM();
    return () => {
      audioService.stopBGM();
    };
  }, []);

  // Init Level
  useEffect(() => {
    const p = physicsRef.current;
    p.guide.pos = { ...currentLevel.startPos };
    p.guide.vel = { x: 0, y: 0 };
    
    // Set HP based on level config (default 5, or custom like 15)
    const startingHp = currentLevel.playerMaxHp || 5;
    p.guide.hp = startingHp; 
    p.guide.maxHp = startingHp;
    p.guide.invulnerableTimer = 0;
    setPlayerHp(startingHp); // Sync UI
    
    p.companion.pos = { ...currentLevel.companionPos };
    p.companion.vel = { x: 0, y: 0 };
    p.companion.hp = 5;
    p.companion.maxHp = 5;

    p.bridges = [];
    p.particles = [];
    p.projectiles = [];
    
    // Deep clone level data so we can mutate it (e.g. moving platforms, button states)
    p.platforms = JSON.parse(JSON.stringify(currentLevel.platforms));
    p.crates = JSON.parse(JSON.stringify(currentLevel.crates || []));
    p.buttons = JSON.parse(JSON.stringify(currentLevel.buttons || []));
    p.monsters = JSON.parse(JSON.stringify(currentLevel.monsters || []));
    p.noInkZones = JSON.parse(JSON.stringify(currentLevel.noInkZones || []));
    p.boss = currentLevel.boss ? JSON.parse(JSON.stringify(currentLevel.boss)) : null;
    p.spawners = JSON.parse(JSON.stringify(currentLevel.spawners || []));

    p.bridgeCount = 0;
    p.cameraX = 0;
    // Set initial camera for auto-scroll levels to align with start
    if (currentLevel.autoScrollSpeed) {
        p.cameraX = 0;
    }
    p.time = 0;
    p.isTethered = true; // Reset tether on new level
  }, [currentLevel, gameState]);

  // --- Physics Engine ---

  const checkRectCollide = (rect1: {pos: Vector2, width: number, height: number}, rect2: {x: number, y: number, width: number, height: number}) => {
    return (
      rect1.pos.x < rect2.x + rect2.width &&
      rect1.pos.x + rect1.width > rect2.x &&
      rect1.pos.y < rect2.y + rect2.height &&
      rect1.pos.y + rect1.height > rect2.y
    );
  };

  const resolveCollision = (entity: {pos: Vector2, vel: Vector2, width: number, height: number, isGrounded: boolean}, plat: Platform) => {
    // Don't collide with open gates
    if (plat.type === 'gate' && plat.isOpen) return;

    const overlapX = (entity.width + plat.width)/2 - Math.abs((entity.pos.x + entity.width/2) - (plat.x + plat.width/2));
    const overlapY = (entity.height + plat.height)/2 - Math.abs((entity.pos.y + entity.height/2) - (plat.y + plat.height/2));

    if (overlapY < overlapX) {
      // Vertical collision
      if (entity.vel.y > 0 && entity.pos.y < plat.y) {
        // Landed on top
        // Play landing sound if impact was heavy enough
        if (entity.vel.y > 5) audioService.playLand();

        entity.pos.y = plat.y - entity.height;
        entity.vel.y = 0;
        entity.isGrounded = true;
        
        // Moving platform friction/carry logic
        if (plat.moving) {
           const timeStep = 0.05; // Matches the tick time increment
           const currentPhase = physicsRef.current.time * plat.moving.speed + plat.moving.offset;
           const nextPhase = (physicsRef.current.time + timeStep) * plat.moving.speed + plat.moving.offset;

           // Calculate exact position now and next frame
           const currX = plat.moving.initialX + Math.sin(currentPhase) * plat.moving.rangeX;
           const nextX = plat.moving.initialX + Math.sin(nextPhase) * plat.moving.rangeX;
           
           const diffX = nextX - currX;
           
           // Apply the exact platform delta to the entity
           entity.pos.x += diffX;
           
           // Vertical moving platforms (Optional based on levels, but good to have)
           if (plat.moving.rangeY > 0) {
             const currY = plat.moving.initialY + Math.cos(currentPhase) * plat.moving.rangeY;
             const nextY = plat.moving.initialY + Math.cos(nextPhase) * plat.moving.rangeY;
             entity.pos.y += (nextY - currY);
           }
        }

      } else if (entity.vel.y < 0 && entity.pos.y > plat.y) {
        // Hit head
        entity.pos.y = plat.y + plat.height;
        entity.vel.y = 0;
      }
    } else {
      // Horizontal collision
      // Improved snapping logic: check relative center position
      const entCenter = entity.pos.x + entity.width/2;
      const platCenter = plat.x + plat.width/2;
      
      if (entCenter > platCenter) {
          // Entity is to the right -> Push Right
          entity.pos.x = plat.x + plat.width;
      } else {
          // Entity is to the left -> Push Left
          entity.pos.x = plat.x - entity.width;
      }
      entity.vel.x = 0;
    }
  };

  const checkBridgeCollide = (entity: Entity | Crate, bridge: BridgeSegment) => {
    if (entity.vel.y < 0) return false; // Only when falling

    const feetX = entity.pos.x + entity.width / 2;
    const feetY = entity.pos.y + entity.height;

    const minX = Math.min(bridge.p1.x, bridge.p2.x);
    const maxX = Math.max(bridge.p1.x, bridge.p2.x);

    if (feetX >= minX - 5 && feetX <= maxX + 5) {
      const dx = bridge.p2.x - bridge.p1.x;
      const dy = bridge.p2.y - bridge.p1.y;
      
      // Prevent division by zero, though minimal impact here
      if (Math.abs(dx) < 0.01) return false; 

      const slope = dy / dx;
      const lineY = bridge.p1.y + slope * (feetX - bridge.p1.x);

      if (feetY >= lineY - 8 && feetY <= lineY + 15) { // Slight tolerance
        return { y: lineY, slope, angle: Math.atan2(dy, dx) };
      }
    }
    return false;
  };

  const updateEntityPhysics = (entity: Entity | Crate) => {
      entity.vel.y += GRAVITY;
      entity.pos.x += entity.vel.x;
      entity.pos.y += entity.vel.y;
      entity.isGrounded = false;
  };

  const takeDamage = (ent: any) => {
      if (ent.invulnerableTimer > 0) return;
      
      if (currentLevel.boss || currentLevel.playerMaxHp) {
          // HP System
          ent.hp--;
          ent.invulnerableTimer = 60; // 1s invul
          audioService.playPlayerHit();
          
          if (ent === physicsRef.current.guide) {
              setPlayerHp(ent.hp); // Update UI
          }

          if (ent.hp <= 0) {
              audioService.playGameOver();
              onGameOver();
          }
      } else {
          // Normal level: Instant Kill
          audioService.playGameOver();
          onGameOver();
      }
  };

  const updateEntityCollisions = (entity: Entity | Crate, isPlayer: boolean) => {
    const p = physicsRef.current;
    
    // Update invulnerability
    if (isPlayer && (entity as any).invulnerableTimer > 0) {
        (entity as any).invulnerableTimer--;
    }

    // Platform Collisions
    for (const plat of p.platforms) {
      if (checkRectCollide(entity, plat)) {
        if (plat.type === 'hazard' && isPlayer) {
           // Fall hazard is always instant death
           audioService.playGameOver();
           onGameOver();
           return;
        }
        if (plat.type === 'ground' || plat.type === 'goal' || plat.type === 'gate') {
           resolveCollision(entity as any, plat);
        }
      }
    }

    // Bridge Collisions
    for (const bridge of p.bridges) {
      const collision = checkBridgeCollide(entity, bridge);
      if (collision) {
        if (entity.vel.y > 5) audioService.playLand();
        entity.pos.y = collision.y - entity.height;
        entity.vel.y = 0;
        entity.isGrounded = true;
        
        // Special logic for bombs rolling on bridges
        if ((entity as Crate).type === 'bomb') {
            // Apply slope physics
            const gravitySlide = Math.sin(collision.angle) * GRAVITY * 2;
            entity.vel.x += gravitySlide;
            entity.vel.x *= 0.98; // Very low friction on lines
        } else {
            // Normal entity friction
            entity.vel.x *= 0.9;
        }
      }
    }

    // Screen Floor Kill
    if (entity.pos.y > 2000 && isPlayer) {
       audioService.playGameOver();
       onGameOver();
    }
  };

  const updateMovingPlatforms = () => {
    const p = physicsRef.current;
    p.platforms.forEach(plat => {
      if (plat.moving) {
        const phase = p.time * plat.moving.speed + plat.moving.offset;
        plat.x = plat.moving.initialX + Math.sin(phase) * plat.moving.rangeX;
        plat.y = plat.moving.initialY + Math.cos(phase) * plat.moving.rangeY;
      }
    });
  };

  const updateMonsters = () => {
     const p = physicsRef.current;
     p.monsters.forEach(m => {
        // Patrol logic
        m.pos.x += m.vel.x;
        if (m.pos.x > m.patrolEnd || m.pos.x < m.patrolStart) {
           m.vel.x *= -1;
        }
        
        // Check collision with players
        if (checkRectCollide(p.guide, {x: m.pos.x, y: m.pos.y, width: m.width, height: m.height})) {
            takeDamage(p.guide);
        }
        // Companion is safe from monsters in current design request
     });
  };

  const resolveCratePush = (pusher: Entity, crate: Crate) => {
    const dx = (pusher.pos.x + pusher.width/2) - (crate.pos.x + crate.width/2);
    const dy = (pusher.pos.y + pusher.height/2) - (crate.pos.y + crate.height/2);
    
    const combinedHalfWidth = pusher.width/2 + crate.width/2;
    const combinedHalfHeight = pusher.height/2 + crate.height/2;

    if (Math.abs(dx) < combinedHalfWidth && Math.abs(dy) < combinedHalfHeight) {
        const overlapX = combinedHalfWidth - Math.abs(dx);
        const overlapY = combinedHalfHeight - Math.abs(dy);

        // Only push horizontally and if feet aligned
        if (overlapX < overlapY && overlapY > 5) {
            const pushDir = dx > 0 ? -1 : 1; // If dx>0 (pusher right of crate), push left
            
            // Try to move crate
            const moveAmount = overlapX * pushDir;
            crate.pos.x += moveAmount;
            
            // Check if crate hit a wall after move
            const p = physicsRef.current;
            let hitWall = false;
            for (const plat of p.platforms) {
                if (plat.type !== 'hazard' && checkRectCollide(crate, plat)) {
                    if (plat.type === 'gate' && plat.isOpen) continue;
                    hitWall = true; 
                    break;
                }
            }

            // If crate hit wall, move it back and stop pusher
            if (hitWall) {
                crate.pos.x -= moveAmount; // Revert crate
                pusher.pos.x -= moveAmount; // Revert pusher (pusher is blocked by crate which is blocked by wall)
                pusher.vel.x = 0;
                crate.vel.x = 0;
            } else {
                // Crate moved successfully, transfer some velocity
                crate.vel.x = pusher.vel.x * 0.9; 
            }
        } else if (overlapY < overlapX && pusher.vel.y > 0 && pusher.pos.y < crate.pos.y) {
             // Landing on crate
             if (pusher.vel.y > 5) audioService.playLand();
             pusher.pos.y = crate.pos.y - pusher.height;
             pusher.vel.y = 0;
             pusher.isGrounded = true;
        }
    }
  };

  const updateCrates = () => {
    const p = physicsRef.current;
    p.crates.forEach(crate => {
       updateEntityPhysics(crate);
       updateEntityCollisions(crate, false);
       // Apply different friction based on type
       const friction = crate.type === 'bomb' ? BOMB_FRICTION : WOOD_FRICTION;
       crate.vel.x *= friction; 
    });

    // Handle Guide AND Companion <-> Crate interactions (Pushing)
    p.crates.forEach(crate => {
         resolveCratePush(p.guide, crate);
         resolveCratePush(p.companion, crate);
    });
  };

  const updateButtons = () => {
     const p = physicsRef.current;
     p.buttons.forEach(btn => {
        // Check if anything is pressing the button (Guide, Companion, or Crates)
        const wasPressed = btn.isPressed;
        let pressed = false;
        
        const checkPress = (ent: {pos: Vector2, width: number, height: number}) => {
           return (
              ent.pos.x < btn.x + btn.width &&
              ent.pos.x + ent.width > btn.x &&
              ent.pos.y + ent.height >= btn.y && // Feet touching top
              ent.pos.y + ent.height <= btn.y + btn.height
           );
        };

        if (checkPress(p.guide) || checkPress(p.companion)) pressed = true;
        p.crates.forEach(c => { if (checkPress(c)) pressed = true; });

        btn.isPressed = pressed;
        
        // Play button sound
        if (!wasPressed && pressed) {
            audioService.playButton();
        }

        // Trigger Logic (Gates)
        if (btn.triggerGateId) {
            const gate = p.platforms.find(plat => plat.gateId === btn.triggerGateId);
            if (gate) {
               gate.isOpen = pressed;
            }
        }
     });
  };

  const updateSpawners = () => {
      const p = physicsRef.current;
      p.spawners.forEach(spawner => {
          if (spawner.cooldown > 0) spawner.cooldown--;

          // Check for trigger
          const triggerBtn = p.buttons.find(b => b.triggerSpawnerId === spawner.id);
          // Only spawn if button is pressed OR no trigger needed
          if (!triggerBtn || triggerBtn.isPressed) {
             if (spawner.cooldown <= 0) {
                 // Check if we need to spawn
                 // Limit to 1 active bomb per spawner to prevent physics chaos
                 const existingBomb = p.crates.find(c => c.type === 'bomb' && Math.hypot(c.pos.x - spawner.x, c.pos.y - spawner.y) < 1000);
                 
                 if (!existingBomb) {
                     const bomb: Crate = {
                         id: Date.now(),
                         type: 'bomb',
                         pos: { x: spawner.x, y: spawner.y },
                         vel: { x: 0, y: 0 },
                         width: 40,
                         height: 40,
                         isGrounded: false
                     };
                     p.crates.push(bomb);
                     spawner.cooldown = 200; // 3+ seconds cooldown
                 }
             }
          }
      });
  };

  const updateBoss = () => {
      const p = physicsRef.current;
      const boss = p.boss;
      if (!boss) return;

      // Update Invulnerability
      if (boss.invulnerableTimer > 0) boss.invulnerableTimer--;

      // Check Boss Death
      if (boss.hp <= 0 && gameState === GameState.PLAYING) {
           audioService.playWin();
           p.boss = null;
           onLevelComplete(p.bridgeCount);
           return;
      }

      // Check Boss Phase
      if (boss.phase === 1 && boss.hp <= 3) {
          boss.phase = 2;
          audioService.playBossHit(); 
          // Reset attack state on phase change
          boss.state = 'cooldown';
          boss.attackTimer = 180; 
      }

      // Movement (Floating Sin wave)
      boss.y += Math.sin(p.time * 0.1) * 0.5;

      // STATE MACHINE
      if (boss.state === 'cooldown') {
          // RESTING
          boss.attackTimer--;
          if (boss.attackTimer <= 0) {
              // Wake up
              boss.state = 'attack';
              boss.shotCount = 0; // Reset burst counter
              boss.attackTimer = 0; // Ready to shoot immediately
          }
      } else if (boss.state === 'attack') {
          // ATTACKING
          boss.attackTimer--;

          if (boss.attackTimer <= 0) {
              const centerX = boss.x + boss.width/2;
              const centerY = boss.y + boss.height/2;
              
              audioService.playBossShoot();

              if (boss.phase === 1) {
                  // PHASE 1: BURST FIRE (5 shots)
                  const dx = (p.guide.pos.x + p.guide.width/2) - centerX;
                  const dy = (p.guide.pos.y + p.guide.height/2) - centerY;
                  const angle = Math.atan2(dy, dx);
                  const speed = 5;
                  
                  p.projectiles.push({
                      x: centerX, y: centerY,
                      vx: Math.cos(angle) * speed,
                      vy: Math.sin(angle) * speed,
                      radius: 8, life: 300
                  });
                  
                  boss.shotCount++;
                  
                  if (boss.shotCount >= 5) {
                      // Burst complete, rest
                      boss.state = 'cooldown';
                      boss.attackTimer = 180; // 3 Seconds (60fps * 3)
                  } else {
                      // Next shot in burst
                      // SLOWED DOWN from 12 to 60 (1 second per shot)
                      boss.attackTimer = 60; 
                  }

              } else {
                  // PHASE 2: AOE (Single big attack then rest)
                  const rand = Math.random();
                  
                  if (rand > 0.5) {
                       // Radial Burst
                       for (let i = 0; i < 8; i++) {
                          const angle = (Math.PI * 2 / 8) * i + p.time;
                          const speed = 4;
                          p.projectiles.push({
                              x: centerX, y: centerY,
                              vx: Math.cos(angle) * speed,
                              vy: Math.sin(angle) * speed,
                              radius: 8, life: 300
                          });
                      }
                  } else {
                      // Rain from sky
                      for (let i = 0; i < 5; i++) {
                          p.projectiles.push({
                              x: p.guide.pos.x + (Math.random() * 400 - 200), // Around player
                              y: -50 - (Math.random() * 200),
                              vx: 0,
                              vy: 5, // Fall down
                              radius: 10, life: 300
                          });
                      }
                  }
                  
                  // Phase 2 attacks are heavy, so always rest after one volley
                  boss.state = 'cooldown';
                  boss.attackTimer = 180; // 3 Seconds
              }
          }
      }

      // Bomb Collision with Boss
      for (let i = p.crates.length - 1; i >= 0; i--) {
          const c = p.crates[i];
          if (c.type === 'bomb') {
              const dx = (c.pos.x + c.width/2) - (boss.x + boss.width/2);
              const dy = (c.pos.y + c.height/2) - (boss.y + boss.height/2);
              const dist = Math.sqrt(dx*dx + dy*dy);
              
              if (dist < boss.width/2 + c.width/2) {
                  // HIT
                  if (boss.invulnerableTimer <= 0) {
                      boss.hp--;
                      boss.invulnerableTimer = 60; // 1 second iframe
                      audioService.playBossHit();
                  }
                  // Destroy bomb
                  p.crates.splice(i, 1);
              }
          }
      }
  };

  const updateProjectiles = () => {
      const p = physicsRef.current;
      for (let i = p.projectiles.length - 1; i >= 0; i--) {
          const proj = p.projectiles[i];
          proj.x += proj.vx;
          proj.y += proj.vy;
          proj.life--;

          if (proj.life <= 0) {
              p.projectiles.splice(i, 1);
              continue;
          }

          // Collision with Guide
          const checkHit = (ent: Entity & {invulnerableTimer?: number}) => {
             const dx = (ent.pos.x + ent.width/2) - proj.x;
             const dy = (ent.pos.y + ent.height/2) - proj.y;
             return Math.sqrt(dx*dx + dy*dy) < proj.radius + ent.width/2;
          };

          if (checkHit(p.guide)) {
             takeDamage(p.guide);
             p.projectiles.splice(i, 1); // Bullet destroyed
             continue;
          }
          
          // COMPANION IS IMMUNE TO PROJECTILES (Removed checkHit(p.companion))
      }
  };

  const tick = () => {
    if (gameState !== GameState.PLAYING) return;

    const p = physicsRef.current;
    p.time += 0.05;

    // Toggle Tether
    if (keys.current['KeyE']) {
        if (!toggleCooldown.current) {
            if (p.isTethered) {
                // Always allow disconnect
                p.isTethered = false;
                audioService.playTetherDisconnect();
            } else {
                // Only allow reconnect if close enough
                const dx = p.guide.pos.x - p.companion.pos.x;
                const dy = p.guide.pos.y - p.companion.pos.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < RECONNECT_DIST) {
                    p.isTethered = true;
                    audioService.playTetherConnect();
                }
            }
            toggleCooldown.current = true;
        }
    } else {
        toggleCooldown.current = false;
    }

    // 1. Environment Updates
    updateMovingPlatforms();
    updateMonsters();
    updateButtons();
    updateBoss();
    updateSpawners();
    updateProjectiles();

    // 2. Guide Input
    if (keys.current['KeyA'] || keys.current['ArrowLeft']) {
      p.guide.vel.x = -GUIDE_SPEED;
    } else if (keys.current['KeyD'] || keys.current['ArrowRight']) {
      p.guide.vel.x = GUIDE_SPEED;
    } else {
      p.guide.vel.x *= FRICTION;
    }

    if ((keys.current['Space'] || keys.current['ArrowUp'] || keys.current['KeyW']) && p.guide.isGrounded) {
      p.guide.vel.y = JUMP_FORCE;
      audioService.playJump();
    }

    // 3. Tether Logic
    if (p.isTethered) {
        const dx = p.guide.pos.x - p.companion.pos.x;
        const dy = p.guide.pos.y - p.companion.pos.y;
        const dist = Math.sqrt(dx*dx + dy*dy);

        if (dist > TETHER_LENGTH) {
            const angle = Math.atan2(dy, dx);
            const force = (dist - TETHER_LENGTH) * TETHER_STRENGTH;
            p.companion.vel.x += Math.cos(angle) * force * COMPANION_WEIGHT;
            p.companion.vel.y += Math.sin(angle) * force * COMPANION_WEIGHT;
            p.guide.vel.x -= Math.cos(angle) * force * 0.2; 
            p.guide.vel.y -= Math.sin(angle) * force * 0.2;
        }
    }
    p.companion.vel.x *= COMPANION_DRAG;

    // 4. Entity Updates
    updateEntityPhysics(p.guide);
    updateEntityCollisions(p.guide, true);
    
    updateEntityPhysics(p.companion);
    updateEntityCollisions(p.companion, true);

    updateCrates(); // Crates physics & interaction

    // 5. Drawing
    if (mouse.current.isDown && inkLeft > 0) {
      const worldX = mouse.current.x + p.cameraX;
      const worldY = mouse.current.y;

      // Check No Ink Zones
      let allowed = true;
      for (const zone of p.noInkZones) {
          if (worldX >= zone.x && worldX <= zone.x + zone.width &&
              worldY >= zone.y && worldY <= zone.y + zone.height) {
              allowed = false;
              break;
          }
      }

      if (allowed) {
        if (p.lastMousePos) {
            const distToLast = Math.hypot(worldX - p.lastMousePos.x, worldY - p.lastMousePos.y);
            if (distToLast > 10) {
            const cost = distToLast * 0.5;
            if (inkLeft >= cost) {
                p.bridges.push({
                p1: p.lastMousePos,
                p2: { x: worldX, y: worldY },
                life: 1.0
                });
                setInkLeft(inkLeft - cost);
                p.lastMousePos = { x: worldX, y: worldY };
                p.bridgeCount++;
                audioService.playDraw(); // Play scribble sound
            }
            }
        } else {
            p.lastMousePos = { x: worldX, y: worldY };
        }
      } else {
          // Reset drawing strip if hitting a dead zone
          p.lastMousePos = null; 
      }
    } else {
      p.lastMousePos = null;
    }

    // 6. Camera
    if (currentLevel.autoScrollSpeed) {
        // Auto Scroll Mode
        p.cameraX += currentLevel.autoScrollSpeed;
        
        // Kill if fallen behind camera
        const killThreshold = p.cameraX - 50;
        if (p.guide.pos.x < killThreshold || p.companion.pos.x < killThreshold) {
            audioService.playGameOver();
            onGameOver();
        }
    } else {
        // Standard Follow Mode
        let targetX = 0;
        if (p.isTethered) {
            const midX = (p.guide.pos.x + p.companion.pos.x) / 2;
            targetX = midX;
        } else {
            targetX = p.guide.pos.x;
        }
        
        const targetCamX = targetX - window.innerWidth / 2;
        p.cameraX += (targetCamX - p.cameraX) * 0.08;
    }

    // 7. Win Condition (Standard)
    const goal = p.platforms.find(pl => pl.type === 'goal');
    if (goal && !currentLevel.boss) { // Boss death handles level complete for boss levels
      const tolerance = 30;
      const isTouchingGoal = (entity: {pos: Vector2, width: number, height: number}) => {
        return (
            entity.pos.x < goal.x + goal.width + tolerance &&
            entity.pos.x + entity.width > goal.x - tolerance &&
            entity.pos.y < goal.y + goal.height + tolerance &&
            entity.pos.y + entity.height > goal.y - tolerance
        );
      };
      // MUST BE TETHERED TO WIN
      if (p.isTethered && isTouchingGoal(p.companion) && isTouchingGoal(p.guide)) {
        audioService.playWin();
        onLevelComplete(p.bridgeCount);
      }
    }
    
    // Particle update
    for (let i = p.particles.length - 1; i >= 0; i--) {
        p.particles[i].x += p.particles[i].vx;
        p.particles[i].y += p.particles[i].vy;
        p.particles[i].life -= 0.02;
        if (p.particles[i].life <= 0) p.particles.splice(i, 1);
    }
  };

  // --- Render ---
  const render = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    const p = physicsRef.current;

    // Clear
    ctx.fillStyle = '#fdfbf7';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(-p.cameraX, 0);

    // Decor
    ctx.fillStyle = '#f3e8ff';
    ctx.fillRect(p.cameraX * 0.8 + 100, 100, 200, 200);

    // No Ink Zones
    if (p.noInkZones.length > 0) {
        p.noInkZones.forEach(zone => {
            ctx.fillStyle = 'rgba(254, 202, 202, 0.2)'; // Faint red
            ctx.fillRect(zone.x, zone.y, zone.width, zone.height);
            
            // Hatching pattern
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.1)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let i = zone.x; i < zone.x + zone.width; i += 20) {
                ctx.moveTo(i, zone.y);
                ctx.lineTo(Math.max(zone.x, i - 20), Math.min(zone.y + zone.height, zone.y + 20)); // Simple diagonal
            }
            ctx.stroke();
        });
    }

    // Bridges
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#475569';
    ctx.beginPath();
    for (const b of p.bridges) {
      ctx.moveTo(b.p1.x, b.p1.y);
      ctx.lineTo(b.p2.x, b.p2.y);
    }
    ctx.stroke();

    // Platforms & Objects
    p.platforms.forEach(plat => {
      if (plat.type === 'goal') {
        ctx.fillStyle = '#bef264';
      } else if (plat.type === 'hazard') {
        ctx.fillStyle = '#fca5a5';
      } else if (plat.type === 'gate') {
         // Gate visual
         if (plat.isOpen) {
             ctx.fillStyle = 'rgba(203, 213, 225, 0.3)'; // Faded
             ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
         } else {
             ctx.fillStyle = '#334155'; // Solid Dark
             ctx.strokeStyle = '#1e293b';
         }
      } else {
        ctx.fillStyle = '#cbd5e1';
      }
      
      ctx.fillRect(plat.x, plat.y, plat.width, plat.height);
      
      if (plat.type === 'gate' && !plat.isOpen) {
          // Draw "X" or Lock on gate
          ctx.beginPath();
          ctx.moveTo(plat.x + 10, plat.y + 10); ctx.lineTo(plat.x + plat.width - 10, plat.y + plat.height - 10);
          ctx.moveTo(plat.x + plat.width - 10, plat.y + 10); ctx.lineTo(plat.x + 10, plat.y + plat.height - 10);
          ctx.lineWidth = 4;
          ctx.strokeStyle = '#475569';
          ctx.stroke();
      } else {
          ctx.lineWidth = 2;
          ctx.strokeRect(plat.x, plat.y, plat.width, plat.height);
      }

      // Goal Flag
      if (plat.type === 'goal' && !currentLevel.boss) {
        const cx = plat.x + plat.width / 2;
        ctx.beginPath(); ctx.moveTo(cx, plat.y); ctx.lineTo(cx, plat.y - 80); ctx.stroke();
        ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.moveTo(cx, plat.y - 80); ctx.lineTo(cx + 60, plat.y - 60 + Math.sin(p.time*0.2)*5); ctx.lineTo(cx, plat.y - 40); ctx.fill();
      }
    });

    // Spawners (Visuals)
    p.spawners.forEach(s => {
        ctx.fillStyle = '#1e40af';
        ctx.fillRect(s.x, s.y, 40, 10); // Spout
        ctx.beginPath();
        ctx.arc(s.x + 20, s.y, 10, 0, Math.PI, true);
        ctx.fill();
    });

    // Buttons
    p.buttons.forEach(btn => {
        ctx.fillStyle = btn.isPressed ? '#22c55e' : '#ef4444'; // Green if pressed, Red if not
        const h = btn.isPressed ? 5 : 15;
        const y = btn.y + (btn.height - h);
        ctx.fillRect(btn.x, y, btn.width, h);
        ctx.strokeRect(btn.x, y, btn.width, h);
        
        // Indicate "Safe Zone" buttons for Boss Levels
        if (btn.triggerSpawnerId) {
             ctx.strokeStyle = 'gold';
             ctx.lineWidth = 3;
             ctx.beginPath();
             ctx.arc(btn.x + btn.width/2, y - 20, 15, 0, Math.PI*2);
             ctx.stroke();
             // Down arrow
             ctx.beginPath(); ctx.moveTo(btn.x+btn.width/2, y-30); ctx.lineTo(btn.x+btn.width/2, y-10); ctx.stroke();
        }
    });

    // Crates
    p.crates.forEach(c => {
       if (c.type === 'bomb') {
           // Bomb Visual
           ctx.fillStyle = '#3b82f6'; // Blue
           ctx.beginPath();
           ctx.arc(c.pos.x + c.width/2, c.pos.y + c.height/2, c.width/2, 0, Math.PI*2);
           ctx.fill();
           // Glow
           ctx.shadowBlur = 15;
           ctx.shadowColor = '#60a5fa';
           ctx.strokeStyle = 'white';
           ctx.lineWidth = 2;
           ctx.stroke();
           ctx.shadowBlur = 0;
           // Icon
           ctx.fillStyle = 'white';
           ctx.font = '20px sans-serif';
           ctx.fillText('!', c.pos.x + 16, c.pos.y + 28);
       } else {
           // Wood Crate
           ctx.fillStyle = '#d97706'; // Amber
           ctx.fillRect(c.pos.x, c.pos.y, c.width, c.height);
           // Wood texture details
           ctx.strokeStyle = '#92400e';
           ctx.lineWidth = 3;
           ctx.strokeRect(c.pos.x, c.pos.y, c.width, c.height);
           ctx.beginPath();
           ctx.moveTo(c.pos.x, c.pos.y); ctx.lineTo(c.pos.x + c.width, c.pos.y + c.height);
           ctx.moveTo(c.pos.x + c.width, c.pos.y); ctx.lineTo(c.pos.x, c.pos.y + c.height);
           ctx.stroke();
       }
    });

    // Monsters
    p.monsters.forEach(m => {
       ctx.fillStyle = '#7f1d1d'; // Dark Red
       // Simple goomba shape
       const bottom = m.pos.y + m.height;
       const cx = m.pos.x + m.width/2;
       
       ctx.beginPath();
       ctx.arc(cx, bottom - 20, 20, Math.PI, 0); // Head
       ctx.lineTo(m.pos.x + m.width, bottom);
       ctx.lineTo(m.pos.x, bottom);
       ctx.fill();
       
       // Eyes
       ctx.fillStyle = 'white';
       ctx.beginPath(); ctx.arc(cx - 8, bottom - 25, 5, 0, Math.PI*2); ctx.fill();
       ctx.beginPath(); ctx.arc(cx + 8, bottom - 25, 5, 0, Math.PI*2); ctx.fill();
       ctx.fillStyle = 'black'; // Pupil moving
       const lookDir = m.vel.x > 0 ? 2 : -2;
       ctx.beginPath(); ctx.arc(cx - 8 + lookDir, bottom - 25, 2, 0, Math.PI*2); ctx.fill();
       ctx.beginPath(); ctx.arc(cx + 8 + lookDir, bottom - 25, 2, 0, Math.PI*2); ctx.fill();
    });
    
    // Boss
    if (p.boss) {
        const b = p.boss;
        const cx = b.x + b.width/2;
        const cy = b.y + b.height/2;
        
        // Flash white if hit
        if (b.invulnerableTimer > 0 && Math.floor(b.invulnerableTimer / 5) % 2 === 0) {
            ctx.fillStyle = 'white';
        } else {
            ctx.fillStyle = b.phase === 1 ? '#4c1d95' : '#581c87'; // Deep Purple
        }
        
        // Body
        ctx.beginPath();
        ctx.arc(cx, cy, b.width/2, 0, Math.PI*2);
        ctx.fill();
        
        // Ring
        ctx.strokeStyle = b.phase === 1 ? '#a78bfa' : '#ef4444'; // Purple -> Red
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(cx, cy, b.width/2 + 5, 0, Math.PI * 2);
        ctx.stroke();

        // Eye state
        const eyeColor = b.state === 'attack' ? '#ef4444' : (b.state === 'cooldown' ? '#94a3b8' : 'black');
        
        // Eye
        ctx.fillStyle = 'black';
        ctx.beginPath(); ctx.arc(cx, cy, 15, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = eyeColor;
        ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI*2); ctx.fill();
    }
    
    // Projectiles
    p.projectiles.forEach(pr => {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, pr.radius, 0, Math.PI*2);
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1;
        ctx.stroke();
    });

    // Tether
    if (p.isTethered) {
        ctx.beginPath();
        ctx.moveTo(p.guide.pos.x + p.guide.width/2, p.guide.pos.y + p.guide.height/2);
        ctx.quadraticCurveTo((p.guide.pos.x + p.companion.pos.x)/2, (p.guide.pos.y + p.companion.pos.y)/2 + 30, p.companion.pos.x + p.companion.width/2, p.companion.pos.y + p.companion.height/2);
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#94a3b8';
        ctx.stroke();
    } else {
        // Draw ghost tether (dashed)
        const dx = p.guide.pos.x - p.companion.pos.x;
        const dy = p.guide.pos.y - p.companion.pos.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        const canReconnect = dist < RECONNECT_DIST;

        ctx.beginPath();
        ctx.setLineDash([5, 5]);
        ctx.moveTo(p.guide.pos.x + p.guide.width/2, p.guide.pos.y + p.guide.height/2);
        ctx.lineTo(p.companion.pos.x + p.companion.width/2, p.companion.pos.y + p.companion.height/2);
        ctx.lineWidth = 2;
        // Green if can reconnect, Red if too far
        ctx.strokeStyle = canReconnect ? 'rgba(34, 197, 94, 0.6)' : 'rgba(239, 68, 68, 0.6)';
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // Entities
    [p.guide, p.companion].forEach(ent => {
        // Flash if invulnerable
        if ((ent as any).invulnerableTimer > 0 && Math.floor(p.time * 10) % 2 === 0) {
            ctx.globalAlpha = 0.5;
        }
        ctx.fillStyle = ent.color;
        ctx.fillRect(ent.pos.x, ent.pos.y, ent.width, ent.height);
        ctx.fillStyle = 'white';
        ctx.beginPath(); ctx.arc(ent.pos.x + 10, ent.pos.y + 10, 4, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(ent.pos.x + 24, ent.pos.y + 10, 4, 0, Math.PI*2); ctx.fill();
        ctx.globalAlpha = 1.0;
    });

    // Storm Effect (Scroll Levels)
    if (currentLevel.autoScrollSpeed) {
        // Draw a dark menacing gradient on the left side
        const gradient = ctx.createLinearGradient(p.cameraX, 0, p.cameraX + 200, 0);
        gradient.addColorStop(0, 'rgba(0,0,0,0.8)');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(p.cameraX, 0, 200, height);
    }

    ctx.restore();
  };

  const animate = useCallback(() => {
    tick();
    render();
    requestRef.current = requestAnimationFrame(animate);
  }, [gameState, currentLevel, inkLeft]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [animate]);

  // Event Listeners (Same as before)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        keys.current[e.code] = true;
        // Resume audio on interaction
        audioService.resume(); 
    };
    const handleKeyUp = (e: KeyboardEvent) => keys.current[e.code] = false;
    const handleMouseDown = (e: PointerEvent) => {
        mouse.current.isDown = true;
        audioService.resume(); 
    };
    const handleMouseUp = () => { mouse.current.isDown = false; physicsRef.current.lastMousePos = null; };
    const handleMouseMove = (e: PointerEvent) => { mouse.current.x = e.clientX; mouse.current.y = e.clientY; };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('pointerdown', handleMouseDown);
    window.addEventListener('pointerup', handleMouseUp);
    window.addEventListener('pointermove', handleMouseMove);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('pointerdown', handleMouseDown);
      window.removeEventListener('pointerup', handleMouseUp);
      window.removeEventListener('pointermove', handleMouseMove);
    };
  }, []);

  return <canvas ref={canvasRef} width={window.innerWidth} height={window.innerHeight} className="block cursor-crosshair bg-[#fdfbf7]" />;
};

export default GameCanvas;
