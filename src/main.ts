import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, GRAVITY } from './config';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { EndScene } from './scenes/EndScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  pixelArt: true,
  roundPixels: true,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: GRAVITY },
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: {
    activePointers: 3, // Support multi-touch for joystick + buttons
  },
  backgroundColor: '#1a1a2e',
  scene: [BootScene, MenuScene, GameScene, EndScene],
};

new Phaser.Game(config);
