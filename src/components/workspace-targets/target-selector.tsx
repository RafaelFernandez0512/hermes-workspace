import { useEffect, useRef, useState } from 'react'
import { useWorkspaceTargetStore } from '@/stores/workspace-target-store'
import { cn } from '@/lib/utils'

export function TargetSelector() {
  const { targets, activeTargetId, isLoaded, load, setActive } = useWorkspaceTargetStore()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isLoaded) load()
  }, [isLoaded, load])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const activeTarget = targets.find((t) => t.id === activeTargetId)
  const label = activeTarget ? activeTarget.name : 'Default'
  const isRemote = Boolean(activeTarget)

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono transition-colors',
          isRemote
            ? 'bg-amber-950/50 border border-amber-700/50 text-amber-300 hover:bg-amber-900/50'
            : 'bg-muted/30 border border-border/40 text-muted-foreground hover:bg-muted/50',
        )}
        title="Workspace Target"
      >
        <span className={cn('w-1.5 h-1.5 rounded-full', isRemote ? 'bg-amber-400' : 'bg-emerald-500')} />
        <span>{label}</span>
        <span className="opacity-50">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] bg-popover border border-border rounded shadow-lg py-1 text-sm">
          <button
            onClick={() => { setActive(undefined); setOpen(false) }}
            className={cn(
              'w-full text-left px-3 py-1.5 hover:bg-muted/50 flex items-center gap-2',
              !activeTargetId && 'text-emerald-400',
            )}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Default
          </button>
          {targets.map((t) => (
            <button
              key={t.id}
              onClick={() => { setActive(t.id); setOpen(false) }}
              className={cn(
                'w-full text-left px-3 py-1.5 hover:bg-muted/50 flex items-center gap-2',
                activeTargetId === t.id && 'text-amber-300',
              )}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              {t.name}
            </button>
          ))}
          {targets.length === 0 && (
            <div className="px-3 py-1.5 text-muted-foreground text-xs">No targets configured</div>
          )}
        </div>
      )}
    </div>
  )
}
