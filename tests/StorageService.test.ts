/**
 * Verifies generic session CRUD, settings persistence, and serialized file access.
 */

import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import StorageService from '../src/main/services/StorageService'
import { DEFAULT_SETTINGS, type DeleteSessionResult } from '../src/shared/types'

const ROOT = '/fake/appdata/app'
const SESSIONS_DIR = join(ROOT, 'sessions')
const SETTINGS_PATH = join(ROOT, 'settings.json')
let fileStore: Record<string, string> = {}

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(async (_path: string, _options?: unknown) => {}),
  readFile: vi.fn(async (path: string) => {
    if (!Object.hasOwn(fileStore, path)) {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    }
    return fileStore[path]
  }),
  readdir: vi.fn(async (path: string) => {
    if (path !== ROOT && path !== SESSIONS_DIR) return []
    return Object.keys(fileStore)
      .filter((filePath) => filePath.startsWith(path) && filePath.endsWith('.json'))
      .map((filePath) => ({
        name: filePath.slice(path.length + 1),
        /** Identifies each mocked directory entry as a JSON file. */
        isFile: () => true,
        /** Prevents mocked entries from being treated as directories. */
        isDirectory: () => false,
      }))
  }),
  rename: vi.fn(async (source: string, destination: string) => {
    if (!Object.hasOwn(fileStore, source)) {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    }
    fileStore[destination] = fileStore[source] ?? ''
    delete fileStore[source]
  }),
  writeFile: vi.fn(async (path: string, content: string) => {
    fileStore[path] = content
  }),
  unlink: vi.fn(async (path: string) => {
    if (!Object.hasOwn(fileStore, path)) {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    }
    delete fileStore[path]
  }),
}))

describe('StorageService', () => {
  let service: StorageService

  beforeEach(() => {
    fileStore = {}
    service = new StorageService(ROOT)
  })

  it('initializes storage and creates an empty generic session', async () => {
    await service.initialize()
    const session = await service.createSession()
    expect(session.title).toBe('New Session')
    expect(session.isDefaultTitle).toBe(true)
    expect(session.data).toEqual({})
    expect(session.id).toMatch(/^[0-9a-f-]{36}$/i)
  })

  it('normalizes a custom session title', async () => {
    const session = await service.createSession(`   ${'A'.repeat(240)}   `)
    expect(session.title).toHaveLength(200)
    expect(session.isDefaultTitle).toBe(false)
  })

  it('loads and renames a persisted session', async () => {
    const created = await service.createSession('Original')
    const renamed = await service.renameSession(created.id, '  Renamed  ')
    const loaded = await service.getSession(created.id)
    expect(renamed.title).toBe('Renamed')
    expect(loaded.title).toBe('Renamed')
    expect(loaded.isDefaultTitle).toBe(false)
  })

  it('rejects empty titles and invalid identifiers', async () => {
    const session = await service.createSession()
    await expect(service.renameSession(session.id, '   ')).rejects.toThrow(
      'Session title cannot be empty.',
    )
    await expect(service.getSession('not-a-uuid')).rejects.toThrow('Invalid session identifier.')
  })

  it('lists compact sessions with the newest first', async () => {
    const first = await service.createSession('First')
    await new Promise((resolve) => setTimeout(resolve, 5))
    const second = await service.createSession('Second')
    const sessions = await service.listSessions()
    expect(sessions.map((session) => session.id)).toEqual([second.id, first.id])
    expect(sessions[0]).not.toHaveProperty('data')
  })

  it('deletes one of several sessions without creating a replacement', async () => {
    const first = await service.createSession('First')
    await service.createSession('Second')
    const result: DeleteSessionResult = await service.deleteSession(first.id)
    expect(result).toEqual({ deleted: true })
    expect(await service.listSessions()).toHaveLength(1)
  })

  it('creates a ready replacement when the final session is deleted', async () => {
    const only = await service.createSession('Only')
    const result = await service.deleteSession(only.id)
    expect(result.deleted).toBe(true)
    expect(result.replacement?.id).not.toBe(only.id)
    expect(result.replacement?.data).toEqual({})
    expect((await service.listSessions()).map((session) => session.id)).toEqual([
      result.replacement?.id,
    ])
  })

  it('deletes every session and creates one fresh replacement', async () => {
    const first = await service.createSession('First')
    const second = await service.createSession('Second')
    const replacement = await service.deleteAllSessions()
    const sessions = await service.listSessions()

    expect(sessions).toHaveLength(1)
    expect(sessions[0]?.id).toBe(replacement.id)
    expect(replacement.id).not.toBe(first.id)
    expect(replacement.id).not.toBe(second.id)
    expect(replacement.data).toEqual({})
  })

  it('returns false for a valid unknown session identifier', async () => {
    const result = await service.deleteSession('550e8400-e29b-41d4-a716-446655440000')
    expect(result).toEqual({ deleted: false })
  })

  it('loads defaults and persists merged shell settings', async () => {
    expect(await service.loadSettings()).toEqual(DEFAULT_SETTINGS)
    const saved = await service.updateSettings({ theme: 'dark', pageZoom: 1.3 })
    expect(saved.theme).toBe('dark')
    expect(saved.pageZoom).toBe(1.3)
    expect(JSON.parse(fileStore[SETTINGS_PATH] ?? '{}')).toEqual(saved)
    expect(Object.keys(fileStore).some((filePath) => filePath.endsWith('.tmp'))).toBe(false)
  })

  it('serializes rapid settings writes without losing earlier fields', async () => {
    await Promise.all([
      service.updateSettings({ theme: 'dark' }),
      service.updateSettings({ uiLanguage: 'tr' }),
      service.updateSettings({ logLevel: 'debug' }),
    ])
    const settings = await service.loadSettings()
    expect(settings).toMatchObject({ theme: 'dark', uiLanguage: 'tr', logLevel: 'debug' })
  })

  it('ignores malformed session files while listing', async () => {
    fileStore[join(SESSIONS_DIR, 'broken.json')] = '{not-json'
    expect(await service.listSessions()).toEqual([])
  })
})
