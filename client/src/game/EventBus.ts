import type { BattleState } from "@xstellar/shared";

type EventMap = {
  "battle-state": BattleState;
};

class TypedEventBus {
  private listeners: { [K in keyof EventMap]: Set<(payload: EventMap[K]) => void> } = {
    "battle-state": new Set(),
  };

  on<K extends keyof EventMap>(event: K, listener: (payload: EventMap[K]) => void): () => void {
    this.listeners[event].add(listener);
    return () => this.listeners[event].delete(listener);
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    this.listeners[event].forEach((listener) => listener(payload));
  }
}

export const eventBus = new TypedEventBus();
