import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliCompressSync, constants as zlibConstants, gzipSync } from 'node:zlib'
import server from './dist/server/server.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const CLIENT_DIR = join(__dirname, 'dist', 'client')

const port = parseInt(process.env.PORT || '3000', 10)
// Default HOST to localhost-only. Operators who want the workspace reachable
// on a LAN / Tailscale / public surface must opt in explicitly with
// HOST=0.0.0.0 *and* set CLAUDE_PASSWORD (enforced below). See #122.
const host = process.env.HOST || '127.0.0.1'

function isNonLoopbackHost(h) {
  if (!h) return false
  const norm = h.trim().toLowerCase()
  if (norm === '127.0.0.1' || norm === '::1' || norm === 'localhost') {
    return false
  }
  return true
}

if (isNonLoopbackHost(host)) {
  // Honor HERMES_PASSWORD (current name) with CLAUDE_PASSWORD as a back-compat
  // fallback for deployments configured pre-rename.
  const password = (
    process.env.HERMES_PASSWORD ||
    process.env.CLAUDE_PASSWORD ||
    ''
  ).trim()
  if (!password) {
    console.error(
      '\n[workspace] refusing to start.\n' +
        `  HOST is set to "${host}" (non-loopback), but HERMES_PASSWORD is unset.\n` +
        '  This would expose a high-privilege control plane (terminals, files, agents)\n' +
        '  to anyone who can reach the port. Either:\n' +
        '    • set HOST=127.0.0.1 for local-only access, or\n' +
        '    • set HERMES_PASSWORD=<strong-secret> to enable workspace auth, or\n' +
        '    • set HERMES_ALLOW_INSECURE_REMOTE=1 to bypass this check (not recommended).\n' +
        '  See #122 for context.\n',
    )
    const allowInsecure = (
      process.env.HERMES_ALLOW_INSECURE_REMOTE ||
      process.env.CLAUDE_ALLOW_INSECURE_REMOTE ||
      ''
    )
      .trim()
      .toLowerCase()
    if (
      allowInsecure !== '1' &&
      allowInsecure !== 'true' &&
      allowInsecure !== 'yes'
    ) {
      process.exit(1)
    }
    console.warn(
      '[workspace] HERMES_ALLOW_INSECURE_REMOTE is set — starting anyway.',
    )
  }

  // Warn when serving over plain HTTP with a password: NODE_ENV=production
  // sets the Secure flag on session cookies, which browsers silently drop
  // over http://.  Operators must set COOKIE_SECURE=0 for plain-HTTP LAN
  // deployments.  See #149.
  const cookieSecureOverride = (process.env.COOKIE_SECURE || '')
    .trim()
    .toLowerCase()
  const cookieSecureExplicit =
    cookieSecureOverride === '0' ||
    cookieSecureOverride === 'false' ||
    cookieSecureOverride === 'no'
  if (!cookieSecureExplicit && process.env.NODE_ENV === 'production') {
    console.warn(
      '\n[workspace] warning: plain-HTTP LAN deployment detected.\n' +
        '  NODE_ENV=production enables the Secure flag on session cookies.\n' +
        '  Browsers silently drop Secure cookies over http://, so login will fail.\n' +
        '  Add COOKIE_SECURE=0 to your .env to fix this.  See #149.\n',
    )
  }
}

const MIME_TYPES = {
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.map': 'application/json',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
  '.webmanifest': 'application/manifest+json',
}

const COMPRESSIBLE_CONTENT_TYPES = [
  'application/javascript',
  'application/json',
  'application/manifest+json',
  'application/xml',
  'image/svg+xml',
  'text/css',
  'text/html',
  'text/plain',
]
const compressionCache = new Map()

function getPreferredEncoding(acceptEncoding = '') {
  const normalized = acceptEncoding.toLowerCase()
  if (normalized.includes('br')) return 'br'
  if (normalized.includes('gzip')) return 'gzip'
  return null
}

function isCompressible(contentType = '') {
  return COMPRESSIBLE_CONTENT_TYPES.some((type) =>
    contentType.startsWith(type),
  )
}

function getCompressedBuffer(data, filePath, fileStat, encoding) {
  const cacheKey = `${filePath}:${fileStat.mtimeMs}:${fileStat.size}:${encoding}`
  const cached = compressionCache.get(cacheKey)
  if (cached) return cached

  const compressed =
    encoding === 'br'
      ? brotliCompressSync(data, {
          params: {
            [zlibConstants.BROTLI_PARAM_QUALITY]: 5,
          },
        })
      : gzipSync(data, {
          level: 6,
        })

  compressionCache.set(cacheKey, compressed)
  return compressed
}

async function tryServeStatic(req, res) {
  const url = new URL(
    req.url || '/',
    `http://${req.headers.host || 'localhost'}`,
  )
  const pathname = decodeURIComponent(url.pathname)

  // Prevent directory traversal
  if (pathname.includes('..')) return false

  // Asset requests should never fall through to the SSR handler. If a browser
  // asks for a stale hashed JS/CSS chunk after a deploy or branch switch,
  // returning the HTML shell with 200 text/html makes the SPA fail as a black
  // screen. Return a real 404 instead so clients reload/recover correctly and
  // health checks can detect the broken asset reference.
  if (pathname.startsWith('/assets/')) {
    const filePath = join(CLIENT_DIR, pathname)
    if (!filePath.startsWith(CLIENT_DIR)) return false
    try {
      const fileStat = await stat(filePath)
      if (!fileStat.isFile()) throw new Error('not a file')
    } catch {
      res.writeHead(404, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      })
      res.end('Asset not found')
      return true
    }
  }

  const filePath = join(CLIENT_DIR, pathname)

  // Make sure the resolved path is within CLIENT_DIR
  if (!filePath.startsWith(CLIENT_DIR)) return false

  try {
    const fileStat = await stat(filePath)
    if (!fileStat.isFile()) return false

    const ext = extname(filePath).toLowerCase()
    const contentType = MIME_TYPES[ext] || 'application/octet-stream'
    const headers = {
      'Content-Type': contentType,
    }

    // Cache hashed assets aggressively (they have content hashes in filenames)
    if (pathname.startsWith('/assets/')) {
      headers['Cache-Control'] = 'public, max-age=31536000, immutable'
    }

    let data = null
    const shouldCompress =
      req.method !== 'HEAD' &&
      fileStat.size >= 1024 &&
      isCompressible(contentType) &&
      !req.headers.range

    if (shouldCompress) {
      const encoding = getPreferredEncoding(req.headers['accept-encoding'])
      if (encoding) {
        const rawData = await readFile(filePath)
        const compressed = getCompressedBuffer(rawData, filePath, fileStat, encoding)

        if (compressed.length < rawData.length) {
          data = compressed
          headers['Content-Encoding'] = encoding
          headers['Vary'] = 'Accept-Encoding'
        } else {
          data = rawData
        }
      }
    }

    if (!data && req.method !== 'HEAD') {
      data = await readFile(filePath)
    }

    headers['Content-Length'] = data ? data.length : fileStat.size

    res.writeHead(200, headers)
    if (req.method === 'HEAD') {
      res.end()
    } else {
      res.end(data)
    }
    return true
  } catch {
    return false
  }
}

async function requestHandler(req, res) {
  // Try static files first (client assets)
  if (req.method === 'GET' || req.method === 'HEAD') {
    const served = await tryServeStatic(req, res)
    if (served) return
  }

  // Fall through to SSR handler
  const url = new URL(
    req.url || '/',
    `http://${req.headers.host || 'localhost'}`,
  )

  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value)
  }

  let body = null
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await new Promise((resolve) => {
      const chunks = []
      req.on('data', (chunk) => chunks.push(chunk))
      req.on('end', () => resolve(Buffer.concat(chunks)))
    })
  }

  const request = new Request(url.toString(), {
    method: req.method,
    headers,
    body,
    duplex: 'half',
  })

  try {
    const response = await server.fetch(request)

    res.writeHead(
      response.status,
      Object.fromEntries(response.headers.entries()),
    )

    if (response.body) {
      const reader = response.body.getReader()
      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          res.write(value)
        }
        res.end()
      }
      pump().catch((err) => {
        console.error('Stream error:', err)
        res.end()
      })
    } else {
      const text = await response.text()
      res.end(text)
    }
  } catch (err) {
    console.error('Request error:', err)
    res.writeHead(500)
    res.end('Internal Server Error')
  }
}

function isEaddrInUse(error) {
  return Boolean(error && typeof error === 'object' && error.code === 'EADDRINUSE')
}

function maybeReapOrphanServerEntryProcesses() {
  const allowReap = (process.env.HERMES_REAP_ORPHAN_SERVER || '').trim().toLowerCase()
  if (allowReap !== '1' && allowReap !== 'true' && allowReap !== 'yes') return []

  try {
    const output = execFileSync('pgrep', ['-af', 'server-entry\.js'], { encoding: 'utf8' }).trim()
    if (!output) return []
    const killed = []
    for (const line of output.split('\n')) {
      const match = line.trim().match(/^(\d+)\s+(.+)$/)
      if (!match) continue
      const pid = Number(match[1])
      const cmd = match[2]
      if (!Number.isFinite(pid) || pid === process.pid) continue
      if (!cmd.includes('server-entry.js')) continue
      try {
        const cwd = execFileSync('readlink', ['-f', `/proc/${pid}/cwd`], { encoding: 'utf8' }).trim()
        if (cwd !== process.cwd()) continue
      } catch {
        continue
      }
      try {
        process.kill(pid, 'SIGTERM')
        killed.push(pid)
      } catch {
        /* ignore */
      }
    }
    return killed
  } catch {
    return []
  }
}

function listenOn(bindHost, retry = false) {
  const httpServer = createServer(requestHandler)
  httpServer.on('error', (error) => {
    if (isEaddrInUse(error)) {
      console.error(
        `\n[workspace] port ${port} is already in use on ${bindHost}.\n` +
          '  A stale node server-entry.js process may still be running.\n' +
          '  Inspect with: pgrep -af "server-entry.js"\n' +
          '  Or enable safe cleanup: HERMES_REAP_ORPHAN_SERVER=1\n',
      )
      const killed = retry ? [] : maybeReapOrphanServerEntryProcesses()
      if (!retry && killed.length > 0) {
        console.warn(`[workspace] requested cleanup for orphaned server-entry.js pids: ${killed.join(', ')}. Retrying bind…`)
        setTimeout(() => listenOn(bindHost, true), 750)
        return
      }
      process.exit(1)
      return
    }
    console.error('[workspace] server error:', error)
    process.exit(1)
  })
  httpServer.listen(port, bindHost, () => {
    console.log(`Hermes Workspace running at http://${bindHost}:${port}`)
  })
  return httpServer
}

listenOn(host)

// Cloudflared remote-managed ingress currently points at http://localhost:10280.
// On macOS, localhost may resolve to ::1 before 127.0.0.1; if Workspace only
// listens on IPv4 loopback, tunneled requests intermittently fail with
// `dial tcp [::1]:10280: connect: connection refused`. Keep the default
// local-only security posture while also serving IPv6 loopback.
if (host === '127.0.0.1') {
  listenOn('::1')
}
