/** Observes system Web Speech voices, including asynchronous operating-system discovery. */

import { useEffect, useState } from 'react'

/** Returns the current browser voice catalog and releases its listener on unmount. */
export const useSpeechVoices = (): SpeechSynthesisVoice[] => {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  useEffect(() => {
    if (!('speechSynthesis' in window)) return
    /** Refreshes the voice list after the speech engine finishes discovery. */
    const update = (): void => setVoices(window.speechSynthesis.getVoices())
    update()
    window.speechSynthesis.addEventListener('voiceschanged', update)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', update)
  }, [])
  return voices
}
