/**
 * Verifies attended and unattended desktop update installation behavior.
 */

import { describe, expect, it, vi } from 'vitest'
import AppUpdater, {
  type UpdateClient,
  type UpdateLogger,
  type UpdateRuntime,
} from '../src/main/services/AppUpdater'
import { APP_NAME, APP_REPO, APP_SLUG } from '../src/shared/appInfo'
import type { UpdateStateEvent } from '../src/shared/types'

const RELEASE_VERSION = '1.1.0'
const INSTALLER_NAME = `${APP_SLUG}-${RELEASE_VERSION}-windows-x64-setup.exe`
const DOWNLOADED_INSTALLER_PATH = `C:\\Temp\\${APP_NAME}-update.exe`

const release = {
  version: RELEASE_VERSION,
  name: `${APP_NAME} ${RELEASE_VERSION}`,
  pageUrl: `https://github.com/${APP_REPO}/releases/tag/v${RELEASE_VERSION}`,
  assets: [
    {
      name: INSTALLER_NAME,
      downloadUrl: `https://github.com/${APP_REPO}/releases/download/v${RELEASE_VERSION}/${INSTALLER_NAME}`,
      size: 1,
    },
  ],
}

/** Creates an updater with deterministic release, runtime, logging, and event dependencies. */
const createHarness = (
  autoUpdate: boolean,
  unattendedUpdates: boolean,
  runtimeOverrides: Partial<UpdateRuntime> = {},
) => {
  const launchInstaller = vi.fn(async (): Promise<void> => undefined)
  const quit = vi.fn()
  const events: UpdateStateEvent[] = []
  const client: UpdateClient = {
    getLatestRelease: vi.fn(async () => release),
    downloadInstaller: vi.fn(async (_asset, _directory, onProgress) => {
      onProgress(50)
      return { filePath: DOWNLOADED_INSTALLER_PATH, sha256: 'abc123' }
    }),
  }
  const runtime: UpdateRuntime = {
    isPackaged: true,
    version: '1.0.0',
    architecture: 'x64',
    platform: 'win32',
    temporaryDirectory: `C:\\Temp\\${APP_NAME}\\Updates`,
    quit,
    launchInstaller,
    ...runtimeOverrides,
  }
  const logger: UpdateLogger = {
    error: vi.fn(),
    info: vi.fn(),
  }
  const updater = new AppUpdater(logger, client, runtime)
  updater.initialize((event) => events.push(event))
  updater.applySettings({ autoUpdate, unattendedUpdates })
  return { client, events, launchInstaller, quit, updater }
}

describe('AppUpdater unattended updates', () => {
  it('silently launches a downloaded installer and exits when enabled', async () => {
    const harness = createHarness(true, true)

    await harness.updater.checkForUpdates()

    expect(harness.launchInstaller).toHaveBeenCalledWith(DOWNLOADED_INSTALLER_PATH)
    expect(harness.quit).toHaveBeenCalledOnce()
    expect(harness.events.at(-1)).toMatchObject({ state: 'downloaded', percent: 100 })
  })

  it.each([
    { autoUpdate: false, unattendedUpdates: true },
    { autoUpdate: true, unattendedUpdates: false },
  ])(
    'keeps the downloaded update attended with $autoUpdate/$unattendedUpdates',
    async ({ autoUpdate, unattendedUpdates }) => {
      const harness = createHarness(autoUpdate, unattendedUpdates)

      await harness.updater.checkForUpdates()

      expect(harness.launchInstaller).not.toHaveBeenCalled()
      expect(harness.quit).not.toHaveBeenCalled()
      expect(harness.events.at(-1)).toMatchObject({ state: 'downloaded', percent: 100 })
    },
  )
})

describe('AppUpdater platform behavior', () => {
  it.each(['darwin', 'linux'] as const)(
    'opens the release page without downloading an installer on %s',
    async (platform) => {
      const harness = createHarness(true, true, { platform })

      await harness.updater.checkForUpdates()

      expect(harness.client.downloadInstaller).not.toHaveBeenCalled()
      expect(harness.launchInstaller).not.toHaveBeenCalled()
      expect(harness.events.at(-1)).toMatchObject({
        state: 'available',
        pageUrl: release.pageUrl,
      })
    },
  )

  it('opens the release page without downloading from an unpackaged Windows build', async () => {
    const harness = createHarness(true, true, { isPackaged: false })

    await harness.updater.checkForUpdates()

    expect(harness.client.downloadInstaller).not.toHaveBeenCalled()
    expect(harness.events.at(-1)).toMatchObject({
      state: 'available',
      pageUrl: release.pageUrl,
    })
  })
})
