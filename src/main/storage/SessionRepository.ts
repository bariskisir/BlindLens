/**
 * Persists generic session workspaces as individually validated JSON documents.
 */

import { randomUUID } from 'node:crypto'
import { mkdir, readdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import {
  MAX_SESSION_TITLE_LENGTH,
  type DeleteSessionResult,
  type SessionDocument,
  type SessionSummary,
} from '@shared/types'
import { z } from 'zod'
import { readJsonFile, removeInterruptedWrites, writeJsonFile } from './atomicJson'
import FileOperationQueue from './FileOperationQueue'
import { captureSchema } from './captureSchema'
import type { ScreenCapture } from '@shared/lens'

const sessionSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(MAX_SESSION_TITLE_LENGTH),
  isDefaultTitle: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  data: z.object({ capture: captureSchema.optional() }),
})

const DEFAULT_SESSION_TITLE = 'New Session'

/** Rejects identifiers that could escape the session directory. */
const assertSessionId = (id: string): void => {
  if (!z.uuid().safeParse(id).success) throw new Error('Invalid session identifier.')
}

/** Trims a requested title to the persisted length limit. */
const normalizeTitle = (title: string | undefined): string =>
  title?.trim().slice(0, MAX_SESSION_TITLE_LENGTH) ?? ''

/** Owns the session directory and serializes every write targeting one session. */
export default class SessionRepository {
  private readonly queue = new FileOperationQueue()

  /** Creates a repository for one directory of session documents. */
  public constructor(private readonly directoryPath: string) {}

  /** Creates the session directory and removes interrupted writes from earlier runs. */
  public async initialize(): Promise<void> {
    await mkdir(this.directoryPath, { recursive: true })
    await removeInterruptedWrites(this.directoryPath)
  }

  /** Creates a new empty generic session. */
  public async create(title?: string): Promise<SessionDocument> {
    const now = new Date().toISOString()
    const normalizedTitle = normalizeTitle(title)
    const session = sessionSchema.parse({
      id: randomUUID(),
      title: normalizedTitle || DEFAULT_SESSION_TITLE,
      isDefaultTitle: !normalizedTitle,
      createdAt: now,
      updatedAt: now,
      data: {},
    })
    const filePath = this.sessionPath(session.id)
    await this.queue.run(filePath, () => writeJsonFile(filePath, session))
    return session
  }

  /** Loads and validates one complete session. */
  public async get(id: string): Promise<SessionDocument> {
    assertSessionId(id)
    const filePath = this.sessionPath(id)
    return this.queue.run(filePath, () => this.readUnlocked(filePath))
  }

  /** Lists compact session summaries in reverse chronological order. */
  public async list(): Promise<SessionSummary[]> {
    const entries = await readdir(this.directoryPath, { withFileTypes: true })
    const documents = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => this.tryRead(join(this.directoryPath, entry.name))),
    )

    return documents
      .filter((document): document is SessionDocument => document !== null)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(({ id, title, isDefaultTitle, createdAt, updatedAt }) => ({
        id,
        title,
        isDefaultTitle,
        createdAt,
        updatedAt,
      }))
  }

  /** Renames a session within the same serialized file operation used by other writes. */
  public async rename(id: string, title: string): Promise<SessionDocument> {
    const normalizedTitle = normalizeTitle(title)
    if (!normalizedTitle) throw new Error('Session title cannot be empty.')
    return this.update(id, (session) => ({
      ...session,
      title: normalizedTitle,
      isDefaultTitle: false,
      updatedAt: new Date().toISOString(),
    }))
  }

  /** Deletes a session and creates a replacement when it was the final workspace. */
  public async delete(id: string): Promise<DeleteSessionResult> {
    assertSessionId(id)
    return this.queue.run(this.directoryPath, async () => {
      const sessions = await this.list()
      if (!sessions.some((session) => session.id === id)) return { deleted: false }

      const replacement = sessions.length === 1 ? await this.create() : undefined
      try {
        await this.removeFile(id)
      } catch (error) {
        if (replacement) await this.removeFile(replacement.id).catch(() => undefined)
        throw error
      }
      return replacement ? { deleted: true, replacement } : { deleted: true }
    })
  }

  /** Deletes every session and returns a fresh empty workspace as the replacement. */
  public async deleteAll(): Promise<SessionDocument> {
    return this.queue.run(this.directoryPath, async () => {
      const sessions = await this.list()
      const replacement = await this.create()
      for (const session of sessions) {
        await this.removeFile(session.id)
      }
      return replacement
    })
  }

  /** Applies one session mutation without allowing another operation to interleave. */
  public async saveCapture(id: string, capture: ScreenCapture): Promise<SessionDocument> {
    return this.update(id, (session) => ({
      ...session,
      data: { capture },
      updatedAt: new Date().toISOString(),
    }))
  }

  /** Applies one session mutation without allowing another operation to interleave. */
  private async update(
    id: string,
    change: (session: SessionDocument) => SessionDocument,
  ): Promise<SessionDocument> {
    assertSessionId(id)
    const filePath = this.sessionPath(id)
    return this.queue.run(filePath, async () => {
      const session = sessionSchema.parse(change(await this.readUnlocked(filePath)))
      await writeJsonFile(filePath, session)
      return session
    })
  }

  /** Reads one session while tolerating malformed history entries. */
  private async tryRead(filePath: string): Promise<SessionDocument | null> {
    try {
      return await this.queue.run(filePath, () => this.readUnlocked(filePath))
    } catch {
      return null
    }
  }

  /** Reads a session while its caller owns the file-operation lock. */
  private async readUnlocked(filePath: string): Promise<SessionDocument> {
    return sessionSchema.parse(await readJsonFile(filePath))
  }

  /** Deletes one session file and treats an already missing file as removed. */
  private async removeFile(id: string): Promise<void> {
    const filePath = this.sessionPath(id)
    try {
      await this.queue.run(filePath, () => unlink(filePath))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  /** Resolves a validated session identifier to its JSON file. */
  private sessionPath(id: string): string {
    return join(this.directoryPath, `${id}.json`)
  }
}
