# 7DRL Game Concept: "Echo Chamber"

**Elevator Pitch:** A tense, side-view, turn-based submarine roguelike where you navigate a procedurally generated undersea cavern. Sight is severely limited; you must rely on intermittent sonar pings to map the environment, while managing a strict payload of 6 torpedoes whose explosions permanently deform the terrain and acoustically muddy your sensors. 

**Objective:** Navigate the labyrinthine depths to locate and capture a secret document capsule hidden at the end of the cavern, then survive.

---

### 1. Technical Architecture
*   **Environment:** Deno
*   **Frontend Framework:** Preact + Preact Signals (for efficient, reactive state management)
*   **Rendering:** WebGL (using TWGL or the best lightweight WebGL wrapper for the job)
*   **Architecture Goal:** Clean separation between the game logic (pure turn-based state) and the WebGL rendering layer.

### 2. Visual Identity & Graphics
*   **Perspective:** 2D Side-view.
*   **Aesthetic:** Retro-terminal, tactical military interface.
*   **Font:** [IBM 3270 font](https://github.com/rbanffy/3270font) for UI and text.
*   **Rendering Effects:** Heavy CRT filter (scanlines, slight curvature, phosphor glow).
*   **Tileset:** SVG-based, sharp, vector graphics. The map should use a connected, auto-tiling system to render the organic, maze-like undersea caverns cleanly.

### 3. Core Mechanics & "Fog of War"
The primary hook of the game is **Sensory Deprivation & Information Gathering**. You cannot directly "see" the map. 

**The Sonar System:**
*   **Passive Vision (Distance-Based Resolution):**
    *   *Distance ≤ 2 tiles (High Res):* Perfect clarity. You can identify exact entities (e.g., "Attack Sub", "Missile Upgrade", "Limestone").
    *   *Distance 3 to 4 tiles (Low Res):* General shapes. You only know the category (ENEMY, ITEM, or TERRAIN).
    *   *Distance ≥ 5 tiles (Blind):* Pitch black. Impossible to know if something exists unless pinged by active sonar.
*   **Active Sonar (Every 3 Turns):**
    *   An automatic sonar wave emits from your submarine.
    *   Leaves a fading visual trail as it travels.
    *   When the wave hits an entity or terrain, it permanently updates the player's Fog of War map with a snapshot of that location.

**Movement & Pacing:**
*   **Player Speed:** Moves 1 tile per turn (Up/Down/Left/Right via WASD/Arrows).
*   **Asynchronous Entity Speed:** Many entities (like torpedoes, falling rocks, or specific enemies) move 3+ tiles per turn, requiring the player to think steps ahead. 

### 4. Combat & Physics
*   **Strict Resource Management:** You only have **6 torpedoes** total. They must be used carefully to dig through walls or destroy threats.
*   **Torpedo Mechanics:**
    *   Fired by both the player and enemy submarines.
    *   Leave a fading trail of bubbles. Enemies can use your bubble trail to track your position in the dark, and vice versa.
*   **Explosions & Destruction:**
    *   Explosions span a 3+ tile radius.
    *   *Terrain Destruction:* Destroys cavern walls, dynamically altering the maze.
    *   *Cave-ins:* Explosions can detach chunks of the cavern ceiling. These falling rocks become lethal, fast-moving entities subject to gravity.
    *   *Acoustic Muddying:* Explosions scramble the water. The resulting "noise cloud" temporarily messes with sonar, creating blind spots or false positives in the Fog of War where the explosion occurred.
