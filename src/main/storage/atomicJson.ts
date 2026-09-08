/**
 * Reads and writes durable JSON documents so an interrupted write cannot replace a valid file.
 */

import { randomUUID } from 'node:crypto'
import { renameSync, writeFileSync } from 'node:fs'
import { readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** File-name suffix of a durable write that has not been committed yet. */
const TEMPORARY_SUFFIX = '.tmp'

/** Serializes one value into the exact bytes stored in a durable JSON document. */
const serialize = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

/** Parses one JSON document without assuming it still matches its expected shape. */
export const readJsonFile = async (filePath: string): Promise<unknown> =>
  JSON.parse(await readFile(filePath, 'utf8'))

/** Commits one complete JSON payload without exposing a partially written destination. */
export const writeJsonFile = async (filePath: string, value: unknown): Promise<void> => {
  const temporaryPath = `${filePath}.${randomUUID()}${TEMPORARY_SUFFIX}`
  try {
    await writeFile(temporaryPath, serialize(value), 'utf8')
    await rename(temporaryPath, filePath)
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined)
    throw error
  }
}

/** Commits one small JSON payload during lifecycle events that cannot await asynchronous IO. */
export const writeJsonFileSync = (filePath: string, value: unknown): void => {
  const temporaryPath = `${filePath}${TEMPORARY_SUFFIX}`
  writeFileSync(temporaryPath, serialize(value), 'utf8')
  renameSync(temporaryPath, filePath)
}

/** Removes only the uncommitted files left behind by an interrupted durable write. */
export const removeInterruptedWrites = async (directoryPath: string): Promise<void> => {
  const entries = await readdir(directoryPath, { withFileTypes: true })
  await Promise.allSettled(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(TEMPORARY_SUFFIX))
      .map((entry) => unlink(join(directoryPath, entry.name))),
  )
}
