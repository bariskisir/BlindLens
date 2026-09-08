/** Verifies modifier-only activation, AltGr suppression, and conflicting shortcut replacement. */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeHotkey } from '@shared/hotkey'
import HotkeyService, { ModifierChord } from '@main/services/HotkeyService'

const native = vi.hoisted(() => ({
  register: vi.fn<(_key: string, _callback: () => void) => boolean>(() => true),
  unregister: vi.fn(),
}))
vi.mock('electron', () => ({ globalShortcut: native }))

describe('capture shortcuts', () => {
  it('supports a standalone Ctrl while ignoring normal Ctrl shortcuts and AltGr', () => {
    const chord = new ModifierChord()
    chord.configure('Ctrl')
    chord.down(29)
    expect(chord.up(29)).toBe(true)
    chord.down(29)
    chord.down(46)
    expect(chord.up(46)).toBe(false)
    expect(chord.up(29)).toBe(false)
    chord.down(29)
    chord.down(3640)
    expect(chord.up(3640)).toBe(false)
    expect(chord.up(29)).toBe(false)
  })
  it('suspends an accelerator while recording and restores it without accidental activation', () => {
    const activate = vi.fn()
    const service = new HotkeyService(activate, vi.fn())
    service.apply('Ctrl+Shift+Space')
    const callback = native.register.mock.calls.at(-1)?.[1] as (() => void) | undefined
    service.setRecording(true)
    expect(native.unregister).toHaveBeenCalledWith('Ctrl+Shift+Space')
    callback?.()
    expect(activate).not.toHaveBeenCalled()
    service.setRecording(false)
    callback?.()
    expect(activate).toHaveBeenCalledOnce()
    expect(native.register).toHaveBeenCalledTimes(2)
    service.dispose()
  })
  beforeEach(() => vi.clearAllMocks())
  it('normalizes supported chords and rejects ambiguous or unsafe shortcuts', () => {
    expect(normalizeHotkey(' Alt + Ctrl ')).toBe('Ctrl+Alt')
    expect(normalizeHotkey('Shift+Ctrl+Space')).toBe('Ctrl+Shift+Space')
    expect(normalizeHotkey('Ctrl')).toBe('Ctrl')
    expect(normalizeHotkey('Alt+Shift')).toBe('Alt+Shift')
    expect(normalizeHotkey('A')).toBe('A')
    for (const invalid of ['Ctrl+Ctrl+A', 'Ctrl+Foo', 'Ctrl+A+B', 'Ctrl++'])
      expect(normalizeHotkey(invalid)).toBeNull()
  })
  it('fires once on release, regardless of modifier order and repeats', () => {
    for (const [first, second] of [
      [29, 56],
      [56, 29],
    ]) {
      const chord = new ModifierChord()
      chord.down(first ?? 29)
      chord.down(second ?? 56)
      chord.down(second ?? 56)
      expect(chord.up(first ?? 29)).toBe(false)
      expect(chord.up(second ?? 56)).toBe(true)
      chord.down(29)
      chord.down(56)
      expect(chord.up(56)).toBe(false)
      expect(chord.up(29)).toBe(true)
    }
  })
  it('does not capture during Ctrl+Alt+Delete, AltGr, or a partially released longer shortcut', () => {
    const chord = new ModifierChord()
    chord.down(29)
    chord.down(56)
    chord.down(3667)
    expect(chord.up(3667)).toBe(false)
    chord.down(29)
    expect(chord.up(29)).toBe(false)
    expect(chord.up(56)).toBe(false)
    chord.down(29)
    chord.down(3640)
    expect(chord.up(3640)).toBe(false)
    expect(chord.up(29)).toBe(false)
  })
  it('retains the previous registered shortcut when replacement conflicts', () => {
    const activate = vi.fn()
    const service = new HotkeyService(activate, vi.fn())
    service.apply('Ctrl+Shift+Space')
    native.register.mockReturnValueOnce(false)
    expect(() => service.apply('Ctrl+Shift+A')).toThrow('already in use')
    expect(service.getState()).toMatchObject({ accelerator: 'Ctrl+Shift+Space', registered: true })
    expect(native.unregister).not.toHaveBeenCalled()
    service.dispose()
    expect(native.unregister).toHaveBeenCalledWith('Ctrl+Shift+Space')
  })
})
