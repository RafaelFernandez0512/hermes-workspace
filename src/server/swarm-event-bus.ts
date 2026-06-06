export type SwarmEventKind =
  | 'mission_state'
  | 'assignment_state'
  | 'checkpoint'
  | 'blocked'
  | 'unblocked'
  | 'tool_use'
  | 'file_edit'
  | 'log_tail'
  | 'cancelled'
  | 'heartbeat'

export type SwarmBusEvent = {
  kind: SwarmEventKind
  missionId: string
  assignmentId?: string
  workerId?: string
  ts: number
  payload: Record<string, unknown>
}

type Subscriber = (event: SwarmBusEvent) => void

const BUS_KEY = '__hermesSwarmEventBus__' as const

interface BusState {
  subscribers: Map<string, Set<Subscriber>>
}

function getBus(): BusState {
  if (!(globalThis as Record<string, unknown>)[BUS_KEY]) {
    ;(globalThis as Record<string, unknown>)[BUS_KEY] = {
      subscribers: new Map<string, Set<Subscriber>>(),
    }
  }
  return (globalThis as Record<string, unknown>)[BUS_KEY] as BusState
}

export function subscribe(missionId: string, fn: Subscriber): () => void {
  const bus = getBus()
  if (!bus.subscribers.has(missionId)) {
    bus.subscribers.set(missionId, new Set())
  }
  bus.subscribers.get(missionId)!.add(fn)
  return () => {
    bus.subscribers.get(missionId)?.delete(fn)
    if (bus.subscribers.get(missionId)?.size === 0) {
      bus.subscribers.delete(missionId)
    }
  }
}

export function publishSwarmEvent(event: SwarmBusEvent): void {
  const bus = getBus()
  const subs = bus.subscribers.get(event.missionId)
  if (!subs || subs.size === 0) return
  for (const sub of subs) {
    try {
      sub(event)
    } catch {
      /* subscriber error — don't crash the bus */
    }
  }
}

export function subscriberCount(missionId: string): number {
  return getBus().subscribers.get(missionId)?.size ?? 0
}
