import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { CleanupPanel } from '@/screens/admin/cleanup-panel'

export const Route = createFileRoute('/admin')({
  ssr: false,
  component: function AdminRoute() {
    usePageTitle('Admin')
    return (
      <div className="min-h-screen bg-[var(--theme-bg)] px-4 py-8">
        <div className="mx-auto max-w-3xl">
          <CleanupPanel />
        </div>
      </div>
    )
  },
})
