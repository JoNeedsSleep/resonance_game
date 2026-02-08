import { describe, it, expect } from 'vitest';
import {
  PentatonicNote,
  NOTE_LABELS,
  PlayerRole,
  MoonGateType,
  NetworkMessageType,
} from '../src/types';

describe('PentatonicNote', () => {
  it('defines all five notes of the Chinese pentatonic scale', () => {
    expect(Object.values(PentatonicNote)).toHaveLength(5);
    expect(PentatonicNote.Gong).toBe('gong');
    expect(PentatonicNote.Shang).toBe('shang');
    expect(PentatonicNote.Jue).toBe('jue');
    expect(PentatonicNote.Zhi).toBe('zhi');
    expect(PentatonicNote.Yu).toBe('yu');
  });

  it('has Chinese character labels for every note', () => {
    for (const note of Object.values(PentatonicNote)) {
      expect(NOTE_LABELS[note]).toBeDefined();
      expect(typeof NOTE_LABELS[note]).toBe('string');
    }
    expect(NOTE_LABELS[PentatonicNote.Gong]).toBe('宫');
    expect(NOTE_LABELS[PentatonicNote.Shang]).toBe('商');
    expect(NOTE_LABELS[PentatonicNote.Jue]).toBe('角');
    expect(NOTE_LABELS[PentatonicNote.Zhi]).toBe('徵');
    expect(NOTE_LABELS[PentatonicNote.Yu]).toBe('羽');
  });
});

describe('PlayerRole', () => {
  it('defines two player roles', () => {
    expect(PlayerRole.Player1).toBe('player1');
    expect(PlayerRole.Player2).toBe('player2');
  });
});

describe('MoonGateType', () => {
  it('defines player-specific and puzzle gate types', () => {
    expect(MoonGateType.Player1).toBe('player1');
    expect(MoonGateType.Player2).toBe('player2');
    expect(MoonGateType.Puzzle).toBe('puzzle');
  });
});

describe('NetworkMessageType', () => {
  it('defines all expected message types', () => {
    const types = Object.values(NetworkMessageType);
    expect(types).toContain('player_move');
    expect(types).toContain('bell_strike');
    expect(types).toContain('bell_pickup');
    expect(types).toContain('bell_place');
    expect(types).toContain('note_play');
    expect(types).toContain('puzzle_solved');
    expect(types).toContain('level_complete');
  });
});
