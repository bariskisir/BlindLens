# BlindLens -- Development Guide

## Project Overview

BlindLens v1.0.0 is an accessible Electron screen-description application. A configurable global shortcut captures the display containing the pointer, ChatGPT describes the screenshot, and Web Speech, Deepgram, or OpenRouter reads the answer. Screenshots, answers, prompts, models, generated cloud speech, and Web Speech replay recipes are retained in local sessions.

The default shortcut is left `Ctrl+Alt`, activated after all keys are released. Preserve its distinction from AltGr and longer shortcuts. Both interface and description languages default to English. Both are editable. The default description prompt requests at most five short sentences. Web Speech is the default speech provider. Tray behavior on supported platforms, automatic updates, unattended updates, and telemetry are enabled by default and remain editable. Linux disables tray behavior at the platform boundary.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Desktop shell | Electron 43.2 with `vite-plugin-electron` |
| Build | Vite 8 for main, preload, and renderer bundles |
| Language | TypeScript 7 |
| UI | React 19, Redux Toolkit, Ant Design 6, SCSS Modules |
| AI description | ChatGPT account integration with PKCE authentication |
| Speech | Web Speech, Deepgram, and OpenRouter |
| Localization | i18next and react-i18next with ten locales |
| Validation | Zod |
| Quality | Vitest, Biome, and Prettier |
| Packaging | electron-builder with NSIS, DMG, and AppImage targets |

## Directory Structure

```text
BlindLens/
├── src/
│   ├── shared/                 # Cross-process contracts, settings, and domain types
│   ├── main/                   # Electron lifecycle, IPC, security, storage, and services
│   │   ├── ipc/                # Validated IPC handlers and registrar
│   │   ├── security/           # Navigation and external URL policies
│   │   ├── services/           # Capture, ChatGPT, speech, hotkey, tray, and update services
│   │   └── storage/            # Atomic settings, session, and media repositories
│   ├── preload/                # Typed context bridge exposed as window.app
│   └── renderer/src/           # Sandboxed React interface
│       ├── components/         # Application shell and session sidebar
│       ├── hooks/              # Capture, session, settings, and desktop actions
│       ├── i18n/locales/       # Ten complete locale resources
│       ├── pages/              # Home workspace and settings sections
│       ├── services/           # Renderer persistence and speech playback services
│       └── store/              # Single Redux application slice
├── tests/                      # Vitest unit and integration tests
├── build/                      # Application icon sources and generated assets
├── images/                     # README screenshots
├── scripts/                    # Asset generation scripts
├── vite.config.mts
├── vitest.config.mts
└── package.json
```

## Sources adapted for this product

- AIHelper: ChatGPT PKCE login and metadata normalization.
- epubreader: Web Speech playback, Deepgram voices, and speech requests.
- AIMediaStudio: OpenRouter speech and model/voice catalog.
- interview: named system prompt management.

Read reference implementations when changing these integrations. Never copy a sibling project's saved credentials or embedded API keys into product source. The application's own secrets are encrypted by `CredentialService` and never returned to the renderer.

## Commands

Requires Node.js 24+ and npm 11+. `uiohook-napi` supports modifier-only global capture. Its native module must remain outside the ASAR archive. Linux packaging runners require the X11, Xrandr, Xtst, and Xt development packages listed in `.github/workflows/release.yml`.

```bash
npm run dev
npm run start
npm run build
npm run typecheck
npm run test
npm run lint
npm run format
npm run format:check
npm run verify
npm audit
npm run package:win:x64
npm run package:win
npm run package:mac
npm run package:linux
node scripts/generate-icons.mjs
```

Use `npm.cmd` in Windows PowerShell when the npm PowerShell shim is blocked. Keep TypeScript build metadata under `node_modules/.cache`. Prettier targets source code, tests, and root TypeScript configuration files, not JSON or Markdown.

## Architecture

- **Main:** Electron, capture, global input, OAuth, provider requests, credentials, durable storage, exports, clipboard, logs, telemetry, tray, window state, and updates.
- **Preload:** typed `AppApi`/`LensApi` exposed through `contextBridge` as `window.app`.
- **Renderer:** sandboxed React presentation. Do not import Node.js or Electron. One Redux slice owns shared application, provider, capture, and playback state. Browser audio and speech objects stay in `SpeechPlaybackService`.

Shared contracts:

- `src/shared/appInfo.ts`: application identity, repository, and telemetry fallback.
- `src/shared/lens.ts`: capture lifecycle, providers, prompts, settings, and API contracts.
- `src/shared/session.ts`: durable session metadata and typed capture data.
- `src/shared/hotkey.ts`: canonical accelerator validation.
- `src/shared/speech.ts`: speech chunking and Deepgram voices.
- `src/shared/IpcChannel.ts`, `ipcContract.ts`, `api.ts`: complete IPC/API contracts.

Main services:

- `LensService`: one cancellable generation, durable stage updates, history mutation exclusion, media ownership, and artifact exports.
- `ChatGptService`, `ChatGptMetadata`, `ChatGptStream`, `OAuthCallback`: account login, refresh, catalogs, and image descriptions.
- `SpeechService`: Deepgram and OpenRouter transport, response size limits, and saved speech recipes.
- `ScreenCaptureService`: display selection and temporary self-window exclusion.
- `HotkeyService`: shortcut registration, conflict handling, native hook cleanup, and modifier chord detection.
- `CredentialService`: an encrypted, serialized atomic credential vault.
- `StorageService`: facade over settings, session, and media repositories.

All commands must use `IpcRegistrar`, which checks both `webContents` and the main frame and validates requests with Zod. Enumerate every channel and add its contract, schema, preload method, handler, and focused tests together. Keep the renderer sandbox, context isolation, disabled Node integration, denied permissions, blocked popups, and navigation policies intact.

## Storage and lifecycle invariants

Durable settings, credentials, sessions, and media belong under `BlindLens/Data`. Chromium runtime files belong under `Runtime/Session`, and logs under `Logs`.

Reuse `FileOperationQueue` and `atomicJson` for durable documents. Serialize same-document mutations. Media paths must derive from validated session/asset UUIDs. Renderer media reads require a reference owned by that session.

There must always be an available empty workspace after deleting the final session. History deletion must cancel active generation before removing session documents and media. New hotkeys cannot start during that mutation. A cancelled or failed capture keeps completed stages. Restart repairs transient capture states. Speech regeneration must retain the previous successful audio if the replacement fails.

Keep large media payloads outside session metadata and Redux. Persist generated MP3 segments and load them on demand. Web Speech stores a replay recipe; it does not expose downloadable audio. Do not imply that Web Speech recordings are saved audio files.

## Settings and prompts

New settings require synchronized shared types/defaults, main schemas, controls, service application, localization, and tests. Persisted parsing validates fields independently. Rapid renderer writes use `SettingsPersistenceQueue`; main settings writes and side effects are serialized as well. Shortcut conflicts reject changes before persistence and failed persistence restores the preceding shortcut.

Prompts follow interview's built-in/custom distinction. The three built-ins are immutable and cannot be deleted, including through direct IPC. Custom copies can be edited or deleted; IDs must be unique and the selected ID must exist. Persisted migration restores missing built-ins and preserves older edits as custom copies. Removing a selected custom prompt changes selection in the same settings update. Each capture stores the actual prompt, model, and language used.

Before capture creates a session or reads the desktop, check ChatGPT login/model and selected speech prerequisites. Missing API keys, unavailable local voices, and incompatible language/model/voice settings must produce a localized warning, including for global shortcuts. Speech-only regeneration does not need ChatGPT. The renderer reports transient Web Speech availability through validated IPC. Provider refreshes are independent; OpenRouter setup must work while ChatGPT is signed out. Verify replacement API keys before saving them.

Retain theme modes, zoom, navigation placement, compact mode, optional tray, clock settings, logging, telemetry, and updater controls. Linux disables tray behavior at the IPC boundary. Navigating away from home exits compact mode. Settings remain lazy-loaded.

Capture, speech, and prompt settings follow General and Display in navigation. The home workspace has no additional identity/settings toolbar or prompt/hotkey footer. Global shortcuts use a Change button and keyboard recording instead of manual text entry. Save only after every captured key is released; support a standalone Ctrl, modifier-only combinations, and one ordinary key with optional modifiers. Suspend global capture while recording, cancel on focus loss or unmount, and bound suspension with a main-process timeout.

## UI and localization

Use focused functional components, custom action hooks, `useFailureReporter`, `useAccentButtonProps`, `SettingRow`, `cx`, existing CSS variables, and co-located SCSS Modules. Keep system and persistence work out of presentation components. Controls must have meaningful accessible labels; capture progress is announced through a live status region.

Support English, Turkish, German, French, Portuguese, Chinese, Spanish, Russian, Japanese, and Korean. Every language implements the complete `LocaleResource` contract directly in its existing locale file (`en.ts`, `tr.ts`, etc.). Do not use delimiter tables, generated translation sources, or English fallback filling. Add complete values to all ten files and run `Localization.test.ts` for key parity, interpolation, used-key coverage, non-empty strings, and whitespace.

The icon assets in `build/` use blue `#4F46E5` and white. Preserve that palette. Action controls remain green `#00b96b`; session icons retain separate blue tokens.

## Code conventions

- Code and comments are English.
- Every code file starts with an explanatory comment. Every named function, method, constructor, and exported type has a meaningful comment above it, matching the existing project style.
- Keep strict TypeScript, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`. Do not use `any`.
- Validate unknown external data. Bound provider bodies, text, media, and log details.
- Prefer explicit dependency injection for services and use `@main`, `@shared`, and `@renderer` aliases.
- Use logging services, not `console`. Never log tokens, API keys, screenshots, descriptions, audio, or raw provider error bodies.
- Derive identity from `appInfo.ts`; packaging metadata, repository links, icons, and version must stay synchronized.

## Verification and release

Vitest uses Node with injected Electron/browser boundaries and isolated temporary directories. Tests must not touch real AppData, live accounts, provider billing, or telemetry. Add focused tests for changes to capture, OAuth, provider transport, cancellation, media ownership, settings side effects, preload, and IPC handlers. Use an isolated data root for interactive smoke checks.

Before distribution run `npm run verify` and `npm audit`. Windows artifacts are NSIS x64/arm64; macOS DMG and Linux AppImage scripts remain available. Package version, `v*` release tag, artifact names, updater selection, and README release links must agree. Do not publish, tag, or release unless requested.

GitHub updates validate repository-scoped downloads, exact architecture, size, and available SHA-256 digests. Unattended install remains enabled only when both startup checking and unattended updates are enabled. Startup telemetry is enabled by default, limited to application/version/platform/locale/anonymous UUID, and independent of session content.
