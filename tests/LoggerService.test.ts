/**
 * Verifies main-process logger creation, directory setup, and main/renderer writes.
 */

import { existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { APP_SLUG } from '@shared/appInfo'

const testDir = join(tmpdir(), `${APP_SLUG}-logger-tests`)

// Hoisted module mocks must be registered before LoggerService is imported.
vi.mock('electron-log/main', () => {
  const mockLogFn = vi.fn()
  /** Creates independent mutable transport settings for each mocked logger. */
  const createTransport = () => ({
    file: { maxSize: 0, format: '', level: 'info', resolvePathFn: null as (() => string) | null },
    console: { format: '', level: 'info' },
  })
  return {
    default: {
      create: vi.fn(() => ({
        transports: createTransport(),
        error: mockLogFn,
        warn: mockLogFn,
        info: mockLogFn,
        debug: mockLogFn,
        verbose: mockLogFn,
      })),
    },
  }
})

vi.mock('electron', () => ({
  app: { name: 'test-app' },
}))

import electronLog from 'electron-log/main'
import LoggerService from '../src/main/services/LoggerService'

describe('LoggerService', () => {
  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true })
    } catch {
      /* Cleanup is best-effort because the directory may already be absent. */
    }
    vi.clearAllMocks()
  })

  it('creates two loggers using the app name as logId prefix', () => {
    new LoggerService(testDir, 'info')
    const create = electronLog.create as ReturnType<typeof vi.fn>
    expect(create).toHaveBeenCalledWith({ logId: 'test-app-app' })
    expect(create).toHaveBeenCalledWith({ logId: 'test-app-errors' })
  })

  it('returns the configured logs directory', () => {
    const service = new LoggerService(testDir, 'info')
    expect(service.getLogsDirectory()).toBe(testDir)
  })

  it('writes error and debug entries without throwing', () => {
    const service = new LoggerService(testDir, 'info')
    expect(() => {
      service.error('TestModule', 'Something went wrong')
      service.warn('TestModule', 'Deprecation warning')
      service.info('TestModule', 'App started')
      service.debug('TestModule', 'Extra detail')
    }).not.toThrow()
  })

  it('creates the log directory on instantiation', async () => {
    new LoggerService(testDir, 'info')
    await vi.waitFor(() => expect(existsSync(testDir)).toBe(true))
  })

  it('writes a renderer log entry without throwing', () => {
    const service = new LoggerService(testDir, 'info')
    expect(() =>
      service.writeRenderer({
        level: 'info',
        module: 'RendererModule',
        message: 'UI event',
      }),
    ).not.toThrow()
  })
})
