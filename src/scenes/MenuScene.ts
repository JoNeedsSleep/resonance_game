import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';
import { PlayerRole } from '../types';
import { NetworkManager } from '../network/NetworkManager';

/**
 * MenuScene — Room code entry and role selection.
 * Handles the full connection flow before transitioning to GameScene.
 */
export class MenuScene extends Phaser.Scene {
  private roomCodeText: Phaser.GameObjects.Text | null = null;
  private statusText: Phaser.GameObjects.Text | null = null;
  private networkManager: NetworkManager | null = null;
  private p1Btn: Phaser.GameObjects.Rectangle | null = null;
  private p2Btn: Phaser.GameObjects.Rectangle | null = null;

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

    // Title
    this.add.text(centerX, 60, 'Mountain Ascent', {
      fontSize: '28px',
      color: '#ffffff',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Player 1 button (blue) — left side
    this.p1Btn = this.add.rectangle(centerX - 120, centerY - 20, 140, 140, 0x8ecae6, 0.8)
      .setInteractive({ useHandCursor: true });
    this.add.image(centerX - 120, centerY - 40, 'player1').setScale(4);
    // Mallet icon (strike indicator)
    const malletIcon = this.add.graphics();
    malletIcon.fillStyle(0x1a1a2e);
    malletIcon.fillRect(centerX - 130, centerY + 20, 20, 4);
    malletIcon.fillCircle(centerX - 110, centerY + 22, 6);
    this.add.text(centerX - 120, centerY + 50, 'HOST', {
      fontSize: '14px',
      color: '#1a1a2e',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Player 2 button (orange) — right side
    this.p2Btn = this.add.rectangle(centerX + 120, centerY - 20, 140, 140, 0xe07a5f, 0.8)
      .setInteractive({ useHandCursor: true });
    this.add.image(centerX + 120, centerY - 40, 'player2').setScale(4);
    // Note icons (music indicator)
    this.add.text(centerX + 95, centerY + 10, '♪♫', {
      fontSize: '20px',
      color: '#1a1a2e',
    });
    this.add.text(centerX + 120, centerY + 50, 'JOIN', {
      fontSize: '14px',
      color: '#1a1a2e',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Room code display
    this.roomCodeText = this.add.text(centerX, centerY + 120, '', {
      fontSize: '28px',
      color: '#ffd700',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.statusText = this.add.text(centerX, centerY + 160, 'Choose your role', {
      fontSize: '14px',
      color: '#aaaaaa',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Role selection handlers
    this.p1Btn.on('pointerdown', () => this.selectRole(PlayerRole.Player1));
    this.p2Btn.on('pointerdown', () => this.selectRole(PlayerRole.Player2));
  }

  private selectRole(role: PlayerRole) {
    // Disable buttons after selection
    this.p1Btn?.disableInteractive();
    this.p2Btn?.disableInteractive();
    this.p1Btn?.setAlpha(0.4);
    this.p2Btn?.setAlpha(0.4);

    if (role === PlayerRole.Player1) {
      this.hostGame();
    } else {
      this.joinGame();
    }
  }

  private hostGame() {
    this.statusText?.setText('Creating room...');
    this.networkManager = new NetworkManager(PlayerRole.Player1, null);

    this.networkManager.onOpen((id) => {
      // Show room code so Player 1 can share it
      this.roomCodeText?.setText(id);
      this.statusText?.setText('Share this code with Player 2');
    });

    this.networkManager.onConnected(() => {
      this.statusText?.setText('Connected!');
      // Brief delay so user sees "Connected!" before scene switch
      this.time.delayedCall(500, () => {
        this.scene.start('GameScene', {
          role: PlayerRole.Player1,
          networkManager: this.networkManager,
        });
      });
    });

    this.networkManager.onError(() => {
      this.statusText?.setText('Connection error — refresh to retry');
      this.p1Btn?.setInteractive();
      this.p2Btn?.setInteractive();
      this.p1Btn?.setAlpha(1);
      this.p2Btn?.setAlpha(1);
    });

    this.networkManager.connect();
  }

  private joinGame() {
    this.statusText?.setText('Enter room code');

    // Create an HTML input for room code (works on mobile + desktop)
    const inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.placeholder = 'Room code';
    inputEl.autocomplete = 'off';
    inputEl.autocapitalize = 'off';
    inputEl.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      font-size: 24px; font-family: monospace; text-align: center;
      padding: 12px 20px; width: 300px; max-width: 80vw;
      background: #2d3436; color: #ffd700; border: 2px solid #ffd700;
      border-radius: 8px; outline: none; z-index: 1000;
    `;

    const submitBtn = document.createElement('button');
    submitBtn.textContent = 'Connect';
    submitBtn.style.cssText = `
      position: fixed; top: calc(50% + 50px); left: 50%; transform: translate(-50%, 0);
      font-size: 18px; font-family: monospace; padding: 10px 30px;
      background: #e07a5f; color: #1a1a2e; border: none;
      border-radius: 8px; cursor: pointer; z-index: 1000;
    `;

    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.5); z-index: 999;
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(inputEl);
    document.body.appendChild(submitBtn);
    inputEl.focus();

    const cleanup = () => {
      inputEl.remove();
      submitBtn.remove();
      overlay.remove();
    };

    const doConnect = () => {
      const code = inputEl.value.trim();
      if (!code) return;
      cleanup();

      this.statusText?.setText('Connecting...');
      this.roomCodeText?.setText(code);

      this.networkManager = new NetworkManager(PlayerRole.Player2, code);

      this.networkManager.onConnected(() => {
        this.statusText?.setText('Connected!');
        this.time.delayedCall(500, () => {
          this.scene.start('GameScene', {
            role: PlayerRole.Player2,
            networkManager: this.networkManager,
          });
        });
      });

      this.networkManager.onError(() => {
        this.statusText?.setText('Connection failed — refresh to retry');
        this.roomCodeText?.setText('');
        this.p1Btn?.setInteractive();
        this.p2Btn?.setInteractive();
        this.p1Btn?.setAlpha(1);
        this.p2Btn?.setAlpha(1);
      });

      this.networkManager.connect();
    };

    submitBtn.addEventListener('click', doConnect);
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doConnect();
    });
    overlay.addEventListener('click', () => {
      cleanup();
      this.statusText?.setText('Connection cancelled');
      this.p1Btn?.setInteractive();
      this.p2Btn?.setInteractive();
      this.p1Btn?.setAlpha(1);
      this.p2Btn?.setAlpha(1);
    });
  }
}
