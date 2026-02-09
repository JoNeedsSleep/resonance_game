import Phaser from 'phaser';
import { PlayerRole, NetworkMessageType, PentatonicNote, NOTE_LABELS, MoonGateType } from '../types';
import type { LevelData, PlayerMovePayload, BellStrikePayload, BellCarryPayload, NotePlayPayload, MoonGateDefinition } from '../types';
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
  private playedSequences: Map<string, PentatonicNote[]> = new Map();
  private activePuzzleGroup: string | null = null;
  private exitZone: Phaser.GameObjects.Zone | null = null;
  private exitMarker: Phaser.GameObjects.Graphics | null = null;
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
  private touchActionBtn: Phaser.GameObjects.Arc | null = null;
  private touchActionLabel: Phaser.GameObjects.Text | null = null;
  private noteButtons: Phaser.GameObjects.Container[] = [];

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
  }

  private setupInput() {
    if (!this.input.keyboard) return;

    this.wasd = {
      W: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
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
        case NetworkMessageType.NotePlay:
          this.handleRemoteNotePlay(message.payload as NotePlayPayload);
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
    this.playedSequences.clear();
    this.activePuzzleGroup = null;
    this.carriedBellId = null;
    this.carriedBellSprite = null;

    // Clear existing objects
    this.platforms.clear(true, true);
    this.bells.clear(true, true);
    this.moonGates.clear(true, true);
    this.pressurePlates.clear(true, true);
    this.exitZone?.destroy();
    this.exitZone = null;
    this.exitMarker?.destroy();
    this.exitMarker = null;

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

    // Place moon gates with proper sizing
    for (const gateDef of this.levelData.moonGates) {
      const g = this.moonGates.create(gateDef.position.x, gateDef.position.y, 'moongate') as Phaser.Physics.Arcade.Sprite;
      g.setDisplaySize(gateDef.width, gateDef.height);
      g.setData('definition', gateDef);
      g.refreshBody();

      // Tint by type
      if (gateDef.type === MoonGateType.Player1) {
        g.setTint(0x8ecae6); // Blue
      } else if (gateDef.type === MoonGateType.Player2) {
        g.setTint(0xe07a5f); // Orange
      } else {
        g.setTint(0xffd700); // Gold for puzzle gates
      }
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
    (this.remotePlayer.body as Phaser.Physics.Arcade.Body).allowGravity = false;

    // Collisions — platforms
    this.physics.add.collider(this.localPlayer, this.platforms);
    this.physics.add.collider(this.remotePlayer, this.platforms);

    // Moon gate collisions — type-based blocking
    this.physics.add.collider(
      this.localPlayer,
      this.moonGates,
      undefined,
      (_player, gateObj) => {
        const gate = gateObj as Phaser.Physics.Arcade.Sprite;
        const def = gate.getData('definition') as MoonGateDefinition;
        return this.shouldGateBlock(def);
      },
      this,
    );

    // Exit zone
    const exitPos = this.levelData.exitPosition;
    this.exitZone = this.add.zone(exitPos.x, exitPos.y, 64, 80);
    this.physics.add.existing(this.exitZone, true); // static body
    this.physics.add.overlap(this.localPlayer, this.exitZone, () => {
      this.checkLevelComplete();
    });

    // Exit marker (golden glow, hidden until all puzzles solved)
    this.exitMarker = this.add.graphics();
    this.exitMarker.fillStyle(0xffd700, 0.3);
    this.exitMarker.fillRect(exitPos.x - 32, exitPos.y - 40, 64, 80);
    this.exitMarker.setVisible(false);

    // Set world bounds to level size
    this.physics.world.setBounds(0, 0, this.levelData.width, this.levelData.height);

    // Camera follow for scrolling levels (especially important on mobile)
    this.cameras.main.startFollow(this.localPlayer, true, 0.1, 0.1);
    this.cameras.main.setBounds(0, 0, this.levelData.width, this.levelData.height);
  }

  private shouldGateBlock(def: MoonGateDefinition): boolean {
    // Player1-type gates: only P1 passes (blocks P2)
    if (def.type === MoonGateType.Player1) {
      return this.role !== PlayerRole.Player1;
    }
    // Player2-type gates: only P2 passes (blocks P1)
    if (def.type === MoonGateType.Player2) {
      return this.role !== PlayerRole.Player2;
    }
    // Puzzle gates: block both until solved
    if (def.type === MoonGateType.Puzzle && def.puzzleGroup) {
      return !this.solvedPuzzles.has(def.puzzleGroup);
    }
    return false;
  }

  private allPuzzlesSolved(): boolean {
    const groups = Object.keys(this.levelData.puzzleSequences);
    return groups.length > 0 && groups.every(g => this.solvedPuzzles.has(g));
  }

  private updateExitMarker() {
    if (this.exitMarker) {
      this.exitMarker.setVisible(this.allPuzzlesSolved());
      if (this.allPuzzlesSolved()) {
        // Pulsing glow effect
        this.tweens.add({
          targets: this.exitMarker,
          alpha: { from: 0.3, to: 0.8 },
          duration: 1000,
          yoyo: true,
          repeat: -1,
        });
      }
    }
  }

  private checkLevelComplete() {
    if (!this.allPuzzlesSolved()) return;

    // Check if remote player is also near the exit
    const exitPos = this.levelData.exitPosition;
    const remoteDist = Phaser.Math.Distance.Between(
      this.remotePlayer.x, this.remotePlayer.y,
      exitPos.x, exitPos.y,
    );
    if (remoteDist > 120) return; // Remote player must be nearby

    // Level complete!
    this.networkManager.send({
      type: NetworkMessageType.LevelComplete,
      payload: {},
      timestamp: Date.now(),
    });
    this.advanceLevel();
  }

  update(time: number) {
    this.handleMovement();
    this.handleActions();
    this.syncPosition(time);
    this.updateCarriedBell();
  }

  private handleMovement() {
    if (!this.localPlayer?.body) return;

    const body = this.localPlayer.body as Phaser.Physics.Arcade.Body;

    // Touch controls (joystick)
    if (this.isTouchDevice && this.joystickActive) {
      body.setVelocityX(this.joystickVector.x * PLAYER_SPEED);
      // Jump via joystick pull-up
      if (this.joystickVector.y < -0.5 && body.blocked.down && !this.joystickJumpFired) {
        body.setVelocityY(PLAYER_JUMP_VELOCITY);
        this.joystickJumpFired = true;
      }
      // Reset jump flag when joystick returns to neutral
      if (this.joystickVector.y >= -0.3) {
        this.joystickJumpFired = false;
      }
      // Also allow dedicated jump button
      if (this.touchJumpRequested && body.blocked.down) {
        body.setVelocityY(PLAYER_JUMP_VELOCITY);
        this.touchJumpRequested = false;
      }
      return;
    }

    // Reset touch jump if using joystick but not moving
    if (this.isTouchDevice && this.touchJumpRequested && body.blocked.down) {
      body.setVelocityY(PLAYER_JUMP_VELOCITY);
      this.touchJumpRequested = false;
    }

    // Keyboard movement
    if (this.wasd?.A?.isDown) {
      body.setVelocityX(-PLAYER_SPEED);
    } else if (this.wasd?.D?.isDown) {
      body.setVelocityX(PLAYER_SPEED);
    } else if (!this.joystickActive) {
      body.setVelocityX(0);
    }

    // Keyboard jump
    if (this.wasd?.W?.isDown && body.blocked.down) {
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
    // Set active puzzle group so P2 knows which puzzle to play notes for
    this.activePuzzleGroup = def.puzzleGroup;

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
    if (!this.activePuzzleGroup) return; // No puzzle active — ignore note

    // Player 2 hears their own note
    this.audioManager.playBellNote(note);

    const puzzleGroup = this.activePuzzleGroup;

    // Track locally on P2 side for visual feedback
    this.trackNoteAndCheck(puzzleGroup, note as PentatonicNote);

    this.networkManager.send({
      type: NetworkMessageType.NotePlay,
      payload: { note, puzzleGroup } as NotePlayPayload,
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
    this.remotePlayer.setPosition(payload.position.x, payload.position.y);
  }

  private handleRemoteBellStrike(payload: BellStrikePayload) {
    // P2 side: track which puzzle group P1 just struck
    const bellDef = this.levelData.bells.find(b => b.id === payload.bellId);
    if (bellDef) {
      this.activePuzzleGroup = bellDef.puzzleGroup;
    }

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

  private handleRemoteNotePlay(payload: NotePlayPayload) {
    // P1 receives notes from P2 — validate the sequence
    this.trackNoteAndCheck(payload.puzzleGroup, payload.note);
  }

  private trackNoteAndCheck(puzzleGroup: string, note: PentatonicNote) {
    const expected = this.levelData.puzzleSequences[puzzleGroup];
    if (!expected || this.solvedPuzzles.has(puzzleGroup)) return;

    if (!this.playedSequences.has(puzzleGroup)) {
      this.playedSequences.set(puzzleGroup, []);
    }
    const played = this.playedSequences.get(puzzleGroup)!;
    played.push(note);

    // Check against expected sequence
    const idx = played.length - 1;
    if (played[idx] !== expected[idx]) {
      // Wrong note — reset with red flash feedback
      this.playedSequences.set(puzzleGroup, []);
      this.cameras.main.flash(200, 255, 80, 80, false); // Red flash
      return;
    }

    if (played.length === expected.length) {
      // Sequence complete — puzzle solved!
      this.onPuzzleSolved(puzzleGroup);
    }
    // Otherwise correct prefix — wait for more notes
  }

  private onPuzzleSolved(puzzleGroup: string) {
    this.solvedPuzzles.add(puzzleGroup);
    this.playedSequences.delete(puzzleGroup);
    this.activePuzzleGroup = null;

    // Play success chord
    this.audioManager.playSuccessChord();

    // Fade out the corresponding moon gate(s)
    this.moonGates.getChildren().forEach((child) => {
      const gate = child as Phaser.Physics.Arcade.Sprite;
      const def = gate.getData('definition') as MoonGateDefinition;
      if (def?.puzzleGroup === puzzleGroup) {
        this.tweens.add({
          targets: gate,
          alpha: 0.15,
          duration: 800,
          onComplete: () => {
            (gate.body as Phaser.Physics.Arcade.StaticBody).enable = false;
          },
        });
      }
    });

    // Update exit marker visibility
    this.updateExitMarker();

    // Broadcast to other player
    this.networkManager.send({
      type: NetworkMessageType.PuzzleSolved,
      payload: { puzzleGroup },
      timestamp: Date.now(),
    });
  }

  private handlePuzzleSolved(payload: { puzzleGroup: string }) {
    this.solvedPuzzles.add(payload.puzzleGroup);
    this.audioManager.playSuccessChord();

    // Open corresponding moon gate
    this.moonGates.getChildren().forEach((child) => {
      const gate = child as Phaser.Physics.Arcade.Sprite;
      const def = gate.getData('definition');
      if (def?.puzzleGroup === payload.puzzleGroup) {
        this.tweens.add({
          targets: gate,
          alpha: 0.15,
          duration: 800,
          onComplete: () => {
            (gate.body as Phaser.Physics.Arcade.StaticBody).enable = false;
          },
        });
      }
    });

    // Update exit marker visibility
    this.updateExitMarker();
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
