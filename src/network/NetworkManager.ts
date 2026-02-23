import Peer, { DataConnection } from 'peerjs';
import { PlayerRole, NetworkMessage } from '../types';
import { generateRoomCode } from '../utils/roomCode';

type MessageHandler = (message: NetworkMessage) => void;

const SESSION_KEY_HOST_ID = 'resonance_host_id';
const SESSION_KEY_ROLE = 'resonance_role';
const SESSION_KEY_ROOM = 'resonance_room_code';

const MAX_HOST_RETRIES = 5;
const JOIN_TIMEOUT_MS = 10000;

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
  private onOpenCallback: ((id: string) => void) | null = null;
  private onConnectCallback: (() => void) | null = null;
  private onErrorCallback: ((err: Error) => void) | null = null;
  private onDisconnectCallback: (() => void) | null = null;
  private visibilityHandler: (() => void) | null = null;
  private beforeUnloadHandler: ((e: BeforeUnloadEvent) => void) | null = null;
  private joinTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(role: PlayerRole, roomCode: string | null) {
    this.role = role;
    this.roomCode = roomCode;
  }

  /** Called when peer opens and receives an ID (room code for Player 1) */
  onOpen(callback: (id: string) => void) {
    this.onOpenCallback = callback;
  }

  /** Called when the two players are connected */
  onConnected(callback: () => void) {
    this.onConnectCallback = callback;
  }

  /** Called on connection error */
  onError(callback: (err: Error) => void) {
    this.onErrorCallback = callback;
  }

  /** Called when connection is lost */
  onDisconnect(callback: () => void) {
    this.onDisconnectCallback = callback;
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

  getRole(): PlayerRole {
    return this.role;
  }

  disconnect() {
    this.clearJoinTimeout();
    this.removeEventListeners();
    this.connection?.close();
    this.peer?.destroy();
    this.connected = false;
    NetworkManager.clearSavedSession();
  }

  /**
   * Attempt to reconnect after a connection loss.
   * Destroys the old peer cleanly and re-runs hostGame or joinGame.
   */
  attemptReconnect() {
    this.clearJoinTimeout();
    this.removeEventListeners();
    this.connection?.close();
    this.peer?.destroy();
    this.peer = null;
    this.connection = null;
    this.connected = false;

    this.connect();
  }

  /** Check for a previously saved session (survives page reload) */
  static getSavedSession(): { role: PlayerRole; roomCode: string } | null {
    const role = sessionStorage.getItem(SESSION_KEY_ROLE) as PlayerRole | null;
    const roomCode = sessionStorage.getItem(SESSION_KEY_ROOM);
    if (role && roomCode) {
      return { role, roomCode };
    }
    return null;
  }

  static clearSavedSession() {
    sessionStorage.removeItem(SESSION_KEY_HOST_ID);
    sessionStorage.removeItem(SESSION_KEY_ROLE);
    sessionStorage.removeItem(SESSION_KEY_ROOM);
  }

  private hostGame() {
    // Reuse previous peer ID if available (allows reconnection after reload)
    const savedHostId = sessionStorage.getItem(SESSION_KEY_HOST_ID);
    const hostId = savedHostId || generateRoomCode();
    this.initHostPeer(hostId, 0);
  }

  /**
   * Creates a host peer with the given ID. On `unavailable-id` error,
   * generates a new word code and retries up to MAX_HOST_RETRIES times.
   */
  private initHostPeer(hostId: string, retryCount: number) {
    this.peer = new Peer(hostId);

    this.peer.on('open', (id) => {
      sessionStorage.setItem(SESSION_KEY_HOST_ID, id);
      sessionStorage.setItem(SESSION_KEY_ROLE, this.role);
      sessionStorage.setItem(SESSION_KEY_ROOM, id);
      this.onOpenCallback?.(id);
    });

    this.peer.on('connection', (conn) => {
      this.connection = conn;
      this.setupConnection(conn);
    });

    this.peer.on('error', (err) => {
      if (err.type === 'unavailable-id' && retryCount < MAX_HOST_RETRIES) {
        this.peer?.destroy();
        NetworkManager.clearSavedSession();
        this.initHostPeer(generateRoomCode(), retryCount + 1);
        return;
      }
      // eslint-disable-next-line no-console
      console.error('PeerJS error:', err);
      this.onErrorCallback?.(err);
    });

    this.setupVisibilityHandler();
  }

  private joinGame() {
    if (!this.roomCode) return;

    sessionStorage.setItem(SESSION_KEY_ROLE, this.role);
    sessionStorage.setItem(SESSION_KEY_ROOM, this.roomCode);

    this.peer = new Peer();

    this.peer.on('open', () => {
      this.onOpenCallback?.(this.peer!.id);
      const conn = this.peer!.connect(this.roomCode!);
      this.connection = conn;
      this.setupConnection(conn);

      // Timeout if connection doesn't open within JOIN_TIMEOUT_MS
      this.joinTimeoutId = setTimeout(() => {
        if (!this.connected) {
          const err = new Error('Connection timed out — host may be offline');
          (err as Error & { type: string }).type = 'timeout';
          this.onErrorCallback?.(err);
        }
      }, JOIN_TIMEOUT_MS);
    });

    this.peer.on('error', (err) => {
      this.clearJoinTimeout();
      // eslint-disable-next-line no-console
      console.error('PeerJS error:', err);
      this.onErrorCallback?.(err);
    });

    this.setupVisibilityHandler();
  }

  private setupConnection(conn: DataConnection) {
    conn.on('open', () => {
      this.clearJoinTimeout();
      this.connected = true;
      this.onConnectCallback?.();
      this.addBeforeUnloadHandler();
    });

    conn.on('data', (data) => {
      const message = data as NetworkMessage;
      for (const handler of this.messageHandlers) {
        handler(message);
      }
    });

    conn.on('close', () => {
      this.connected = false;
      this.removeBeforeUnloadHandler();
      this.onDisconnectCallback?.();
    });
  }

  private clearJoinTimeout() {
    if (this.joinTimeoutId !== null) {
      clearTimeout(this.joinTimeoutId);
      this.joinTimeoutId = null;
    }
  }

  private setupVisibilityHandler() {
    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        // Tab became visible — check if connection survived
        if (this.peer && this.peer.disconnected) {
          this.peer.reconnect();
        }
        if (this.connection && !this.connection.open && this.connected) {
          this.connected = false;
          this.onDisconnectCallback?.();
        }
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  private addBeforeUnloadHandler() {
    this.beforeUnloadHandler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', this.beforeUnloadHandler);
  }

  private removeBeforeUnloadHandler() {
    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
      this.beforeUnloadHandler = null;
    }
  }

  private removeEventListeners() {
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    this.removeBeforeUnloadHandler();
  }
}
