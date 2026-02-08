import { LevelData, PentatonicNote, MoonGateType } from '../types';

/**
 * Level 2 — Stone Stairway
 *
 * Introduces vertical platforming and typed moon gates.
 * One puzzle group with 2 bells (2-note sequence).
 * Players must take different paths to reach the same area.
 */
export const level2: LevelData = {
  id: 2,
  name: 'Stone Stairway',
  width: 960,
  height: 540,
  spawnPoints: {
    player1: { x: 80, y: 440 },
    player2: { x: 160, y: 440 },
  },
  platforms: [
    // Ground level
    { x: 200, y: 500, width: 400, height: 40 },
    // Stone steps going up
    { x: 350, y: 440, width: 120, height: 16 },
    { x: 450, y: 380, width: 120, height: 16 },
    { x: 550, y: 320, width: 120, height: 16 },
    // Upper platform (bell area)
    { x: 700, y: 280, width: 200, height: 16 },
    // Right side ground (after gate)
    { x: 850, y: 500, width: 200, height: 40 },
    // Separate path for Player 2 (lower route)
    { x: 600, y: 460, width: 160, height: 16 },
    { x: 780, y: 420, width: 120, height: 16 },
  ],
  bells: [
    {
      id: 'l2-bell-1',
      position: { x: 660, y: 250 },
      puzzleGroup: 'blue',
      dotCount: 1,
      note: PentatonicNote.Zhi,
    },
    {
      id: 'l2-bell-2',
      position: { x: 740, y: 250 },
      puzzleGroup: 'blue',
      dotCount: 2,
      note: PentatonicNote.Shang,
    },
  ],
  moonGates: [
    // Blue gate — only Player 1 passes (upper route to bells)
    {
      id: 'l2-gate-blue',
      position: { x: 500, y: 290 },
      width: 48,
      height: 64,
      type: MoonGateType.Player1,
    },
    // Red gate — only Player 2 passes (lower route)
    {
      id: 'l2-gate-red',
      position: { x: 700, y: 390 },
      width: 48,
      height: 64,
      type: MoonGateType.Player2,
    },
    // Puzzle gate — opens when blue sequence completed
    {
      id: 'l2-gate-puzzle',
      position: { x: 820, y: 440 },
      width: 64,
      height: 80,
      type: MoonGateType.Puzzle,
      puzzleGroup: 'blue',
    },
  ],
  pressurePlates: [],
  puzzleSequences: {
    blue: [PentatonicNote.Zhi, PentatonicNote.Shang],
  },
  exitPosition: { x: 920, y: 440 },
  background: {
    layers: ['bg_stone_stairway'],
  },
};
