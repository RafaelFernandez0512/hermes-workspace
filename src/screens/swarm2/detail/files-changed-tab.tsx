'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { SwarmEvent } from './types'

type FilesChangedTabProps = {
  events: Array<SwarmEvent>
  className?: string
}

type FileEntry = {
  path: string
  count: number
}

export function FilesChangedTab({ events, className }: FilesChangedTabProps) {
  const files = useMemo(() => {
    const map = new Map<string, number>()
    for (const evt of events) {
      if (evt.kind === 'file_edit') {
        const path = evt.payload.path as string | undefined
        if (path) map.set(path, (map.get(path) ?? 0) + 1)
      }
      if (evt.kind === 'checkpoint') {
        const fc = evt.payload.filesChanged as string | undefined
        if (fc && fc !== 'none') {
          for (const p of fc.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean)) {
            map.set(p, (map.get(p) ?? 0) + 1)
          }
        }
      }
    }
    const entries: Array<FileEntry> = []
    for (const [path, count] of map.entries()) {
      entries.push({ path, count })
    }
    return entries.sort((a, b) => a.path.localeCompare(b.path))
  }, [events])

  function openFile(path: string) {
    const url = `/api/files?path=${encodeURIComponent(path)}`
    window.open(url, '_blank')
  }

  return (
    <div className={cn('flex-1 overflow-y-auto px-3 py-2', className)}>
      {files.length === 0 ? (
        <div className="py-6 text-center text-xs text-[var(--theme-muted)]">No file edits recorded yet.</div>
      ) : (
        <ul className="space-y-1">
          {files.map((entry) => (
            <li key={entry.path}>
              <button
                type="button"
                onClick={() => openFile(entry.path)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--theme-card2)]"
              >
                <span className="font-mono text-[11px] text-[var(--theme-muted)]">✎</span>
                <span className="flex-1 min-w-0 truncate font-mono text-xs text-[var(--theme-text)]">{entry.path}</span>
                {entry.count > 1 ? (
                  <span className="shrink-0 rounded-full bg-[var(--theme-card2)] px-1.5 py-px text-[9px] text-[var(--theme-muted)]">
                    ×{entry.count}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
