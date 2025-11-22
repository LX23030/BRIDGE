
import React, { useState, useCallback, useEffect } from 'react';
import GameCanvas from './components/GameCanvas';
import UIOverlay from './components/UIOverlay';
import { GameState, LevelData, Platform } from './types';
import { generateNarrative } from './services/narrativeService';

const generateLevel = (levelIdx: number): LevelData => {
  const groundY = window.innerHeight - 100;
  
  // Define Levels
  const levels: LevelData[] = [
    // Level 1: Tutorial - Jump & Tether
    {
      id: 1,
      name: "初次跨越 (The First Step)",
      startPos: { x: 100, y: groundY - 100 },
      companionPos: { x: 50, y: groundY - 100 },
      inkLimit: 600,
      platforms: [
        { x: 0, y: groundY, width: 400, height: 100, type: 'ground' },
        { x: 550, y: groundY, width: 500, height: 100, type: 'ground' },
        { x: 1200, y: groundY - 50, width: 150, height: 150, type: 'goal' },
        { x: 0, y: groundY + 200, width: 2000, height: 100, type: 'hazard' }
      ],
      crates: [],
      buttons: [],
      monsters: [],
      noInkZones: []
    },
    // Level 2: Bridge Drawing
    {
      id: 2,
      name: "信任之桥 (Bridge of Trust)",
      startPos: { x: 50, y: groundY - 100 },
      companionPos: { x: 20, y: groundY - 100 },
      inkLimit: 800,
      noInkZones: [
        // Prevent sky-bridging (cheesing over the whole level)
        { x: 0, y: 0, width: 2000, height: groundY - 300 }
      ],
      platforms: [
        { x: 0, y: groundY, width: 300, height: 100, type: 'ground' },
        // Large gap requiring ink
        { x: 600, y: groundY - 100, width: 300, height: 100, type: 'ground' },
        { x: 1000, y: groundY - 50, width: 150, height: 150, type: 'goal' },
        { x: 0, y: groundY + 200, width: 2000, height: 100, type: 'hazard' }
      ],
      crates: [],
      buttons: [],
      monsters: []
    },
    // Level 3: Moving Platforms
    {
      id: 3,
      name: "流动的地面 (Shifting Ground)",
      startPos: { x: 100, y: groundY - 100 },
      companionPos: { x: 50, y: groundY - 100 },
      inkLimit: 1000,
      noInkZones: [
        // Force usage of moving platforms by blocking the area directly above them
        { x: 350, y: groundY - 300, width: 200, height: 250 }, // Above horizontal platform
        { x: 1050, y: groundY - 300, width: 200, height: 250 } // Above vertical platform
      ],
      platforms: [
        { x: 0, y: groundY, width: 300, height: 100, type: 'ground' },
        // Moving horizontal
        { 
          x: 350, y: groundY, width: 150, height: 50, type: 'ground',
          moving: { rangeX: 200, rangeY: 0, speed: 0.03, initialX: 350, initialY: groundY, offset: 0 }
        },
        { x: 800, y: groundY - 100, width: 200, height: 50, type: 'ground' },
        // Moving Vertical
        { 
            x: 1100, y: groundY, width: 120, height: 50, type: 'ground',
            moving: { rangeX: 0, rangeY: 150, speed: 0.04, initialX: 1100, initialY: groundY - 50, offset: 1.5 }
        },
        { x: 1300, y: groundY - 200, width: 150, height: 200, type: 'goal' },
        { x: 0, y: groundY + 200, width: 2000, height: 100, type: 'hazard' }
      ],
      crates: [],
      buttons: [],
      monsters: []
    },
    // Level 4: Crates & Gates
    {
      id: 4,
      name: "重担 (The Burden)",
      startPos: { x: 100, y: groundY - 100 },
      companionPos: { x: 50, y: groundY - 100 },
      inkLimit: 800,
      noInkZones: [
        // Prevent building a bridge OVER the gate or jamming the gate mechanism
        { x: 550, y: groundY - 500, width: 140, height: 400 }
      ],
      platforms: [
        { x: 0, y: groundY, width: 600, height: 100, type: 'ground' },
        // Gate blocking the path
        { x: 600, y: groundY - 250, width: 40, height: 350, type: 'gate', gateId: 1, isOpen: false },
        { x: 700, y: groundY, width: 600, height: 100, type: 'ground' },
        { x: 1200, y: groundY - 50, width: 150, height: 150, type: 'goal' },
        { x: 0, y: groundY + 200, width: 2000, height: 100, type: 'hazard' }
      ],
      crates: [
        // Crate to be pushed onto button
        { id: 1, pos: { x: 200, y: groundY - 100 }, vel: { x: 0, y: 0 }, width: 50, height: 50, isGrounded: false }
      ],
      buttons: [
        // The button
        { id: 1, triggerGateId: 1, x: 450, y: groundY, width: 60, height: 10, isPressed: false }
      ],
      monsters: []
    },
    // Level 5: Monsters
    {
      id: 5,
      name: "阴影潜行 (Shadows)",
      startPos: { x: 50, y: groundY - 150 },
      companionPos: { x: 20, y: groundY - 150 },
      inkLimit: 1500,
      noInkZones: [
        // Force interaction with the monster path, don't let them build a skybridge over the enemy
        { x: 300, y: groundY - 400, width: 600, height: 250 }
      ],
      platforms: [
        { x: 0, y: groundY, width: 200, height: 100, type: 'ground' },
        { x: 300, y: groundY - 50, width: 600, height: 50, type: 'ground' },
        { x: 1000, y: groundY - 150, width: 150, height: 50, type: 'ground' },
        { x: 1200, y: groundY - 250, width: 150, height: 50, type: 'goal' },
        { x: 0, y: groundY + 200, width: 2000, height: 100, type: 'hazard' }
      ],
      crates: [],
      buttons: [],
      monsters: [
        // Monster on the long middle platform
        { id: 1, pos: { x: 400, y: groundY - 90 }, vel: { x: 2, y: 0 }, width: 40, height: 40, patrolStart: 300, patrolEnd: 860 }
      ]
    },
    // Level 6: Separation Mechanic & Puzzle
    {
      id: 6,
      name: "各司其职 (Division of Labor)",
      startPos: { x: 200, y: groundY - 100 },
      companionPos: { x: 150, y: groundY - 100 },
      inkLimit: 600, // Give ink back
      noInkZones: [
        // Prevent building a bridge UP to the crate shelf.
        // Shelf is at x:50, y: groundY - 150.
        // Block area in front/below it.
        { x: 0, y: groundY - 250, width: 250, height: 250 } 
      ],
      platforms: [
        // Main floor
        { x: 0, y: groundY, width: 1000, height: 100, type: 'ground' },
        
        // High Shelf for Crate. Height adjusted so player can jump ALONE but not TETHERED.
        // Guide jump ~140px. Shelf at 140px high.
        { x: 50, y: groundY - 140, width: 150, height: 20, type: 'ground' },

        // The Gate blocking the Goal
        { x: 800, y: groundY - 300, width: 40, height: 400, type: 'gate', gateId: 99, isOpen: false },
        
        // Goal Area
        { x: 900, y: groundY - 50, width: 150, height: 150, type: 'goal' },
        
        // Pit
        { x: 0, y: groundY + 200, width: 2000, height: 100, type: 'hazard' }
      ],
      crates: [
        // Crate on the high shelf
        { id: 1, pos: { x: 100, y: groundY - 200 }, vel: { x: 0, y: 0 }, width: 50, height: 50, isGrounded: false }
      ],
      buttons: [
        // Button near the gate. Needs crate to stay pressed.
        { id: 1, triggerGateId: 99, x: 600, y: groundY, width: 80, height: 10, isPressed: false }
      ],
      monsters: []
    }
  ];

  return levels[(levelIdx - 1) % levels.length];
};

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.PLAYING);
  const [levelIdx, setLevelIdx] = useState(1);
  const [currentLevel, setCurrentLevel] = useState<LevelData>(generateLevel(1));
  const [narrative, setNarrative] = useState("");
  const [inkLeft, setInkLeft] = useState(currentLevel.inkLimit);

  useEffect(() => {
    const handleResize = () => {
      setCurrentLevel(generateLevel(levelIdx));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [levelIdx]);

  useEffect(() => {
      setInkLeft(currentLevel.inkLimit);
  }, [currentLevel]);

  const handleReset = useCallback(() => {
    setGameState(GameState.MENU); 
    setTimeout(() => {
        setGameState(GameState.PLAYING);
        setInkLeft(currentLevel.inkLimit);
    }, 10);
  }, [currentLevel]);

  const handleGameOver = useCallback(() => {
    handleReset();
  }, [handleReset]);

  const handleLevelComplete = useCallback(async (bridgesBuilt: number) => {
    if (gameState === GameState.LEVEL_COMPLETE) return;
    
    setGameState(GameState.LEVEL_COMPLETE);
    const text = await generateNarrative(currentLevel.name, bridgesBuilt);
    setNarrative(text);
  }, [currentLevel, gameState]);

  const handleNextLevel = useCallback(() => {
    const nextIdx = levelIdx + 1;
    setLevelIdx(nextIdx);
    setCurrentLevel(generateLevel(nextIdx));
    setNarrative("");
    setGameState(GameState.PLAYING);
  }, [levelIdx]);

  return (
    <div className="relative w-screen h-screen bg-[#fdfbf7] overflow-hidden font-sans">
      <GameCanvas 
        gameState={gameState} 
        currentLevel={currentLevel}
        onLevelComplete={handleLevelComplete}
        onGameOver={handleGameOver}
        inkLeft={inkLeft}
        setInkLeft={setInkLeft}
      />

      <UIOverlay 
        level={currentLevel}
        narrative={narrative}
        showNarrative={gameState === GameState.LEVEL_COMPLETE}
        onReset={handleReset}
        onNextLevel={handleNextLevel}
        inkLeft={inkLeft}
        maxInk={currentLevel.inkLimit}
      />
    </div>
  );
};

export default App;
