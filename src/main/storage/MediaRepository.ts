/** Stores bounded media separately from session metadata with atomic durable writes. */

import { randomUUID } from 'node:crypto'
import { mkdir, readdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { readJsonFile, removeInterruptedWrites, writeJsonFile } from './atomicJson'
import FileOperationQueue from './FileOperationQueue'

const mediaSchema = z.object({
  mime: z.enum(['image/png', 'audio/mpeg']),
  base64: z
    .string()
    .min(1)
    .max(32 * 1024 * 1024)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/),
})

/** Owns media documents named only from validated session and asset UUIDs. */
export default class MediaRepository {
  private readonly queue = new FileOperationQueue()
  /** Binds one durable media directory. */
  public constructor(private readonly directory: string) {}
  /** Creates the directory and removes uncommitted writes from previous processes. */
  public async initialize(): Promise<void> {
    await mkdir(this.directory, { recursive: true })
    await removeInterruptedWrites(this.directory)
  }
  /** Saves a new immutable media payload and returns its generated identifier. */
  public async save(
    sessionId: string,
    mime: 'image/png' | 'audio/mpeg',
    bytes: Uint8Array,
  ): Promise<string> {
    const assetId = randomUUID()
    const payload = mediaSchema.parse({ mime, base64: Buffer.from(bytes).toString('base64') })
    const path = this.path(sessionId, assetId)
    await this.queue.run(path, () => writeJsonFile(path, payload))
    return assetId
  }
  /** Reads validated media for playback or native export. */
  public async read(sessionId: string, assetId: string): Promise<z.infer<typeof mediaSchema>> {
    const path = this.path(sessionId, assetId)
    return this.queue.run(path, async () => mediaSchema.parse(await readJsonFile(path)))
  }
  /** Removes an obsolete asset without failing when it is already absent. */
  public async remove(sessionId: string, assetId: string): Promise<void> {
    const path = this.path(sessionId, assetId)
    await this.queue.run(path, async () => {
      try {
        await unlink(path)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    })
  }
  /** Deletes every media asset for one validated session, including interrupted job leftovers. */
  public async deleteSession(sessionId: string): Promise<void> {
    z.uuid().parse(sessionId)
    for (const entry of await readdir(this.directory)) {
      if (!entry.startsWith(`${sessionId}-`) || !entry.endsWith('.json')) continue
      const assetId = entry.slice(sessionId.length + 1, -5)
      if (z.uuid().safeParse(assetId).success) await this.remove(sessionId, assetId)
    }
  }
  /** Resolves identifiers beneath the fixed media directory. */
  private path(sessionId: string, assetId: string): string {
    return join(this.directory, `${z.uuid().parse(sessionId)}-${z.uuid().parse(assetId)}.json`)
  }
}
