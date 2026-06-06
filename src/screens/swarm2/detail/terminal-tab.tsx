'use client'

import { useState } from 'react'
import { SwarmTerminal } from '@/components/swarm/swarm-terminal'
import { cn } from '@/lib/utils'

type TerminalTabProps = {
  workerIds: Array<string>
  isActive?: boolean
  className?: string
}

export function TerminalTab({ workerIds, isActive = true, className }: TerminalTabProps) {
  const [activeWorker, setActiveWorker] = useState(workerIds[0] ?? '')

  if (workerIds.length === 0) {
    return (
      <div className={cn('flex-1 flex items-center justify-center text-xs text-[var(--theme-muted)]', className)}>
        No workers assigned.
      </div>
    )
  }

  return (
    <div className={cn('flex flex-1 flex-col overflow-hidden', className)}>
      {workerIds.length > 1 ? (
        <div className="flex shrink-0 gap-1 border-b border-[var(--theme-border)] px-3 pt-2 pb-0">
          {workerIds.map((wId) => (
            <button
              key={wId}
              type="button"
              onClick={() => setActiveWorker(wId)}
              className={cn(
                'rounded-t-md border-b-2 px-3 py-1.5 text-xs font-medium transition-colors',
                activeWorker === wId
                  ? 'border-[var(--theme-accent)] text-[var(--theme-accent)]'
                  : 'border-transparent text-[var(--theme-muted)] hover:text-[var(--theme-text)]',
              )}
            >
              {wId}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex-1 overflow-hidden p-3">
        {workerIds.map((wId) => (
          <div key={wId} className={cn('h-full', activeWorker !== wId && 'hidden')}>
            <SwarmTerminal
              workerId={wId}
              command={['tmux', 'attach-session', '-t', `swarm-${wId}`, '-r']}
              active={isActive && activeWorker === wId}
              className="h-full"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
