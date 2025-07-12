import * as THREE from 'three';
import { BikeState, GameConfig } from './types';

export class WallSensors {
  public f: number = 9999;  // Forward distance
  public l: number = 9999;  // Left distance
  public r: number = 9999;  // Right distance
  
  public lWall: any = null; // Left wall reference
  public rWall: any = null; // Right wall reference
  
  private config: GameConfig;
  
  constructor(config: GameConfig) {
    this.config = config;
  }
  
  // Port of TMath.lineIntersect from Armagetron
  private lineIntersect(
    p0_x: number, p0_y: number,
    p1_x: number, p1_y: number, 
    p2_x: number, p2_y: number,
    p3_x: number, p3_y: number
  ): boolean {
    const s1_x = p1_x - p0_x;
    const s1_y = p1_y - p0_y;
    const s2_x = p3_x - p2_x;
    const s2_y = p3_y - p2_y;
    
    const denominator = (-s2_x * s1_y + s1_x * s2_y);
    if (Math.abs(denominator) < 0.0001) return false;
    
    const s = (-s1_y * (p0_x - p2_x) + s1_x * (p0_y - p2_y)) / denominator;
    const t = (s2_x * (p0_y - p2_y) - s2_y * (p0_x - p2_x)) / denominator;
    
    return (s >= 0 && s <= 1 && t >= 0 && t <= 1);
  }
  
  // Port of TMath.distanceOfLines from Armagetron
  private distanceOfLines(
    x1: number, y1: number,
    x2: number, y2: number,
    x3: number, y3: number,
    x4: number, y4: number
  ): number {
    const SMALL_NUM = 0.00000001;
    const ux = x2 - x1, uy = y2 - y1;
    const vx = x4 - x3, vy = y4 - y3;
    const wx = x1 - x3, wy = y1 - y3;
    const a = (ux * ux) + (uy * uy);
    const b = (ux * vx) + (uy * vy);
    const c = (vx * vx) + (vy * vy);
    const d = (ux * wx) + (uy * wy);
    const e = (vx * wx) + (vy * wy);
    let D = a * c - b * b;
    
    let sc: number, sN: number, sD = D;
    let tc: number, tN: number, tD = D;
    
    if (D < SMALL_NUM) {
      sN = 0;
      sD = 1;
      tN = e;
      tD = c;
    } else {
      sN = (b * e - c * d);
      tN = (a * e - b * d);
      
      if (sN < 0) {
        sN = 0;
        tN = e;
        tD = c;
      } else if (sN > sD) {
        sN = sD;
        tN = e + b;
        tD = c;
      }
    }
    
    if (tN < 0) {
      tN = 0;
      if (d > 0) {
        sN = 0;
      } else if (d < a) {
        sN = sD;
      } else {
        sN = -d;
        sD = a;
      }
    } else if (tN > tD) {
      tN = tD;
      if ((b - d) < 0) {
        sN = 0;
      } else if ((b - d) > a) {
        sN = sD;
      } else {
        sN = b - d;
        sD = a;
      }
    }
    
    sc = (Math.abs(sN) < SMALL_NUM ? 0.0 : sN / sD);
    tc = (Math.abs(tN) < SMALL_NUM ? 0.0 : tN / tD);
    const dPx = wx + (ux * sc) - (vx * tc);
    const dPy = wy + (uy * sc) - (vy * tc);
    
    return Math.sqrt(dPx * dPx + dPy * dPy);
  }
  
  // AUTHENTIC ARMAGETRON GRINDING MECHANICS
  public measure(bikeState: BikeState, trail: THREE.Vector3[], range: number): boolean {
    const x = bikeState.position.x;
    const y = bikeState.position.z; // Use z as y in 2D calculations
    const xdir = Math.sin(bikeState.rotation);
    const ydir = Math.cos(bikeState.rotation);
    
    // Store last position for grinding calculations
    const lastX = bikeState.lastX || x;
    const lastY = bikeState.lastY || y;
    const lastdirX = bikeState.lastdirX || xdir;
    const lastdirY = bikeState.lastdirY || ydir;
    
    // Calculate left direction (90 degrees counter-clockwise)
    const t = Math.atan2(ydir, xdir) + (Math.PI / 2);
    const lxdir = Math.cos(t);
    const lydir = Math.sin(t);
    
    let collision = false;
    this.f = this.l = this.r = range;
    
    // Check boundary walls
    const limit = this.config.boundaryLimit;
    const walls = [
      { x1: -limit, y1: -limit, x2: limit, y2: -limit }, // Bottom wall
      { x1: limit, y1: -limit, x2: limit, y2: limit },   // Right wall  
      { x1: limit, y1: limit, x2: -limit, y2: limit },   // Top wall
      { x1: -limit, y1: limit, x2: -limit, y2: -limit }  // Left wall
    ];
    
    // Add trail segments as walls (skip recent segments)
    const trailWalls = [];
    for (let i = 0; i < trail.length - 3; i++) {
      if (i + 1 < trail.length) {
        trailWalls.push({
          x1: trail[i].x,
          y1: trail[i].z,
          x2: trail[i + 1].x, 
          y2: trail[i + 1].z
        });
      }
    }
    
    const allWalls = [...walls, ...trailWalls];
    
    for (const wall of allWalls) {
      // GRINDING MECHANICS: Position adjustment when colliding with walls
      if (bikeState.checkLast) {
        if (this.lineIntersect(
          lastX, lastY,
          x, y,
          wall.x1, wall.y1,
          wall.x2, wall.y2
        )) {
          let dist = this.distanceOfLines(x, y, x, y, wall.x1, wall.y1, wall.x2, wall.y2);
          
          // DEPTH CALCULATION: Subtract minimum distance (how deep cycle is in wall)
          dist -= bikeState.minDistF;
          if (dist < 0) dist = 0;
          
          // POSITION ADJUSTMENT: Push cycle back from wall based on depth
          bikeState.position.x -= (lastdirX * dist);
          bikeState.position.z -= (lastdirY * dist);
          
          // Update local coordinates
          const newX = bikeState.position.x;
          const newY = bikeState.position.z;
          
          // SECONDARY COLLISION CHECK: Handle deeper grinding
          if (this.lineIntersect(
            lastX, lastY,
            newX, newY,
            wall.x1, wall.y1,
            wall.x2, wall.y2
          )) {
            dist = this.distanceOfLines(lastX, lastY, newX, newY, wall.x1, wall.y1, wall.x2, wall.y2);
            dist -= bikeState.minDistF;
            if (dist < 0) dist = 0;
            
            // FINAL POSITION: Place cycle at safe distance from wall
            bikeState.position.x = lastX + (lastdirX * dist);
            bikeState.position.z = lastY + (lastdirY * dist);
            
            // DEATH CHECK: Kill cycle if still intersecting after adjustment
            if (this.lineIntersect(
              lastX, lastY,
              bikeState.position.x, bikeState.position.z,
              wall.x1, wall.y1,
              wall.x2, wall.y2
            )) {
              bikeState.alive = false;
            }
          }
          
          collision = true;
          
          // RECURSIVE COLLISION: Re-check after position adjustment
          return this.measure(bikeState, trail, range);
        }
      }
      
      // FORWARD DISTANCE DETECTION
      if (this.lineIntersect(
        x, y,
        x + xdir * range, y + ydir * range,
        wall.x1, wall.y1,
        wall.x2, wall.y2
      )) {
        const ff = this.distanceOfLines(x, y, x, y, wall.x1, wall.y1, wall.x2, wall.y2);
        
        if (ff < 0.01) {
          collision = true;
        }
        
        if (this.f > ff) {
          this.f = ff;
        }
      }
      
      // LEFT DISTANCE DETECTION
      if (this.lineIntersect(
        x, y,
        x + lxdir * range, y + lydir * range,
        wall.x1, wall.y1,
        wall.x2, wall.y2
      )) {
        const ff = this.distanceOfLines(x, y, x, y, wall.x1, wall.y1, wall.x2, wall.y2);
        
        if (this.l > ff) {
          this.l = ff;
          this.lWall = wall;
        }
      }
      
      // RIGHT DISTANCE DETECTION  
      if (this.lineIntersect(
        x, y,
        x - lxdir * range, y - lydir * range,
        wall.x1, wall.y1,
        wall.x2, wall.y2
      )) {
        const ff = this.distanceOfLines(x, y, x, y, wall.x1, wall.y1, wall.x2, wall.y2);
        
        if (this.r > ff) {
          this.r = ff;
          this.rWall = wall;
        }
      }
    }
    
    return collision;
  }
} 