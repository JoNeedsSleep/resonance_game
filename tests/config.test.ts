import { describe, it, expect } from 'vitest';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  GRAVITY,
  PLAYER_SPEED,
  PLAYER_JUMP_VELOCITY,
  BELL_INTERACT_RANGE,
  NETWORK_SYNC_RATE,
  PIXEL_SCALE,
} from '../src/config';

describe('Game config constants', () => {
  it('has 16:9 aspect ratio dimensions', () => {
    expect(GAME_WIDTH / GAME_HEIGHT).toBeCloseTo(16 / 9, 1);
  });

  it('has reasonable physics values', () => {
    expect(GRAVITY).toBeGreaterThan(0);
    expect(PLAYER_SPEED).toBeGreaterThan(0);
    expect(PLAYER_JUMP_VELOCITY).toBeLessThan(0); // Negative = upward
  });

  it('has a positive pixel scale', () => {
    expect(PIXEL_SCALE).toBeGreaterThan(0);
  });

  it('has sensible interaction range', () => {
    expect(BELL_INTERACT_RANGE).toBeGreaterThan(0);
    expect(BELL_INTERACT_RANGE).toBeLessThan(GAME_WIDTH);
  });

  it('has a reasonable network sync rate', () => {
    expect(NETWORK_SYNC_RATE).toBeGreaterThanOrEqual(16); // At least ~60fps
    expect(NETWORK_SYNC_RATE).toBeLessThanOrEqual(200);
  });
});
