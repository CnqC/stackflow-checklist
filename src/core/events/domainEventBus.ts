import type { AppNotice, WorkspaceSnapshot } from '../../types/models';

export interface DomainEventMap {
  'workspace:sanitized': {
    workspaceId: string;
    workspaceCode: string;
    schemaVersion: number;
  };
  'snapshot:updated': {
    prev: WorkspaceSnapshot | null;
    next: WorkspaceSnapshot;
    activeMemberId: string | null;
  };
  'notices:detected': {
    workspaceId: string;
    targetMemberId: string;
    notices: AppNotice[];
  };
  'notices:changed': {
    workspaceId: string;
    memberId: string;
    notices: AppNotice[];
  };
}

export type DomainEventName = keyof DomainEventMap;
export type DomainEventHandler<TPayload> = (payload: TPayload) => void;

export class DomainEventBus<TEventMap extends object = DomainEventMap> {
  private listeners = new Map<keyof TEventMap, Set<DomainEventHandler<unknown>>>();

  public on<K extends keyof TEventMap>(
    event: K,
    handler: DomainEventHandler<TEventMap[K]>,
  ): () => void {
    let bucket = this.listeners.get(event);
    if (!bucket) {
      bucket = new Set();
      this.listeners.set(event, bucket);
    }
    const typedHandler = handler as DomainEventHandler<unknown>;
    bucket.add(typedHandler);

    return () => {
      const current = this.listeners.get(event);
      if (!current) return;
      current.delete(typedHandler);
      if (current.size === 0) {
        this.listeners.delete(event);
      }
    };
  }

  public once<K extends keyof TEventMap>(
    event: K,
    handler: DomainEventHandler<TEventMap[K]>,
  ): () => void {
    const off = this.on(event, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  public emit<K extends keyof TEventMap>(event: K, payload: TEventMap[K]): void {
    const bucket = this.listeners.get(event);
    if (!bucket || bucket.size === 0) return;

    for (const listener of [...bucket]) {
      listener(payload);
    }
  }

  public clear(event?: keyof TEventMap): void {
    if (event !== undefined) {
      this.listeners.delete(event);
      return;
    }
    this.listeners.clear();
  }

  public listenerCount(event: keyof TEventMap): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}

export const domainEventBus = new DomainEventBus<DomainEventMap>();
