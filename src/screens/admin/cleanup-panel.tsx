'use client'

import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'

type CleanupCounts = {
  orphanedCards: number
  archivedMissions: number
  archivedCards: number
  staleSessions: number
}

type DryRunResult = {
  dryRun: true
  counts: CleanupCounts
  orphanedCardIds: Array<string>
  archivedMissionIds: Array<string>
  archivedCardIds: Array<string>
}

type RunResult = {
  action: string
  dryRun: false
  count: number
  deletedCardIds?: Array<string>
  deletedMissionIds?: Array<string>
  archivedIds?: Array<string>
}

async function fetchDryRun(): Promise<DryRunResult> {
  const res = await fetch('/api/admin/cleanup?action=dry-run')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<DryRunResult>
}

async function runCleanup(action: string): Promise<RunResult> {
  const res = await fetch('/api/admin/cleanup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  })
  if (!res.ok) {
    const data = (await res.json()) as { error?: string }
    throw new Error(data.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<RunResult>
}

type JobLog = { ts: number; text: string; kind: 'info' | 'success' | 'error' }

export function CleanupPanel() {
  const [log, setLog] = useState<Array<JobLog>>([])
  const [confirmed, setConfirmed] = useState<string | null>(null)

  const dryRunQuery = useQuery({
    queryKey: ['admin', 'cleanup', 'dry-run'],
    queryFn: fetchDryRun,
    staleTime: 30_000,
  })

  const runMutation = useMutation({
    mutationFn: (action: string) => runCleanup(action),
    onMutate: (action) => {
      setLog((prev) => [
        ...prev,
        { ts: Date.now(), text: `Running cleanup: ${action}…`, kind: 'info' },
      ])
    },
    onSuccess: (data) => {
      setLog((prev) => [
        ...prev,
        {
          ts: Date.now(),
          text: `Done — ${data.count} records affected (action: ${data.action})`,
          kind: 'success',
        },
      ])
      setConfirmed(null)
      dryRunQuery.refetch()
    },
    onError: (err) => {
      setLog((prev) => [
        ...prev,
        {
          ts: Date.now(),
          text: `Error: ${err instanceof Error ? err.message : String(err)}`,
          kind: 'error',
        },
      ])
      setConfirmed(null)
    },
  })

  const dryRun = dryRunQuery.data

  const actions: Array<{
    id: string
    label: string
    description: string
    danger?: boolean
  }> = [
    {
      id: 'orphans',
      label: 'Delete orphaned cards',
      description:
        'Cards whose missionId points to a mission that no longer exists.',
    },
    {
      id: 'archived',
      label: 'Purge archived',
      description: 'Hard-delete all archived missions and their child cards.',
      danger: true,
    },
    {
      id: 'stale-sessions',
      label: 'Archive stale missions',
      description:
        'Archive missions idle >6h with all assignments in terminal state.',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--theme-muted)]">
          Admin
        </div>
        <h2 className="mt-1 text-xl font-semibold text-[var(--theme-text)]">
          Cleanup
        </h2>
        <p className="mt-1 text-sm text-[var(--theme-muted-2)]">
          Run dry-run first to preview, then execute. All operations are logged
          below.
        </p>
      </div>

      {/* Dry-run preview */}
      <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-[var(--theme-text)]">
            Dry-run preview
          </h3>
          <button
            type="button"
            onClick={() => dryRunQuery.refetch()}
            disabled={dryRunQuery.isFetching}
            className="rounded-lg border border-[var(--theme-border)] px-2 py-1 text-xs text-[var(--theme-muted)] hover:text-[var(--theme-text)] disabled:opacity-50"
          >
            {dryRunQuery.isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        {dryRunQuery.isError ? (
          <p className="text-sm text-red-600">
            Failed to load:{' '}
            {dryRunQuery.error instanceof Error
              ? dryRunQuery.error.message
              : 'Unknown error'}
          </p>
        ) : dryRunQuery.isPending ? (
          <p className="text-sm text-[var(--theme-muted)]">Loading…</p>
        ) : dryRun ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Orphaned cards', value: dryRun.counts.orphanedCards },
              {
                label: 'Archived missions',
                value: dryRun.counts.archivedMissions,
              },
              { label: 'Archived cards', value: dryRun.counts.archivedCards },
              { label: 'Stale sessions', value: dryRun.counts.staleSessions },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-3 text-center"
              >
                <div className="text-2xl font-bold text-[var(--theme-text)]">
                  {value}
                </div>
                <div className="mt-1 text-[10px] text-[var(--theme-muted)]">
                  {label}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Action buttons */}
      <div className="space-y-2">
        {actions.map((action) => (
          <div
            key={action.id}
            className="flex items-center justify-between gap-4 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-4 py-3"
          >
            <div>
              <div className="text-sm font-semibold text-[var(--theme-text)]">
                {action.label}
              </div>
              <div className="text-xs text-[var(--theme-muted-2)]">
                {action.description}
              </div>
            </div>
            {confirmed === action.id ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmed(null)}
                  className="rounded-lg border border-[var(--theme-border)] px-3 py-1.5 text-xs text-[var(--theme-muted)] hover:text-[var(--theme-text)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={runMutation.isPending}
                  onClick={() => runMutation.mutate(action.id)}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50',
                    action.danger
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'bg-[var(--theme-accent)] text-primary-950 hover:bg-[var(--theme-accent-strong)]',
                  )}
                >
                  {runMutation.isPending ? 'Running…' : 'Confirm'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={runMutation.isPending}
                onClick={() => setConfirmed(action.id)}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50',
                  action.danger
                    ? 'border-red-400/40 bg-red-500/10 text-red-700 hover:bg-red-500/20'
                    : 'border-[var(--theme-border)] bg-[var(--theme-bg)] text-[var(--theme-muted)] hover:text-[var(--theme-text)]',
                )}
              >
                Run
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Results log */}
      {log.length > 0 ? (
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--theme-muted)]">
            Log
          </div>
          <div className="max-h-48 overflow-y-auto rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-3 font-mono text-[11px]">
            {log.map((entry) => (
              <div
                key={entry.ts}
                className={cn(
                  'py-0.5',
                  entry.kind === 'error'
                    ? 'text-red-600'
                    : entry.kind === 'success'
                      ? 'text-emerald-600'
                      : 'text-[var(--theme-muted-2)]',
                )}
              >
                <span className="opacity-50">
                  {new Date(entry.ts).toLocaleTimeString()}
                </span>{' '}
                {entry.text}
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setLog([])}
              className="text-[10px] text-[var(--theme-muted)] hover:text-[var(--theme-text)]"
            >
              Clear log
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
