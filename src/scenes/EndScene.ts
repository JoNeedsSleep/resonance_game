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

    // Render entire background at low res for pixel art edges
    const bgScale = 4;
    const bw = Math.ceil(w / bgScale);
    const bh = Math.ceil(h / bgScale);
    const bg = this.make.graphics({ x: 0, y: 0 }, false);

    // Sky gradient
    bg.fillGradientStyle(0xffd89b, 0xffd89b, 0x19547b, 0x19547b, 1);
    bg.fillRect(0, 0, bw, bh);

    // Cloud layer
    for (let i = 0; i < 8; i++) {
      const cloudX = Phaser.Math.Between(0, bw);
      const cloudY = Phaser.Math.Between(bh - 30, bh - 10);
      bg.fillStyle(0xffffff, 0.6);
      bg.fillEllipse(cloudX, cloudY, Phaser.Math.Between(20, 40), Phaser.Math.Between(5, 10));
    }

    // Distant mountain silhouettes
    bg.fillStyle(0x2d3436, 0.5);
    bg.fillTriangle(
      -bw * 0.05, bh - 20,
      bw * 0.16, bh - 62,
      bw * 0.36, bh - 20,
    );
    bg.fillTriangle(
      bw * 0.42, bh - 20,
      bw * 0.68, bh - 75,
      bw * 0.94, bh - 20,
    );
    bg.fillTriangle(
      bw * 0.78, bh - 20,
      bw * 0.94, bh - 55,
      bw + 12, bh - 20,
    );

    // Summit platform
    bg.fillStyle(0x6b7b8d);
    bg.fillRect(bw / 2 - 25, bh - 40, 50, 5);

    bg.generateTexture('end_bg', bw, bh);
    bg.destroy();
    this.add.image(w / 2, h / 2, 'end_bg').setDisplaySize(w, h);

    // Both players sitting on the summit (keep as sprites for crisp pixel art)
    const p1 = this.add.image(w / 2 - 20, h - 175, 'player1');
    p1.setScale(PIXEL_SCALE);

    const p2 = this.add.image(w / 2 + 20, h - 175, 'player2');
    p2.setScale(PIXEL_SCALE);
  }
}
