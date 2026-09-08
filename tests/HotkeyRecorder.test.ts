/** Verifies physical key recording independently of browser timing and global keyboard hooks. */

import { describe, expect, it } from 'vitest'
import { HotkeyRecorder } from '@shared/hotkey'

describe('shortcut key recorder', () => {
  it('records a single modifier and a single ordinary key', () => {
    const recorder = new HotkeyRecorder()
    expect(recorder.down('ControlLeft')).toBe('Ctrl')
    expect(recorder.up('ControlLeft')).toBe('Ctrl')
    recorder.down('KeyA')
    expect(recorder.up('KeyA')).toBe('A')
  })
  it('waits for all keys to be released and preserves the complete combination', () => {
    const recorder = new HotkeyRecorder()
    recorder.down('AltLeft')
    recorder.down('ControlLeft')
    recorder.down('KeyK')
    expect(recorder.preview()).toBe('Ctrl+Alt+K')
    expect(recorder.up('ControlLeft')).toBeUndefined()
    expect(recorder.up('KeyK')).toBeUndefined()
    expect(recorder.up('AltLeft')).toBe('Ctrl+Alt+K')
  })
  it('deduplicates repeats and tracks both physical sides of a modifier until release', () => {
    const recorder = new HotkeyRecorder()
    recorder.down('ControlLeft')
    recorder.down('ControlLeft')
    recorder.down('ControlRight')
    expect(recorder.up('ControlLeft')).toBeUndefined()
    expect(recorder.up('ControlRight')).toBe('Ctrl')
  })
  it('rejects AltGr and multiple ordinary keys, then allows a clean retry', () => {
    const recorder = new HotkeyRecorder()
    recorder.down('ControlLeft')
    recorder.down('AltRight')
    recorder.up('AltRight')
    expect(recorder.up('ControlLeft')).toBeNull()
    recorder.down('KeyA')
    recorder.down('KeyB')
    recorder.up('KeyA')
    expect(recorder.up('KeyB')).toBeNull()
    recorder.down('F8')
    expect(recorder.up('F8')).toBe('F8')
  })
  it('discards interrupted keys and ignores unmatched releases', () => {
    const recorder = new HotkeyRecorder()
    recorder.down('ControlLeft')
    recorder.reset()
    expect(recorder.up('ControlLeft')).toBeUndefined()
    recorder.down('Escape')
    expect(recorder.up('Escape')).toBe('Escape')
  })
})
