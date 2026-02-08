import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';
import { PlayerRole } from '../types';

/**
 * MenuScene — Room code entry and role selection.
 * This is the only screen that uses text (room codes).
 * Uses simple shapes/icons for role selection to stay mostly wordless.
 */
export class MenuScene extends Phaser.Scene {
  private selectedRole: PlayerRole | null = null;
  private roomCodeText: Phaser.GameObjects.Text | null = null;
  private statusText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super({ key: 'MenuScene' });
  }

  create() {
    const centerX = GAME_WIDTH / 2;
    const centerY = GAME_HEIGHT / 2;

    // Mountain silhouette background
    const bg = this.add.graphics();
    bg.fillStyle(0x2d3436);
    bg.fillTriangle(0, GAME_HEIGHT, 200, 150, 400, GAME_HEIGHT);
    bg.fillStyle(0x3d4446);
    bg.fillTriangle(300, GAME_HEIGHT, 550, 100, 800, GAME_HEIGHT);
    bg.fillStyle(0x4d5456);
    bg.fillTriangle(600, GAME_HEIGHT, 800, 180, GAME_WIDTH, GAME_HEIGHT);

    // Player 1 button (blue) — left side
    const p1Btn = this.add.rectangle(centerX - 120, centerY - 20, 140, 140, 0x8ecae6, 0.8)
      .setInteractive({ useHandCursor: true });
    this.add.image(centerX - 120, centerY - 40, 'player1').setScale(4);
    // Mallet icon (strike indicator)
    const malletIcon = this.add.graphics();
    malletIcon.fillStyle(0x1a1a2e);
    malletIcon.fillRect(centerX - 130, centerY + 20, 20, 4);
    malletIcon.fillCircle(centerX - 110, centerY + 22, 6);

    // Player 2 button (red) — right side
    const p2Btn = this.add.rectangle(centerX + 120, centerY - 20, 140, 140, 0xe07a5f, 0.8)
      .setInteractive({ useHandCursor: true });
    this.add.image(centerX + 120, centerY - 40, 'player2').setScale(4);
    // Note icons (music indicator)
    this.add.text(centerX + 95, centerY + 10, '♪♫', {
      fontSize: '20px',
      color: '#1a1a2e',
    });

    // Room code display
    this.roomCodeText = this.add.text(centerX, centerY + 120, '', {
      fontSize: '24px',
      color: '#ffffff',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.statusText = this.add.text(centerX, centerY + 160, '', {
      fontSize: '14px',
      color: '#aaaaaa',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Role selection handlers
    p1Btn.on('pointerdown', () => this.selectRole(PlayerRole.Player1));
    p2Btn.on('pointerdown', () => this.selectRole(PlayerRole.Player2));
  }

  private selectRole(role: PlayerRole) {
    this.selectedRole = role;

    if (role === PlayerRole.Player1) {
      // Player 1 hosts — generate room code and wait for connection
      this.statusText?.setText('Waiting for Player 2...');
      this.scene.start('GameScene', { role, roomCode: null });
    } else {
      // Player 2 joins — prompt for room code
      this.promptRoomCode();
    }
  }

  private promptRoomCode() {
    // Use browser prompt for room code entry (simple approach for v1)
    const code = window.prompt('Enter room code:');
    if (code && code.trim()) {
      this.scene.start('GameScene', { role: PlayerRole.Player2, roomCode: code.trim() });
    } else {
      this.statusText?.setText('Connection cancelled');
    }
  }
}
