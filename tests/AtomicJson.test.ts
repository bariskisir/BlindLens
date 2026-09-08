/**
 * Verifies durable JSON writes, reads, and interrupted-write cleanup.
 */

import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  readJsonFile,
  removeInterruptedWrites,
  writeJsonFile,
  writeJsonFileSync,
} from '../src/main/storage/atomicJson'

const temporaryDirectories: string[] = []

/** Creates an isolated directory for one durable-storage test. */
const createDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'app-atomic-json-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('writeJsonFile', () => {
  it('writes formatted JSON and leaves no uncommitted file behind', async () => {
    const directory = await createDirectory()
    const filePath = join(directory, 'settings.json')

    await writeJsonFile(filePath, { theme: 'dark' })

    expect(await readFile(filePath, 'utf8')).toBe('{\n  "theme": "dark"\n}\n')
    expect(await readdir(directory)).toEqual(['settings.json'])
  })

  it('replaces an existing document in place', async () => {
    const directory = await createDirectory()
    const filePath = join(directory, 'settings.json')

    await writeJsonFile(filePath, { revision: 1 })
    await writeJsonFile(filePath, { revision: 2 })

    expect(await readJsonFile(filePath)).toEqual({ revision: 2 })
    expect(await readdir(directory)).toEqual(['settings.json'])
  })
})

describe('writeJsonFileSync', () => {
  it('commits small documents during lifecycle events', async () => {
    const directory = await createDirectory()
    const filePath = join(directory, 'window-state.json')

    writeJsonFileSync(filePath, { maximized: true })

    expect(await readJsonFile(filePath)).toEqual({ maximized: true })
    expect(await readdir(directory)).toEqual(['window-state.json'])
  })
})

describe('readJsonFile', () => {
  it('rejects malformed documents instead of returning partial data', async () => {
    const directory = await createDirectory()
    const filePath = join(directory, 'broken.json')
    await writeFile(filePath, '{not-json', 'utf8')

    await expect(readJsonFile(filePath)).rejects.toThrow()
  })
})

describe('removeInterruptedWrites', () => {
  it('removes only uncommitted files from an earlier run', async () => {
    const directory = await createDirectory()
    await writeJsonFile(join(directory, 'settings.json'), {})
    await writeFile(join(directory, 'settings.json.1234.tmp'), 'partial', 'utf8')

    await removeInterruptedWrites(directory)

    expect(await readdir(directory)).toEqual(['settings.json'])
  })
})
