# MAPGEN: Echo Chamber Map Generation Overhaul

Brogue-inspired procedural generation for an underwater submarine roguelike.

## References

- [Brian Walker interview (RPS)](https://rockpapershotgun.com/how-do-roguelikes-generate-levels)
- [anderoonies blog Part 1](http://anderoonies.github.io/2020/03/17/brogue-generation.html)
- [anderoonies blog Part 2](http://anderoonies.github.io/2020/04/07/brogue-generation-2.html)
- [anderoonies blog Part 3](https://anderoonies.github.io/2020/11/14/brogue-generation-3.html)
- [BrogueCE source](https://github.com/tmewett/BrogueCE) — `src/brogue/Architect.c`, `Rogue.h`, `Grid.c`

## Thematic Translation (Brogue to Underwater)

| Brogue Concept        | Echo Chamber Equivalent           |
|-----------------------|-----------------------------------|
| Grass / foliage       | Kelp forests, sea grass           |
| Torches               | Bioluminescent organisms          |
| Lava / fire           | Thermal vents, magma seeps        |
| Chasms                | Abyssal drops                     |
| Gas traps             | Toxic volcanic gas clouds         |
| Pressure plates       | Current triggers                  |
| Bridges               | Rock formations, coral bridges    |
| Fungi                 | Coral formations                  |
| Crystal formations    | Mineral deposits                  |
| Shallow water         | Sandy shallows                    |
| Deep water            | Deep currents (movement penalty)  |
| Rooms                 | Caverns, grottos                  |
| Corridors             | Tunnels, fissures                 |
| Doors                 | Narrow passages, breakable walls  |

## Dependency Graph

```
Phase 0: Foundation Types  [SEQUENTIAL — blocks everything]
  └─ 00-foundation-types.md
     Expand TileKind, add terrain properties, CellColor, LightSource
     Update isPassableTile, create tile property lookup

              ┌──────────┬──────────┬──────────┬──────────┬──────────┐
              │          │          │          │          │          │
Phase 1:     1A        1B        1C        1D        1E        1F
(parallel)   Room      CA Blob   Color &   Feature   Biome     Pathfinding
             Shapes    Generator Atmosphere Autogen   Profiles  & Connectivity
              │          │          │          │          │          │
              └────┬─────┴──────────┘          └────┬─────┴──────────┘
                   │                                │
Phase 2:          2G                2H             2I             2J
(parallel)        Main Pipeline     Lakes &        Loop           Machines
                  (uses A,B,E,F)    Chambers       Punching       & Vaults
                                    (uses B,F)     (uses F)       (uses D,A)
                   │                 │              │              │
                   └─────────────────┴──────────────┴──────────────┘
                                     │
Phase 3:          3K                3L             3M
(parallel)        Tile Rendering    Color          Feature &
                  (new tile types)  Rendering      Lighting Rendering
                   │                 │              │
                   └─────────────────┴──────────────┘
                                     │
Phase 4: Integration & Testing  [SEQUENTIAL]
  └─ 04-integration.md
     Wire up pipeline, migrate destruction/perception/boulders,
     end-to-end tests, visual QA
```

## File Index

| Doc | Phase | Title | Parallel Group |
|-----|-------|-------|----------------|
| [00-foundation-types.md](./00-foundation-types.md) | 0 | Foundation Types & Tile System | sequential |
| [01a-room-shapes.md](./01a-room-shapes.md) | 1 | Room Shapes & Placement | 1-parallel |
| [01b-ca-blob.md](./01b-ca-blob.md) | 1 | CA Blob Generator | 1-parallel |
| [01c-color-atmosphere.md](./01c-color-atmosphere.md) | 1 | Color & Atmosphere Engine | 1-parallel |
| [01d-feature-autogen.md](./01d-feature-autogen.md) | 1 | Feature Autogenerator | 1-parallel |
| [01e-biome-profiles.md](./01e-biome-profiles.md) | 1 | Biome Profile System | 1-parallel |
| [01f-pathfinding.md](./01f-pathfinding.md) | 1 | Pathfinding & Connectivity | 1-parallel |
| [02g-main-pipeline.md](./02g-main-pipeline.md) | 2 | Main Generation Pipeline | 2-parallel |
| [02h-lakes-chambers.md](./02h-lakes-chambers.md) | 2 | Lakes & Open Chambers | 2-parallel |
| [02i-loop-punching.md](./02i-loop-punching.md) | 2 | Loop Punching | 2-parallel |
| [02j-machines-vaults.md](./02j-machines-vaults.md) | 2 | Machines & Vaults | 2-parallel |
| [03-rendering.md](./03-rendering.md) | 3 | Rendering Updates (K, L, M) | 3-parallel |
| [04-integration.md](./04-integration.md) | 4 | Integration, Migration & Testing | sequential |

## Design Constraints

- **Runtime**: Deno
- **Frontend**: Preact + Preact Signals (no `use*` hooks when signals suffice)
- **Rendering**: Canvas 2D (current), auto-tiling box-drawing glyphs
- **RNG**: rot-js `RNG` with save/restore state for determinism
- **Map size**: 144x84 (configurable via `MapGenOptions`)
- **Border**: Always 1-cell solid wall border
- **Perspective**: 2D side-view (gravity matters — boulders fall down)
- **Aesthetic**: Retro-terminal, tactical military interface, IBM 3270 font
- **Libraries**: `npm:rot-js@2.2.1`, `jsr:@std/random`, `jsr:@std/assert` (tests)

## Current Codebase Entry Points

| File | Role | Lines |
|------|------|-------|
| `src/game/mapgen.ts` | Map generation (CA + connectivity) | 413 |
| `src/game/model.ts` | All game types (GameState, etc.) | 126 |
| `src/game/state.ts` | `createGame()` entry point | 70 |
| `src/game/constants.ts` | Balance constants | 32 |
| `src/game/helpers.ts` | Utility functions | 203 |
| `src/game/items.ts` | Item placement (corner heuristic) | 207 |
| `src/game/perception.ts` | FOW / visibility system | 130 |
| `src/game/systems/destruction.ts` | Torpedo detonation, terrain carving | 309 |
| `src/game/systems/boulders.ts` | Falling boulder physics | ~80 |
| `src/game/systems/shockwaves.ts` | Sonar wave expansion | ~100 |
| `src/render/layers/tileMemory.ts` | Tile rendering (wall/water only) | 56 |
| `src/render/helpers/selectors.ts` | Wall autotiling bitmask | 106 |
| `src/render/colors.ts` | Flat color palette | 20 |
| `src/game/mapgen_test.ts` | Map generation tests | 178 |
