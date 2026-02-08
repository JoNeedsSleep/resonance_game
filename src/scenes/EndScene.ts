import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, PIXEL_SCALE } from '../config';

/**
 * EndScene — The summit.
 * Both characters sit side by side looking at the view.
 * No text. Just stillness.
 */
export class EndScene extends Phaser.Scene {
  constructor() {
    super({ key: 'EndScene' });
  }

  create() {
    // Sky gradient
    const bg = this.add.graphics();
    bg.fillGradientStyle(0xffd89b, 0xffd89b, 0x19547b, 0x19547b, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Cloud layer below
    for (let i = 0; i < 8; i++) {
      const cloudX = Phaser.Math.Between(0, GAME_WIDTH);
      const cloudY = Phaser.Math.Between(GAME_HEIGHT - 120, GAME_HEIGHT - 40);
      const cloud = this.add.graphics();
      cloud.fillStyle(0xffffff, 0.6);
      cloud.fillEllipse(cloudX, cloudY, Phaser.Math.Between(80, 160), Phaser.Math.Between(20, 40));
    }

    // Summit platform
    const ground = this.add.graphics();
    ground.fillStyle(0x6b7b8d);
    ground.fillRect(GAME_WIDTH / 2 - 100, GAME_HEIGHT - 160, 200, 20);

    // Both players sitting on the summit
    const p1 = this.add.image(GAME_WIDTH / 2 - 20, GAME_HEIGHT - 175, 'player1');
    p1.setScale(PIXEL_SCALE);

    const p2 = this.add.image(GAME_WIDTH / 2 + 20, GAME_HEIGHT - 175, 'player2');
    p2.setScale(PIXEL_SCALE);

    // Distant mountain silhouettes
    const mountains = this.add.graphics();
    mountains.fillStyle(0x2d3436, 0.5);
    mountains.fillTriangle(-50, GAME_HEIGHT - 80, 150, GAME_HEIGHT - 250, 350, GAME_HEIGHT - 80);
    mountains.fillTriangle(400, GAME_HEIGHT - 80, 650, GAME_HEIGHT - 300, 900, GAME_HEIGHT - 80);
    mountains.fillTriangle(750, GAME_HEIGHT - 80, 900, GAME_HEIGHT - 220, GAME_WIDTH + 50, GAME_HEIGHT - 80);
  }
}
