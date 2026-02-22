# CLAUDE.md

## Project Overview

**Mountain Ascent** (`resonance_game`) — A two-player cooperative browser platformer built with Phaser 3 and PeerJS P2P networking. Players solve puzzles using the Chinese pentatonic scale (五声音阶). Player 1 (Striker, desktop) strikes bells; Player 2 (Carrier, mobile-friendly) collects bells and replays note sequences to unlock moon gates.

## Commands

```bash
npm run dev          # Start Vite dev server on port 3000
npm run build        # TypeScript compile + Vite production build
npm run preview      # Preview production build locally
npm run lint         # ESLint check on src/ (.ts, .tsx)
npm test             # Run Vitest tests once
npm run test:watch   # Run Vitest in watch mode
```

## Architecture

```
src/
├── main.ts              # Phaser game init & window resize handler
├── config.ts            # Game constants (physics, colors, sync rate)
├── types/index.ts       # All enums & interfaces (domain model)
├── scenes/
│   ├── BootScene.ts     # Procedural texture generation (no external assets)
│   ├── MenuScene.ts     # Room creation/joining UI, reconnection prompt
│   ├── GameScene.ts     # Core gameplay loop (movement, bells, sync, UI)
│   ├── EndScene.ts      # Victory screen when both players reach summit
│   └── index.ts         # Scene exports
├── network/
│   └── NetworkManager.ts  # PeerJS P2P connection, session persistence
├── audio/
│   └── AudioManager.ts   # Web Audio API synthesizer for pentatonic notes
└── levels/
    ├── level1.ts        # Tutorial: Mountain Base (1 bell, 1 gate)
    ├── level2.ts        # Stone Stairway (vertical, role-specific gates)
    └── index.ts         # Level array export
tests/
├── config.test.ts       # Config constants validation
├── levels.test.ts       # Level data integrity tests
└── types.test.ts        # Enum/type definition tests
```

## Key Files

| File | What it does |
|------|-------------|
| `src/scenes/GameScene.ts` | Main gameplay: player movement, bell strike/pickup/carry/place, puzzle gate logic, touch controls (joystick, action buttons), network sync, help popup |
| `src/network/NetworkManager.ts` | PeerJS wrapper — host creates room, guest joins by ID. Session persistence via sessionStorage. Handles visibility changes for reconnection |
| `src/audio/AudioManager.ts` | Synthesizes pentatonic bell tones using Web Audio API (fundamental + 2 overtones for metallic timbre). Plays success chord on puzzle solve |
| `src/types/index.ts` | Central domain model — `PentatonicNote`, `PlayerRole`, `MoonGateType`, `NetworkMessageType` enums; `LevelData`, `BellDefinition`, `NetworkMessage` interfaces |
| `src/config.ts` | Tunable constants: gravity (1400), speed (160), jump velocity (-520), pixel scale (3x), sync rate (50ms) |
| `src/scenes/MenuScene.ts` | Lobby UI — Player 1 creates room and shares code; Player 2 enters code to join. Handles reconnection prompts |
| `src/levels/level1.ts`, `level2.ts` | Level definitions: platforms, bells (with puzzle group, dot count, note), gates (type, puzzle group), exit positions, puzzle sequences |

## Code Conventions

- **TypeScript** with strict mode, ES2020 target
- **Vite** bundler with path alias `@/*` → `src/*`
- **OOP pattern**: Scenes extend `Phaser.Scene`; managers are classes (`NetworkManager`, `AudioManager`)
- **Enums** for domain constants (`PentatonicNote`, `PlayerRole`, `MoonGateType`, `NetworkMessageType`)
- **Interfaces** for all data structures; use `import type` for type-only imports
- **Private members**: use `private` keyword for encapsulation in classes
- **ESLint rules**: no unused vars (except `_`-prefixed), `no-console: warn`
- **No external art assets** — all textures generated procedurally in `BootScene`

## Domain Concepts

### Pentatonic Scale (五声音阶)
Five notes — Gong (宫), Shang (商), Jue (角), Zhi (徵), Yu (羽) — mapped to frequencies C5 through A5. Bells produce these notes; puzzle gates require specific sequences to unlock.

### Player Roles
- **Player 1 / Striker**: Desktop keyboard (WASD/arrows). Hosts the P2P connection. Strikes bells to produce sounds.
- **Player 2 / Carrier**: Mobile touch controls (virtual joystick + buttons). Joins the connection. Picks up, carries, and places bells. Plays note sequences to solve puzzles.

### Moon Gates (月门)
Three gate types: `Player1Gate` (only P1 passes), `Player2Gate` (only P2 passes), `PuzzleGate` (opens when the correct note sequence is played). Puzzle sequences are defined per level in `puzzleSequences` as `Record<puzzleGroup, PentatonicNote[]>`.

### Bells
Defined by `BellDefinition`: id, position, puzzleGroup, dotCount (visual order hint), note. Player 1 strikes them (within 40px range); Player 2 picks up and carries them (shown as rucksack).

## Testing

Three test suites (~120 cases) using **Vitest** with Node environment:
- `tests/config.test.ts` — validates physics values and constant bounds
- `tests/levels.test.ts` — validates level data integrity (platforms, bells, gates, sequences, bounds)
- `tests/types.test.ts` — validates enum values and labels

## Deployment

Auto-deploys to **GitHub Pages** on push to `main` via `.github/workflows/deploy.yml`.
- Build: `npm ci && npm run build` (Node 20)
- Output: `dist/` served at base path `/resonance_game/`
