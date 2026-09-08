/** Validates accelerators and records physical key chords until every pressed key is released. */

export const HOTKEY_MODIFIERS = ['Ctrl', 'Alt', 'Shift', 'Super'] as const
const KEY_PATTERN =
  /^(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Space|Tab|Escape|Enter|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Up|Down|Left|Right|Plus|Capslock|Numlock|Scrolllock|PrintScreen|Pause|[,./\\;'[\]`=-])$/

/** Identifies chords that need native modifier tracking instead of Electron accelerators. */
export const isModifierHotkey = (accelerator: string): boolean =>
  accelerator.split('+').every((part) => HOTKEY_MODIFIERS.some((modifier) => modifier === part))

/** Returns the canonical accelerator, or null when a chord is ambiguous or unsupported. */
export const normalizeHotkey = (input: string): string | null => {
  const parts = input
    .trim()
    .split('+')
    .map((part) => part.trim())
  if (parts.length < 1 || parts.length > 5 || new Set(parts).size !== parts.length) return null
  const modifiers = HOTKEY_MODIFIERS.filter((modifier) => parts.includes(modifier))
  const keys = parts.filter((part) => !HOTKEY_MODIFIERS.some((modifier) => modifier === part))
  if (keys.length === 0) return modifiers.join('+') || null
  if (keys.length !== 1 || !KEY_PATTERN.test(keys[0] ?? '')) return null
  return [...modifiers, keys[0]].join('+')
}

/** Maps browser physical key codes to Electron accelerator names without depending on keyboard layout. */
const keyFromCode = (code: string): string | null => {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  if (/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(code)) return code
  const names: Record<string, string> = {
    ControlLeft: 'Ctrl',
    ControlRight: 'Ctrl',
    AltLeft: 'Alt',
    ShiftLeft: 'Shift',
    ShiftRight: 'Shift',
    MetaLeft: 'Super',
    MetaRight: 'Super',
    Space: 'Space',
    Tab: 'Tab',
    Escape: 'Escape',
    Enter: 'Enter',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Insert: 'Insert',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    CapsLock: 'Capslock',
    NumLock: 'Numlock',
    ScrollLock: 'Scrolllock',
    PrintScreen: 'PrintScreen',
    Pause: 'Pause',
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    BracketLeft: '[',
    BracketRight: ']',
    Backquote: '`',
    Minus: '-',
    Equal: '=',
  }
  return names[code] ?? null
}

/** Tracks one recording without committing partial releases, repeats, or unsupported combinations. */
export class HotkeyRecorder {
  private readonly held = new Set<string>()
  private readonly keys = new Set<string>()
  private invalid = false
  /** Accumulates distinct keys and returns the currently visible chord. */
  public down(code: string): string {
    this.held.add(code)
    const key = keyFromCode(code)
    if (key) this.keys.add(key)
    else this.invalid = true
    return this.preview()
  }
  /** Returns undefined while keys remain held, null for an invalid chord, or the completed accelerator. */
  public up(code: string): string | null | undefined {
    if (!this.held.delete(code) || this.held.size > 0) return undefined
    const result = this.invalid ? null : normalizeHotkey([...this.keys].join('+'))
    this.reset()
    return result
  }
  /** Formats the captured keys while preserving all modifiers until the final release. */
  public preview(): string {
    return normalizeHotkey([...this.keys].join('+')) ?? [...this.keys].join('+')
  }
  /** Discards an interrupted recording when focus is lost or the dialog is cancelled. */
  public reset(): void {
    this.held.clear()
    this.keys.clear()
    this.invalid = false
  }
}
