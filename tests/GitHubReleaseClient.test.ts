/**
 * Verifies GitHub release parsing, installer selection, and trusted download boundaries.
 */

import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import GitHubReleaseClient, {
  isNewerVersion,
  selectWindowsInstaller,
  type GitHubRelease,
} from '@main/services/GitHubReleaseClient'
import { APP_REPO, APP_SLUG } from '@shared/appInfo'

const RELEASE_VERSION = '1.2.0'
const X64_INSTALLER = `${APP_SLUG}-${RELEASE_VERSION}-windows-x64-setup.exe`
const ARM64_INSTALLER = `${APP_SLUG}-${RELEASE_VERSION}-windows-arm64-setup.exe`
const temporaryDirectories: string[] = []

/** Builds stable release metadata with both supported Windows installers. */
const createRelease = (): GitHubRelease => ({
  version: RELEASE_VERSION,
  name: `Release ${RELEASE_VERSION}`,
  pageUrl: `https://github.com/${APP_REPO}/releases/tag/v${RELEASE_VERSION}`,
  assets: [
    {
      name: X64_INSTALLER,
      downloadUrl: `https://github.com/${APP_REPO}/releases/download/v${RELEASE_VERSION}/${X64_INSTALLER}`,
      size: 1,
    },
    {
      name: ARM64_INSTALLER,
      downloadUrl: `https://github.com/${APP_REPO}/releases/download/v${RELEASE_VERSION}/${ARM64_INSTALLER}`,
      size: 1,
    },
  ],
})

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('GitHub release versions and assets', () => {
  it('compares stable versions and rejects unsupported version strings', () => {
    expect(isNewerVersion('1.2.0', '1.1.9')).toBe(true)
    expect(isNewerVersion('1.2.0', '1.2.0')).toBe(false)
    expect(isNewerVersion('1.1.9', '1.2.0')).toBe(false)
    expect(() => isNewerVersion('latest', '1.0.0')).toThrow('Unsupported release version')
  })

  it('selects the exact installer for each supported Windows architecture', () => {
    const release = createRelease()

    expect(selectWindowsInstaller(release, 'x64').name).toBe(X64_INSTALLER)
    expect(selectWindowsInstaller(release, 'arm64').name).toBe(ARM64_INSTALLER)
    expect(() => selectWindowsInstaller(release, 'ia32')).toThrow(
      'Application updates are not available',
    )
  })
})

describe('GitHubReleaseClient', () => {
  it('validates, maps, and caches the latest stable GitHub release', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          tag_name: `v${RELEASE_VERSION}`,
          name: null,
          body: 'Release notes',
          html_url: `https://github.com/${APP_REPO}/releases/tag/v${RELEASE_VERSION}`,
          draft: false,
          prerelease: false,
          assets: [
            {
              name: X64_INSTALLER,
              browser_download_url: `https://github.com/${APP_REPO}/releases/download/v${RELEASE_VERSION}/${X64_INSTALLER}`,
              size: 12,
              digest: 'sha256:abc123',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    const client = new GitHubReleaseClient(fetcher)

    const [first, second] = await Promise.all([
      client.getLatestRelease(),
      client.getLatestRelease(),
    ])
    const cached = await client.getLatestRelease()

    expect(fetcher).toHaveBeenCalledOnce()
    expect(first).toEqual(second)
    expect(cached).toEqual(first)
    expect(first).toMatchObject({
      version: RELEASE_VERSION,
      releaseNotes: 'Release notes',
      assets: [{ name: X64_INSTALLER, digest: 'sha256:abc123' }],
    })
  })

  it('downloads a repository asset with case-normalized path validation and verifies it', async () => {
    const payload = new TextEncoder().encode('verified installer')
    const sha256 = createHash('sha256').update(payload).digest('hex')
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(payload, { status: 200 }))
    const client = new GitHubReleaseClient(fetcher)
    const destination = await mkdtemp(join(tmpdir(), 'app-release-'))
    temporaryDirectories.push(destination)
    const progress: number[] = []

    const downloaded = await client.downloadInstaller(
      {
        name: X64_INSTALLER,
        downloadUrl: `https://github.com/${APP_REPO}/releases/download/v${RELEASE_VERSION}/${X64_INSTALLER}`,
        size: payload.byteLength,
        digest: `sha256:${sha256}`,
      },
      destination,
      (percent) => progress.push(percent),
    )

    expect(new Uint8Array(await readFile(downloaded.filePath))).toEqual(payload)
    expect(downloaded.sha256).toBe(sha256)
    expect(progress.at(-1)).toBe(100)
  })

  it('rejects installer URLs outside the configured repository before downloading', async () => {
    const fetcher = vi.fn<typeof fetch>()
    const client = new GitHubReleaseClient(fetcher)

    await expect(
      client.downloadInstaller(
        {
          name: X64_INSTALLER,
          downloadUrl: `https://github.com/another-owner/another-repo/releases/download/v${RELEASE_VERSION}/${X64_INSTALLER}`,
          size: 1,
        },
        tmpdir(),
        () => undefined,
      ),
    ).rejects.toThrow('untrusted update download URL')
    expect(fetcher).not.toHaveBeenCalled()
  })
})
