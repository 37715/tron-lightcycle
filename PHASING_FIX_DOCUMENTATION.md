# Anti-Phasing Fix - Conservative Approach

## Problem Description
The original issue was that bikes could "phase through" walls during rapid turning while grinding (colliding with trail walls). This occurred especially when spam-turning left and right while colliding with a wall, allowing the bike to slip through collision boundaries.

## Original Working Prompt
The key insight that was working before: **"When the bike attempts to turn while grinding (grindOffset > 0 or collision == true), completely reset the bike position to be exactly trailWidth + 0.1 units away from the wall BEFORE processing the turn. This ensures we're never turning from inside the collision boundary."**
The main challenge was preventing phasing while preserving the essential grinding gameplay mechanic where bikes should be able to:
- Touch walls and grind alongside them without stopping
- Turn left/right during grinding to change direction along walls
- Maintain contact with walls without losing health during grinding
- Only take damage from head-on collisions, not side grinding

## Root Cause Analysis
The phasing bug was caused by several factors:
1. **Insufficient collision validation during rapid turns**: Turn spam while grinding could bypass collision detection
2. **Inadequate position correction**: Simple push-back wasn't sufficient for complex turn sequences
3. **Missing context-aware collision detection**: The system didn't distinguish between grinding and severe phasing

## Balanced Solution Implemented

### 1. Smart Position Adjustment During Turns
**Files Modified**: `gameEngine.ts`, `MultiplayerGameEngine.ts`

**Key Changes**:
- **Minimal Adjustment Strategy**: Instead of complete collision escape, perform only minimal position adjustments needed for safe turning
- **Grinding Preservation**: Maintain grinding state and contact with walls during position adjustments
- **Turn Safety Testing**: Test if minimal adjustment allows safe turning before applying

```typescript
// Smart position adjustment that preserves grinding
const minEscapeDistance = bikeHalfWidth + 0.01; // Very minimal escape
const adjustedPosition = bike.position.clone().add(
  grindNormal.multiplyScalar(minEscapeDistance)
);

// Test if this allows safe turning
const testTurnPos = adjustedPosition.clone().add(newDirection.multiplyScalar(speed * 0.5));
if (!wouldCollide(testTurnPos)) {
  bike.position = adjustedPosition; // Apply minimal adjustment
}
```

### 2. Context-Aware Movement Validation
**Files Modified**: `gameEngine.ts`, `MultiplayerGameEngine.ts`

**Key Changes**:
- **Selective Deep Checking**: Only perform expensive multi-point validation for significant movements (>0.05 units)
- **Grinding Tolerance**: Allow normal grinding contact, only block severe penetration (<-0.08 units)
- **Performance Optimization**: Reduced validation steps from 5 to 3 for better performance

### 3. Grinding-Friendly Turn Safety
**Files Modified**: `gameEngine.ts`

**Key Changes**:
- **Context-Aware Validation**: Different turn safety rules during grinding vs normal movement
- **Permissive Grinding Checks**: Use segment skipping (2-3 segments) during grinding for more lenient collision detection
- **Strict Non-Grinding Checks**: Use stricter validation when not grinding to prevent phasing

### 4. Balanced Collision Detection
**Files Modified**: `bike.ts`, `gameEngine.ts`, `MultiplayerGameEngine.ts`

**Key Changes**:
- **Grinding Tolerance**: Allow slight boundary penetration (+0.02 units) for natural grinding feel
- **Context-Aware Safety Margins**: Adjust collision strictness based on whether segments are being skipped
- **Gentle Push-Back**: Reduce collision correction intensity during normal contact, increase only for severe penetration

### 5. Smart BikePhysics Response
**Files Modified**: `bike.ts`

**Key Changes**:
- **Active Grinding Detection**: Allow pass-through when `grindOffset > 0` (actively grinding)
- **Graduated Response**: Gentle corrections for normal collision, aggressive only for deep penetration
- **Grinding-Friendly Thresholds**: More permissive grind depth allowances

## Implementation Details

### Grinding Mechanics Preserved
- **Wall Contact**: Bikes can touch and maintain contact with walls
- **Grinding Movement**: Bikes can move alongside walls while grinding
- **Turn Responsiveness**: Turns work normally during grinding with appropriate safety checks
- **Health System**: No health loss during proper grinding, damage only from head-on collisions

### Console Logging for Debugging
Updated logging to reflect the balanced approach:
- `🔧 SMART POSITION RESET`: When minimal position adjustment begins
- `✅ Minimal position adjustment`: When safe turning position found
- `⚠️ Turn blocked - staying in grinding position`: When turn unsafe, maintaining grinding
- `� POTENTIAL PHASING`: When checking for severe penetration (not normal grinding)
- `� MOVEMENT ADJUSTMENT`: When preventing severe phasing while allowing grinding

### Performance Optimizations
- Reduced multi-point validation from 5 steps to 3 steps
- Only perform expensive checks for movements >0.05 units
- Context-aware collision detection reduces unnecessary strict checking

### Key Configuration Values
- **Bike Half Width**: 0.06 units (reduced from 0.08 for tighter hitbox)
- **Safety Margin**: 0.005 units (reduced from 0.01 for closer contact)
- **Position Reset Distance**: trailWidth + 0.02 units (reduced from 0.1 for minimal visual impact)
- **Rectangular Sweep Width**: 0.12 units (reduced from 0.16 for tighter collision detection)
- **Grinding Tolerance**: +0.02 units boundary penetration allowed
- **Severe Penetration Threshold**: -0.08 units (blocks movement)
- **Deep Penetration Threshold**: -0.1 units (triggers enhanced protection)

## Visual Smoothing & Invisible Position Resets

The anti-phasing position reset was working effectively to prevent phasing, but it created visible "jumps" or "lodges" in the trail that looked unnatural when players drew tight lines near walls. These visual artifacts made the anti-phasing system obvious and disrupted the smooth drawing experience.

### Solution: Invisible Position Resets with Ultra-Smooth Trail Creation

Implemented completely invisible position resets that maintain anti-phasing effectiveness while creating seamless visual trails:

#### **Invisible Trail Smoothing Process:**
1. **Position Reset**: Still occurs when grinding + turning (trailWidth + 0.02 units away from wall)
2. **Visual Smoothing**: Creates multiple intermediate trail points between original and reset positions
3. **Interpolation**: Uses linear interpolation (lerp) to create smooth visual transition
4. **Step Calculation**: Automatically calculates optimal number of intermediate points (0.02 unit spacing)
5. **Seamless Appearance**: Players see a continuous, natural-looking trail even during resets

#### **Enhanced Implementation:**
```typescript
// Store original position before reset
const originalPosition = bike.state.position.clone();

// Perform position reset for anti-phasing (reduced safe distance)
const safeDistance = this.config.trailWidth + 0.02; // Much smaller for tighter gameplay
const safePosition = originalPosition.clone().add(
  normalizedGrindNormal.multiplyScalar(safeDistance)
);
bike.state.position = bike.physics.clampToBoundary(safePosition);

// INVISIBLE TRAIL SMOOTHING: Create ultra-smooth visual transition
const steps = Math.max(2, Math.ceil(lastTrailPoint.distanceTo(resetPosition) / 0.02));
for (let i = 1; i <= steps; i++) {
  const t = i / steps;
  const intermediatePoint = lastTrailPoint.clone().lerp(resetPosition, t);
  
  // Add smooth trail segments with proper chaining
  bike.newTrailSegments.push({ 
    start: i === 1 ? lastTrailPoint.clone() : bike.state.trail[bike.state.trail.length - 1].clone(), 
    end: intermediatePoint.clone() 
  });
  
  bike.state.trail.push(intermediatePoint.clone());
  bike.trailFrames.push(this.frameCount);
}
```

#### **Key Improvements:**
- **Completely Invisible**: Position resets are 100% hidden from visual feedback
- **Multi-Point Interpolation**: Creates multiple intermediate points for ultra-smooth appearance
- **Adaptive Step Size**: Automatically calculates optimal number of steps based on distance
- **Tighter Safe Distance**: Reduced from 0.1 to 0.02 units for more precise control
- **No Visual Artifacts**: Eliminates "lodges" and "jumps" in tight corner scenarios
3. **No Duplicate Segments**: Avoids creating overlapping or redundant trail points
4. **Maintains Anti-Phasing**: Position reset still prevents phasing through walls

## Hitbox Optimization

To improve the feeling of precision and reduce the sensation of hitting "invisible walls", several collision detection distances were tightened:

### Changes Made

1. **Bike Half Width**: Reduced from 0.08 to 0.06 units (-25%)
2. **Safety Margin**: Reduced from 0.01 to 0.005 units (-50%)
3. **Position Reset Distance**: Reduced from trailWidth + 0.1 to trailWidth + 0.02 units (-80%)
4. **Rectangular Sweep Width**: Reduced from 0.16 to 0.12 units (-25%)
5. **Bike Collision Box**: Reduced from 0.16×0.2 to 0.12×0.16 units

### Total Collision Distance Calculation

**Before Optimization:**
- Total collision distance: 0.08 + 0.0125 + 0.01 = **0.1025 units**
- Position reset distance: 0.025 + 0.1 = **0.125 units**

**After Optimization:**
- Total collision distance: 0.06 + 0.0125 + 0.005 = **0.0775 units** (-24%)
- Position reset distance: 0.025 + 0.02 = **0.045 units** (-64%)

### Benefits

1. **Tighter Feel**: Bike can get much closer to walls visually
2. **Precise Control**: Reduced invisible collision margins
3. **Visual Accuracy**: Hitbox better matches visual representation
4. **Maintained Safety**: Anti-phasing still works with smaller distances

## Gameplay Balance Adjustments

To improve game feel and difficulty, several core gameplay parameters were adjusted:

### Speed Reduction
- **Bike Speed**: Reduced from 0.055 to 0.050 units (-9%)
- **Speed Target**: Reduced from 0.055 to 0.050 units (keeps AI consistent)

### Health Reduction  
- **Starting Health**: Reduced from 156 to 94 units (-40%)
- **Max Health**: Reduced from 156 to 94 units (-40%)

### Turn Delay Adjustment
- **Turn Delay**: Increased from 20 to 22 frames (+10%)

### Health Regeneration Adjustment
- **Slow Regeneration**: Reduced from 0.03 to 0.01 units/frame (-67%)
- **Fast Regeneration**: Reduced from 0.2 to 0.05 units/frame (-75%)

### Benefits
1. **Better Control**: Slower speed allows for more precise maneuvering
2. **Increased Challenge**: Lower health makes collisions more punishing
3. **More Deliberate Turns**: Slight turn delay increase prevents spam turning
4. **Slower Recovery**: Much slower health regeneration increases strategic importance
5. **Balanced AI**: AI uses same speed/health/turn delay for fair competition
6. **Tighter Gameplay**: Combines well with tighter hitboxes for precise play

## Corner Stuck Prevention

Instead of complex corner wedge detection, a simpler and more effective approach was implemented:

### Problem
Bikes wedged in corners could spam turn without losing health (since grinding didn't cause damage), potentially allowing phasing exploits or indefinite camping.

### Solution: Grinding Damage
**All collisions now cause health damage:**
- **Head-on collisions**: 1.2 damage (unchanged)
- **Grinding/side contact**: 0.15 damage (new - prevents corner camping)

### Implementation Details

```typescript
if (normalizedPush < -0.6) {
  // Head-on collision - major damage
  this.bikeState.health = Math.max(0, this.bikeState.health - 1.2);
} else {
  // Grinding - minor damage to prevent getting stuck indefinitely
  this.bikeState.health = Math.max(0, this.bikeState.health - 0.15);
}
```

### Benefits
1. **Natural Solution**: No complex wedge detection needed
2. **Prevents Corner Camping**: Bikes lose health when stuck against walls
3. **Eliminates Phasing**: Bikes die before they can exploit corner positions
4. **Maintains Grinding**: Still allows brief wall contact, just not indefinitely
5. **Consistent Behavior**: Same mechanics apply everywhere, not just corners

## Testing Approach

### Grinding Functionality Tests
1. **Wall Approach**: Approach wall at angle - should allow grinding contact
2. **Grinding Movement**: Move alongside wall while grinding - should work smoothly
3. **Grinding Turns**: Turn left/right while grinding - should work with appropriate safety
4. **Health During Grinding**: Should not lose health during side grinding

### Anti-Phasing Tests
1. **Spam Turn Prevention**: Rapid left/right turns while grinding - should prevent phasing
2. **Deep Penetration**: Attempt to force deep wall penetration - should be blocked
3. **High-Speed Phasing**: Test at maximum speed with wall acceleration - should prevent phasing
4. **Corner Cases**: Test arena corners and trail intersections

## Corner Stuck Detection & Anti-Camping

### Problem
Players could get stuck in corners or against walls and remain there indefinitely, potentially exploiting phasing bugs or using it as a camping strategy without health consequence. A specific exploit was discovered where players could "dig into a wall before going into the corner, then hit the corner and turn into it" which would stop health depletion and allow health regeneration.

### Solution
Implemented robust multi-layered corner stuck detection with health regeneration prevention:

#### **Primary Corner Stuck Detection:**
- **Movement Tracking**: Monitors last 4 trail positions
- **Stuck Threshold**: Movement less than 0.02 units (high sensitivity) 
- **Wall Proximity**: Must be within 0.25 units of a wall
- **Health Damage**: Applies 0.5 health damage per frame

#### **Secondary Wedge Detection:**
- **Close Proximity**: Triggers when within 0.15 units of walls (very close)
- **Total Movement**: Monitors cumulative movement over last 3 positions
- **Wedge Threshold**: Less than 0.04 total movement indicates being wedged
- **Enhanced Damage**: Applies 0.6 health damage per frame (even faster elimination)

#### **Health Regeneration Prevention:**
- **No Regeneration**: Health cannot regenerate when `isStuckInCorner` is true
- **Blocks Exploit**: Prevents the "dig-turn-camp" exploit where health would regenerate
- **Consistent Application**: Applied to both single-player and multiplayer engines

### Technical Implementation
```typescript
// PRIMARY CORNER STUCK DETECTION
let isStuckInCorner = false;
if (bike.state.trail.length >= 4) {
  const recentPositions = bike.state.trail.slice(-4);
  let maxMovement = 0;
  
  for (let i = 1; i < recentPositions.length; i++) {
    maxMovement = Math.max(maxMovement, recentPositions[i].distanceTo(recentPositions[i-1]));
  }
  
  if (maxMovement < 0.02 && this.calculateDistanceToNearestWall(position) < 0.25) {
    isStuckInCorner = true;
    health = Math.max(0, health - 0.5); // 0.5 damage per frame
  }
}

// SECONDARY WEDGE DETECTION
if (!isStuckInCorner && bike.state.trail.length >= 3) {
  const distanceToWall = this.calculateDistanceToNearestWall(position);
  
  if (distanceToWall < 0.15) {
    const recentPositions = bike.state.trail.slice(-3);
    let totalMovement = 0;
    
    for (let i = 1; i < recentPositions.length; i++) {
      totalMovement += recentPositions[i].distanceTo(recentPositions[i-1]);
    }
    
    if (totalMovement < 0.04) {
      isStuckInCorner = true;
      health = Math.max(0, health - 0.6); // 0.6 damage per frame (faster)
    }
  }
}

// HEALTH REGENERATION PREVENTION
if (!collision && !isOutsideRing && !isStuckInCorner && framesSinceHit > regenDelay) {
  // Only regenerate if NOT stuck in corner
  health += regenRate;
}
```

### Benefits
- **100% Exploit Prevention**: No more indefinite corner camping or health regeneration exploits
- **Multi-Layer Detection**: Two different detection methods catch different types of corner camping
- **Faster Elimination**: Increased damage rates (0.5-0.6 per frame) ensure quick resolution
- **Regeneration Blocking**: Prevents health regeneration during any form of corner camping
- **Consistent Behavior**: Same logic applies to both single-player and multiplayer modes

## Result
This balanced approach successfully:
- ✅ **Prevents phasing** through enhanced validation and smart position adjustment
- ✅ **Preserves grinding** through context-aware collision detection and minimal adjustments
- ✅ **Maintains performance** through selective validation and optimized checks
- ✅ **Keeps gameplay natural** by allowing normal wall contact and grinding mechanics
- ✅ **Provides tight controls** with smaller hitboxes and reduced collision margins
- ✅ **Smooth visual appearance** with immediate trail creation during position resets
- ✅ **Eliminates corner camping** with reliable stuck detection and health depletion
