/** Persists provider keys and AIHelper-compatible OAuth tokens in an encrypted local vault. */

import { join } from 'node:path'
import { safeStorage } from 'electron'
import { z } from 'zod'
import type { CredentialProvider } from '@shared/lens'
import { readJsonFile, writeJsonFile } from '@main/storage/atomicJson'
import FileOperationQueue from '@main/storage/FileOperationQueue'

const authSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  accountId: z.string(),
  accountEmail: z.string(),
  expiresAt: z.number().positive(),
})
const vaultSchema = z.object({
  chatgpt: authSchema.nullable(),
  deepgram: z.string(),
  openrouter: z.string(),
})
const envelopeSchema = z.object({ version: z.literal(1), encrypted: z.string().min(1) })

/** OAuth token document compatible with the AIHelper login service. */
export type ChatGptAuthTokens = z.infer<typeof authSchema>
/** Injectable OS encryption boundary for isolated vault tests. */
export interface CredentialEncryption {
  /** Reports whether secure OS encryption is available. */
  available(): boolean
  /** Encrypts a plaintext document. */
  encrypt(text: string): Buffer
  /** Decrypts a previously encrypted document. */
  decrypt(bytes: Buffer): string
}

const encryption: CredentialEncryption = {
  /** Rejects the insecure Linux basic-text backend. */
  available: () =>
    safeStorage.isEncryptionAvailable() &&
    (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text'),
  /** Delegates encryption to the OS credential service. */
  encrypt: (text) => safeStorage.encryptString(text),
  /** Delegates decryption to the OS credential service. */
  decrypt: (bytes) => safeStorage.decryptString(bytes),
}

/** Serializes credential mutations and keeps all secrets in the main process. */
export default class CredentialService {
  private readonly queue = new FileOperationQueue()
  private readonly path: string
  /** Binds the vault to the application's isolated durable directory. */
  public constructor(
    dataRoot: string,
    private readonly crypto: CredentialEncryption = encryption,
  ) {
    this.path = join(dataRoot, 'credentials.json')
  }
  /** Returns the saved ChatGPT tokens only to main-process services. */
  public async getChatGptAuth(): Promise<ChatGptAuthTokens | null> {
    return (await this.read()).chatgpt
  }
  /** Atomically saves validated OAuth tokens. */
  public async saveChatGptAuth(auth: ChatGptAuthTokens): Promise<void> {
    await this.update({ chatgpt: authSchema.parse(auth) })
  }
  /** Removes the ChatGPT login while retaining other providers. */
  public async deleteChatGptAuth(): Promise<void> {
    await this.update({ chatgpt: null })
  }
  /** Reads one provider API key within the main process. */
  public async getApiKey(provider: CredentialProvider): Promise<string> {
    return (await this.read())[provider]
  }
  /** Replaces or removes one provider key. */
  public async saveApiKey(provider: CredentialProvider, key: string): Promise<void> {
    await this.update({ [provider]: key.trim() })
  }
  /** Returns presence flags without returning credentials to the renderer. */
  public async getStatus(): Promise<Record<CredentialProvider, boolean>> {
    const vault = await this.read()
    return { deepgram: Boolean(vault.deepgram), openrouter: Boolean(vault.openrouter) }
  }
  /** Reads a vault while preserving corrupted files for recovery. */
  private async read(): Promise<z.infer<typeof vaultSchema>> {
    let raw: unknown
    try {
      raw = await readJsonFile(this.path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return { chatgpt: null, deepgram: '', openrouter: '' }
      throw new Error('The credential vault could not be read.')
    }
    if (!this.crypto.available())
      throw new Error('Operating-system credential encryption is unavailable.')
    const envelope = envelopeSchema.parse(raw)
    return vaultSchema.parse(
      JSON.parse(this.crypto.decrypt(Buffer.from(envelope.encrypted, 'base64'))),
    )
  }
  /** Merges one credential change under the vault's write lock. */
  private async update(patch: Partial<z.infer<typeof vaultSchema>>): Promise<void> {
    await this.queue.run(this.path, async () => {
      if (!this.crypto.available())
        throw new Error('Operating-system credential encryption is unavailable.')
      const vault = vaultSchema.parse({ ...(await this.read()), ...patch })
      await writeJsonFile(this.path, {
        version: 1,
        encrypted: this.crypto.encrypt(JSON.stringify(vault)).toString('base64'),
      })
    })
  }
}
