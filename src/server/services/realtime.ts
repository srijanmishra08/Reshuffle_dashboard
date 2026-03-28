type RealtimeEvent = {
  type: string;
  ts: number;
  payload?: Record<string, unknown>;
};

type RealtimeListener = (event: RealtimeEvent) => void;

declare global {
  var realtimeTopicListeners: Map<string, Set<RealtimeListener>> | undefined;
}

function getTopicListeners(topic: string) {
  if (!global.realtimeTopicListeners) {
    global.realtimeTopicListeners = new Map<string, Set<RealtimeListener>>();
  }

  let listeners = global.realtimeTopicListeners.get(topic);

  if (!listeners) {
    listeners = new Set<RealtimeListener>();
    global.realtimeTopicListeners.set(topic, listeners);
  }

  return listeners;
}

export function subscribeRealtime(topic: string, listener: RealtimeListener) {
  const listeners = getTopicListeners(topic);
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function publishRealtime(topic: string, event: Omit<RealtimeEvent, "ts"> & { ts?: number }) {
  if (!global.realtimeTopicListeners) {
    return;
  }

  const listeners = global.realtimeTopicListeners.get(topic);

  if (!listeners || listeners.size === 0) {
    return;
  }

  const nextEvent: RealtimeEvent = {
    ...event,
    ts: event.ts ?? Date.now(),
  };

  for (const listener of listeners) {
    listener(nextEvent);
  }
}
