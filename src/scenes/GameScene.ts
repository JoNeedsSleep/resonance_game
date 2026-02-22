import Phaser from 'phaser';
import { PlayerRole, NetworkMessageType, PentatonicNote, NOTE_LABELS } from '../types';
import type { LevelData, PlayerMovePayload, BellStrikePayload, BellCarryPayload } from '../types';
import { GAME_WIDTH, GAME_HEIGHT, IS_PORTRAIT, PLAYER_SPEED, PLAYER_JUMP_VELOCITY, BELL_INTERACT_RANGE, NETWORK_SYNC_RATE, PIXEL_SCALE } from '../config';
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
  private noteKeys: Record<string, Phaser.Input.Keyboard.Key> = {};

  // Touch controls
  private isTouchDevice = false;
  private joystickBase: Phaser.GameObjects.Arc | null = null;
  private joystickThumb: Phaser.GameObjects.Arc | null = null;
  private joystickActive = false;
  private joystickVector = { x: 0, y: 0 };
  private joystickPointerId: number | null = null;
  private touchJumpRequested = false;
  private joystickJumpFired = false;

  // Remote player interpolation
  private remoteTargetX = 0;
  private remoteTargetY = 0;
  private remoteTargetInitialized = false;

  private touchActionBtn: Phaser.GameObjects.Arc | null = null;
  private touchActionLabel: Phaser.GameObjects.Text | null = null;
  private noteButtons: Phaser.GameObjects.Container[] = [];

  // Help button
  private helpBtn: Phaser.GameObjects.Arc | null = null;
  private helpLabel: Phaser.GameObjects.Text | null = null;
  private helpPopupObjects: Phaser.GameObjects.GameObject[] = [];
  private helpPopupVisible = false;
  private helpPopupPinned = false;

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
    const uiCamera = this.cameras.add(0, 0, GAME_WIDTH, GAME_HEIGHT);
    uiCamera.setScroll(0, 0);

    // --- Virtual Joystick (left side) ---
    const joyX = 100;
    const joyY = GAME_HEIGHT - 100;
    const baseRadius = 50;
    const thumbRadius = 25;

    this.joystickBase = this.add.circle(joyX, joyY, baseRadius, 0xffffff, 0.15);
    this.joystickThumb = this.add.circle(joyX, joyY, thumbRadius, 0xffffff, 0.4);
    this.joystickBase.setScrollFactor(0).setDepth(1000);
    this.joystickThumb.setScrollFactor(0).setDepth(1001);

    // Jump button (above joystick)
    const jumpBtn = this.add.circle(joyX + 90, joyY - 50, 30, 0x8ecae6, 0.3)
      .setScrollFactor(0).setDepth(1000).setInteractive();
    this.add.text(joyX + 90, joyY - 50, '▲', {
      fontSize: '20px', color: '#8ecae6',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);

    jumpBtn.on('pointerdown', () => { this.touchJumpRequested = true; });

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

      const noteSpacing = IS_PORTRAIT ? 44 : 52;
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

    // Click / tap: toggle and pin
    this.helpBtn.on('pointerdown', () => {
      if (this.helpPopupVisible) {
        this.hideHelpPopup();
      } else {
        this.showHelpPopup();
        this.helpPopupPinned = true;
      }
    });

    // Desktop hover
    if (!this.isTouchDevice) {
      this.helpBtn.on('pointerover', () => {
        if (!this.helpPopupVisible) {
          this.showHelpPopup();
        }
      });
      this.helpBtn.on('pointerout', () => {
        if (this.helpPopupVisible && !this.helpPopupPinned) {
          this.hideHelpPopup();
        }
      });
    }
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
    this.helpPopupPinned = false;
  }

  private getControlsText(): string {
    if (this.role === PlayerRole.Player1) {
      if (this.isTouchDevice) {
        return [
          'Move:    Joystick (left)',
          'Jump:    ▲ button / flick up',
          'Strike:  Bell button (right)',
        ].join('\n');
      }
      return [
        'Move:    A/D or ←/→',
        'Jump:    W or ↑',
        'Strike:  0 (near a bell)',
      ].join('\n');
    }

    // Player 2
    if (this.isTouchDevice) {
      return [
        'Move:    Joystick (left)',
        'Jump:    ▲ button / flick up',
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
        case NetworkMessageType.BellPlace:
          this.handleRemoteBellCarry(message.payload as BellCarryPayload);
          break;
        case NetworkMessageType.PuzzleSolved:
          this.handlePuzzleSolved(message.payload as { puzzleGroup: string });
          break;
        case NetworkMessageType.LevelComplete:
          this.advanceLevel();
          break;
      }
    });

    this.networkManager.onDisconnect(() => {
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Connection lost', {
        fontSize: '24px',
        color: '#ff6b6b',
        fontFamily: 'monospace',
        backgroundColor: '#1a1a2e',
        padding: { x: 20, y: 10 },
      }).setOrigin(0.5).setScrollFactor(0).setDepth(2000);

      this.time.delayedCall(2000, () => {
        this.scene.start('MenuScene');
      });
    });
  }

  private loadLevel(index: number) {
    this.currentLevel = index;
    this.levelData = levels[index];
    this.solvedPuzzles.clear();
    this.carriedBellId = null;
    this.carriedBellSprite = null;
    this.remoteTargetInitialized = false;

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
    this.updateCarriedBell();
    this.interpolateRemotePlayer();
  }

  private interpolateRemotePlayer() {
    if (!this.remotePlayer || !this.remoteTargetInitialized) return;

    const lerpFactor = 0.25;
    const newX = Phaser.Math.Linear(this.remotePlayer.x, this.remoteTargetX, lerpFactor);
    const newY = Phaser.Math.Linear(this.remotePlayer.y, this.remoteTargetY, lerpFactor);
    this.remotePlayer.setPosition(newX, newY);
  }

  private handleMovement() {
    if (!this.localPlayer?.body) return;

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
      // Also allow dedicated jump button
      if (this.touchJumpRequested && body.blocked.down && body.velocity.y >= 0) {
        body.setVelocityY(PLAYER_JUMP_VELOCITY);
        this.touchJumpRequested = false;
      }
      return;
    }

    // Reset touch jump if using joystick but not moving
    if (this.isTouchDevice && this.touchJumpRequested && body.blocked.down && body.velocity.y >= 0) {
      body.setVelocityY(PLAYER_JUMP_VELOCITY);
      this.touchJumpRequested = false;
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

    this.carriedBellSprite.setPosition(this.localPlayer.x, this.localPlayer.y + 20);
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

    this.remoteTargetX = payload.position.x;
    this.remoteTargetY = payload.position.y;

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

  private handleRemoteBellCarry(payload: BellCarryPayload) {
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
  }

  private syncPosition(time: number) {
    if (time - this.lastSyncTime < NETWORK_SYNC_RATE) return;
    this.lastSyncTime = time;

    if (!this.localPlayer?.body) return;
    const body = this.localPlayer.body as Phaser.Physics.Arcade.Body;

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
    // Visual feedback: if Player 2 is carrying a bell, it's on their back
    // This is handled by hiding the bell sprite — the rucksack texture implies carrying
  }

  private advanceLevel() {
    if (this.currentLevel < levels.length - 1) {
      this.loadLevel(this.currentLevel + 1);
    } else {
      this.scene.start('EndScene');
    }
  }
}
