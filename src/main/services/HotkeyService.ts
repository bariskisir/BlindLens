/** Registers configurable global capture shortcuts, including a modifier-only Ctrl+Alt chord. */

import { globalShortcut } from 'electron'
import { createRequire } from 'node:module'
import type { UiohookKeyboardEvent } from 'uiohook-napi'
import { normalizeHotkey, isModifierHotkey } from '@shared/hotkey'
import type { LensState } from '@shared/lens'

/** Recognizes modifier-only chords without triggering on AltGr or longer shortcuts. */
export class ModifierChord {
  private readonly held = new Set<number>()
  private armed = false
  private blocked = false
  private required = new Set(['Ctrl', 'Alt'])
  /** Selects the required modifiers and discards any partially held previous chord. */
  public configure(accelerator: string): void {
    this.required = new Set(accelerator.split('+'))
    this.reset()
  }
  /** Maps native modifier codes while deliberately excluding AltGr. */
  private modifier(code: number): string | undefined {
    return (
      {
        29: 'Ctrl',
        3613: 'Ctrl',
        56: 'Alt',
        42: 'Shift',
        54: 'Shift',
        3675: 'Super',
        3676: 'Super',
      } as Record<number, string>
    )[code]
  }
  /** Tracks key presses without retaining typed text or generating repeat activations. */
  public down(code: number): void {
    if (this.held.has(code)) return
    this.held.add(code)
    if (!this.required.has(this.modifier(code) ?? '')) this.blocked = true
    const modifiers = new Set([...this.held].map((key) => this.modifier(key)))
    if (!this.blocked && [...this.required].every((modifier) => modifiers.has(modifier)))
      this.armed = true
  }
  /** Activates only when a standalone chord is released. */
  public up(code: number): boolean {
    if (!this.held.delete(code) || this.held.size > 0) return false
    const fire = this.armed && !this.blocked
    this.reset()
    return fire
  }
  /** Clears modifier tracking when a shortcut is replaced. */
  public reset(): void {
    this.held.clear()
    this.armed = false
    this.blocked = false
  }
}

/** Owns the shortcut registration for one application window. */
export default class HotkeyService {
  private current = ''
  private hooked = false
  private recording = false
  private recordingTimer: ReturnType<typeof setTimeout> | null = null
  private native: typeof import('uiohook-napi') | null = null
  private readonly chord = new ModifierChord()
  private state: LensState['hotkey'] = { accelerator: 'Ctrl+Alt', registered: false, error: null }
  /** Binds capture activation and public status reporting. */
  public constructor(
    private readonly activate: () => void,
    private readonly changed: () => void,
  ) {}
  /** Returns a copy of the current registration result. */
  public getState(): LensState['hotkey'] {
    return { ...this.state }
  }
  /** Registers a new shortcut before releasing the old one whenever the OS permits it. */
  public apply(accelerator: string): void {
    if (this.recording) throw new Error('Finish recording the shortcut before changing it.')
    const next = normalizeHotkey(accelerator)
    if (!next) throw new Error('Invalid capture shortcut.')
    if (next === this.current && this.state.registered) return
    if (isModifierHotkey(next) && !this.hooked) {
      try {
        this.native ??= createRequire(__filename)('uiohook-napi') as typeof import('uiohook-napi')
        const { uIOhook } = this.native
        uIOhook.on('keydown', this.onDown)
        uIOhook.on('keyup', this.onUp)
        uIOhook.start()
        this.hooked = true
      } catch {
        this.native?.uIOhook.removeListener('keydown', this.onDown)
        this.native?.uIOhook.removeListener('keyup', this.onUp)
        throw new Error(
          'Global keyboard access is unavailable. Choose a shortcut with a letter or function key.',
        )
      }
    } else if (!isModifierHotkey(next) && !globalShortcut.register(next, this.onActivate)) {
      throw new Error('This shortcut is already in use or is unavailable on this desktop.')
    }
    if (this.current && !isModifierHotkey(this.current) && this.current !== next)
      globalShortcut.unregister(this.current)
    if (this.hooked && !isModifierHotkey(next)) this.stopHook()
    if (isModifierHotkey(next)) this.chord.configure(next)
    this.current = next
    this.state = { accelerator: next, registered: true, error: null }
    this.changed()
  }
  /** Attempts startup registration without preventing the application from opening. */
  public initialize(accelerator: string): void {
    try {
      this.apply(accelerator)
    } catch (error) {
      this.state = {
        accelerator,
        registered: false,
        error: error instanceof Error ? error.message : 'Shortcut unavailable.',
      }
      this.changed()
    }
  }
  /** Removes every registration owned by this service. */
  public dispose(): void {
    if (this.recordingTimer) clearTimeout(this.recordingTimer)
    if (this.current && !isModifierHotkey(this.current)) globalShortcut.unregister(this.current)
    this.stopHook()
    this.current = ''
  }
  /** Tracks only key codes necessary to recognize the modifier chord. */
  private readonly onDown = (event: UiohookKeyboardEvent): void => {
    if (!this.recording) this.chord.down(event.keycode)
  }
  /** Fires once when a complete chord is released. */
  private readonly onUp = (event: UiohookKeyboardEvent): void => {
    if (!this.recording && this.chord.up(event.keycode)) this.onActivate()
  }
  /** Suppresses activation while the shortcut editor owns keyboard input. */
  private readonly onActivate = (): void => {
    if (!this.recording) this.activate()
  }
  /** Temporarily releases registered accelerators so the editor can record the existing chord too. */
  public setRecording(recording: boolean): void {
    if (this.recording === recording) return
    if (this.recordingTimer) clearTimeout(this.recordingTimer)
    this.recordingTimer = null
    this.recording = recording
    this.chord.reset()
    if (recording) {
      if (this.current && !isModifierHotkey(this.current)) globalShortcut.unregister(this.current)
      this.recordingTimer = setTimeout(() => this.setRecording(false), 30_000)
    } else if (this.current && !isModifierHotkey(this.current)) {
      const registered = globalShortcut.register(this.current, this.onActivate)
      this.state = {
        ...this.state,
        registered,
        error: registered
          ? null
          : 'The previous shortcut could not be restored. Choose another shortcut.',
      }
      this.changed()
    }
  }
  /** Releases native keyboard listeners and resets transient key state. */
  private stopHook(): void {
    if (!this.hooked || !this.native) return
    const { uIOhook } = this.native
    uIOhook.removeListener('keydown', this.onDown)
    uIOhook.removeListener('keyup', this.onUp)
    uIOhook.stop()
    this.hooked = false
    this.chord.reset()
  }
}
