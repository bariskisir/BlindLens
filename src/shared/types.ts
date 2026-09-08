/**
 * Re-exports every serializable domain model and cross-process application contract.
 */

export { DESKTOP_PLATFORMS, toDesktopPlatform } from './api'
export type { AppApi, BootstrapPayload, DesktopPlatform, Unsubscribe } from './api'
export { LOG_LEVELS } from './logging'
export type { LogLevel, RendererLogEntry } from './logging'
export { MAX_SESSION_TITLE_LENGTH, toSessionSummary } from './session'
export type { DeleteSessionResult, SessionData, SessionDocument, SessionSummary } from './session'
export {
  APP_LOCALES,
  DEFAULT_APP_LOCALE,
  DEFAULT_SETTINGS,
  NAVBAR_POSITIONS,
  PAGE_ZOOM_LIMITS,
  THEME_MODES,
  TIME_FORMATS,
} from './settings'
export type {
  AppLocale,
  AppSettings,
  AppSettingsPatch,
  NavbarPosition,
  ResolvedThemeMode,
  ThemeMode,
  TimeFormat,
} from './settings'
export { UPDATE_STATES } from './updates'
export type { UpdateState, UpdateStateEvent } from './updates'

export {
  CAPTURE_PHASES,
  DEFAULT_LENS_SETTINGS,
  DEFAULT_SYSTEM_PROMPTS,
  INITIAL_LENS_STATE,
  MAX_DESCRIPTION_LENGTH,
  SPEECH_PROVIDERS,
  THINKING_LEVELS,
} from './lens'
export type {
  AiModel,
  CaptureEvent,
  CaptureImage,
  CapturePhase,
  CaptureSpeech,
  ChatGptState,
  ChatGptUsageWindow,
  CredentialProvider,
  LensApi,
  LensSettings,
  LensState,
  ScreenCapture,
  SpeechModel,
  SpeechProvider,
  SystemPrompt,
  ThinkingLevel,
} from './lens'
