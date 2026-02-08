import Phaser from 'phaser';
import { PlayerRole, NetworkMessageType } from '../types';
import type { LevelData, PlayerMovePayload, BellStrikePayload, BellCarryPayload } from '../types';
import { PLAYER_SPEED, PLAYER_JUMP_VELOCITY, BELL_INTERACT_RANGE, NETWORK_SYNC_RATE, PIXEL_SCALE } from '../config';
import { NetworkManager } from '../network/NetworkManager';
import { AudioManager } from '../audio/AudioManager';
import { levels } from '../levels';

interface GameSceneData {
  role: PlayerRole;
  roomCode: string | null;
}

export class GameScene extends Phaser.Scene {
  private localPlayer!: Phaser.Physics.Arcade.Sprite;
  private remotePlayer!: Phaser.Physics.Arcade.Sprite;
  private role!: PlayerRole;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
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
  private strikeKey!: Phaser.Input.Keyboard.Key;
  private pickupKey!: Phaser.Input.Keyboard.Key;
  private noteKeys: Record<string, Phaser.Input.Keyboard.Key> = {};

  constructor() {
    super({ key: 'GameScene' });
  }

  init(data: GameSceneData) {
    this.role = data.role;
    this.networkManager = new NetworkManager(data.role, data.roomCode);
    this.audioManager = new AudioManager();
  }

  create() {
    this.platforms = this.physics.add.staticGroup();
    this.bells = this.physics.add.staticGroup();
    this.moonGates = this.physics.add.staticGroup();
    this.pressurePlates = this.physics.add.staticGroup();

    this.setupInput();
    this.setupNetwork();
    this.loadLevel(0);
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

    this.networkManager.connect();
  }

  private loadLevel(index: number) {
    this.currentLevel = index;
    this.levelData = levels[index];
    this.solvedPuzzles.clear();
    this.carriedBellId = null;
    this.carriedBellSprite = null;

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
    this.remotePlayer.body!.allowGravity = false; // Remote player position is synced

    // Collisions
    this.physics.add.collider(this.localPlayer, this.platforms);
    this.physics.add.collider(this.remotePlayer, this.platforms);

    // Set world bounds to level size
    this.physics.world.setBounds(0, 0, this.levelData.width, this.levelData.height);
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

    // Horizontal movement
    if (this.wasd.A?.isDown) {
      body.setVelocityX(-PLAYER_SPEED);
    } else if (this.wasd.D?.isDown) {
      body.setVelocityX(PLAYER_SPEED);
    } else {
      body.setVelocityX(0);
    }

    // Jump
    if (this.wasd.W?.isDown && body.blocked.down) {
      body.setVelocityY(PLAYER_JUMP_VELOCITY);
    }
  }

  private handleActions() {
    // Player 1: Strike bell
    if (this.role === PlayerRole.Player1 && Phaser.Input.Keyboard.JustDown(this.strikeKey)) {
      this.tryStrikeBell();
    }

    // Player 2: Pick up / place bell
    if (this.role === PlayerRole.Player2 && Phaser.Input.Keyboard.JustDown(this.pickupKey)) {
      if (this.carriedBellId) {
        this.placeBell();
      } else {
        this.tryPickupBell();
      }
    }

    // Player 2: Play notes
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
    this.remotePlayer.setPosition(payload.position.x, payload.position.y);
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
