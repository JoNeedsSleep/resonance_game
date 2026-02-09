import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, IS_PORTRAIT } from '../config';
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
  private roomCodeOverlay: HTMLDivElement | null = null;

  constructor() {
    super({ key: 'MenuScene' });
  }

  create() {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    // Mountain silhouette background — render at low res for pixel art edges
    const bgScale = 4;
    const bw = Math.ceil(GAME_WIDTH / bgScale);
    const bh = Math.ceil(GAME_HEIGHT / bgScale);
    const bg = this.make.graphics({ x: 0, y: 0 }, false);
    bg.fillStyle(0x1a1a2e);
    bg.fillRect(0, 0, bw, bh);
    bg.fillStyle(0x2d3436);
    bg.fillTriangle(0, bh, bw * 0.21, bh * 0.28, bw * 0.42, bh);
    bg.fillStyle(0x3d4446);
    bg.fillTriangle(bw * 0.31, bh, bw * 0.57, bh * 0.19, bw * 0.83, bh);
    bg.fillStyle(0x4d5456);
    bg.fillTriangle(bw * 0.63, bh, bw * 0.83, bh * 0.33, bw, bh);
    bg.generateTexture('menu_bg', bw, bh);
    bg.destroy();
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'menu_bg')
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT);

    // Title
    this.add.text(cx, IS_PORTRAIT ? 80 : 60, 'Mountain Ascent', {
      fontSize: IS_PORTRAIT ? '32px' : '28px',
      color: '#ffffff',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Button layout — side-by-side on landscape, stacked on portrait
    const btnSize = 140;
    let p1X: number, p1Y: number, p2X: number, p2Y: number;

    if (IS_PORTRAIT) {
      p1X = cx;
      p1Y = cy - 110;
      p2X = cx;
      p2Y = cy + 90;
    } else {
      p1X = cx - 120;
      p1Y = cy - 20;
      p2X = cx + 120;
      p2Y = cy - 20;
    }

    // Player 1 button (blue)
    this.p1Btn = this.add.rectangle(p1X, p1Y, btnSize, btnSize, 0x8ecae6, 0.8)
      .setInteractive({ useHandCursor: true });
    this.add.image(p1X, p1Y - 20, 'player1').setScale(4);
    // Mallet icon
    const malletIcon = this.add.graphics();
    malletIcon.fillStyle(0x1a1a2e);
    malletIcon.fillRect(p1X - 10, p1Y + 20, 20, 4);
    malletIcon.fillCircle(p1X + 10, p1Y + 22, 6);
    this.add.text(p1X, p1Y + 50, 'HOST', {
      fontSize: '14px',
      color: '#1a1a2e',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Player 2 button (orange)
    this.p2Btn = this.add.rectangle(p2X, p2Y, btnSize, btnSize, 0xe07a5f, 0.8)
      .setInteractive({ useHandCursor: true });
    this.add.image(p2X, p2Y - 20, 'player2').setScale(4);
    // Note icons (music indicator)
    this.add.text(p2X, p2Y + 10, '♪♫', {
      fontSize: '20px',
      color: '#1a1a2e',
    }).setOrigin(0.5);
    this.add.text(p2X, p2Y + 50, 'JOIN', {
      fontSize: '14px',
      color: '#1a1a2e',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Info text area — below buttons
    const infoY = IS_PORTRAIT ? cy + 210 : cy + 120;

    // Room code display
    this.roomCodeText = this.add.text(cx, infoY, '', {
      fontSize: '28px',
      color: '#ffd700',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.statusText = this.add.text(cx, infoY + 40, 'Choose your role', {
      fontSize: '14px',
      color: '#aaaaaa',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Check for saved session (page was reloaded while connected)
    const saved = NetworkManager.getSavedSession();
    if (saved) {
      this.showReconnectPrompt(saved);
    }

    // Role selection handlers
    this.p1Btn.on('pointerdown', () => this.selectRole(PlayerRole.Player1));
    this.p2Btn.on('pointerdown', () => this.selectRole(PlayerRole.Player2));
  }

  private showReconnectPrompt(session: { role: PlayerRole; roomCode: string }) {
    const cx = GAME_WIDTH / 2;
    const infoY = IS_PORTRAIT ? GAME_HEIGHT / 2 + 210 : GAME_HEIGHT / 2 + 120;

    this.statusText?.setText(
      `Previous session (${session.role === PlayerRole.Player1 ? 'Host' : 'Guest'})`
    );
    this.roomCodeText?.setText(session.roomCode);

    const reconnectBtn = this.add.text(cx, infoY + 75, '[ RECONNECT ]', {
      fontSize: '14px',
      color: '#4ecca3',
      fontFamily: 'monospace',
      backgroundColor: '#2d3436',
      padding: { x: 12, y: 6 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    reconnectBtn.on('pointerdown', () => {
      reconnectBtn.destroy();
      this.selectRole(session.role);
    });
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
      this.showRoomCodeOverlay(id);
    });

    this.networkManager.onConnected(() => {
      this.statusText?.setText('Connected!');
      this.hideRoomCodeOverlay();
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

  private showRoomCodeOverlay(code: string) {
    this.hideRoomCodeOverlay();

    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
      position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
      display: flex; align-items: center; gap: 8px; z-index: 1000;
    `;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = code;
    input.readOnly = true;
    input.style.cssText = `
      font-size: 20px; font-family: monospace; text-align: center;
      padding: 8px 16px; width: 260px; max-width: 50vw;
      background: #2d3436; color: #ffd700; border: 2px solid #ffd700;
      border-radius: 8px; outline: none;
    `;

    const btn = document.createElement('button');
    btn.textContent = 'COPY';
    btn.style.cssText = `
      font-size: 16px; font-family: monospace; padding: 8px 16px;
      background: #ffd700; color: #1a1a2e; border: none;
      border-radius: 8px; cursor: pointer; font-weight: bold;
    `;

    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(code).then(() => {
        btn.textContent = 'COPIED!';
        setTimeout(() => { btn.textContent = 'COPY'; }, 1500);
      }).catch(() => {
        input.select();
        document.execCommand('copy');
        btn.textContent = 'COPIED!';
        setTimeout(() => { btn.textContent = 'COPY'; }, 1500);
      });
    });

    // Also select all on tap so mobile users can long-press copy
    input.addEventListener('focus', () => input.select());

    wrapper.appendChild(input);
    wrapper.appendChild(btn);
    document.body.appendChild(wrapper);
    this.roomCodeOverlay = wrapper;
  }

  private hideRoomCodeOverlay() {
    this.roomCodeOverlay?.remove();
    this.roomCodeOverlay = null;
  }
}
