'use client'

import { useEffect, useRef, useState } from 'react'

interface TimelineEvent {
  kind: string
  missionId?: string
  assignmentId?: string
  workerId?: string
  ts: number
  payload?: {
    message?: string
    data?: Record<string, unknown>
    mission?: unknown
    assignment?: unknown
  }
}

interface TimelineListProps {
  swarmId: string
}

function formatEventKind(kind: string): string {
  return kind.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function TimelineList({ swarmId }: TimelineListProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!swarmId) return

    // Try to connect to mission events for this swarm (treated as missionId)
    const url = `/api/swarm-mission-events?missionId=${encodeURIComponent(swarmId)}`
    const es = new EventSource(url)
    esRef.current = es

    es.onopen = () => {
      setConnected(true)
      setError(null)
    }

    es.onerror = () => {
      setConnected(false)
      setError('Event stream disconnected')
    }

    const handleEvent = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data as string) as TimelineEvent
        setEvents((prev) => {
          // Deduplicate by ts + kind
          const key = `${data.kind}:${data.ts}`
          if (prev.some((ev) => `${ev.kind}:${ev.ts}` === key)) return prev
          return [data, ...prev].slice(0, 200)
        })
      } catch {
        // ignore parse errors
      }
    }

    es.addEventListener('history', handleEvent)
    es.addEventListener('checkpoint', handleEvent)
    es.addEventListener('assignment_state', handleEvent)
    es.addEventListener('mission_state', handleEvent)
    es.addEventListener('blocked', handleEvent)
    es.addEventListener('cancelled', handleEvent)

    return () => {
      es.close()
      esRef.current = null
    }
  }, [swarmId])

  if (error && events.length === 0) {
    return (
      <p className="text-xs text-[var(--theme-muted,var(--color-primary-600))] italic">
        {error} — history unavailable for this swarm.
      </p>
    )
  }

  if (!connected && events.length === 0) {
    return (
      <p className="text-xs text-[var(--theme-muted,var(--color-primary-600))] italic">
        Connecting to mission event stream…
      </p>
    )
  }

  if (events.length === 0) {
    return (
      <p className="text-xs text-[var(--theme-muted,var(--color-primary-600))] italic">
        No events yet.
      </p>
    )
  }

  return (
    <ol className="flex flex-col gap-2">
      {events.map((ev, i) => (
        <li
          key={`${ev.kind}:${ev.ts}:${i}`}
          className="flex items-start gap-3 text-sm"
        >
          <span className="shrink-0 font-mono text-xs text-[var(--theme-muted,var(--color-primary-600))] pt-0.5 w-20">
            {formatTime(ev.ts)}
          </span>
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="font-medium text-[var(--theme-text,var(--color-ink))]">
              {formatEventKind(ev.kind)}
            </span>
            {ev.payload?.message && (
              <span className="text-xs text-[var(--theme-muted,var(--color-primary-700))] truncate">
                {ev.payload.message}
              </span>
            )}
            {ev.workerId && (
              <span className="text-xs font-mono text-[var(--theme-muted,var(--color-primary-600))]">
                {ev.workerId}
              </span>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}
