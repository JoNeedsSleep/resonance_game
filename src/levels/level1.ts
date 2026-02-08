import { LevelData, PentatonicNote, MoonGateType } from '../types';

/**
 * Level 1 — Mountain Base (Tutorial)
 *
 * Simple flat terrain. One puzzle group with a single bell.
 * Player 1 strikes, hums the note, Player 2 plays it back.
 * Teaches the core mechanic with zero complexity.
 */
export const level1: LevelData = {
  id: 1,
  name: 'Mountain Base',
  width: 960,
  height: 540,
  spawnPoints: {
    player1: { x: 100, y: 400 },
    player2: { x: 180, y: 400 },
  },
  platforms: [
    // Ground
    { x: 480, y: 500, width: 960, height: 40 },
    // Small step up to bell area
    { x: 480, y: 440, width: 200, height: 16 },
  ],
  bells: [
    {
      id: 'l1-bell-1',
      position: { x: 480, y: 410 },
      puzzleGroup: 'red',
      dotCount: 1,
      note: PentatonicNote.Gong,
    },
  ],
  moonGates: [
    {
      id: 'l1-gate-1',
      position: { x: 800, y: 440 },
      width: 64,
      height: 80,
      type: MoonGateType.Puzzle,
      puzzleGroup: 'red',
    },
  ],
  pressurePlates: [],
  puzzleSequences: {
    red: [PentatonicNote.Gong],
  },
  exitPosition: { x: 900, y: 400 },
  background: {
    layers: ['bg_mountain_base'],
  },
};
