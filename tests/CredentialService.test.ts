/** Verifies encrypted credential persistence, concurrent updates, and malformed-vault protection. */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CredentialService, { type CredentialEncryption } from '@main/services/CredentialService'

vi.mock('electron', () => ({ safeStorage: {} }))
const roots: string[] = []
const encryption: CredentialEncryption = {
  /** Reports the deterministic test cipher as available. */
  available: () => true,
  /** Obscures test bytes without depending on a real OS credential vault. */
  encrypt: (text) => Buffer.from(Array.from(Buffer.from(text), (byte) => byte ^ 0xa5)),
  /** Restores the deterministic test ciphertext. */
  decrypt: (bytes) => Buffer.from(Array.from(bytes, (byte) => byte ^ 0xa5)).toString(),
}

/** Creates an isolated credential directory for one test. */
const createRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'lens-vault-'))
  roots.push(root)
  return root
}
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

describe('credential vault', () => {
  it('merges concurrent keys and tokens without exposing plaintext on disk', async () => {
    const root = await createRoot()
    const service = new CredentialService(root, encryption)
    const auth = {
      accessToken: 'test-access-secret',
      refreshToken: 'test-refresh-secret',
      accountId: 'test-account',
      accountEmail: 'test@example.invalid',
      expiresAt: Date.now() + 3600000,
    }
    await Promise.all([
      service.saveApiKey('deepgram', 'test-deepgram-secret'),
      service.saveApiKey('openrouter', 'test-router-secret'),
      service.saveChatGptAuth(auth),
    ])
    const stored = await readFile(join(root, 'credentials.json'), 'utf8')
    expect(stored).not.toContain('secret')
    expect(stored).not.toContain(auth.accountEmail)
    const restored = new CredentialService(root, encryption)
    expect(await restored.getStatus()).toEqual({ deepgram: true, openrouter: true })
    expect(await restored.getChatGptAuth()).toEqual(auth)
    await restored.deleteChatGptAuth()
    expect(await restored.getChatGptAuth()).toBeNull()
    expect(await restored.getApiKey('openrouter')).toBe('test-router-secret')
  })
  it('refuses plaintext fallback and does not overwrite a malformed vault', async () => {
    const root = await createRoot()
    const unavailable = new CredentialService(root, { ...encryption, available: () => false })
    await expect(unavailable.saveApiKey('deepgram', 'test-key')).rejects.toThrow('unavailable')
    await writeFile(join(root, 'credentials.json'), 'broken-vault')
    await expect(
      new CredentialService(root, encryption).saveApiKey('deepgram', 'new-key'),
    ).rejects.toThrow('could not be read')
    expect(await readFile(join(root, 'credentials.json'), 'utf8')).toBe('broken-vault')
  })
})
