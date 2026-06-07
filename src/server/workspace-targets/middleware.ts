import { activeTargetAls } from './resolver'
import { loadTargetsFile } from './store'

function parseCookieHeader(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {}
  return Object.fromEntries(
    cookieHeader.split(';').map((pair) => {
      const [k, ...vs] = pair.trim().split('=')
      return [k.trim(), vs.join('=').trim()]
    }),
  )
}

/** Wrap a request handler so the ALS target context is set from headers/cookies. */
export function withTargetContext<T>(
  request: Request,
  fn: () => Promise<T>,
): Promise<T> {
  const headerId = request.headers.get('x-hermes-target-id') ?? undefined
  const cookieId =
    parseCookieHeader(request.headers.get('cookie'))['hermes_target_id'] ?? undefined
  const candidateId = headerId || cookieId

  if (!candidateId) {
    return activeTargetAls.run({ targetId: undefined }, fn)
  }

  // Validate the target exists before binding it to the context.
  return loadTargetsFile()
    .then((file) => {
      const valid = file.targets.some((t) => t.id === candidateId)
      const targetId = valid ? candidateId : undefined
      return activeTargetAls.run({ targetId }, fn)
    })
    .catch(() => activeTargetAls.run({ targetId: undefined }, fn))
}
