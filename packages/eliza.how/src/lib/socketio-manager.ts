import { Evt } from 'evt';
import { io, type Socket } from 'socket.io-client';
// Import the enum from the core package
import { v4 as uuidv4 } from 'uuid'; // For generating internal message IDs if needed

// Import the assertion utility
import { assert } from '@/utils/assert';

export enum SOCKET_MESSAGE_TYPE {
  ROOM_JOINING = 1,
  SEND_MESSAGE = 2,
  MESSAGE = 3,
  ACK = 4,
  THINKING = 5,
  CONTROL = 6,
}

// Simplified type for message data received from the backend
export type MessageBroadcastData = {
  id?: string; // Optional message ID from backend
  senderId: string;
  senderName: string;
  text: string;
  roomId: string;
  createdAt: number;
  source: string;
  name: string; // Usually same as senderName for compatibility
  thought?: string;
  actions?: string[];
  [key: string]: any;
};

// Type for control messages received from the backend
export type ControlMessageData = {
  action: 'enable_input' | 'disable_input';
  roomId: string;
  [key: string]: any;
};

// --- Event Adapter (Helper Class) ---
class EventAdapter {
  private events: Record<string, Evt<any>> = {};

  constructor() {
    this.events.messageBroadcast = Evt.create<MessageBroadcastData>();
    this.events.controlMessage = Evt.create<ControlMessageData>();
    // Add more events if needed (e.g., messageComplete)
  }

  on(eventName: string, listener: (...args: any[]) => void) {
    if (!this.events[eventName]) {
      this.events[eventName] = Evt.create();
    }
    this.events[eventName].attach(listener);
    return this;
  }

  off(eventName: string, listener: (...args: any[]) => void) {
    if (this.events[eventName]) {
      this.events[eventName].getHandlers().forEach((handler) => {
        if (handler.callback === listener) {
          handler.detach();
        }
      });
    }
    return this;
  }

  emit(eventName: string, ...args: any[]) {
    if (this.events[eventName]) {
      this.events[eventName].post(args.length === 1 ? args[0] : args);
    }
    return this;
  }

  _getEvt(eventName: string): Evt<any> | undefined {
    return this.events[eventName];
  }
}

// --- SocketIOManager Class ---
class SocketIOManager extends EventAdapter {
  private static instance: SocketIOManager | null = null;
  private socket: Socket | null = null;
  private isConnected = false;
  private connectPromise: Promise<void> | null = null;
  private resolveConnect: (() => void) | null = null;
  private activeRooms: Set<string> = new Set();
  private entityId: string | null = null;
  private agentIds: string[] = []; // Store agent IDs this manager might interact with

  // Public EVT accessors
  public get evtMessageBroadcast() {
    return this._getEvt('messageBroadcast') as Evt<MessageBroadcastData>;
  }

  public get evtControlMessage() {
    return this._getEvt('controlMessage') as Evt<ControlMessageData>;
  }

  private constructor() {
    super();
  }

  public static getInstance(): SocketIOManager {
    if (!SocketIOManager.instance) {
      SocketIOManager.instance = new SocketIOManager();
    }
    return SocketIOManager.instance;
  }

  /**
   * Initializes the Socket.IO connection.
   * Should only be called once per user session.
   */
  public initialize(entityId: string, agentIds: string[]): void {
    assert(typeof window !== 'undefined', '[SocketIO Init] Cannot initialize on the server.');
    if (typeof window === 'undefined') return;

    assert(
      entityId && typeof entityId === 'string',
      `[SocketIO Init] Invalid entityId: ${entityId}`
    );
    // Use assertion for agentIds check
    assert(
      agentIds &&
        Array.isArray(agentIds) &&
        agentIds.length > 0 &&
        agentIds.every((id) => typeof id === 'string'),
      `[SocketIO Init] Invalid agentIds: ${agentIds}`
    );
    if (!entityId || !agentIds || agentIds.length === 0) {
      console.error('[SocketIO Init] Initialization cancelled due to invalid parameters.');
      return;
    }

    this.entityId = entityId;
    this.agentIds = agentIds;

    if (this.socket?.connected) {
      console.warn('[SocketIO] Socket already initialized and connected.');
      this.resolveConnect?.();
      return;
    }

    if (this.socket) {
      console.warn('[SocketIO] Initialization called while connection attempt may be in progress.');
      return;
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || window.location.origin;
    console.info(`[SocketIO] Creating new socket connection to ${apiUrl}`);
    this.socket = io(apiUrl, {
      autoConnect: true,
      reconnection: true,
      // transports: ['websocket'], // REMOVE or COMMENT OUT this line
    });

    this.connectPromise = new Promise<void>((resolve) => {
      this.resolveConnect = resolve;
    });

    console.log('[SocketIO] Attaching ALL listeners.');

    this.socket.on('connect', () => {
      console.info(`[SocketIO] Connected successfully. Socket ID: ${this.socket?.id}`);
      this.isConnected = true;
      this.resolveConnect?.();

      this.activeRooms.forEach((roomId) => {
        console.log(`[SocketIO] Rejoining room ${roomId} after connection.`);
        this.joinRoom(roomId);
      });
    });

    this.socket.on('disconnect', (reason) => {
      console.warn(`[SocketIO Listener] SOCKET DISCONNECTED! Reason: ${reason}`);
      this.isConnected = false;
      this.connectPromise = new Promise<void>((resolve) => {
        this.resolveConnect = resolve;
      });
      if (reason === 'io server disconnect' && this.socket) {
        console.log('[SocketIO] Server initiated disconnect, allowing reconnect attempt.');
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('[SocketIO] Connection error:', error);
      this.connectPromise = new Promise<void>((resolve) => {
        this.resolveConnect = resolve;
      });
    });

    this.socket.on('messageBroadcast', (data: MessageBroadcastData) => {
      assert(data, '[SocketIO Listener] Received null/undefined messageBroadcast data.');
      if (!data) return;
      assert(
        typeof data.roomId === 'string',
        `[SocketIO Listener] Invalid roomId in messageBroadcast: ${data.roomId}`
      );
      assert(
        typeof data.senderId === 'string',
        `[SocketIO Listener] Invalid senderId in messageBroadcast: ${data.senderId}`
      );
      assert(
        typeof data.senderName === 'string' || typeof data.name === 'string',
        `[SocketIO Listener] Missing senderName/name in messageBroadcast: ${data.senderName} / ${data.name}`
      );
      assert(
        typeof data.text === 'string' ||
          typeof data.thought === 'string' ||
          data.text === null ||
          data.text === undefined,
        `[SocketIO Listener] Invalid text/thought type in messageBroadcast: text=${typeof data.text}, thought=${typeof data.thought}`
      );
      console.log("[SocketIO Listener] 'messageBroadcast' event received from server:", data);

      const targetRoom = data.roomId;
      const isActive = this.activeRooms.has(targetRoom);
      console.log(
        `[SocketIO Listener] Checking if room '${targetRoom}' is active. Active rooms: [${Array.from(this.activeRooms).join(', ')}]. Result: ${isActive}`
      );

      if (isActive) {
        console.log(`[SocketIO Listener] Room ${data.roomId} is active. Emitting internal event.`);
        this.emit('messageBroadcast', data);
      } else {
        console.warn(
          `[SocketIO Listener] Ignoring message for inactive room ${data.roomId}. Active: ${Array.from(this.activeRooms).join(', ')}`
        );
      }
    });

    this.socket.on('controlMessage', (data: ControlMessageData) => {
      assert(data, '[SocketIO Listener] Received null/undefined controlMessage data.');
      if (!data) return;
      assert(
        typeof data.roomId === 'string',
        `[SocketIO Listener] Invalid roomId in controlMessage: ${data.roomId}`
      );
      assert(
        data.action === 'enable_input' || data.action === 'disable_input',
        `[SocketIO Listener] Invalid action in controlMessage: ${data.action}`
      );
      console.debug('[SocketIO] Raw controlMessage received:', data);
      if (this.activeRooms.has(data.roomId)) {
        console.info(`[SocketIO] Handling control message for active room ${data.roomId}`);
        this.emit('controlMessage', data);
      } else {
        console.warn(
          `[SocketIO] Ignoring control message for inactive room ${data.roomId}. Active: ${Array.from(this.activeRooms).join(', ')}`
        );
      }
    });

    if (process.env.NODE_ENV === 'development') {
      this.socket.onAny((event, ...args) => {
        console.log(`[SocketIO DEBUG] Event Received: '${event}' Args:`, args);
      });
      this.socket.onAnyOutgoing((event, ...args) => {
        console.log(`[SocketIO DEBUG] Event Sent: '${event}' Args:`, args);
      });
    }
  }

  private async ensureConnected(): Promise<void> {
    assert(this.socket, '[SocketIO ensureConnected] Socket is not initialized.');
    if (!this.socket) throw new Error('Socket not initialized');

    if (this.isConnected) {
      return;
    }

    if (this.connectPromise) {
      console.log('[SocketIO] Waiting for existing connection attempt...');
      await this.connectPromise;
      console.log('[SocketIO] Connection established.');
      if (!this.isConnected) {
        console.error(
          '[SocketIO ensureConnected] connectPromise resolved but still not connected!'
        );
        throw new Error('Socket connection failed after waiting.');
      }
    } else {
      console.error(
        '[SocketIO ensureConnected] Not connected and no connectPromise found. Socket may not be initializing correctly.'
      );
      throw new Error('Socket connection failed or not initiated.');
    }
  }

  /**
   * Joins a specific room on the server.
   */
  public async joinRoom(roomId: string): Promise<void> {
    assert(roomId && typeof roomId === 'string', `[SocketIO joinRoom] Invalid roomId: ${roomId}`);
    if (!roomId) return;

    await this.ensureConnected();

    if (!this.activeRooms.has(roomId)) {
      this.activeRooms.add(roomId);
      const payload = {
        roomId,
        entityId: this.entityId,
        agentIds: this.agentIds,
      };
      assert(
        typeof SOCKET_MESSAGE_TYPE.ROOM_JOINING === 'number',
        '[SocketIO joinRoom] SOCKET_MESSAGE_TYPE.ROOM_JOINING is not a number!'
      );
      assert(
        payload.entityId && typeof payload.entityId === 'string',
        '[SocketIO joinRoom] Invalid entityId in payload.'
      );
      this.socket!.emit('message', {
        type: SOCKET_MESSAGE_TYPE.ROOM_JOINING,
        payload: payload,
      });
      console.info(
        `[SocketIO] Emitted ROOM_JOINING for room ${roomId} with entity ${this.entityId}`
      );
    } else {
      console.log(`[SocketIO] Already in room ${roomId}, no need to rejoin.`);
    }
  }

  /**
   * Leaves a specific room.
   */
  public leaveRoom(roomId: string): void {
    if (!this.socket) {
      console.warn(`[SocketIO] Cannot leave room ${roomId}: socket not initialized.`);
      return;
    }
    if (this.activeRooms.has(roomId)) {
      this.activeRooms.delete(roomId);
      console.info(`[SocketIO] Left room ${roomId}`);
    }
  }

  /**
   * Sends a chat message to a room.
   */
  public async sendMessage(
    message: string,
    roomId: string,
    source: string,
    worldId: string
  ): Promise<void> {
    assert(
      roomId && typeof roomId === 'string',
      `[SocketIO sendMessage] Invalid roomId: ${roomId}`
    );
    assert(
      message !== undefined && message !== null,
      `[SocketIO sendMessage] Invalid message: ${message}`
    );
    assert(
      source && typeof source === 'string',
      `[SocketIO sendMessage] Invalid source: ${source}`
    );
    assert(
      worldId && typeof worldId === 'string',
      `[SocketIO sendMessage] Invalid worldId: ${worldId}`
    );
    if (!roomId || message === null || message === undefined || !source || !worldId) {
      console.error('[SocketIO sendMessage] Send cancelled due to invalid parameters.');
      return;
    }

    await this.ensureConnected();

    const payload = {
      senderId: this.entityId,
      senderName: 'User',
      message,
      roomId,
      worldId,
      source,
      createdAt: Date.now(),
    };

    assert(
      typeof SOCKET_MESSAGE_TYPE.SEND_MESSAGE === 'number',
      '[SocketIO sendMessage] SOCKET_MESSAGE_TYPE.SEND_MESSAGE is not a number!'
    );
    assert(
      payload.senderId && typeof payload.senderId === 'string',
      '[SocketIO sendMessage] Invalid senderId in payload.'
    );
    console.log("[SocketIO sendMessage] Emitting 'message' event with payload:", {
      type: SOCKET_MESSAGE_TYPE.SEND_MESSAGE,
      payload,
    });
    this.socket!.emit('message', {
      type: SOCKET_MESSAGE_TYPE.SEND_MESSAGE,
      payload,
    });
    console.info(`[SocketIO sendMessage] Successfully emitted SEND_MESSAGE to room ${roomId}`);
  }

  /**
   * Disconnects the socket and cleans up.
   */
  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.activeRooms.clear();
      this.connectPromise = null;
      this.resolveConnect = null;
      console.info('[SocketIO] Disconnected and cleaned up.');
    }
  }
}

export default SocketIOManager;
