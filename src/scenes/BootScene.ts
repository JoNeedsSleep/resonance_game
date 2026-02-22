import Phaser from 'phaser';

/**
 * BootScene — Initial loading scene.
 * Loads minimal assets needed for the menu, then transitions.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    // Placeholder: generate basic textures programmatically until pixel art assets exist
    this.createPlaceholderTextures();
  }

  create() {
    this.scene.start('MenuScene');
  }

  private createPlaceholderTextures() {
    // Player 1 — pastel blue square with eyes
    const p1 = this.make.graphics({ x: 0, y: 0 }, false);
    p1.fillStyle(0x8ecae6);
    p1.fillRect(0, 0, 16, 16);
    p1.fillStyle(0x1a1a2e);
    p1.fillRect(4, 4, 3, 3);
    p1.fillRect(10, 4, 3, 3);
    p1.generateTexture('player1', 16, 16);
    p1.destroy();

    // Player 2 — warm orange-red square with eyes and rucksack bump
    const p2 = this.make.graphics({ x: 0, y: 0 }, false);
    p2.fillStyle(0xe07a5f);
    p2.fillRect(0, 0, 16, 16);
    p2.fillStyle(0x1a1a2e);
    p2.fillRect(4, 4, 3, 3);
    p2.fillRect(10, 4, 3, 3);
    p2.fillStyle(0xc9684a);
    p2.fillRect(13, 6, 3, 8); // rucksack
    p2.generateTexture('player2', 16, 16);
    p2.destroy();

    // Bell — bronze/gold silhouette
    const bell = this.make.graphics({ x: 0, y: 0 }, false);
    bell.fillStyle(0xc9a84c);
    bell.fillRect(2, 0, 12, 2);   // hanging bar
    bell.fillRect(4, 2, 8, 12);   // bell body
    bell.fillRect(2, 10, 12, 4);  // bell flare
    bell.generateTexture('bell', 16, 16);
    bell.destroy();

    // Platform tile — slate gray stone
    const platform = this.make.graphics({ x: 0, y: 0 }, false);
    platform.fillStyle(0x6b7b8d);
    platform.fillRect(0, 0, 16, 16);
    platform.fillStyle(0x5a6a7a);
    platform.fillRect(0, 0, 8, 8);
    platform.fillRect(8, 8, 8, 8);
    platform.generateTexture('platform', 16, 16);
    platform.destroy();

    // Moon gate — circular opening placeholder
    const gate = this.make.graphics({ x: 0, y: 0 }, false);
    gate.fillStyle(0xffffff, 0.3);
    gate.fillCircle(16, 16, 16);
    gate.generateTexture('moongate', 32, 32);
    gate.destroy();

    // Pressure plate
    const plate = this.make.graphics({ x: 0, y: 0 }, false);
    plate.fillStyle(0x8b7355);
    plate.fillRect(0, 12, 16, 4);
    plate.generateTexture('pressure_plate', 16, 16);
    plate.destroy();

    // Sparkle particle (8x8): bright white core with faded outer ring
    const sparkle = this.make.graphics({ x: 0, y: 0 }, false);
    sparkle.fillStyle(0xffffff, 0.3);
    sparkle.fillCircle(4, 4, 4);
    sparkle.fillStyle(0xffffff, 0.7);
    sparkle.fillCircle(4, 4, 2);
    sparkle.fillStyle(0xffffff, 1.0);
    sparkle.fillRect(3, 3, 2, 2);
    sparkle.generateTexture('sparkle', 8, 8);
    sparkle.destroy();

    // Altar for Player 1 (32x32): blue concentric circles
    const altarP1 = this.make.graphics({ x: 0, y: 0 }, false);
    altarP1.fillStyle(0x8ecae6, 0.15);
    altarP1.fillCircle(16, 16, 16);
    altarP1.fillStyle(0x8ecae6, 0.3);
    altarP1.fillCircle(16, 16, 11);
    altarP1.fillStyle(0x8ecae6, 0.5);
    altarP1.fillCircle(16, 16, 6);
    altarP1.generateTexture('altar_p1', 32, 32);
    altarP1.destroy();

    // Altar for Player 2 (32x32): orange-red concentric circles
    const altarP2 = this.make.graphics({ x: 0, y: 0 }, false);
    altarP2.fillStyle(0xe07a5f, 0.15);
    altarP2.fillCircle(16, 16, 16);
    altarP2.fillStyle(0xe07a5f, 0.3);
    altarP2.fillCircle(16, 16, 11);
    altarP2.fillStyle(0xe07a5f, 0.5);
    altarP2.fillCircle(16, 16, 6);
    altarP2.generateTexture('altar_p2', 32, 32);
    altarP2.destroy();
  }
}
