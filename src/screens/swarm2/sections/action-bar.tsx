'use client'

import { useState } from 'react'
import type { SwarmStatusPayload } from '@/lib/swarm/canonical-state'
import { CTA } from '@/lib/swarm/cta-copy'

interface ActionBarProps {
  status: SwarmStatusPayload
  swarmId: string
}

interface ActionButton {
  label: string
  primary?: boolean
  onClick: () => Promise<void> | void
}

async function postLifecycleAction(action: string, workerId?: string): Promise<void> {
  await fetch('/api/swarm-lifecycle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, workerId }),
  })
}

export function ActionBar({ status, swarmId }: ActionBarProps) {
  const [loading, setLoading] = useState<string | null>(null)

  const workerId = status.currentWorkerId ?? swarmId

  const handleAction = async (label: string, fn: () => Promise<void>) => {
    setLoading(label)
    try {
      await fn()
    } finally {
      setLoading(null)
    }
  }

  let primary: ActionButton | null = null
  let secondaries: ActionButton[] = []

  switch (status.status) {
    case 'not_started':
    case 'paused':
      primary = {
        label: CTA.START_OR_RESUME,
        primary: true,
        onClick: () => postLifecycleAction('start-or-resume', workerId),
      }
      break

    case 'running':
    case 'starting':
      primary = {
        label: CTA.SEND_GUIDANCE,
        primary: true,
        onClick: () => postLifecycleAction('start-or-resume', workerId),
      }
      secondaries = [
        { label: CTA.PAUSE, onClick: () => postLifecycleAction('pause', workerId) },
        { label: CTA.VIEW_WORKERS, onClick: () => {} },
      ]
      break

    case 'blocked':
      primary = {
        label: CTA.SEND_GUIDANCE,
        primary: true,
        onClick: () => postLifecycleAction('start-or-resume', workerId),
      }
      secondaries = [
        { label: CTA.REROUTE, onClick: () => postLifecycleAction('mark-blocked', workerId) },
        { label: CTA.ESCALATE_REVIEW, onClick: () => postLifecycleAction('mark-needs-review', workerId) },
        { label: CTA.OPEN_INCIDENT, onClick: () => {} },
      ]
      break

    case 'needs_review':
      primary = {
        label: CTA.APPROVE_MARK_READY,
        primary: true,
        onClick: () => postLifecycleAction('mark-ready', workerId),
      }
      secondaries = [
        { label: CTA.SEND_GUIDANCE, onClick: () => postLifecycleAction('start-or-resume', workerId) },
        { label: CTA.OPEN_INCIDENT, onClick: () => {} },
      ]
      break

    case 'ready':
      primary = {
        label: CTA.MARK_COMPLETE,
        primary: true,
        onClick: () => postLifecycleAction('complete', workerId),
      }
      secondaries = [
        { label: CTA.OPEN_PR, onClick: () => {} },
        { label: CTA.SEND_GUIDANCE, onClick: () => postLifecycleAction('start-or-resume', workerId) },
      ]
      break

    case 'recovering':
    case 'stale':
      primary = {
        label: CTA.RECOVER_RUNTIME,
        primary: true,
        onClick: () => postLifecycleAction('recover-runtime', workerId),
      }
      secondaries = [
        { label: CTA.VIEW_DETAILS, onClick: () => {} },
      ]
      break

    case 'failed':
      primary = {
        label: CTA.RETRY_WORKER,
        primary: true,
        onClick: () => postLifecycleAction('renew', workerId),
      }
      secondaries = [
        { label: CTA.ESCALATE_REVIEW, onClick: () => postLifecycleAction('mark-needs-review', workerId) },
        { label: CTA.VIEW_LOGS, onClick: () => {} },
      ]
      break

    case 'completed':
      primary = {
        label: CTA.VIEW_DETAILS,
        primary: false,
        onClick: () => {},
      }
      break

    default:
      primary = {
        label: CTA.VIEW_DETAILS,
        primary: false,
        onClick: () => {},
      }
  }

  const renderButton = (btn: ActionButton, key: string) => (
    <button
      key={key}
      type="button"
      disabled={loading !== null}
      onClick={() => handleAction(btn.label, async () => { await btn.onClick() })}
      className={[
        'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50',
        btn.primary
          ? 'bg-[var(--theme-accent,var(--color-accent-500))] text-white hover:bg-[var(--theme-accent-strong,var(--color-accent-600))]'
          : 'border border-[var(--theme-border,var(--color-primary-200))] bg-transparent text-[var(--theme-text,var(--color-ink))] hover:bg-[var(--theme-card,var(--color-primary-50))]',
      ].join(' ')}
    >
      {loading === btn.label ? '…' : btn.label}
    </button>
  )

  return (
    <div className="flex flex-wrap items-center gap-2">
      {primary && renderButton(primary, 'primary')}
      {secondaries.map((btn, i) => renderButton(btn, `secondary-${i}`))}
    </div>
  )
}
