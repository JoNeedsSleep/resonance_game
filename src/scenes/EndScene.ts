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
    const w = GAME_WIDTH;
    const h = GAME_HEIGHT;

    // Sky gradient
    const bg = this.add.graphics();
    bg.fillGradientStyle(0xffd89b, 0xffd89b, 0x19547b, 0x19547b, 1);
    bg.fillRect(0, 0, w, h);

    // Cloud layer below
    for (let i = 0; i < 8; i++) {
      const cloudX = Phaser.Math.Between(0, w);
      const cloudY = Phaser.Math.Between(h - 120, h - 40);
      const cloud = this.add.graphics();
      cloud.fillStyle(0xffffff, 0.6);
      cloud.fillEllipse(cloudX, cloudY, Phaser.Math.Between(80, 160), Phaser.Math.Between(20, 40));
    }

    // Summit platform
    const ground = this.add.graphics();
    ground.fillStyle(0x6b7b8d);
    ground.fillRect(w / 2 - 100, h - 160, 200, 20);

    // Both players sitting on the summit
    const p1 = this.add.image(w / 2 - 20, h - 175, 'player1');
    p1.setScale(PIXEL_SCALE);

    const p2 = this.add.image(w / 2 + 20, h - 175, 'player2');
    p2.setScale(PIXEL_SCALE);

    // Distant mountain silhouettes — proportional to viewport width
    const mountains = this.add.graphics();
    mountains.fillStyle(0x2d3436, 0.5);
    mountains.fillTriangle(
      -w * 0.05, h - 80,
      w * 0.16, h - 250,
      w * 0.36, h - 80,
    );
    mountains.fillTriangle(
      w * 0.42, h - 80,
      w * 0.68, h - 300,
      w * 0.94, h - 80,
    );
    mountains.fillTriangle(
      w * 0.78, h - 80,
      w * 0.94, h - 220,
      w + 50, h - 80,
    );
  }
}
