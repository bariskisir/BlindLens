/** Verifies persisted capture settings, prompt selection invariants, and untrusted IPC media payloads. */

import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { parsePersistedSettings, settingsPatchSchema, settingsSchema } from '@main/settingsSchema'
import {
  captureExportSchema,
  captureMediaSchema,
  captureRetrySchema,
  credentialSaveSchema,
} from '@main/ipc/schemas'

describe('screen description preferences', () => {
  it('defaults both languages to English and limits the selected built-in description to five sentences', () => {
    const settings = parsePersistedSettings(null)
    expect(settings.uiLanguage).toBe('en')
    expect(settings.descriptionLanguage).toBe('en')
    expect(
      settings.systemPrompts.find((prompt) => prompt.id === settings.systemPromptPreset)?.text,
    ).toContain('no more than 5 short sentences')
    expect(parsePersistedSettings({ descriptionLanguage: 'tr' }).descriptionLanguage).toBe('tr')
  })
  it('restores all built-ins without dropping a full legacy custom prompt collection', () => {
    const prompts = Array.from({ length: 100 }, (_, index) => ({
      id: `custom-${index}`,
      name: `Prompt ${index}`,
      text: `Instructions ${index}`,
    }))
    const restored = parsePersistedSettings({
      systemPrompts: prompts,
      systemPromptPreset: 'custom-99',
    })
    expect(restored.systemPrompts).toHaveLength(103)
    expect(restored.systemPrompts.filter((prompt) => !prompt.isBuiltIn)).toHaveLength(100)
    expect(restored.systemPromptPreset).toBe('custom-99')
    expect(parsePersistedSettings(restored)).toEqual(restored)
  })
  it('rejects deleting, changing, or unmarking built-in prompts at the persistence boundary', () => {
    for (const prompts of [
      DEFAULT_SETTINGS.systemPrompts.slice(1),
      DEFAULT_SETTINGS.systemPrompts.map((prompt) => ({ ...prompt, text: 'Changed' })),
      DEFAULT_SETTINGS.systemPrompts.map((prompt) => ({ ...prompt, isBuiltIn: false })),
    ])
      expect(
        settingsSchema.safeParse({ ...DEFAULT_SETTINGS, systemPrompts: prompts }).success,
      ).toBe(false)
  })
  it('restores missing built-ins and preserves older edits as selected custom prompts', () => {
    const restored = parsePersistedSettings({
      ...DEFAULT_SETTINGS,
      systemPrompts: [
        { id: 'describe', name: 'My prompt', text: 'My previous instructions' },
        { id: 'mine', name: 'Custom', text: 'Keep me' },
      ],
    })
    expect(restored.systemPrompts.slice(0, 3)).toEqual(DEFAULT_SETTINGS.systemPrompts)
    expect(restored.systemPrompts.find((prompt) => prompt.id === 'mine')?.text).toBe('Keep me')
    expect(
      restored.systemPrompts.find((prompt) => prompt.id === restored.systemPromptPreset),
    ).toMatchObject({ name: 'My prompt', text: 'My previous instructions', isBuiltIn: false })
    expect(settingsSchema.safeParse(restored).success).toBe(true)
  })
  it('defaults to Ctrl+Alt and repairs corrupted fields independently', () => {
    expect(DEFAULT_SETTINGS.captureHotkey).toBe('Ctrl+Alt')
    const saved = parsePersistedSettings({
      ...DEFAULT_SETTINGS,
      captureHotkey: 'Invalid',
      speechRate: 20,
      speechProvider: 'openrouter',
      systemPromptPreset: 'deleted',
      theme: 'dark',
    })
    expect(saved.captureHotkey).toBe('Ctrl+Alt')
    expect(saved.speechRate).toBe(1)
    expect(saved.theme).toBe('dark')
    expect(saved.speechProvider).toBe('openrouter')
    expect(saved.systemPrompts.some((prompt) => prompt.id === saved.systemPromptPreset)).toBe(true)
  })
  it('rejects missing, duplicate, or empty system prompts and secret settings fields', () => {
    expect(
      settingsSchema.safeParse({ ...DEFAULT_SETTINGS, systemPromptPreset: 'missing' }).success,
    ).toBe(false)
    expect(settingsSchema.safeParse({ ...DEFAULT_SETTINGS, systemPrompts: [] }).success).toBe(false)
    expect(
      settingsSchema.safeParse({
        ...DEFAULT_SETTINGS,
        systemPrompts: [...DEFAULT_SETTINGS.systemPrompts, DEFAULT_SETTINGS.systemPrompts[0]],
      }).success,
    ).toBe(false)
    expect(settingsPatchSchema.safeParse({ deepgramApiKey: 'secret' }).success).toBe(false)
  })
  it('rejects path traversal, arbitrary exports, unknown credential providers, and header injection', () => {
    expect(captureMediaSchema.safeParse({ id: '../secret', assetId: '../secret' }).success).toBe(
      false,
    )
    expect(captureRetrySchema.safeParse({ id: 'bad', speechOnly: true }).success).toBe(false)
    expect(
      captureExportSchema.safeParse({
        id: '550e8400-e29b-41d4-a716-446655440000',
        kind: 'executable',
      }).success,
    ).toBe(false)
    expect(credentialSaveSchema.safeParse({ provider: 'unknown', key: 'test' }).success).toBe(false)
    expect(
      credentialSaveSchema.safeParse({ provider: 'deepgram', key: 'test\nInjected: value' })
        .success,
    ).toBe(false)
  })
})
