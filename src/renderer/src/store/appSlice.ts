/**
 * Stores application settings, navigation, sessions, and update progress.
 */

import { INITIAL_LENS_STATE, type LensState, type CaptureEvent } from '@shared/lens'
import { toSessionSummary } from '@shared/session'
import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type BootstrapPayload,
  type SessionDocument,
  type SessionSummary,
  type UpdateStateEvent,
} from '@shared/types'
import { DEFAULT_SESSIONS_SIDEBAR_WIDTH } from '@renderer/utils/sidebarSizing'

/** Top-level application pages. */
export type AppPage = 'home' | 'settings'
/** Settings categories available in the reusable shell. */
export type SettingsSection =
  | 'general'
  | 'display'
  | 'tray'
  | 'updates'
  | 'telemetry'
  | 'about'
  | 'logging'
  | 'capture'
  | 'speech'
  | 'prompts'

/** Complete renderer state owned by the application slice. */
export interface AppState {
  lens: LensState
  playback: {
    sessionId: string | null
    status: 'idle' | 'loading' | 'playing' | 'paused'
    progress: number
  }
  initialized: boolean
  initializationError: boolean
  page: AppPage
  settingsSection: SettingsSection
  settings: AppSettings
  platform: BootstrapPayload['platform']
  version: string
  sessions: SessionSummary[]
  currentSession: SessionDocument | null
  update: UpdateStateEvent
  sessionsSidebarOpen: boolean
  sessionsSidebarWidth: number
  compactMode: boolean
}

const initialState: AppState = {
  lens: INITIAL_LENS_STATE,
  playback: { sessionId: null, status: 'idle', progress: 0 },
  initialized: false,
  initializationError: false,
  page: 'home',
  settingsSection: 'general',
  settings: DEFAULT_SETTINGS,
  platform: 'win32',
  version: '0.0.0',
  sessions: [],
  currentSession: null,
  update: { state: 'idle' },
  sessionsSidebarOpen: true,
  sessionsSidebarWidth: DEFAULT_SESSIONS_SIDEBAR_WIDTH,
  compactMode: false,
}

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    /** Updates provider and job state without exposing authentication credentials. */
    setLensState(state, action: PayloadAction<LensState>) {
      state.lens = action.payload
    },
    /** Tracks audible playback across pages and hidden-window operation. */
    setPlayback(state, action: PayloadAction<AppState['playback']>) {
      state.playback = action.payload
    },
    /** Applies capture updates while preserving a manually selected historical session. */
    applyCaptureEvent(state, action: PayloadAction<CaptureEvent>) {
      const { session, select } = action.payload
      const index = state.sessions.findIndex((item) => item.id === session.id)
      if (index < 0) state.sessions.unshift(toSessionSummary(session))
      else state.sessions[index] = toSessionSummary(session)
      if (select || state.currentSession?.id === session.id) state.currentSession = session
      if (select) state.page = 'home'
    },
    /** Hydrates the renderer with persisted main-process state. */
    hydrate(state, action: PayloadAction<BootstrapPayload>) {
      if (state.initialized) return
      state.initialized = true
      state.initializationError = false
      state.settings = action.payload.settings
      state.platform = action.payload.platform
      state.version = action.payload.version
      state.sessions = action.payload.sessions
      state.currentSession = action.payload.currentSession
    },
    /** Records whether main-process bootstrap failed before the shell became usable. */
    setInitializationError(state, action: PayloadAction<boolean>) {
      state.initializationError = action.payload
    },
    /** Opens a top-level application page. */
    setPage(state, action: PayloadAction<AppPage>) {
      state.page = action.payload
      if (action.payload !== 'home') state.compactMode = false
    },
    /** Selects the settings category shown when the settings page is opened. */
    setSettingsSection(state, action: PayloadAction<SettingsSection>) {
      state.settingsSection = action.payload
    },
    /** Replaces settings after successful persistence. */
    setSettings(state, action: PayloadAction<AppSettings>) {
      state.settings = action.payload
    },
    /** Replaces session summaries from local storage. */
    setSessions(state, action: PayloadAction<SessionSummary[]>) {
      state.sessions = action.payload
    },
    /** Inserts a newly created summary at the front without duplicating its identifier. */
    addSessionSummary(state, action: PayloadAction<SessionSummary>) {
      state.sessions = [
        action.payload,
        ...state.sessions.filter((item) => item.id !== action.payload.id),
      ]
    },
    /** Replaces a known summary in place, or inserts it when not yet synchronized. */
    replaceSessionSummary(state, action: PayloadAction<SessionSummary>) {
      const index = state.sessions.findIndex((item) => item.id === action.payload.id)
      if (index === -1) state.sessions.unshift(action.payload)
      else state.sessions[index] = action.payload
    },
    /** Removes one session summary by its durable identifier. */
    removeSessionSummary(state, action: PayloadAction<string>) {
      state.sessions = state.sessions.filter((item) => item.id !== action.payload)
    },
    /** Sets the session displayed in the main workspace. */
    setCurrentSession(state, action: PayloadAction<SessionDocument | null>) {
      state.currentSession = action.payload
    },
    /** Refreshes a document only when it is still the active session. */
    replaceCurrentSession(state, action: PayloadAction<SessionDocument>) {
      if (state.currentSession?.id === action.payload.id) {
        state.currentSession = action.payload
      }
    },
    /** Applies desktop updater progress. */
    setUpdateState(state, action: PayloadAction<UpdateStateEvent>) {
      state.update = action.payload
    },
    /** Shows or hides the session management sidebar for the current app session. */
    setSessionsSidebarOpen(state, action: PayloadAction<boolean>) {
      state.sessionsSidebarOpen = action.payload
    },
    /** Stores the current session sidebar width for layout and local persistence. */
    setSessionsSidebarWidth(state, action: PayloadAction<number>) {
      state.sessionsSidebarWidth = action.payload
    },
    /** Toggles the distraction-free generic workspace view. */
    setCompactMode(state, action: PayloadAction<boolean>) {
      state.compactMode = action.payload
    },
  },
})

export const {
  setLensState,
  setPlayback,
  applyCaptureEvent,
  addSessionSummary,
  hydrate,
  removeSessionSummary,
  replaceCurrentSession,
  replaceSessionSummary,
  setCurrentSession,
  setInitializationError,
  setSessions,
  setPage,
  setSettings,
  setSettingsSection,
  setCompactMode,
  setSessionsSidebarOpen,
  setSessionsSidebarWidth,
  setUpdateState,
} = appSlice.actions

export default appSlice.reducer
