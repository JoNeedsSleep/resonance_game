import { describe, it, expect } from 'vitest';
import { levels } from '../src/levels';
import { PentatonicNote } from '../src/types';

describe('Level data', () => {
  it('has at least one level', () => {
    expect(levels.length).toBeGreaterThanOrEqual(1);
  });

  levels.forEach((level, index) => {
    describe(`Level ${index + 1}: ${level.name}`, () => {
      it('has valid dimensions', () => {
        expect(level.width).toBeGreaterThan(0);
        expect(level.height).toBeGreaterThan(0);
      });

      it('has spawn points for both players', () => {
        expect(level.spawnPoints.player1).toBeDefined();
        expect(level.spawnPoints.player2).toBeDefined();
        expect(level.spawnPoints.player1.x).toBeGreaterThanOrEqual(0);
        expect(level.spawnPoints.player1.y).toBeGreaterThanOrEqual(0);
        expect(level.spawnPoints.player2.x).toBeGreaterThanOrEqual(0);
        expect(level.spawnPoints.player2.y).toBeGreaterThanOrEqual(0);
      });

      it('has at least one platform', () => {
        expect(level.platforms.length).toBeGreaterThanOrEqual(1);
      });

      it('has valid bell definitions', () => {
        for (const bell of level.bells) {
          expect(bell.id).toBeTruthy();
          expect(bell.puzzleGroup).toBeTruthy();
          expect(bell.dotCount).toBeGreaterThanOrEqual(1);
          expect(Object.values(PentatonicNote)).toContain(bell.note);
        }
      });

      it('has puzzle sequences matching bell puzzle groups', () => {
        const bellGroups = new Set(level.bells.map((b) => b.puzzleGroup));
        for (const group of bellGroups) {
          expect(level.puzzleSequences[group]).toBeDefined();
          expect(level.puzzleSequences[group].length).toBeGreaterThan(0);
        }
      });

      it('has an exit position within level bounds', () => {
        expect(level.exitPosition.x).toBeLessThanOrEqual(level.width);
        expect(level.exitPosition.y).toBeLessThanOrEqual(level.height);
      });
    });
  });
});
