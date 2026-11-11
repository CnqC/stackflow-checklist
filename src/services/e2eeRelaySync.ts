import mqtt, { type MqttClient } from 'mqtt';
import { normalizeRoomCode } from '../domain/stackDomain';
import type { PresencePeer, WorkspaceSnapshot } from '../types/models';

const RELAY_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
];

export interface EncryptedEnvelope {
  v: 1;
  senderId: string;
  sentAt: string;
  iv: string; // base64
  ct: string; // base64 ciphertext
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function deriveRoomTopicAndKey(
  roomCodeRaw: string,
  pinCodeRaw: string,
): Promise<{ topicBase: string; aesKey: CryptoKey }> {
  const code = normalizeRoomCode(roomCodeRaw);
  const pin = pinCodeRaw.trim();
  const enc = new TextEncoder();

  // Topic hash derived from roomCode + PIN so outsiders cannot guess or enumerate rooms
  const topicDigest = await crypto.subtle.digest(
    'SHA-256',
    enc.encode(`stackflow-room-topic-v1::${code}::${pin}`),
  );
  const topicHash = bytesToHex(new Uint8Array(topicDigest)).slice(0, 40);

  // Derive 256-bit AES-GCM key via PBKDF2
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(`${code}::${pin}`),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const salt = enc.encode(`stackflow-aes-salt-v1::${code}`);
  const aesKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 25000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );

  return {
    topicBase: `stackflow/v1/${topicHash}`,
    aesKey,
  };
}

export async function encryptPayload(
  aesKey: CryptoKey,
  senderId: string,
  data: unknown,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, plaintext);

  const envelope: EncryptedEnvelope = {
    v: 1,
    senderId,
    sentAt: new Date().toISOString(),
    iv: bytesToBase64(iv),
    ct: bytesToBase64(new Uint8Array(encrypted)),
  };
  return JSON.stringify(envelope);
}

export async function decryptPayload<T>(
  aesKey: CryptoKey,
  rawMessage: string,
): Promise<{ senderId: string; sentAt: string; data: T } | null> {
  try {
    const env = JSON.parse(rawMessage) as EncryptedEnvelope;
    if (!env || env.v !== 1 || !env.iv || !env.ct) return null;
    const iv = base64ToBytes(env.iv);
    const ct = base64ToBytes(env.ct);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      aesKey,
      ct as BufferSource,
    );
    const json = new TextDecoder().decode(decrypted);
    return {
      senderId: env.senderId,
      sentAt: env.sentAt,
      data: JSON.parse(json) as T,
    };
  } catch {
    return null;
  }
}

export interface RelayConnectionCallbacks {
  onRemoteSnapshot: (snapshot: WorkspaceSnapshot) => void;
  onRemotePresence: (clientId: string, peer: PresencePeer | null) => void;
  onConnectionChange: (connected: boolean) => void;
}

export class E2eeCloudRelaySession {
  private client: MqttClient | null = null;
  private aesKey: CryptoKey | null = null;
  private topicSnapshot = '';
  private topicPresencePrefix = '';
  private senderId: string;
  private callbacks: RelayConnectionCallbacks;
  private connected = false;

  constructor(senderId: string, callbacks: RelayConnectionCallbacks) {
    this.senderId = senderId;
    this.callbacks = callbacks;
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public async connectAndFetchInitial(
    roomCode: string,
    pinCode: string,
    waitMsForRetained = 1400,
  ): Promise<WorkspaceSnapshot | null> {
    this.disconnect();

    if (typeof window === 'undefined' || typeof WebSocket === 'undefined') {
      return null;
    }

    const { topicBase, aesKey } = await deriveRoomTopicAndKey(roomCode, pinCode);
    this.aesKey = aesKey;
    this.topicSnapshot = `${topicBase}/snapshot`;
    this.topicPresencePrefix = `${topicBase}/presence`;

    return new Promise<WorkspaceSnapshot | null>((resolve) => {
      let settled = false;
      const finish = (snap: WorkspaceSnapshot | null) => {
        if (!settled) {
          settled = true;
          resolve(snap);
        }
      };

      const timeout = setTimeout(() => {
        finish(null);
      }, waitMsForRetained + 1800);

      const client = mqtt.connect(RELAY_BROKERS[0], {
        clientId: `sf_${this.senderId.slice(0, 12)}_${Math.random().toString(36).slice(2, 6)}`,
        clean: true,
        connectTimeout: 3000,
        reconnectPeriod: 3000,
        will: {
          topic: `${this.topicPresencePrefix}/${this.senderId}`,
          payload: '',
          qos: 0,
          retain: false,
        },
      });

      this.client = client;

      client.on('connect', () => {
        this.connected = true;
        this.callbacks.onConnectionChange(true);
        client.subscribe([this.topicSnapshot, `${this.topicPresencePrefix}/+`], { qos: 1 }, () => {
          // Give retained snapshot a short window to arrive if room already exists on Cloud Relay
          setTimeout(() => {
            clearTimeout(timeout);
            finish(null);
          }, waitMsForRetained);
        });
      });

      client.on('close', () => {
        this.connected = false;
        this.callbacks.onConnectionChange(false);
      });

      client.on('error', () => {
        this.connected = false;
        this.callbacks.onConnectionChange(false);
      });

      client.on('message', (topic, payloadBuf) => {
        if (!this.aesKey) return;
        const text = payloadBuf.toString('utf-8');

        if (topic === this.topicSnapshot) {
          if (!text) return;
          void decryptPayload<WorkspaceSnapshot>(this.aesKey, text).then((res) => {
            if (!res) return;
            if (!settled) {
              clearTimeout(timeout);
              finish(res.data);
            }
            if (res.senderId !== this.senderId) {
              this.callbacks.onRemoteSnapshot(res.data);
            }
          });
          return;
        }

        if (topic.startsWith(`${this.topicPresencePrefix}/`)) {
          const peerClientId = topic.slice(this.topicPresencePrefix.length + 1);
          if (!text) {
            this.callbacks.onRemotePresence(peerClientId, null);
            return;
          }
          void decryptPayload<PresencePeer>(this.aesKey, text).then((res) => {
            if (!res) return;
            this.callbacks.onRemotePresence(peerClientId, res.data);
          });
        }
      });
    });
  }

  public async publishSnapshot(snapshot: WorkspaceSnapshot): Promise<void> {
    if (!this.client || !this.aesKey) return;
    const encrypted = await encryptPayload(this.aesKey, this.senderId, snapshot);
    this.client.publish(this.topicSnapshot, encrypted, { qos: 1, retain: true });
  }

  public async publishPresence(peer: PresencePeer | null): Promise<void> {
    if (!this.client || !this.aesKey) return;
    const topic = `${this.topicPresencePrefix}/${this.senderId}`;
    if (!peer) {
      this.client.publish(topic, '', { qos: 0, retain: false });
      return;
    }
    const encrypted = await encryptPayload(this.aesKey, this.senderId, peer);
    this.client.publish(topic, encrypted, { qos: 0, retain: false });
  }

  public disconnect(): void {
    if (this.client) {
      try {
        if (this.connected && this.topicPresencePrefix) {
          this.client.publish(`${this.topicPresencePrefix}/${this.senderId}`, '', { qos: 0 });
        }
        this.client.end(true);
      } catch {
        // Ignore close error
      }
      this.client = null;
    }
    this.connected = false;
    this.aesKey = null;
  }
}
