import { BikeState } from './types';

export class WallAcceleration {
  public accelBase: number = 20;    // Base acceleration strength
  public rimMult: number = 0;       // Multiplier for boundary walls
  public selfMult: number = 1;      // Multiplier for own walls
  public teamMult: number = 1;      // Multiplier for team walls
  public enemyMult: number = 1;     // Multiplier for enemy walls
  public offset: number = 2;        // Offset for acceleration calculation
  public wallNear: number = 6;      // Distance threshold for wall acceleration
  
  private target: BikeState;
  
  constructor(target: BikeState) {
    this.target = target;
  }
  
  // Calculate acceleration against a specific wall
  private against(dist: number, isOwnWall: boolean, isBoundary: boolean): number {
    if (this.wallNear < dist) return 0;
    
    let wallAccel = this.accelBase;
    
    if (isBoundary) {
      wallAccel *= this.rimMult;
    } else if (isOwnWall) {
      wallAccel *= this.selfMult;
    } else {
      wallAccel *= this.enemyMult;
    }
    
    return wallAccel * (
      (1 / (dist + this.offset)) -
      (1 / (this.wallNear + this.offset))
    );
  }
  
  // Calculate total acceleration from nearby walls
  public calc(): number {
    let finalAccel = 0;
    
    if (this.accelBase !== 0 && (this.target.distL < this.wallNear || this.target.distR < this.wallNear)) {
      // For now, treat all walls as boundary walls since we don't have wall ownership tracking
      finalAccel += this.against(this.target.distL, false, true);
      finalAccel += this.against(this.target.distR, false, true);
    }
    
    return finalAccel;
  }
} 