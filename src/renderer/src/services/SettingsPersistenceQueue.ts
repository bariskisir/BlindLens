/**
 * Serializes partial settings writes and keeps the queue usable after failed requests.
 */

import type { AppSettings, AppSettingsPatch } from '@shared/types'

type PersistSettings = (patch: AppSettingsPatch) => Promise<AppSettings>

/** Orders renderer settings writes and recovers the queue after rejected operations. */
export default class SettingsPersistenceQueue {
  private tail: Promise<AppSettings | null> = Promise.resolve(null)

  /** Persists one patch after every earlier request so main-process merges retain user ordering. */
  public enqueue(patch: AppSettingsPatch, persist: PersistSettings): Promise<AppSettings> {
    const operation = this.tail.then(() => persist(patch))
    this.tail = operation.catch(() => null)
    return operation
  }
}
