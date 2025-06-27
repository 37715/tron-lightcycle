import React, { useEffect, useRef, useState, useCallback } from 'react';

interface Position {
  x: number;
  y: number;
}

interface Player {
  id: number;
  position: Position;
  direction: 'up' | 'down' | 'left' | 'right';
  trail: Position[];
  color: string;
  alive: boolean;
}

const GRID_SIZE = 4;
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
const MOVE_SPEED = 120; // milliseconds between moves

const Game: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<'waiting' | 'playing' | 'gameOver'>('waiting');
  const [winner, setWinner] = useState<number | null>(null);
  const gameLoopRef = useRef<number>();
  const lastMoveTimeRef = useRef<number>(0);
  
  const [players, setPlayers] = useState<Player[]>([
    {
      id: 1,
      position: { x: 100, y: 300 },
      direction: 'right',
      trail: [{ x: 100, y: 300 }],
      color: '#00ff00',
      alive: true
    },
    {
      id: 2,
      position: { x: 700, y: 300 },
      direction: 'left',
      trail: [{ x: 700, y: 300 }],
      color: '#ff0000',
      alive: true
    }
  ]);

  const checkCollision = useCallback((player: Player, newPosition: Position): boolean => {
    // Check boundaries
    if (newPosition.x < 0 || newPosition.x >= GAME_WIDTH || 
        newPosition.y < 0 || newPosition.y >= GAME_HEIGHT) {
      return true;
    }

    // Check collision with all trails (including own trail after first move)
    for (const p of players) {
      for (const trailPoint of p.trail) {
        if (Math.abs(newPosition.x - trailPoint.x) < GRID_SIZE && 
            Math.abs(newPosition.y - trailPoint.y) < GRID_SIZE) {
          return true;
        }
      }
    }

    return false;
  }, [players]);

  const movePlayer = useCallback((player: Player): Player => {
    if (!player.alive) return player;

    const newPosition = { ...player.position };
    
    switch (player.direction) {
      case 'up':
        newPosition.y -= GRID_SIZE;
        break;
      case 'down':
        newPosition.y += GRID_SIZE;
        break;
      case 'left':
        newPosition.x -= GRID_SIZE;
        break;
      case 'right':
        newPosition.x += GRID_SIZE;
        break;
    }

    if (checkCollision(player, newPosition)) {
      return { ...player, alive: false };
    }

    return {
      ...player,
      position: newPosition,
      trail: [...player.trail, newPosition]
    };
  }, [checkCollision]);

  const updateGame = useCallback((currentTime: number) => {
    if (gameState !== 'playing') return;

    if (currentTime - lastMoveTimeRef.current >= MOVE_SPEED) {
      setPlayers(prevPlayers => {
        const newPlayers = prevPlayers.map(movePlayer);
        const alivePlayers = newPlayers.filter(p => p.alive);
        
        if (alivePlayers.length <= 1) {
          setGameState('gameOver');
          setWinner(alivePlayers.length === 1 ? alivePlayers[0].id : null);
        }
        
        return newPlayers;
      });
      lastMoveTimeRef.current = currentTime;
    }
  }, [gameState, movePlayer]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Draw grid (subtle)
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 1;
    for (let x = 0; x <= GAME_WIDTH; x += GRID_SIZE * 5) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, GAME_HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y <= GAME_HEIGHT; y += GRID_SIZE * 5) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(GAME_WIDTH, y);
      ctx.stroke();
    }

    // Draw trails
    players.forEach(player => {
      ctx.fillStyle = player.color;
      player.trail.forEach(point => {
        ctx.fillRect(point.x, point.y, GRID_SIZE, GRID_SIZE);
      });
    });

    // Draw player heads (slightly larger)
    players.forEach(player => {
      if (player.alive) {
        ctx.fillStyle = player.color;
        ctx.fillRect(
          player.position.x - 1, 
          player.position.y - 1, 
          GRID_SIZE + 2, 
          GRID_SIZE + 2
        );
      }
    });
  }, [players]);

  const gameLoop = useCallback((currentTime: number) => {
    updateGame(currentTime);
    render();
    gameLoopRef.current = requestAnimationFrame(gameLoop);
  }, [updateGame, render]);

  const handleKeyPress = useCallback((event: KeyboardEvent) => {
    if (gameState !== 'playing') return;

    setPlayers(prevPlayers => prevPlayers.map(player => {
      if (player.id === 1) {
        switch (event.key.toLowerCase()) {
          case 'w':
            return player.direction !== 'down' ? { ...player, direction: 'up' } : player;
          case 's':
            return player.direction !== 'up' ? { ...player, direction: 'down' } : player;
          case 'a':
            return player.direction !== 'right' ? { ...player, direction: 'left' } : player;
          case 'd':
            return player.direction !== 'left' ? { ...player, direction: 'right' } : player;
        }
      }
      if (player.id === 2) {
        switch (event.key) {
          case 'ArrowUp':
            return player.direction !== 'down' ? { ...player, direction: 'up' } : player;
          case 'ArrowDown':
            return player.direction !== 'up' ? { ...player, direction: 'down' } : player;
          case 'ArrowLeft':
            return player.direction !== 'right' ? { ...player, direction: 'left' } : player;
          case 'ArrowRight':
            return player.direction !== 'left' ? { ...player, direction: 'right' } : player;
        }
      }
      return player;
    }));
  }, [gameState]);

  const startGame = () => {
    setGameState('playing');
    setWinner(null);
    setPlayers([
      {
        id: 1,
        position: { x: 100, y: 300 },
        direction: 'right',
        trail: [{ x: 100, y: 300 }],
        color: '#00ff00',
        alive: true
      },
      {
        id: 2,
        position: { x: 700, y: 300 },
        direction: 'left',
        trail: [{ x: 700, y: 300 }],
        color: '#ff0000',
        alive: true
      }
    ]);
    lastMoveTimeRef.current = 0;
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleKeyPress]);

  useEffect(() => {
    if (gameState === 'playing') {
      gameLoopRef.current = requestAnimationFrame(gameLoop);
    } else if (gameLoopRef.current) {
      cancelAnimationFrame(gameLoopRef.current);
    }

    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
    };
  }, [gameState, gameLoop]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white">
      <div className="mb-4">
        <h1 className="text-4xl font-bold text-green-400 mb-2 text-center">TRON BIKES</h1>
        <div className="text-sm text-gray-400 text-center">
          <p>Player 1 (Green): WASD | Player 2 (Red): Arrow Keys</p>
        </div>
      </div>
      
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={GAME_WIDTH}
          height={GAME_HEIGHT}
          className="border border-gray-700 bg-black"
        />
        
        {gameState === 'waiting' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-80">
            <div className="text-center">
              <p className="text-xl mb-4">Ready to race?</p>
              <button
                onClick={startGame}
                className="px-8 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded transition-colors"
              >
                START GAME
              </button>
            </div>
          </div>
        )}
        
        {gameState === 'gameOver' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-90">
            <div className="text-center">
              <h2 className="text-2xl mb-4">
                {winner ? `Player ${winner} Wins!` : 'Draw!'}
              </h2>
              <button
                onClick={startGame}
                className="px-8 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded transition-colors"
              >
                PLAY AGAIN
              </button>
            </div>
          </div>
        )}
      </div>
      
      <div className="mt-4 text-xs text-gray-500 text-center max-w-lg">
        <p>Classic Tron-style bike racing. Avoid walls and trails. Turn at 90-degree angles only.</p>
        <p>Optimized for competitive play with minimal graphics and maximum performance.</p>
      </div>
    </div>
  );
};

export default Game;