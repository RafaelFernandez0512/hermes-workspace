import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { loadTargetsFile } from '../../../server/workspace-targets/store'

export const Route = createFileRoute('/api/workspace-targets/list')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const file = await loadTargetsFile()
        return json({ ok: true, targets: file.targets, activeTargetId: file.activeTargetId })
      },
    },
  },
})
