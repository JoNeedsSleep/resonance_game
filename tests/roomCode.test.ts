import { describe, it, expect } from 'vitest';
import { WORD_LIST, generateRoomCode } from '../src/utils/roomCode';

describe('WORD_LIST', () => {
  it('has at least 200 words', () => {
    expect(WORD_LIST.length).toBeGreaterThanOrEqual(200);
  });

  it('contains only lowercase alpha words (no digits, no special chars)', () => {
    for (const word of WORD_LIST) {
      expect(word).toMatch(/^[a-z]+$/);
    }
  });

  it('contains words between 2 and 7 characters long', () => {
    for (const word of WORD_LIST) {
      expect(word.length).toBeGreaterThanOrEqual(2);
      expect(word.length).toBeLessThanOrEqual(7);
    }
  });
});

describe('generateRoomCode', () => {
  it('returns a string with three words separated by hyphens', () => {
    const code = generateRoomCode();
    const parts = code.split('-');
    expect(parts).toHaveLength(3);
  });

  it('uses words from the word list', () => {
    const code = generateRoomCode();
    const parts = code.split('-');
    for (const word of parts) {
      expect(WORD_LIST).toContain(word);
    }
  });

  it('uses three distinct words', () => {
    const code = generateRoomCode();
    const parts = code.split('-');
    const unique = new Set(parts);
    expect(unique.size).toBe(3);
  });

  it('produces a valid PeerJS ID (alphanumeric and hyphens only)', () => {
    for (let i = 0; i < 20; i++) {
      const code = generateRoomCode();
      expect(code).toMatch(/^[a-z]+(-[a-z]+){2}$/);
    }
  });

  it('generates different codes on successive calls', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 20; i++) {
      codes.add(generateRoomCode());
    }
    // With 200+ words, 20 codes should almost certainly all be unique
    expect(codes.size).toBeGreaterThan(15);
  });
});
