/**
 * Verifies Redux state transitions for the reusable shell, sessions, and compact mode.
 */

import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import reducer, {
  addSessionSummary,
  hydrate,
  removeSessionSummary,
  replaceCurrentSession,
  replaceSessionSummary,
  setCompactMode,
  setCurrentSession,
  setInitializationError,
  setPage,
  setSessions,
  setSessionsSidebarOpen,
  setSessionsSidebarWidth,
  setSettings,
  setSettingsSection,
  setUpdateState,
} from '../src/renderer/src/store/appSlice'
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type BootstrapPayload,
  type SessionDocument,
  type SessionSummary,
} from '../src/shared/types'

/** Builds complete application settings with optional scenario-specific overrides. */
const makeSettings = (overrides: Partial<AppSettings> = {}): AppSettings => ({
  ...structuredClone(DEFAULT_SETTINGS),
  ...overrides,
})

/** Builds one generic session document for reducer scenarios. */
const makeSessionDocument = (overrides: Partial<SessionDocument> = {}): SessionDocument => {
  const now = new Date().toISOString()
  return {
    id: randomUUID(),
    title: 'Test Session',
    isDefaultTitle: false,
    createdAt: now,
    updatedAt: now,
    data: {},
    ...overrides,
  }
}

/** Builds compact session metadata for sidebar reducer scenarios. */
const makeSessionSummary = (overrides: Partial<SessionSummary> = {}): SessionSummary => {
  const now = new Date().toISOString()
  return {
    id: randomUUID(),
    title: 'Test Session',
    isDefaultTitle: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

/** Builds the payload used to exercise one-time application hydration. */
const makeBootstrapPayload = (overrides: Partial<BootstrapPayload> = {}): BootstrapPayload => ({
  settings: makeSettings(),
  sessions: [],
  currentSession: makeSessionDocument(),
  platform: 'win32',
  version: '1.0.0',
  ...overrides,
})

describe('appSlice', () => {
  it('starts with the reusable shell defaults', () => {
    const state = reducer(undefined, { type: '@@INIT' })
    expect(state.initialized).toBe(false)
    expect(state.initializationError).toBe(false)
    expect(state.page).toBe('home')
    expect(state.settings).toEqual(DEFAULT_SETTINGS)
    expect(state.compactMode).toBe(false)
    expect(state.sessionsSidebarWidth).toBe(266)
  })

  it('records bootstrap failure and clears it after successful hydration', () => {
    const failed = reducer(undefined, setInitializationError(true))
    const hydrated = reducer(failed, hydrate(makeBootstrapPayload()))

    expect(failed.initializationError).toBe(true)
    expect(hydrated.initialized).toBe(true)
    expect(hydrated.initializationError).toBe(false)
  })

  it('hydrates persisted settings, platform, sessions, and version once', () => {
    const currentSession = makeSessionDocument({ title: 'Active' })
    const first = reducer(
      undefined,
      hydrate(
        makeBootstrapPayload({
          settings: makeSettings({ theme: 'dark' }),
          currentSession,
          platform: 'darwin',
          version: '2.0.0',
        }),
      ),
    )
    const second = reducer(first, hydrate(makeBootstrapPayload({ version: '3.0.0' })))

    expect(second.initialized).toBe(true)
    expect(second.settings.theme).toBe('dark')
    expect(second.platform).toBe('darwin')
    expect(second.currentSession?.title).toBe('Active')
    expect(second.version).toBe('2.0.0')
  })

  it('navigates pages and exits compact mode outside the workspace', () => {
    const compact = reducer(undefined, setCompactMode(true))
    expect(reducer(compact, setPage('home')).compactMode).toBe(true)
    const settings = reducer(compact, setPage('settings'))
    expect(settings.page).toBe('settings')
    expect(settings.compactMode).toBe(false)
  })

  it('updates the selected settings section and persisted settings', () => {
    const section = reducer(undefined, setSettingsSection('display'))
    const state = reducer(section, setSettings(makeSettings({ theme: 'light' })))
    expect(state.settingsSection).toBe('display')
    expect(state.settings.theme).toBe('light')
  })

  it('adds, replaces, and removes session summaries without duplicates', () => {
    const existing = makeSessionSummary({ id: 'session-a', title: 'Old' })
    const seeded = reducer(undefined, setSessions([existing]))
    const added = reducer(
      seeded,
      addSessionSummary(makeSessionSummary({ id: 'session-b', title: 'New' })),
    )
    const replaced = reducer(
      added,
      replaceSessionSummary(makeSessionSummary({ id: 'session-a', title: 'Updated' })),
    )
    const deduplicated = reducer(
      replaced,
      addSessionSummary(makeSessionSummary({ id: 'session-b', title: 'Newest' })),
    )
    const removed = reducer(deduplicated, removeSessionSummary('session-a'))

    expect(removed.sessions).toHaveLength(1)
    expect(removed.sessions[0]?.id).toBe('session-b')
    expect(removed.sessions[0]?.title).toBe('Newest')
  })

  it('sets and conditionally replaces the active session', () => {
    const current = makeSessionDocument({ id: 'current', title: 'Old' })
    const seeded = reducer(undefined, setCurrentSession(current))
    const unrelated = reducer(
      seeded,
      replaceCurrentSession(makeSessionDocument({ id: 'other', title: 'Other' })),
    )
    const updated = reducer(
      unrelated,
      replaceCurrentSession(makeSessionDocument({ id: 'current', title: 'Updated' })),
    )

    expect(unrelated.currentSession?.title).toBe('Old')
    expect(updated.currentSession?.title).toBe('Updated')
    expect(reducer(updated, setCurrentSession(null)).currentSession).toBeNull()
  })

  it('stores update progress and UI visibility preferences', () => {
    const updating = reducer(
      undefined,
      setUpdateState({ state: 'downloading', percent: 42, version: '2.0.0' }),
    )
    const hidden = reducer(updating, setSessionsSidebarOpen(false))
    const resized = reducer(hidden, setSessionsSidebarWidth(320))
    const compact = reducer(resized, setCompactMode(true))

    expect(compact.update.percent).toBe(42)
    expect(compact.sessionsSidebarOpen).toBe(false)
    expect(compact.sessionsSidebarWidth).toBe(320)
    expect(compact.compactMode).toBe(true)
  })
})
