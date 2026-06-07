import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { deleteTarget } from '../../../server/workspace-targets/store'

export const Route = createFileRoute('/api/workspace-targets/delete')({
  server: {
    handlers: {
      DELETE: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const url = new URL(request.url)
        const id = url.searchParams.get('id')?.trim()
        if (!id) return json({ ok: false, error: 'Missing id' }, { status: 400 })

        await deleteTarget(id)
        return json({ ok: true })
      },
    },
  },
})
