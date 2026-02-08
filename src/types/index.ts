/** Pentatonic scale notes — 宫商角徵羽 */
export enum PentatonicNote {
  Gong = 'gong',     // 宫
  Shang = 'shang',   // 商
  Jue = 'jue',       // 角
  Zhi = 'zhi',       // 徵
  Yu = 'yu',         // 羽
}

/** The Chinese character labels for each note */
export const NOTE_LABELS: Record<PentatonicNote, string> = {
  [PentatonicNote.Gong]: '宫',
  [PentatonicNote.Shang]: '商',
  [PentatonicNote.Jue]: '角',
  [PentatonicNote.Zhi]: '徵',
  [PentatonicNote.Yu]: '羽',
};

export enum PlayerRole {
  Player1 = 'player1', // Desktop — listener/striker
  Player2 = 'player2', // Mobile — carrier/note-player
}

export enum MoonGateType {
  Player1 = 'player1',   // Blue — only Player 1 can pass
  Player2 = 'player2',   // Red — only Player 2 can pass
  Puzzle = 'puzzle',      // Color-coded — opens when puzzle solved
}

export interface Position {
  x: number;
  y: number;
}

export interface BellDefinition {
  id: string;
  position: Position;
  puzzleGroup: string;       // Color group identifier (e.g., 'red', 'blue')
  dotCount: number;          // Sequence order within the group (1, 2, 3...)
  note: PentatonicNote;      // The note this bell produces when struck
}

export interface MoonGateDefinition {
  id: string;
  position: Position;
  width: number;
  height: number;
  type: MoonGateType;
  puzzleGroup?: string;      // Required for Puzzle type gates
}

export interface PressurePlateDefinition {
  id: string;
  position: Position;
  targetId: string;          // ID of the element this plate controls
}

export interface PlatformDefinition {
  x: number;
  y: number;
  width: number;
  height: number;
  type?: 'static' | 'moving';
  moveRange?: { startX: number; endX: number; speed: number };
}

export interface LevelData {
  id: number;
  name: string;
  width: number;
  height: number;
  spawnPoints: {
    player1: Position;
    player2: Position;
  };
  platforms: PlatformDefinition[];
  bells: BellDefinition[];
  moonGates: MoonGateDefinition[];
  pressurePlates: PressurePlateDefinition[];
  puzzleSequences: Record<string, PentatonicNote[]>; // puzzleGroup -> correct note sequence
  exitPosition: Position;
  background: {
    layers: string[];        // Parallax layer asset keys, back to front
  };
}

/** Messages sent over PeerJS data channel */
export enum NetworkMessageType {
  PlayerMove = 'player_move',
  BellStrike = 'bell_strike',
  BellPickup = 'bell_pickup',
  BellPlace = 'bell_place',
  NotePlay = 'note_play',
  SequenceAttempt = 'sequence_attempt',
  PuzzleSolved = 'puzzle_solved',
  PressurePlateToggle = 'pressure_plate_toggle',
  LevelComplete = 'level_complete',
  GameState = 'game_state',
  LevelLoad = 'level_load',
}

export interface NetworkMessage {
  type: NetworkMessageType;
  payload: unknown;
  timestamp: number;
}

export interface PlayerMovePayload {
  role: PlayerRole;
  position: Position;
  velocityX: number;
  velocityY: number;
  animation: string;
}

export interface BellStrikePayload {
  bellId: string;
  note: PentatonicNote;
}

export interface BellCarryPayload {
  bellId: string;
  position: Position;
}

export interface NotePlayPayload {
  note: PentatonicNote;
  puzzleGroup: string;
}

export interface SequenceAttemptPayload {
  puzzleGroup: string;
  notes: PentatonicNote[];
}

export interface PuzzleSolvedPayload {
  puzzleGroup: string;
  moonGateId: string;
}
