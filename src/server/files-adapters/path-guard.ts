import path from 'node:path'

/**
 * Resolve `input` relative to `rootPath` and verify it stays within the root.
 * Rejects `..` traversal, absolute paths outside root, and Windows-style paths.
 * Returns the resolved absolute path.
 */
export function ensureWithinRoot(rootPath: string, input: string): string {
  const root = path.posix.resolve(rootPath)
  const normalized = input.replace(/\\/g, '/').replace(/^\/+/, '')
  const candidate = path.posix.resolve(root, normalized)
  const rel = path.posix.relative(root, candidate)
  if (!rel.startsWith('..') && !path.posix.isAbsolute(rel)) {
    return candidate
  }
  throw new Error('Path is outside SFTP root')
}
