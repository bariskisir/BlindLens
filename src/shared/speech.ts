/** Defines speech chunking and the Deepgram voice catalog adapted from epubreader. */

export const DEEPGRAM_VOICES: Record<string, readonly string[]> = {
  en: [
    'amalthea',
    'andromeda',
    'apollo',
    'arcas',
    'aries',
    'asteria',
    'athena',
    'atlas',
    'aurora',
    'callista',
    'cora',
    'cordelia',
    'delia',
    'draco',
    'electra',
    'harmonia',
    'helena',
    'hera',
    'hermes',
    'hyperion',
    'iris',
    'janus',
    'juno',
    'jupiter',
    'luna',
    'mars',
    'minerva',
    'neptune',
    'odysseus',
    'ophelia',
    'orion',
    'orpheus',
    'pandora',
    'phoebe',
    'pluto',
    'saturn',
    'selene',
    'thalia',
    'theia',
    'vesta',
    'zeus',
  ],
  es: [
    'sirio',
    'nestor',
    'carina',
    'celeste',
    'alvaro',
    'diana',
    'aquila',
    'selena',
    'estrella',
    'javier',
    'agustina',
    'antonia',
    'gloria',
    'luciano',
    'olivia',
    'silvia',
    'valerio',
  ],
  nl: ['beatrix', 'daphne', 'cornelia', 'sander', 'hestia', 'lars', 'roman', 'rhea', 'leda'],
  fr: ['agathe', 'hector'],
  de: ['elara', 'aurelia', 'lara', 'julius', 'fabian', 'kara', 'viktoria'],
  it: [
    'melia',
    'elio',
    'flavio',
    'maia',
    'cinzia',
    'cesare',
    'livia',
    'perseo',
    'dionisio',
    'demetra',
  ],
  ja: ['uzume', 'ebisu', 'fujin', 'izanami', 'ama'],
}

/** Splits speech into bounded phrases without discarding characters or breaking surrogate pairs. */
export const splitSpeechText = (text: string, maximum = 900): string[] => {
  if (maximum < 2) throw new Error('Speech chunk size must be at least two characters.')
  const chunks: string[] = []
  let remaining = text.trim()
  while (remaining.length > maximum) {
    const candidate = remaining.slice(0, maximum)
    const boundaries = [...candidate.matchAll(/[.!?。！？\n]\s*|\s+/g)]
    const last = boundaries.at(-1)
    let end = last && last.index > maximum / 2 ? last.index + last[0].length : maximum
    const lastCode = remaining.charCodeAt(end - 1)
    if (lastCode >= 0xd800 && lastCode <= 0xdbff) end--
    chunks.push(remaining.slice(0, end).trim())
    remaining = remaining.slice(end).trim()
  }
  if (remaining) chunks.push(remaining)
  return chunks
}
