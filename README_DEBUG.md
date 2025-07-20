# Debug Mode Documentation

## Debug Controls

### Keyboard Shortcuts

- **Shift+D**: Toggle debug mode on/off
- **D**: Dump complete bike state and collision history to console (when debug mode is enabled)
- **G**: Toggle step-by-step mode and advance frame by frame (when debug mode is enabled)

### Debug Visualizations

When debug mode is enabled, you'll see:

1. **Green wireframe box**: Player bike's collision boundary
2. **Orange wireframe box**: AI bike's collision boundary (in practice mode)
3. **Red lines**: Nearby wall segments (arena boundaries and trail segments)
4. **Yellow zone**: Allowed penetration zone when grinding against walls
5. **Text overlay**: Real-time debug information including:
   - Current frame number
   - Bike position
   - Grind offset value
   - Rubber value
   - Collision state
   - Distance to nearest wall
   - Health and grace frames

### Console Logs

- **Collision state changes**: Automatically logged when collision state changes from false to true or vice versa
- **Complete state dump**: Press 'D' to dump full bike state and last 10 collision checks
- **Step-by-step logs**: Frame-by-frame progression when using 'G' mode

### Understanding the Values

- **GrindOffset**: How far the bike has penetrated into a wall (should be small during grinding)
- **Rubber**: Accumulated damage from head-on collisions (resets over time)
- **Distance to Wall**: Minimum distance to any wall or trail segment
- **Collision State**: Whether the bike is currently colliding with something

### Using Step-by-Step Mode

1. Press **Shift+D** to enable debug mode
2. Press **G** to enter step-by-step mode (game will pause)
3. Press **G** repeatedly to advance frame by frame
4. Each frame will be logged to console with details

This debug system will help you identify exactly when and why phasing occurs by showing the precise collision boundaries and values at each frame. 