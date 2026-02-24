import Phaser from 'phaser';
import { PlayerRole, NetworkMessageType, PentatonicNote, NOTE_LABELS, AscensionPhase } from '../types';
import type { LevelData, PlayerMovePayload, BellStrikePayload, BellCarryPayload, AscensionAltarPayload } from '../types';
import { GAME_WIDTH, GAME_HEIGHT, PLAYER_SPEED, PLAYER_JUMP_VELOCITY, BELL_INTERACT_RANGE, NETWORK_SYNC_RATE, PIXEL_SCALE, PLAYER1_COLOR, PLAYER2_COLOR, DEAD_RECKONING_LERP, DEAD_RECKONING_SNAP_THRESHOLD, SYNC_POSITION_THRESHOLD, SYNC_VELOCITY_THRESHOLD } from '../config';
import { NetworkManager } from '../network/NetworkManager';
import { AudioManager } from '../audio/AudioManager';
import { levels } from '../levels';

interface GameSceneData {
  role: PlayerRole;
  networkManager: NetworkManager;
}

export class GameScene extends Phaser.Scene {
  private localPlayer!: Phaser.Physics.Arcade.Sprite;
  private remotePlayer!: Phaser.Physics.Arcade.Sprite;
  private role!: PlayerRole;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private arrows!: Record<string, Phaser.Input.Keyboard.Key>;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private bells!: Phaser.Physics.Arcade.StaticGroup;
  private moonGates!: Phaser.Physics.Arcade.StaticGroup;
  private pressurePlates!: Phaser.Physics.Arcade.StaticGroup;
  private networkManager!: NetworkManager;
  private audioManager!: AudioManager;
  private currentLevel = 0;
  private levelData!: LevelData;
  private lastSyncTime = 0;
  private carriedBellId: string | null = null;
  private carriedBellSprite: Phaser.Physics.Arcade.Sprite | null = null;
  private solvedPuzzles: Set<string> = new Set();
  private strikeKey!: Phaser.Input.Keyboard.Key;
  private pickupKey!: Phaser.Input.Keyboard.Key;
  private restartKey!: Phaser.Input.Keyboard.Key;
  private noteKeys: Record<string, Phaser.Input.Keyboard.Key> = {};
  private playedNoteSequence: PentatonicNote[] = [];
  private sequenceResetTimer: Phaser.Time.TimerEvent | null = null;

  // Touch controls
  private isTouchDevice = false;
  private joystickBase: Phaser.GameObjects.Arc | null = null;
  private joystickThumb: Phaser.GameObjects.Arc | null = null;
  private joystickActive = false;
  private joystickVector = { x: 0, y: 0 };
  private joystickPointerId: number | null = null;
  private joystickJumpFired = false;

  // Remote player interpolation + dead reckoning
  private remoteTargetX = 0;
  private remoteTargetY = 0;
  private remoteTargetInitialized = false;
  private remoteVelocityX = 0;
  private remoteVelocityY = 0;
  private lastRemoteUpdateTime = 0;

  // Dirty-check state for sync throttling
  private lastSentX = 0;
  private lastSentY = 0;
  private lastSentVX = 0;
  private lastSentVY = 0;

  private touchActionBtn: Phaser.GameObjects.Arc | null = null;
  private touchActionLabel: Phaser.GameObjects.Text | null = null;
  private noteButtons: Phaser.GameObjects.Container[] = [];

  // Carry indicators
  private carriedBellIndicator: Phaser.GameObjects.Sprite | null = null;
  private remoteCarryingBell = false;
  private remoteCarryIndicator: Phaser.GameObjects.Sprite | null = null;

  // Help button
  private helpBtn: Phaser.GameObjects.Arc | null = null;
  private helpLabel: Phaser.GameObjects.Text | null = null;
  private helpPopupObjects: Phaser.GameObjects.GameObject[] = [];
  private helpPopupVisible = false;

  // Reconnection overlay
  private reconnectOverlay: Phaser.GameObjects.GameObject[] = [];
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;

  // Ascension ceremony
  private ascensionPhase: AscensionPhase = AscensionPhase.Inactive;
  private localOnAltar = false;
  private remoteOnAltar = false;
  private controlsDisabled = false;
  private altarSprites: Phaser.GameObjects.Image[] = [];
  private sparkleEmitterLocal: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private sparkleEmitterRemote: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private lightBeamLocal: Phaser.GameObjects.Rectangle | null = null;
  private lightBeamRemote: Phaser.GameObjects.Rectangle | null = null;

  constructor() {
    super({ key: 'GameScene' });
  }

  init(data: GameSceneData) {
    this.role = data.role;
    this.networkManager = data.networkManager;
    this.audioManager = new AudioManager();
  }

  create() {
    this.platforms = this.physics.add.staticGroup();
    this.bells = this.physics.add.staticGroup();
    this.moonGates = this.physics.add.staticGroup();
    this.pressurePlates = this.physics.add.staticGroup();

    this.isTouchDevice = this.input.activePointer.wasTouch || 'ontouchstart' in window;

    this.setupInput();
    this.setupNetwork();
    this.loadLevel(0);

    if (this.isTouchDevice) {
      this.setupTouchControls();
    }

    this.createHelpButton();

    // Sync carry indicators after physics so they stick to players
    this.events.on('postupdate', () => {
      this.updateCarriedBell();
      this.updateRemoteCarryIndicator();
    });
  }

  private setupInput() {
    if (!this.input.keyboard) return;

    this.wasd = {
      W: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    this.arrows = {
      UP: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      LEFT: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      DOWN: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
      RIGHT: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
    };

    // Strike key (Player 1: 0 key)
    this.strikeKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ZERO);
    // Pickup key (Player 2: E key)
    this.pickupKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);

    // Restart key
    this.restartKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);

    // Note keys for Player 2: 6-0 map to 宫商角徵羽
    this.noteKeys = {
      gong: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SIX),
      shang: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SEVEN),
      jue: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.EIGHT),
      zhi: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.NINE),
      yu: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ZERO),
    };
  }

  private setupTouchControls() {
    // --- Virtual Joystick (left side) ---
    const joyX = 100;
    const joyY = GAME_HEIGHT - 100;
    const baseRadius = 50;
    const thumbRadius = 25;

    this.joystickBase = this.add.circle(joyX, joyY, baseRadius, 0xffffff, 0.15);
    this.joystickThumb = this.add.circle(joyX, joyY, thumbRadius, 0xffffff, 0.4);
    this.joystickBase.setScrollFactor(0).setDepth(1000);
    this.joystickThumb.setScrollFactor(0).setDepth(1001);

    // Joystick touch handling — use scene-level pointer events
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // Only grab pointers on left half of screen for joystick
      if (pointer.x < GAME_WIDTH / 2 && this.joystickPointerId === null) {
        this.joystickActive = true;
        this.joystickPointerId = pointer.id;
        this.updateJoystick(pointer);
      }
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.joystickActive && pointer.id === this.joystickPointerId) {
        this.updateJoystick(pointer);
      }
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.id === this.joystickPointerId) {
        this.joystickActive = false;
        this.joystickPointerId = null;
        this.joystickVector = { x: 0, y: 0 };
        this.joystickJumpFired = false;
        if (this.joystickThumb && this.joystickBase) {
          this.joystickThumb.setPosition(this.joystickBase.x, this.joystickBase.y);
        }
      }
    });

    // --- Action Button (right side) ---
    const actionX = GAME_WIDTH - 80;
    const actionY = GAME_HEIGHT - 80;

    if (this.role === PlayerRole.Player1) {
      // Strike button for Player 1
      this.touchActionBtn = this.add.circle(actionX, actionY, 35, 0xffd700, 0.3)
        .setScrollFactor(0).setDepth(1000).setInteractive();
      this.add.text(actionX, actionY, '🔔', {
        fontSize: '24px',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);

      this.touchActionBtn.on('pointerdown', () => { this.tryStrikeBell(); });
    } else {
      // Pickup/place button for Player 2
      this.touchActionBtn = this.add.circle(actionX, actionY, 35, 0xe07a5f, 0.3)
        .setScrollFactor(0).setDepth(1000).setInteractive();
      this.touchActionLabel = this.add.text(actionX, actionY, '⬆', {
        fontSize: '22px', color: '#e07a5f', fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);

      this.touchActionBtn.on('pointerdown', () => {
        if (this.carriedBellId) {
          this.placeBell();
        } else {
          this.tryPickupBell();
        }
      });

      // Note buttons for Player 2 (pentatonic scale)
      const notes = [
        { key: PentatonicNote.Gong, label: NOTE_LABELS[PentatonicNote.Gong] },
        { key: PentatonicNote.Shang, label: NOTE_LABELS[PentatonicNote.Shang] },
        { key: PentatonicNote.Jue, label: NOTE_LABELS[PentatonicNote.Jue] },
        { key: PentatonicNote.Zhi, label: NOTE_LABELS[PentatonicNote.Zhi] },
        { key: PentatonicNote.Yu, label: NOTE_LABELS[PentatonicNote.Yu] },
      ];

      const noteSpacing = 52;
      const noteBlockWidth = (notes.length - 1) * noteSpacing;
      const noteStartX = GAME_WIDTH - 40 - noteBlockWidth;
      const noteY = GAME_HEIGHT - 30;

      notes.forEach((note, i) => {
        const nx = noteStartX + i * noteSpacing;
        const circle = this.add.circle(nx, noteY, 22, 0xffd700, 0.25)
          .setScrollFactor(0).setDepth(1000).setInteractive();
        const label = this.add.text(nx, noteY, note.label, {
          fontSize: '16px', color: '#ffd700', fontFamily: 'serif',
        }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);

        const container = this.add.container(0, 0, [circle, label]);
        container.setDepth(1000);
        this.noteButtons.push(container);

        circle.on('pointerdown', () => { this.playNote(note.key); });
      });
    }
  }

  private updateJoystick(pointer: Phaser.Input.Pointer) {
    if (!this.joystickBase || !this.joystickThumb) return;

    const baseX = this.joystickBase.x;
    const baseY = this.joystickBase.y;
    const maxDist = 45;

    let dx = pointer.x - baseX;
    let dy = pointer.y - baseY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > maxDist) {
      dx = (dx / dist) * maxDist;
      dy = (dy / dist) * maxDist;
    }

    this.joystickThumb.setPosition(baseX + dx, baseY + dy);
    this.joystickVector = { x: dx / maxDist, y: dy / maxDist };
  }

  private createHelpButton() {
    this.helpBtn = this.add.circle(36, 36, 18, 0xffffff, 0.25)
      .setScrollFactor(0).setDepth(1000).setInteractive({ useHandCursor: true });
    this.helpLabel = this.add.text(36, 36, '?', {
      fontSize: '20px', color: '#ffffff', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);

    // Click / tap: toggle popup
    this.helpBtn.on('pointerdown', () => {
      if (this.helpPopupVisible) {
        this.hideHelpPopup();
      } else {
        this.showHelpPopup();
      }
    });
  }

  private showHelpPopup() {
    if (this.helpPopupVisible) return;
    this.helpPopupVisible = true;

    const w = GAME_WIDTH;
    const h = GAME_HEIGHT;

    // Backdrop
    const backdrop = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.6)
      .setScrollFactor(0).setDepth(2000).setInteractive();
    backdrop.on('pointerdown', () => this.hideHelpPopup());
    this.helpPopupObjects.push(backdrop);

    // Panel
    const panelW = Math.min(320, w - 40);
    const panelH = this.role === PlayerRole.Player2 ? 260 : 200;
    const roleColor = this.role === PlayerRole.Player1 ? 0x4a90d9 : 0xe07a5f;
    const panel = this.add.rectangle(w / 2, h / 2, panelW, panelH, 0x1a1a2e, 0.95)
      .setScrollFactor(0).setDepth(2001).setStrokeStyle(2, roleColor);
    this.helpPopupObjects.push(panel);

    // Title
    const title = this.add.text(w / 2, h / 2 - panelH / 2 + 24, 'Controls', {
      fontSize: '20px', color: '#ffd700', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2002);
    this.helpPopupObjects.push(title);

    // Role label
    const roleLabel = this.role === PlayerRole.Player1
      ? 'Player 1 (Striker)' : 'Player 2 (Carrier)';
    const roleColorStr = this.role === PlayerRole.Player1 ? '#4a90d9' : '#e07a5f';
    const roleTxt = this.add.text(w / 2, h / 2 - panelH / 2 + 50, roleLabel, {
      fontSize: '14px', color: roleColorStr, fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2002);
    this.helpPopupObjects.push(roleTxt);

    // Controls text
    const controls = this.getControlsText();
    const controlsTxt = this.add.text(w / 2, h / 2 - panelH / 2 + 75, controls, {
      fontSize: '13px', color: '#cccccc', fontFamily: 'monospace',
      lineSpacing: 6, align: 'left',
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(2002);
    this.helpPopupObjects.push(controlsTxt);

    // Close X button
    const closeBtn = this.add.text(w / 2 + panelW / 2 - 20, h / 2 - panelH / 2 + 10, 'X', {
      fontSize: '18px', color: '#ff6b6b', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2002).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => this.hideHelpPopup());
    this.helpPopupObjects.push(closeBtn);
  }

  private hideHelpPopup() {
    for (const obj of this.helpPopupObjects) {
      obj.destroy();
    }
    this.helpPopupObjects = [];
    this.helpPopupVisible = false;
  }

  private getControlsText(): string {
    if (this.role === PlayerRole.Player1) {
      if (this.isTouchDevice) {
        return [
          'Move:    Joystick (left)',
          'Jump:    Flick joystick up',
          'Strike:  Bell button (right)',
        ].join('\n');
      }
      return [
        'Move:    A/D or ←/→',
        'Jump:    W or ↑',
        'Strike:  0 (near a bell)',
        'Restart: R',
      ].join('\n');
    }

    // Player 2
    if (this.isTouchDevice) {
      return [
        'Move:    Joystick (left)',
        'Jump:    Flick joystick up',
        'Pick up: Action button (right)',
        'Place:   Action button (carrying)',
        'Notes:   Bottom row buttons',
      ].join('\n');
    }
    return [
      'Move:    A/D or ←/→',
      'Jump:    W or ↑',
      'Pick up: E (near a bell)',
      'Place:   E (while carrying)',
      'Notes:   6=宫 7=商 8=角 9=徵 0=羽',
      'Restart: R',
    ].join('\n');
  }

  private setupNetwork() {
    this.networkManager.onMessage((message) => {
      switch (message.type) {
        case NetworkMessageType.PlayerMove:
          this.handleRemotePlayerMove(message.payload as PlayerMovePayload);
          break;
        case NetworkMessageType.BellStrike:
          this.handleRemoteBellStrike(message.payload as BellStrikePayload);
          break;
        case NetworkMessageType.BellPickup:
          this.handleRemoteBellPickup(message.payload as BellCarryPayload);
          break;
        case NetworkMessageType.BellPlace:
          this.handleRemoteBellPlace(message.payload as BellCarryPayload);
          break;
        case NetworkMessageType.PuzzleSolved:
          this.handlePuzzleSolved(message.payload as { puzzleGroup: string });
          break;
        case NetworkMessageType.AscensionPlayerOnAltar:
          this.handleRemoteAltarState(message.payload as AscensionAltarPayload);
          break;
        case NetworkMessageType.LevelComplete:
          this.advanceLevel();
          break;
        case NetworkMessageType.LevelRestart:
          this.restartLevel();
          break;
      }
    });

    this.networkManager.onDisconnect(() => {
      this.showReconnectOverlay();
    });
  }

  private showReconnectOverlay() {
    this.clearReconnectOverlay();
    this.controlsDisabled = true;

    const w = GAME_WIDTH;
    const h = GAME_HEIGHT;

    // Semi-transparent backdrop
    const backdrop = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.6)
      .setScrollFactor(0).setDepth(3000);
    this.reconnectOverlay.push(backdrop);

    // Title
    const title = this.add.text(w / 2, h / 2 - 50, 'Connection Lost', {
      fontSize: '24px',
      color: '#ff6b6b',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(3001);
    this.reconnectOverlay.push(title);

    // Status text
    const statusText = this.add.text(w / 2, h / 2, 'Reconnecting...', {
      fontSize: '14px',
      color: '#aaaaaa',
      fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(3001);
    this.reconnectOverlay.push(statusText);

    // Return to Menu button
    const menuBtn = this.add.text(w / 2, h / 2 + 50, '[ Return to Menu ]', {
      fontSize: '14px',
      color: '#4ecca3',
      fontFamily: 'monospace',
      backgroundColor: '#2d3436',
      padding: { x: 12, y: 6 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(3001)
      .setInteractive({ useHandCursor: true });
    this.reconnectOverlay.push(menuBtn);

    menuBtn.on('pointerdown', () => {
      this.clearReconnectOverlay();
      this.scene.start('MenuScene');
    });

    // Auto-retry with exponential backoff: 1s, 2s, 4s, 8s
    const delays = [1000, 2000, 4000, 8000];
    let attempt = 0;

    // Re-register the connect callback for reconnection
    this.networkManager.onConnected(() => {
      // Reconnected successfully
      if (this.reconnectTimeoutId !== null) {
        clearTimeout(this.reconnectTimeoutId);
        this.reconnectTimeoutId = null;
      }
      this.clearReconnectOverlay();
      this.controlsDisabled = false;
    });

    const tryReconnect = () => {
      if (attempt >= delays.length) {
        statusText.setText('Could not reconnect');
        return;
      }
      statusText.setText(`Reconnecting... (${attempt + 1}/${delays.length})`);
      this.reconnectTimeoutId = setTimeout(() => {
        this.reconnectTimeoutId = null;
        if (this.networkManager.isConnected()) return;
        this.networkManager.attemptReconnect();
        attempt++;
        // Schedule next retry
        if (attempt < delays.length && !this.networkManager.isConnected()) {
          tryReconnect();
        } else if (attempt >= delays.length && !this.networkManager.isConnected()) {
          statusText.setText('Could not reconnect');
        }
      }, delays[attempt]);
    };

    tryReconnect();
  }

  private clearReconnectOverlay() {
    if (this.reconnectTimeoutId !== null) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    for (const obj of this.reconnectOverlay) {
      obj.destroy();
    }
    this.reconnectOverlay = [];
  }

  private loadLevel(index: number) {
    this.currentLevel = index;
    this.levelData = levels[index];
    this.solvedPuzzles.clear();
    this.playedNoteSequence = [];
    if (this.sequenceResetTimer) {
      this.sequenceResetTimer.destroy();
      this.sequenceResetTimer = null;
    }
    this.carriedBellId = null;
    this.carriedBellSprite = null;
    this.remoteTargetInitialized = false;
    this.remoteVelocityX = 0;
    this.remoteVelocityY = 0;
    this.lastRemoteUpdateTime = 0;
    this.lastSentX = 0;
    this.lastSentY = 0;
    this.lastSentVX = 0;
    this.lastSentVY = 0;
    this.remoteCarryingBell = false;
    this.cleanupAscensionEffects();
    this.ascensionPhase = AscensionPhase.Inactive;
    this.localOnAltar = false;
    this.remoteOnAltar = false;
    this.controlsDisabled = false;
    if (this.carriedBellIndicator) {
      this.carriedBellIndicator.destroy();
      this.carriedBellIndicator = null;
    }
    if (this.remoteCarryIndicator) {
      this.remoteCarryIndicator.destroy();
      this.remoteCarryIndicator = null;
    }

    // Clear existing objects
    this.platforms.clear(true, true);
    this.bells.clear(true, true);
    this.moonGates.clear(true, true);
    this.pressurePlates.clear(true, true);

    // Build platforms
    for (const plat of this.levelData.platforms) {
      const p = this.platforms.create(plat.x, plat.y, 'platform') as Phaser.Physics.Arcade.Sprite;
      p.setScale(plat.width / 16, plat.height / 16);
      p.refreshBody();
    }

    // Place bells
    for (const bellDef of this.levelData.bells) {
      const b = this.bells.create(bellDef.position.x, bellDef.position.y, 'bell') as Phaser.Physics.Arcade.Sprite;
      b.setScale(PIXEL_SCALE);
      b.setData('definition', bellDef);
      b.refreshBody();
    }

    // Place moon gates
    for (const gateDef of this.levelData.moonGates) {
      const g = this.moonGates.create(gateDef.position.x, gateDef.position.y, 'moongate') as Phaser.Physics.Arcade.Sprite;
      g.setData('definition', gateDef);
      g.refreshBody();
    }

    // Place pressure plates
    for (const plateDef of this.levelData.pressurePlates) {
      const pp = this.pressurePlates.create(plateDef.position.x, plateDef.position.y, 'pressure_plate') as Phaser.Physics.Arcade.Sprite;
      pp.setScale(PIXEL_SCALE);
      pp.setData('definition', plateDef);
      pp.refreshBody();
    }

    // Spawn players
    const localSpawn = this.role === PlayerRole.Player1
      ? this.levelData.spawnPoints.player1
      : this.levelData.spawnPoints.player2;
    const remoteSpawn = this.role === PlayerRole.Player1
      ? this.levelData.spawnPoints.player2
      : this.levelData.spawnPoints.player1;

    const localTexture = this.role === PlayerRole.Player1 ? 'player1' : 'player2';
    const remoteTexture = this.role === PlayerRole.Player1 ? 'player2' : 'player1';

    if (this.localPlayer) this.localPlayer.destroy();
    if (this.remotePlayer) this.remotePlayer.destroy();

    this.localPlayer = this.physics.add.sprite(localSpawn.x, localSpawn.y, localTexture);
    this.localPlayer.setScale(PIXEL_SCALE);
    this.localPlayer.setCollideWorldBounds(true);

    this.remotePlayer = this.physics.add.sprite(remoteSpawn.x, remoteSpawn.y, remoteTexture);
    this.remotePlayer.setScale(PIXEL_SCALE);
    (this.remotePlayer.body as Phaser.Physics.Arcade.Body).allowGravity = false; // Remote player position is synced

    // Collisions
    this.physics.add.collider(this.localPlayer, this.platforms);
    this.physics.add.collider(this.remotePlayer, this.platforms);

    // Set world bounds to level size
    this.physics.world.setBounds(0, 0, this.levelData.width, this.levelData.height);

    // Camera follow for scrolling levels (especially important on mobile)
    this.cameras.main.startFollow(this.localPlayer, true, 0.15, 0.35);
    this.cameras.main.setBounds(0, 0, this.levelData.width, this.levelData.height);
  }

  update(time: number) {
    this.handleMovement();
    this.handleActions();
    this.syncPosition(time);
    this.interpolateRemotePlayer();
    this.updateAscension();
  }

  private interpolateRemotePlayer() {
    if (!this.remotePlayer || !this.remoteTargetInitialized) return;
    if (this.ascensionPhase === AscensionPhase.FloatingUp || this.ascensionPhase === AscensionPhase.TransitionOut) return;

    // Dead reckoning: extrapolate from last known position using velocity
    const elapsed = (performance.now() - this.lastRemoteUpdateTime) / 1000;
    const predictedX = this.remoteTargetX + this.remoteVelocityX * elapsed;
    const predictedY = this.remoteTargetY + this.remoteVelocityY * elapsed;

    const dx = predictedX - this.remotePlayer.x;
    const dy = predictedY - this.remotePlayer.y;
    const error = Math.sqrt(dx * dx + dy * dy);

    if (error > DEAD_RECKONING_SNAP_THRESHOLD) {
      // Teleport / level load — snap immediately
      this.remotePlayer.setPosition(predictedX, predictedY);
    } else {
      const newX = Phaser.Math.Linear(this.remotePlayer.x, predictedX, DEAD_RECKONING_LERP);
      const newY = Phaser.Math.Linear(this.remotePlayer.y, predictedY, DEAD_RECKONING_LERP);
      this.remotePlayer.setPosition(newX, newY);
    }
  }

  private handleMovement() {
    if (!this.localPlayer?.body) return;
    if (this.controlsDisabled) return;

    const body = this.localPlayer.body as Phaser.Physics.Arcade.Body;

    // Touch controls (joystick)
    if (this.isTouchDevice && this.joystickActive) {
      body.setVelocityX(this.joystickVector.x * PLAYER_SPEED);
      // Jump via joystick pull-up
      if (this.joystickVector.y < -0.5 && body.blocked.down && body.velocity.y >= 0 && !this.joystickJumpFired) {
        body.setVelocityY(PLAYER_JUMP_VELOCITY);
        this.joystickJumpFired = true;
      }
      // Reset jump flag when joystick returns to neutral
      if (this.joystickVector.y >= -0.3) {
        this.joystickJumpFired = false;
      }
      return;
    }

    // Keyboard movement
    if (this.wasd?.A?.isDown || this.arrows?.LEFT?.isDown) {
      body.setVelocityX(-PLAYER_SPEED);
    } else if (this.wasd?.D?.isDown || this.arrows?.RIGHT?.isDown) {
      body.setVelocityX(PLAYER_SPEED);
    } else if (!this.joystickActive) {
      body.setVelocityX(0);
    }

    // Keyboard jump
    if ((this.wasd?.W?.isDown || this.arrows?.UP?.isDown) && body.blocked.down && body.velocity.y >= 0) {
      body.setVelocityY(PLAYER_JUMP_VELOCITY);
    }
  }

  private handleActions() {
    if (this.controlsDisabled) return;

    // Restart level
    if (this.restartKey && Phaser.Input.Keyboard.JustDown(this.restartKey)) {
      this.networkManager.send({
        type: NetworkMessageType.LevelRestart,
        payload: {},
        timestamp: Date.now(),
      });
      this.restartLevel();
      return;
    }

    // Player 1: Strike bell (keyboard)
    if (this.role === PlayerRole.Player1 && this.strikeKey && Phaser.Input.Keyboard.JustDown(this.strikeKey)) {
      this.tryStrikeBell();
    }

    // Player 2: Pick up / place bell (keyboard)
    if (this.role === PlayerRole.Player2 && this.pickupKey && Phaser.Input.Keyboard.JustDown(this.pickupKey)) {
      if (this.carriedBellId) {
        this.placeBell();
      } else {
        this.tryPickupBell();
      }
    }

    // Player 2: Play notes (keyboard)
    if (this.role === PlayerRole.Player2) {
      for (const [note, key] of Object.entries(this.noteKeys)) {
        if (Phaser.Input.Keyboard.JustDown(key)) {
          this.playNote(note);
        }
      }
    }
  }

  private tryStrikeBell() {
    const nearest = this.findNearestBell();
    if (!nearest) return;

    const def = nearest.getData('definition');
    // Play animation
    nearest.setTint(0xffd700);
    this.time.delayedCall(300, () => nearest.clearTint());

    // Play sound ONLY for Player 1
    this.audioManager.playBellNote(def.note);

    // Broadcast strike (visual only — no sound for Player 2)
    this.networkManager.send({
      type: NetworkMessageType.BellStrike,
      payload: { bellId: def.id, note: def.note } as BellStrikePayload,
      timestamp: Date.now(),
    });
  }

  private tryPickupBell() {
    const nearest = this.findNearestBell();
    if (!nearest) return;

    const def = nearest.getData('definition');
    this.carriedBellId = def.id;
    this.carriedBellSprite = nearest;
    nearest.setVisible(false);
    (nearest.body as Phaser.Physics.Arcade.StaticBody).enable = false;
    this.touchActionLabel?.setText('⬇');

    this.networkManager.send({
      type: NetworkMessageType.BellPickup,
      payload: { bellId: def.id, position: { x: nearest.x, y: nearest.y } } as BellCarryPayload,
      timestamp: Date.now(),
    });
  }

  private placeBell() {
    if (!this.carriedBellId || !this.carriedBellSprite) return;

    this.carriedBellSprite.setPosition(this.localPlayer.x, this.localPlayer.y);
    this.carriedBellSprite.setVisible(true);
    (this.carriedBellSprite.body as Phaser.Physics.Arcade.StaticBody).enable = true;
    this.carriedBellSprite.refreshBody();

    this.networkManager.send({
      type: NetworkMessageType.BellPlace,
      payload: {
        bellId: this.carriedBellId,
        position: { x: this.carriedBellSprite.x, y: this.carriedBellSprite.y },
      } as BellCarryPayload,
      timestamp: Date.now(),
    });

    this.carriedBellId = null;
    this.carriedBellSprite = null;
    this.touchActionLabel?.setText('⬆');
  }

  private playNote(note: string) {
    // Player 2 hears their own note
    this.audioManager.playBellNote(note);

    this.networkManager.send({
      type: NetworkMessageType.NotePlay,
      payload: { note, puzzleGroup: '' },
      timestamp: Date.now(),
    });

    this.checkNoteSequence(note as PentatonicNote);
  }

  private checkNoteSequence(note: PentatonicNote) {
    this.playedNoteSequence.push(note);

    // Reset inactivity timer — clear buffer if no notes played for 3 seconds
    if (this.sequenceResetTimer) {
      this.sequenceResetTimer.destroy();
    }
    this.sequenceResetTimer = this.time.delayedCall(3000, () => {
      this.playedNoteSequence = [];
    });

    // Check against all unsolved puzzle sequences
    for (const [puzzleGroup, expectedSeq] of Object.entries(this.levelData.puzzleSequences)) {
      if (this.solvedPuzzles.has(puzzleGroup)) continue;

      const seqLen = expectedSeq.length;
      if (this.playedNoteSequence.length < seqLen) continue;

      // Compare the tail of played notes against the expected sequence
      const tail = this.playedNoteSequence.slice(-seqLen);
      const matches = tail.every((n, i) => n === expectedSeq[i]);

      if (matches) {
        this.playedNoteSequence = [];
        if (this.sequenceResetTimer) {
          this.sequenceResetTimer.destroy();
          this.sequenceResetTimer = null;
        }

        this.handlePuzzleSolved({ puzzleGroup });

        this.networkManager.send({
          type: NetworkMessageType.PuzzleSolved,
          payload: { puzzleGroup },
          timestamp: Date.now(),
        });
        break;
      }
    }
  }

  private findNearestBell(): Phaser.Physics.Arcade.Sprite | null {
    let nearest: Phaser.Physics.Arcade.Sprite | null = null;
    let minDist = BELL_INTERACT_RANGE;

    this.bells.getChildren().forEach((child) => {
      const bell = child as Phaser.Physics.Arcade.Sprite;
      if (!bell.visible) return;
      const dist = Phaser.Math.Distance.Between(
        this.localPlayer.x, this.localPlayer.y,
        bell.x, bell.y
      );
      if (dist < minDist) {
        minDist = dist;
        nearest = bell;
      }
    });

    return nearest;
  }

  private handleRemotePlayerMove(payload: PlayerMovePayload) {
    if (!this.remotePlayer) return;
    if (this.ascensionPhase === AscensionPhase.FloatingUp || this.ascensionPhase === AscensionPhase.TransitionOut) return;

    this.remoteTargetX = payload.position.x;
    this.remoteTargetY = payload.position.y;
    this.remoteVelocityX = payload.velocityX;
    this.remoteVelocityY = payload.velocityY;
    this.lastRemoteUpdateTime = performance.now();

    // Snap directly on the first update to avoid lerping from 0,0
    if (!this.remoteTargetInitialized) {
      this.remotePlayer.setPosition(payload.position.x, payload.position.y);
      this.remoteTargetInitialized = true;
    }
  }

  private handleRemoteBellStrike(payload: BellStrikePayload) {
    // Show visual animation but NO sound for the receiving player
    this.bells.getChildren().forEach((child) => {
      const bell = child as Phaser.Physics.Arcade.Sprite;
      const def = bell.getData('definition');
      if (def?.id === payload.bellId) {
        bell.setTint(0xffd700);
        this.time.delayedCall(300, () => bell.clearTint());
      }
    });
  }

  private handleRemoteBellPickup(payload: BellCarryPayload) {
    this.bells.getChildren().forEach((child) => {
      const bell = child as Phaser.Physics.Arcade.Sprite;
      const def = bell.getData('definition');
      if (def?.id === payload.bellId) {
        bell.setVisible(false);
        (bell.body as Phaser.Physics.Arcade.StaticBody).enable = false;
      }
    });
    this.remoteCarryingBell = true;
  }

  private handleRemoteBellPlace(payload: BellCarryPayload) {
    this.bells.getChildren().forEach((child) => {
      const bell = child as Phaser.Physics.Arcade.Sprite;
      const def = bell.getData('definition');
      if (def?.id === payload.bellId) {
        bell.setPosition(payload.position.x, payload.position.y);
        bell.setVisible(true);
        (bell.body as Phaser.Physics.Arcade.StaticBody).enable = true;
        bell.refreshBody();
      }
    });
    this.remoteCarryingBell = false;
  }

  private handlePuzzleSolved(payload: { puzzleGroup: string }) {
    this.solvedPuzzles.add(payload.puzzleGroup);
    // Open corresponding moon gate
    this.moonGates.getChildren().forEach((child) => {
      const gate = child as Phaser.Physics.Arcade.Sprite;
      const def = gate.getData('definition');
      if (def?.puzzleGroup === payload.puzzleGroup) {
        gate.setAlpha(0.3);
        (gate.body as Phaser.Physics.Arcade.StaticBody).enable = false;
      }
    });

    // Check if all puzzle groups for this level are solved
    const allGroups = Object.keys(this.levelData.puzzleSequences);
    const allSolved = allGroups.every((g) => this.solvedPuzzles.has(g));
    if (allSolved && this.ascensionPhase === AscensionPhase.Inactive) {
      this.beginAscensionSequence();
    }
  }

  private syncPosition(time: number) {
    if (time - this.lastSyncTime < NETWORK_SYNC_RATE) return;

    if (!this.localPlayer?.body) return;
    const body = this.localPlayer.body as Phaser.Physics.Arcade.Body;

    // Dirty-check: skip sending if position and velocity barely changed
    const dx = Math.abs(this.localPlayer.x - this.lastSentX);
    const dy = Math.abs(this.localPlayer.y - this.lastSentY);
    const dvx = Math.abs(body.velocity.x - this.lastSentVX);
    const dvy = Math.abs(body.velocity.y - this.lastSentVY);

    if (dx < SYNC_POSITION_THRESHOLD && dy < SYNC_POSITION_THRESHOLD &&
        dvx < SYNC_VELOCITY_THRESHOLD && dvy < SYNC_VELOCITY_THRESHOLD) {
      return;
    }

    this.lastSyncTime = time;
    this.lastSentX = this.localPlayer.x;
    this.lastSentY = this.localPlayer.y;
    this.lastSentVX = body.velocity.x;
    this.lastSentVY = body.velocity.y;

    this.networkManager.send({
      type: NetworkMessageType.PlayerMove,
      payload: {
        role: this.role,
        position: { x: this.localPlayer.x, y: this.localPlayer.y },
        velocityX: body.velocity.x,
        velocityY: body.velocity.y,
        animation: 'idle',
      } as PlayerMovePayload,
      timestamp: Date.now(),
    });
  }

  private updateCarriedBell() {
    if (this.carriedBellId && this.localPlayer) {
      if (!this.carriedBellIndicator) {
        this.carriedBellIndicator = this.add.sprite(0, 0, 'bell');
        this.carriedBellIndicator.setScale(PIXEL_SCALE);
        this.carriedBellIndicator.setDepth(999);
      }
      this.carriedBellIndicator.setPosition(this.localPlayer.x, this.localPlayer.y - 36);
      this.carriedBellIndicator.setVisible(true);
    } else if (this.carriedBellIndicator) {
      this.carriedBellIndicator.setVisible(false);
    }
  }

  private updateRemoteCarryIndicator() {
    if (this.remoteCarryingBell && this.remotePlayer) {
      if (!this.remoteCarryIndicator) {
        this.remoteCarryIndicator = this.add.sprite(0, 0, 'bell');
        this.remoteCarryIndicator.setScale(PIXEL_SCALE);
        this.remoteCarryIndicator.setDepth(999);
      }
      this.remoteCarryIndicator.setPosition(this.remotePlayer.x, this.remotePlayer.y - 36);
      this.remoteCarryIndicator.setVisible(true);
    } else if (this.remoteCarryIndicator) {
      this.remoteCarryIndicator.setVisible(false);
    }
  }

  // --- Ascension Ceremony ---

  private updateAscension() {
    if (this.ascensionPhase === AscensionPhase.WaitingOnAltars) {
      this.checkAltarOverlap();
    }
  }

  private beginAscensionSequence() {
    this.ascensionPhase = AscensionPhase.SparklesActive;

    // Fade in altar sprites
    for (const altarDef of this.levelData.altars) {
      const textureKey = altarDef.forPlayer === PlayerRole.Player1 ? 'altar_p1' : 'altar_p2';
      const altar = this.add.image(altarDef.position.x, altarDef.position.y, textureKey);
      altar.setScale(PIXEL_SCALE);
      altar.setAlpha(0);
      altar.setDepth(0);
      altar.setData('definition', altarDef);
      this.altarSprites.push(altar);

      // Fade in
      this.tweens.add({
        targets: altar,
        alpha: 0.8,
        duration: 800,
        ease: 'Sine.easeIn',
      });

      // Pulsing glow
      this.tweens.add({
        targets: altar,
        scaleX: PIXEL_SCALE * 1.1,
        scaleY: PIXEL_SCALE * 1.1,
        duration: 1000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    // Create sparkle emitters following both players
    const localColor = this.role === PlayerRole.Player1 ? PLAYER1_COLOR : PLAYER2_COLOR;
    const remoteColor = this.role === PlayerRole.Player1 ? PLAYER2_COLOR : PLAYER1_COLOR;

    this.sparkleEmitterLocal = this.add.particles(0, 0, 'sparkle', {
      follow: this.localPlayer,
      frequency: 80,
      lifespan: 800,
      speed: { min: 20, max: 60 },
      scale: { start: 1.5, end: 0 },
      alpha: { start: 0.8, end: 0 },
      tint: localColor,
      blendMode: 'ADD',
      emitting: true,
    });
    this.sparkleEmitterLocal.setDepth(998);

    this.sparkleEmitterRemote = this.add.particles(0, 0, 'sparkle', {
      follow: this.remotePlayer,
      frequency: 80,
      lifespan: 800,
      speed: { min: 20, max: 60 },
      scale: { start: 1.5, end: 0 },
      alpha: { start: 0.8, end: 0 },
      tint: remoteColor,
      blendMode: 'ADD',
      emitting: true,
    });
    this.sparkleEmitterRemote.setDepth(998);

    // Transition to WaitingOnAltars after a short delay
    this.time.delayedCall(500, () => {
      if (this.ascensionPhase === AscensionPhase.SparklesActive) {
        this.ascensionPhase = AscensionPhase.WaitingOnAltars;
      }
    });
  }

  private checkAltarOverlap() {
    const myRole = this.role;
    const myAltar = this.levelData.altars.find((a) => a.forPlayer === myRole);
    if (!myAltar) return;

    const dist = Phaser.Math.Distance.Between(
      this.localPlayer.x, this.localPlayer.y,
      myAltar.position.x, myAltar.position.y
    );
    const onAltar = dist < 30;

    if (onAltar !== this.localOnAltar) {
      this.localOnAltar = onAltar;
      this.networkManager.send({
        type: NetworkMessageType.AscensionPlayerOnAltar,
        payload: { role: myRole, onAltar } as AscensionAltarPayload,
        timestamp: Date.now(),
      });

      if (this.localOnAltar && this.remoteOnAltar) {
        this.startLightBeamPhase();
      }
    }
  }

  private handleRemoteAltarState(payload: AscensionAltarPayload) {
    this.remoteOnAltar = payload.onAltar;

    if (this.ascensionPhase === AscensionPhase.WaitingOnAltars &&
        this.localOnAltar && this.remoteOnAltar) {
      this.startLightBeamPhase();
    }
  }

  private startLightBeamPhase() {
    this.ascensionPhase = AscensionPhase.LightBeamDown;
    this.controlsDisabled = true;

    // Zero velocity and disable gravity on local player
    const localBody = this.localPlayer.body as Phaser.Physics.Arcade.Body;
    localBody.setVelocity(0, 0);
    localBody.allowGravity = false;

    // Intensify sparkles
    if (this.sparkleEmitterLocal) {
      this.sparkleEmitterLocal.setFrequency(30);
    }
    if (this.sparkleEmitterRemote) {
      this.sparkleEmitterRemote.setFrequency(30);
    }

    // Create light beams (tall colored rectangles above each player)
    const beamWidth = 40;
    const beamHeight = 300;
    const localColor = this.role === PlayerRole.Player1 ? PLAYER1_COLOR : PLAYER2_COLOR;
    const remoteColor = this.role === PlayerRole.Player1 ? PLAYER2_COLOR : PLAYER1_COLOR;

    this.lightBeamLocal = this.add.rectangle(
      this.localPlayer.x, this.localPlayer.y - beamHeight / 2,
      beamWidth, beamHeight, localColor, 0
    );
    this.lightBeamLocal.setDepth(997);

    this.lightBeamRemote = this.add.rectangle(
      this.remotePlayer.x, this.remotePlayer.y - beamHeight / 2,
      beamWidth, beamHeight, remoteColor, 0
    );
    this.lightBeamRemote.setDepth(997);

    // Fade in light beams
    this.tweens.add({
      targets: [this.lightBeamLocal, this.lightBeamRemote],
      alpha: 0.5,
      duration: 1200,
      ease: 'Sine.easeIn',
      onComplete: () => {
        // Hold for 400ms then start float
        this.time.delayedCall(400, () => {
          this.startFloatUp();
        });
      },
    });
  }

  private startFloatUp() {
    this.ascensionPhase = AscensionPhase.FloatingUp;

    // Remove camera bounds so it can follow players above the level
    this.cameras.main.removeBounds();

    const floatDistance = 300;
    const floatDuration = 2000;

    // Float both players upward
    this.tweens.add({
      targets: this.localPlayer,
      y: this.localPlayer.y - floatDistance,
      duration: floatDuration,
      ease: 'Sine.easeIn',
    });

    this.tweens.add({
      targets: this.remotePlayer,
      y: this.remotePlayer.y - floatDistance,
      duration: floatDuration,
      ease: 'Sine.easeIn',
    });

    // Float light beams up with players
    if (this.lightBeamLocal) {
      this.tweens.add({
        targets: this.lightBeamLocal,
        y: this.lightBeamLocal.y - floatDistance,
        duration: floatDuration,
        ease: 'Sine.easeIn',
      });
    }
    if (this.lightBeamRemote) {
      this.tweens.add({
        targets: this.lightBeamRemote,
        y: this.lightBeamRemote.y - floatDistance,
        duration: floatDuration,
        ease: 'Sine.easeIn',
      });
    }

    // After float completes, transition out
    this.time.delayedCall(floatDuration, () => {
      this.startTransitionOut();
    });
  }

  private startTransitionOut() {
    this.ascensionPhase = AscensionPhase.TransitionOut;

    this.cameras.main.fadeOut(800, 255, 255, 255);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.cleanupAscensionEffects();
      this.advanceLevel();
      this.cameras.main.fadeIn(800, 255, 255, 255);
    });
  }

  private cleanupAscensionEffects() {
    if (this.sparkleEmitterLocal) {
      this.sparkleEmitterLocal.destroy();
      this.sparkleEmitterLocal = null;
    }
    if (this.sparkleEmitterRemote) {
      this.sparkleEmitterRemote.destroy();
      this.sparkleEmitterRemote = null;
    }
    if (this.lightBeamLocal) {
      this.lightBeamLocal.destroy();
      this.lightBeamLocal = null;
    }
    if (this.lightBeamRemote) {
      this.lightBeamRemote.destroy();
      this.lightBeamRemote = null;
    }
    for (const altar of this.altarSprites) {
      altar.destroy();
    }
    this.altarSprites = [];
  }

  private restartLevel() {
    this.loadLevel(this.currentLevel);
  }

  private advanceLevel() {
    if (this.currentLevel < levels.length - 1) {
      this.loadLevel(this.currentLevel + 1);
    } else {
      this.scene.start('EndScene');
    }
  }
}
