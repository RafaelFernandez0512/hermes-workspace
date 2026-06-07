import { delimiter } from 'node:path'

export function buildSpawnPath(
  prependEntries: Array<string | undefined | null>,
  currentPath: string | undefined = process.env.PATH,
  pathDelimiter: string = delimiter,
): string {
  return [...prependEntries, currentPath]
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .join(pathDelimiter)
}
