'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { SwarmEvent, ActivityLevel } from './types'

type ActivityFeedProps = {
  events: Array<SwarmEvent>
  level: ActivityLevel
  filterWorkerId?: string | null
  className?: string
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function eventIcon(kind: SwarmEvent['kind']): string {
  switch (kind) {
    case 'checkpoint': return '✓'
    case 'blocked': return '⚠'
    case 'unblocked': return '↺'
    case 'file_edit': return '✎'
    case 'tool_use': return '⚙'
    case 'log_tail': return '▶'
    case 'cancelled': return '✕'
    case 'mission_state': return '◆'
    case 'assignment_state': return '→'
    default: return '·'
  }
}

function eventSummaryL1(evt: SwarmEvent): string {
  switch (evt.kind) {
    case 'checkpoint': {
      const stateLabel = evt.payload.stateLabel as string | undefined
      const result = evt.payload.result as string | undefined
      return stateLabel ? `Checkpoint ${stateLabel}${result ? `: ${result.slice(0, 80)}` : ''}` : 'Checkpoint'
    }
    case 'blocked': {
      const blocker = evt.payload.blocker as string | undefined
      const msg = evt.payload.message as string | undefined
      return `Blocked${blocker ? `: ${blocker.slice(0, 80)}` : msg ? `: ${msg.slice(0, 80)}` : ''}`
    }
    case 'unblocked': return 'Unblocked — resuming'
    case 'file_edit': return `Edited ${(evt.payload.path as string | undefined) ?? 'file'}`
    case 'tool_use': return `Ran: ${(evt.payload.input as string | undefined)?.slice(0, 60) ?? (evt.payload.tool as string | undefined) ?? 'tool'}`
    case 'log_tail': return (evt.payload.lines as string | undefined)?.split('\n').at(-1)?.slice(0, 80) ?? 'terminal output'
    case 'cancelled': return `Cancelled${evt.payload.reason ? `: ${(evt.payload.reason as string).slice(0, 60)}` : ''}`
    case 'mission_state': return `Mission: ${(evt.payload.state as string | undefined) ?? ''}`
    case 'assignment_state': return `Assignment: ${(evt.payload.message as string | undefined)?.slice(0, 60) ?? 'state changed'}`
    default: return evt.kind
  }
}

export function ActivityFeed({ events, level, filterWorkerId, className }: ActivityFeedProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [newCount, setNewCount] = useState(0)
  const isAtBottomRef = useRef(true)
  const prevLengthRef = useRef(events.length)

  const filtered = filterWorkerId
    ? events.filter((e) => !e.workerId || e.workerId === filterWorkerId)
    : events

  const visible = level === 'L3'
    ? filtered.filter((e) => e.kind === 'log_tail')
    : filtered.filter((e) => e.kind !== 'log_tail')

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    function onScroll() {
      if (!container) return
      const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 60
      isAtBottomRef.current = atBottom
      if (atBottom) setNewCount(0)
    }
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => container.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const added = visible.length - prevLengthRef.current
    prevLengthRef.current = visible.length
    if (added <= 0) return
    if (isAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    } else {
      setNewCount((n) => n + added)
    }
  }, [visible.length])

  return (
    <div className={cn('relative flex flex-col overflow-hidden', className)}>
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto px-3 py-2 space-y-1"
        style={{ fontFamily: level === 'L3' ? 'JetBrains Mono, monospace' : undefined, fontSize: level === 'L3' ? 11 : 12 }}
      >
        {visible.length === 0 ? (
          <div className="py-6 text-center text-xs text-[var(--theme-muted)]">No activity yet.</div>
        ) : visible.map((evt, i) => (
          <div key={`${evt.ts}-${i}`} className="group flex items-start gap-2 rounded-md px-2 py-1 hover:bg-[var(--theme-card2)]">
            <span className="mt-px shrink-0 text-[10px] text-[var(--theme-muted)]">{formatTime(evt.ts)}</span>
            <span className={cn(
              'shrink-0 text-[11px] font-mono',
              evt.kind === 'blocked' ? 'text-[var(--theme-warning)]' :
              evt.kind === 'cancelled' ? 'text-[var(--theme-danger)]' :
              evt.kind === 'checkpoint' ? 'text-[var(--theme-accent)]' :
              'text-[var(--theme-muted)]',
            )}>{eventIcon(evt.kind)}</span>
            {evt.workerId ? (
              <span className="shrink-0 rounded-full bg-[var(--theme-card2)] px-1.5 py-px text-[9px] font-medium text-[var(--theme-muted)] uppercase tracking-wide">{evt.workerId.slice(0, 8)}</span>
            ) : null}
            <span className="flex-1 min-w-0 leading-relaxed text-[var(--theme-text)] break-words">
              {eventSummaryL1(evt)}
            </span>
            {level === 'L2' && Object.keys(evt.payload).length > 0 ? (
              <details className="mt-1 w-full">
                <summary className="cursor-pointer text-[9px] text-[var(--theme-muted)] hover:text-[var(--theme-text)]">payload</summary>
                <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded border border-[var(--theme-border)] bg-[var(--theme-bg)] p-2 text-[10px] text-[var(--theme-muted-2)]">{JSON.stringify(evt.payload, null, 2)}</pre>
              </details>
            ) : null}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      {newCount > 0 ? (
        <button
          type="button"
          onClick={() => {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
            setNewCount(0)
          }}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-[var(--theme-accent)] px-3 py-1 text-[11px] font-semibold text-primary-950 shadow-lg"
        >
          ↓ {newCount} new
        </button>
      ) : null}
    </div>
  )
}
