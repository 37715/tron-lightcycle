import * as THREE from 'three';
import { BikeState, TurnDirection, GameConfig } from './types';
import { Arena } from './arena';

interface AIDecision {
  shouldTurn: boolean;
  direction: TurnDirection | null;
  shouldBrake: boolean;
}

interface ThreatAssessment {
  distance: number;
  angle: number;
  type: 'wall' | 'trail' | 'ring';
  position: THREE.Vector3;
}

export class AIController {
  private lookAheadSteps = 5;
  private dangerThreshold = 3.0;
  private criticalThreshold = 1.5;
  private lastDecisionFrame = 0;
  private decisionCooldown = 30; // More patience between decisions
  
  constructor(private config: GameConfig) {}

  public makeDecision(
    aiState: BikeState,
    playerState: BikeState,
    arena: Arena,
    frameCount: number
  ): AIDecision {
    // Don't make decisions too frequently
    if (frameCount - this.lastDecisionFrame < this.decisionCooldown) {
      return { shouldTurn: false, direction: null, shouldBrake: false };
    }

    // Get current direction
    const currentDirection = new THREE.Vector3(
      Math.sin(aiState.rotation),
      0,
      Math.cos(aiState.rotation)
    );

    // Assess threats in current direction
    const threats = this.assessThreats(aiState, playerState, arena, currentDirection);
    
    // Find the most immediate threat
    const immediateThreats = threats.filter(t => t.distance < this.dangerThreshold);
    const criticalThreats = threats.filter(t => t.distance < this.criticalThreshold);

    // Decision making
    let decision: AIDecision = { shouldTurn: false, direction: null, shouldBrake: false };

    // If critical threat, make immediate evasive action
    if (criticalThreats.length > 0) {
      const threat = criticalThreats[0];
      decision = this.evadeThreats(aiState, [threat], currentDirection);
      this.lastDecisionFrame = frameCount;
      
      // Use brakes in critical situations
      if (threat.distance < 1.0) {
        decision.shouldBrake = true;
      }
    } 
    // If danger ahead, plan route
    else if (immediateThreats.length > 0) {
      decision = this.planSafeRoute(aiState, playerState, arena, currentDirection, immediateThreats);
      this.lastDecisionFrame = frameCount;
    }
    // Otherwise, make strategic moves
    else {
      decision = this.makeStrategicMove(aiState, playerState, arena, currentDirection, frameCount);
    }

    // If we decided to turn, extend cooldown slightly to avoid immediate consecutive turns
    if (decision.shouldTurn) {
      this.lastDecisionFrame = frameCount;
    }

    return decision;
  }

  private assessThreats(
    aiState: BikeState,
    playerState: BikeState,
    arena: Arena,
    direction: THREE.Vector3
  ): ThreatAssessment[] {
    const threats: ThreatAssessment[] = [];
    const position = aiState.position;

    // Check wall boundaries
    const limit = this.config.boundaryLimit - 0.15;
    
    // Check each wall
    if (direction.x > 0) {
      const distToWall = limit - position.x;
      threats.push({
        distance: distToWall / aiState.speed,
        angle: 0,
        type: 'wall',
        position: new THREE.Vector3(limit, 0, position.z)
      });
    } else if (direction.x < 0) {
      const distToWall = position.x + limit;
      threats.push({
        distance: distToWall / aiState.speed,
        angle: 0,
        type: 'wall',
        position: new THREE.Vector3(-limit, 0, position.z)
      });
    }

    if (direction.z > 0) {
      const distToWall = limit - position.z;
      threats.push({
        distance: distToWall / aiState.speed,
        angle: 0,
        type: 'wall',
        position: new THREE.Vector3(position.x, 0, limit)
      });
    } else if (direction.z < 0) {
      const distToWall = position.z + limit;
      threats.push({
        distance: distToWall / aiState.speed,
        angle: 0,
        type: 'wall',
        position: new THREE.Vector3(position.x, 0, -limit)
      });
    }

    // Check trail collisions (both AI's own trail and player's trail)
    const allTrails = [...aiState.trail, ...playerState.trail];
    const trailThreats = this.checkTrailCollisions(position, direction, allTrails, aiState.speed);
    threats.push(...trailThreats);

    // Check ring boundary
    const ringThreat = this.checkRingBoundary(position, direction, arena, aiState.speed);
    if (ringThreat) {
      threats.push(ringThreat);
    }

    // Sort by distance
    return threats.sort((a, b) => a.distance - b.distance);
  }

  private checkTrailCollisions(
    position: THREE.Vector3,
    direction: THREE.Vector3,
    trails: THREE.Vector3[],
    speed: number
  ): ThreatAssessment[] {
    const threats: ThreatAssessment[] = [];
    const bikeHalfWidth = 0.15;
    const trailWidth = this.config.trailWidth;
    const collisionRadius = bikeHalfWidth + trailWidth / 2 + 0.05; // Safety margin

    // Cast ray in current direction
    for (let step = 1; step <= this.lookAheadSteps; step++) {
      const checkPos = position.clone().add(direction.clone().multiplyScalar(step * speed * 10));
      
      // Check each trail segment
      for (let i = 0; i < trails.length - 1; i++) {
        const start = trails[i];
        const end = trails[i + 1];
        
        const segDir = new THREE.Vector3().subVectors(end, start);
        const segLength = segDir.length();
        
        if (segLength < 0.01) continue;
        
        segDir.normalize();
        
        const toStart = new THREE.Vector3().subVectors(checkPos, start);
        const projLength = THREE.MathUtils.clamp(toStart.dot(segDir), 0, segLength);
        
        const closestPoint = start.clone().add(segDir.clone().multiplyScalar(projLength));
        const dist = checkPos.distanceTo(closestPoint);
        
        if (dist < collisionRadius) {
          threats.push({
            distance: step,
            angle: 0,
            type: 'trail',
            position: closestPoint
          });
        }
      }
    }

    return threats;
  }

  private checkRingBoundary(
    position: THREE.Vector3,
    direction: THREE.Vector3,
    arena: Arena,
    speed: number
  ): ThreatAssessment | null {
    const ringRadius = arena.getRingScale() * this.config.ringInitialRadius;
    const currentDistFromCenter = Math.sqrt(position.x * position.x + position.z * position.z);
    
    // If already outside ring, immediate threat
    if (currentDistFromCenter > ringRadius) {
      return {
        distance: 0,
        angle: 0,
        type: 'ring',
        position: position.clone()
      };
    }

    // Check if heading towards ring boundary
    for (let step = 1; step <= this.lookAheadSteps; step++) {
      const checkPos = position.clone().add(direction.clone().multiplyScalar(step * speed * 10));
      const distFromCenter = Math.sqrt(checkPos.x * checkPos.x + checkPos.z * checkPos.z);
      
      if (distFromCenter > ringRadius - 1.0) { // Safety margin
        return {
          distance: step,
          angle: 0,
          type: 'ring',
          position: checkPos
        };
      }
    }

    return null;
  }

  private evadeThreats(
    aiState: BikeState,
    threats: ThreatAssessment[],
    currentDirection: THREE.Vector3
  ): AIDecision {
    // Calculate left and right directions
    const leftDirection = new THREE.Vector3(
      Math.sin(aiState.rotation + Math.PI / 2),
      0,
      Math.cos(aiState.rotation + Math.PI / 2)
    );
    
    const rightDirection = new THREE.Vector3(
      Math.sin(aiState.rotation - Math.PI / 2),
      0,
      Math.cos(aiState.rotation - Math.PI / 2)
    );

    // Check which direction is safer
    let leftSafety = 0;
    let rightSafety = 0;

    for (const threat of threats) {
      const toThreat = new THREE.Vector3().subVectors(threat.position, aiState.position).normalize();
      
      // Higher dot product means more aligned with threat (bad)
      const leftAlignment = leftDirection.dot(toThreat);
      const rightAlignment = rightDirection.dot(toThreat);
      
      leftSafety -= leftAlignment;
      rightSafety -= rightAlignment;
    }

    // Choose the safer direction
    if (leftSafety > rightSafety) {
      return { shouldTurn: true, direction: 'left', shouldBrake: false };
    } else {
      return { shouldTurn: true, direction: 'right', shouldBrake: false };
    }
  }

  private planSafeRoute(
    aiState: BikeState,
    playerState: BikeState,
    arena: Arena,
    currentDirection: THREE.Vector3,
    threats: ThreatAssessment[]
  ): AIDecision {
    // Simulate turning left and right
    const leftScore = this.evaluateDirection(aiState, playerState, arena, 'left');
    const rightScore = this.evaluateDirection(aiState, playerState, arena, 'right');
    const straightScore = this.evaluateDirection(aiState, playerState, arena, null);

    // Choose best option
    if (straightScore >= leftScore && straightScore >= rightScore) {
      return { shouldTurn: false, direction: null, shouldBrake: false };
    } else if (leftScore > rightScore) {
      return { shouldTurn: true, direction: 'left', shouldBrake: false };
    } else {
      return { shouldTurn: true, direction: 'right', shouldBrake: false };
    }
  }

  private evaluateDirection(
    aiState: BikeState,
    playerState: BikeState,
    arena: Arena,
    turnDirection: TurnDirection | null
  ): number {
    let score = 100;
    
    // Simulate the turn
    let newRotation = aiState.rotation;
    if (turnDirection === 'left') {
      newRotation += Math.PI / 2;
    } else if (turnDirection === 'right') {
      newRotation -= Math.PI / 2;
    }

    const newDirection = new THREE.Vector3(
      Math.sin(newRotation),
      0,
      Math.cos(newRotation)
    );

    // Check threats in new direction
    const threats = this.assessThreats(
      { ...aiState, rotation: newRotation },
      playerState,
      arena,
      newDirection
    );

    // Penalize based on threats
    for (const threat of threats) {
      if (threat.distance < this.criticalThreshold) {
        score -= 50;
      } else if (threat.distance < this.dangerThreshold) {
        score -= 20;
      } else {
        score -= 5 / threat.distance;
      }
    }

    // Bonus for staying near center of arena (safer from ring)
    const centerDistance = aiState.position.length();
    score += Math.max(0, 20 - centerDistance);

    return score;
  }

  private makeStrategicMove(
    aiState: BikeState,
    playerState: BikeState,
    arena: Arena,
    currentDirection: THREE.Vector3,
    frameCount: number
  ): AIDecision {
    // Sometimes make random turns to create more complex patterns
    if (Math.random() < 0.005 && frameCount - aiState.lastTurnFrame > this.config.turnDelayFrames) {
      const direction = Math.random() < 0.5 ? 'left' : 'right';
      return { shouldTurn: true, direction, shouldBrake: false };
    }

    // Try to stay towards center of arena
    const centerDistance = aiState.position.length();
    if (centerDistance > 15) {
      // Turn towards center
      const toCenter = new THREE.Vector3(-aiState.position.x, 0, -aiState.position.z).normalize();
      const leftDir = new THREE.Vector3(
        Math.sin(aiState.rotation + Math.PI / 2),
        0,
        Math.cos(aiState.rotation + Math.PI / 2)
      );
      
      if (toCenter.dot(leftDir) > 0) {
        return { shouldTurn: true, direction: 'left', shouldBrake: false };
      } else {
        return { shouldTurn: true, direction: 'right', shouldBrake: false };
      }
    }

    return { shouldTurn: false, direction: null, shouldBrake: false };
  }
} 