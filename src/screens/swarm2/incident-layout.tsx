'use client'

import type { SwarmStatusPayload } from '@/lib/swarm/canonical-state'
import { IncidentSummary } from './sections/incident-summary'
import { WhyBlocked } from './sections/why-blocked'
import { ActionBar } from './sections/action-bar'
import { TimelineList } from './sections/timeline-list'

interface IncidentLayoutProps {
  swarmId: string
  status: SwarmStatusPayload
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="sticky top-0 z-10 bg-[var(--theme-bg,var(--color-surface))] border-b border-[var(--theme-border,var(--color-primary-200))] px-4 py-2">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--theme-muted,var(--color-primary-700))]">
        {title}
      </h2>
    </div>
  )
}

export function IncidentLayout({ swarmId, status }: IncidentLayoutProps) {
  return (
    <div className="flex flex-col gap-0 overflow-auto h-full">
      {/* Section 1: Summary */}
      <section aria-label="Summary">
        <SectionHeader title="Summary" />
        <div className="px-4 py-3">
          <IncidentSummary status={status} />
        </div>
      </section>

      {/* Section 2: Why blocked */}
      <section aria-label="Why blocked">
        <SectionHeader title="Why blocked" />
        <div className="px-4 py-3">
          <WhyBlocked status={status} swarmId={swarmId} />
        </div>
      </section>

      {/* Section 3: What to do now */}
      <section aria-label="What to do now">
        <SectionHeader title="What to do now" />
        <div className="px-4 py-3">
          <ActionBar status={status} swarmId={swarmId} />
        </div>
      </section>

      {/* Section 4: History */}
      <section aria-label="History">
        <SectionHeader title="History" />
        <div className="px-4 py-3">
          <TimelineList swarmId={swarmId} />
        </div>
      </section>
    </div>
  )
}
