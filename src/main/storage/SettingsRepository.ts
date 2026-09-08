/**
 * Persists validated application settings in one serialized durable document.
 */

import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { AppSettings, AppSettingsPatch } from '@shared/types'
import { parsePersistedSettings, settingsSchema } from '../settingsSchema'
import { readJsonFile, removeInterruptedWrites, writeJsonFile } from './atomicJson'
import FileOperationQueue from './FileOperationQueue'

/** Owns the settings document and keeps concurrent updates from losing fields. */
export default class SettingsRepository {
  private readonly queue = new FileOperationQueue()

  /** Creates a repository for one durable settings document. */
  public constructor(private readonly filePath: string) {}

  /** Creates the containing directory and removes interrupted writes from earlier runs. */
  public async initialize(): Promise<void> {
    const directory = dirname(this.filePath)
    await mkdir(directory, { recursive: true })
    await removeInterruptedWrites(directory)
  }

  /** Loads validated settings or safe defaults for missing or malformed data. */
  public async load(): Promise<AppSettings> {
    return this.queue.run(this.filePath, () => this.readUnlocked())
  }

  /** Atomically merges changed fields into the latest validated settings document. */
  public async update(patch: AppSettingsPatch): Promise<AppSettings> {
    return this.queue.run(this.filePath, async () => {
      const current = await this.readUnlocked()
      const settings = settingsSchema.parse({ ...current, ...patch })
      await writeJsonFile(this.filePath, settings)
      return settings
    })
  }

  /** Reads settings while its caller owns the settings-file operation lock. */
  private async readUnlocked(): Promise<AppSettings> {
    try {
      return parsePersistedSettings(await readJsonFile(this.filePath))
    } catch {
      return parsePersistedSettings(null)
    }
  }
}
