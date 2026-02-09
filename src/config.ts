/**
 * Auto-detect viewport and set game dimensions to match the screen aspect ratio.
 * The shorter side is always 540px (logical), the longer side scales proportionally.
 */
const BASE_SIZE = 540;
const vw = window.innerWidth || 960;
const vh = window.innerHeight || 540;
const aspect = vw / vh;

export const IS_PORTRAIT = vh > vw;
export const GAME_WIDTH = IS_PORTRAIT ? BASE_SIZE : Math.round(BASE_SIZE * aspect);
export const GAME_HEIGHT = IS_PORTRAIT ? Math.round(BASE_SIZE / aspect) : BASE_SIZE;

/** Pixel art scale factor */
export const PIXEL_SCALE = 3;

/** Physics constants */
export const GRAVITY = 800;
export const PLAYER_SPEED = 160;
export const PLAYER_JUMP_VELOCITY = -350;

/** Player colors */
export const PLAYER1_COLOR = 0x8ecae6; // Pastel blue
export const PLAYER2_COLOR = 0xe07a5f; // Warm orange-pink-red

/** Bell interaction range (pixels) */
export const BELL_INTERACT_RANGE = 40;

/** Network sync rate (ms between position updates) */
export const NETWORK_SYNC_RATE = 50;
