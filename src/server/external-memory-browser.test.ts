import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

let tempRoot = ''
let hindsightServer: http.Server | null = null
let hindsightBaseUrl = ''

function makeProviderConfig() {
  fs.writeFileSync(
    path.join(tempRoot, 'external_memory_providers.json'),
    JSON.stringify({
      providers: [
        {
          id: 'custom_provider',
          label: 'Custom Provider',
          db_path: 'custom_provider/knowledge.sqlite',
          config_path: 'custom_provider.json',
        },
      ],
    }),
  )
  fs.mkdirSync(path.join(tempRoot, 'custom_provider'), { recursive: true })
  fs.writeFileSync(
    path.join(tempRoot, 'custom_provider.json'),
    JSON.stringify({ vector_collection: 'external_memory_collection' }),
  )
}

function seedCandidateDb() {
  const dbPath = path.join(tempRoot, 'custom_provider/knowledge.sqlite')
  execFileSync('python3', [
    '-c',
    `import sqlite3, sys, json
con = sqlite3.connect(sys.argv[1])
con.execute('create table candidates(id text primary key, text text not null, source text not null default "agent", metadata_json text not null default "{}", state text not null default "candidate", content_sha256 text not null, created_at real not null, updated_at real not null)')
con.execute('insert into candidates values(?,?,?,?,?,?,?,?)', ('mem-1', 'External providers should expose reviewable memory', 'agent', json.dumps({'domain':'ops'}), 'candidate', 'abc', 1000.0, 1001.0))
con.execute('insert into candidates values(?,?,?,?,?,?,?,?)', ('mem-2', 'Approved strategic note', 'manual', '{}', 'approved', 'def', 900.0, 950.0))
con.execute('insert into candidates values(?,?,?,?,?,?,?,?)', ('mem-3', 'Rejected transient note', 'manual', '{}', 'rejected', 'ghi', 800.0, 850.0))
con.commit()
con.close()
`,
    dbPath,
  ])
}

async function startHindsightServer() {
  const documents = new Map<string, any>([
    [
      'doc-1',
      {
        id: 'doc-1',
        bank_id: 'hermes',
        original_text: 'Alpha note from Hindsight',
        content_hash: 'hash-1',
        created_at: '2026-06-05T12:00:00Z',
        updated_at: '2026-06-05T12:05:00Z',
        memory_unit_count: 2,
        text_length: 25,
        tags: ['alpha'],
        document_metadata: { source: 'test' },
        retain_params: { context: 'unit test' },
        nodes_by_fact_type: { world: 1, observation: 1 },
      },
    ],
    [
      'doc-2',
      {
        id: 'doc-2',
        bank_id: 'hermes',
        original_text: 'Beta memory from Hindsight',
        content_hash: 'hash-2',
        created_at: '2026-06-05T13:00:00Z',
        updated_at: '2026-06-05T13:05:00Z',
        memory_unit_count: 1,
        text_length: 26,
        tags: ['beta'],
        document_metadata: { source: 'test' },
        retain_params: { context: 'unit test' },
        nodes_by_fact_type: { experience: 1 },
      },
    ],
  ])

  hindsightServer = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'healthy' }))
      return
    }
    if (
      req.method === 'GET' &&
      url.pathname === '/v1/default/banks/hermes/documents'
    ) {
      const items = Array.from(documents.values()).map((document) => ({
        id: document.id,
        bank_id: document.bank_id,
        content_hash: document.content_hash,
        created_at: document.created_at,
        updated_at: document.updated_at,
        text_length: document.text_length,
        memory_unit_count: document.memory_unit_count,
        tags: document.tags,
        document_metadata: document.document_metadata,
        retain_params: document.retain_params,
      }))
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          items,
          total: items.length,
          limit: Number(url.searchParams.get('limit') || items.length),
          offset: Number(url.searchParams.get('offset') || 0),
        }),
      )
      return
    }
    const match = url.pathname.match(
      /^\/v1\/default\/banks\/hermes\/documents\/([^/]+)$/,
    )
    if (match && req.method === 'GET') {
      const document = documents.get(match[1])
      if (!document) {
        res.writeHead(404).end()
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(document))
      return
    }
    if (match && req.method === 'DELETE') {
      documents.delete(match[1])
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      return
    }
    res.writeHead(404).end()
  })

  await new Promise<void>((resolve) => {
    hindsightServer!.listen(0, '127.0.0.1', () => resolve())
  })
  const address = hindsightServer.address()
  if (!address || typeof address === 'string') throw new Error('No address')
  hindsightBaseUrl = `http://127.0.0.1:${address.port}`
}

function makeHindsightConfig() {
  fs.mkdirSync(path.join(tempRoot, 'hindsight'), { recursive: true })
  fs.writeFileSync(
    path.join(tempRoot, 'hindsight', 'config.json'),
    JSON.stringify({
      mode: 'local_external',
      api_url: hindsightBaseUrl,
      bank_id: 'hermes',
    }),
  )
}

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-external-memory-'))
  process.env.HERMES_HOME = tempRoot
})

afterEach(async () => {
  delete process.env.HERMES_HOME
  if (hindsightServer) {
    await new Promise<void>((resolve, reject) => {
      hindsightServer?.close((error) => (error ? reject(error) : resolve()))
    })
  }
  hindsightServer = null
  hindsightBaseUrl = ''
  fs.rmSync(tempRoot, { recursive: true, force: true })
})

describe('external-memory-browser', () => {
  it('discovers registered external memory providers from HERMES_HOME', async () => {
    makeProviderConfig()
    const mod = await import('./external-memory-browser')

    const result = mod.listExternalMemoryProviders()

    expect(result.active).toBe('custom_provider')
    expect(result.providers).toEqual([
      expect.objectContaining({
        id: 'custom_provider',
        label: 'Custom Provider',
        kind: 'custom',
        available: true,
      }),
    ])
  })

  it('lists provider candidates from the review queue sqlite database', async () => {
    makeProviderConfig()
    seedCandidateDb()
    const mod = await import('./external-memory-browser')

    const result = await mod.listExternalMemoryCandidates({
      provider: 'custom_provider',
      state: 'candidate',
    })

    expect(result).toMatchObject({
      ok: true,
      provider: 'custom_provider',
      state: 'candidate',
      count: 1,
      total: 1,
    })
    expect(result.candidates[0]).toMatchObject({
      id: 'mem-1',
      text: 'External providers should expose reviewable memory',
      source: 'agent',
      state: 'candidate',
      metadata: { domain: 'ops' },
    })
  })

  it('returns per-state totals with candidate lists for filter badges', async () => {
    makeProviderConfig()
    seedCandidateDb()
    const mod = await import('./external-memory-browser')

    const result = await mod.listExternalMemoryCandidates({
      provider: 'custom_provider',
      state: 'all',
    })

    expect(result.counts).toEqual({
      candidate: 1,
      approved: 1,
      rejected: 1,
      all: 3,
    })
  })

  it('searches candidate text and metadata for a registered provider', async () => {
    makeProviderConfig()
    seedCandidateDb()
    const mod = await import('./external-memory-browser')

    const result = await mod.searchExternalMemoryCandidates({
      provider: 'custom_provider',
      query: 'strategic',
    })

    expect(result.count).toBe(1)
    expect(result.results[0]).toMatchObject({ id: 'mem-2', state: 'approved' })
  })

  it('edits candidate text and refreshes its content hash', async () => {
    makeProviderConfig()
    seedCandidateDb()
    const mod = await import('./external-memory-browser')

    const result = mod.editExternalMemoryCandidate({
      provider: 'custom_provider',
      id: 'mem-1',
      text: 'External providers should expose curated memory.',
    })

    expect(result.candidate).toMatchObject({
      id: 'mem-1',
      text: 'External providers should expose curated memory.',
      state: 'candidate',
    })
    expect(result.candidate.contentSha256).toHaveLength(64)
    expect(result.candidate.contentSha256).not.toBe('abc')
    expect(result.candidate.metadata.edited_at).toEqual(expect.any(Number))
  })

  it('auto-discovers native Hindsight providers from HERMES_HOME', async () => {
    await startHindsightServer()
    makeHindsightConfig()
    const mod = await import('./external-memory-browser')

    const result = mod.listExternalMemoryProviders()

    expect(result.active).toBe('hindsight')
    expect(result.providers[0]).toMatchObject({
      id: 'hindsight',
      label: 'Hindsight',
      kind: 'hindsight',
      bankId: 'hermes',
      available: true,
    })
  })

  it('lists, searches, and deletes Hindsight documents', async () => {
    await startHindsightServer()
    makeHindsightConfig()
    const mod = await import('./external-memory-browser')

    const listed = await mod.listExternalMemoryCandidates({
      provider: 'hindsight',
    })
    const searched = await mod.searchExternalMemoryCandidates({
      provider: 'hindsight',
      query: 'beta',
    })
    const deleted = await mod.deleteExternalMemoryCandidate({
      provider: 'hindsight',
      id: 'doc-1',
    })
    const afterDelete = await mod.listExternalMemoryCandidates({
      provider: 'hindsight',
    })

    expect(listed.total).toBe(2)
    expect(listed.candidates[0]).toMatchObject({
      provider: 'hindsight',
      state: 'document',
    })
    expect(searched.results[0]).toMatchObject({ id: 'doc-2' })
    expect(deleted).toEqual({
      ok: true,
      provider: 'hindsight',
      deleted: 'doc-1',
    })
    expect(afterDelete.total).toBe(1)
  })

  it('approves, rejects, and deletes candidates from the review queue', async () => {
    makeProviderConfig()
    seedCandidateDb()
    const mod = await import('./external-memory-browser')

    const approved = mod.approveExternalMemoryCandidate({
      provider: 'custom_provider',
      id: 'mem-1',
    })
    const rejected = mod.rejectExternalMemoryCandidate({
      provider: 'custom_provider',
      id: 'mem-2',
      reason: 'not durable',
    })
    const deleted = await mod.deleteExternalMemoryCandidate({
      provider: 'custom_provider',
      id: 'mem-3',
    })

    expect(approved.candidate).toMatchObject({ id: 'mem-1', state: 'approved' })
    expect(approved.candidate.metadata.approved_at).toEqual(expect.any(Number))
    expect(rejected.candidate).toMatchObject({ id: 'mem-2', state: 'rejected' })
    expect(rejected.candidate.metadata.review_reason).toBe('not durable')
    expect(deleted).toEqual({
      ok: true,
      provider: 'custom_provider',
      deleted: 'mem-3',
    })
    expect(
      (
        await mod.listExternalMemoryCandidates({
          provider: 'custom_provider',
          state: 'all',
        })
      ).total,
    ).toBe(2)
  })
})
