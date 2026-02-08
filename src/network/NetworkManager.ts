import Peer, { DataConnection } from 'peerjs';
import { PlayerRole, NetworkMessage } from '../types';

type MessageHandler = (message: NetworkMessage) => void;

/**
 * Manages peer-to-peer connection via PeerJS.
 * Player 1 (host) creates a peer and shares the ID as room code.
 * Player 2 connects using the room code.
 */
export class NetworkManager {
  private peer: Peer | null = null;
  private connection: DataConnection | null = null;
  private role: PlayerRole;
  private roomCode: string | null;
  private messageHandlers: MessageHandler[] = [];
  private connected = false;

  constructor(role: PlayerRole, roomCode: string | null) {
    this.role = role;
    this.roomCode = roomCode;
  }

  onMessage(handler: MessageHandler) {
    this.messageHandlers.push(handler);
  }

  connect() {
    if (this.role === PlayerRole.Player1) {
      this.hostGame();
    } else {
      this.joinGame();
    }
  }

  send(message: NetworkMessage) {
    if (this.connection && this.connected) {
      this.connection.send(message);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  getRoomCode(): string | null {
    return this.peer?.id ?? this.roomCode;
  }

  disconnect() {
    this.connection?.close();
    this.peer?.destroy();
    this.connected = false;
  }

  private hostGame() {
    this.peer = new Peer();

    this.peer.on('open', (id) => {
      // The peer ID is the room code
      // eslint-disable-next-line no-console
      console.log(`Room code: ${id}`);
    });

    this.peer.on('connection', (conn) => {
      this.connection = conn;
      this.setupConnection(conn);
    });

    this.peer.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('PeerJS error:', err);
    });
  }

  private joinGame() {
    if (!this.roomCode) return;

    this.peer = new Peer();

    this.peer.on('open', () => {
      const conn = this.peer!.connect(this.roomCode!);
      this.connection = conn;
      this.setupConnection(conn);
    });

    this.peer.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('PeerJS error:', err);
    });
  }

  private setupConnection(conn: DataConnection) {
    conn.on('open', () => {
      this.connected = true;
    });

    conn.on('data', (data) => {
      const message = data as NetworkMessage;
      for (const handler of this.messageHandlers) {
        handler(message);
      }
    });

    conn.on('close', () => {
      this.connected = false;
    });
  }
}
