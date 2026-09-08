/** Reads bounded ChatGPT Responses events and rejects failed or interrupted completions. */

import { z } from 'zod'
import { MAX_DESCRIPTION_LENGTH } from '@shared/lens'

const eventSchema = z.object({
  type: z.string(),
  delta: z.string().optional(),
  response: z
    .object({
      output: z
        .array(z.object({ content: z.array(z.object({ text: z.string().optional() })).optional() }))
        .optional(),
    })
    .optional(),
})

/** Collects a successful SSE response while preserving incremental text for the workspace. */
export const readChatGptStream = async (
  response: Response,
  signal: AbortSignal,
  onDelta: (delta: string) => void,
): Promise<string> => {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('ChatGPT returned an empty response.')
  const decoder = new TextDecoder()
  let buffer = ''
  let answer = ''
  let completed = false
  let totalBytes = 0
  /** Processes one SSE data line while accepting only documented text event shapes. */
  const consume = (line: string): void => {
    if (!line.startsWith('data:')) return
    const data = line.slice(5).trim()
    if (!data || data === '[DONE]') return
    const event = eventSchema.parse(JSON.parse(data))
    if (['error', 'response.failed', 'response.incomplete'].includes(event.type))
      throw new Error(
        'ChatGPT could not complete the description. Try again or choose another model.',
      )
    if (event.type === 'response.output_text.delta' && event.delta) {
      answer += event.delta
      if (answer.length > MAX_DESCRIPTION_LENGTH)
        throw new Error('The description exceeded the text limit.')
      onDelta(event.delta)
    }
    if (event.type === 'response.completed') {
      const finalText = event.response?.output
        ?.flatMap((item) => item.content?.map((part) => part.text ?? '') ?? [])
        .join('\n')
        .trim()
      if (finalText) answer = finalText
      completed = true
    }
  }
  try {
    for (;;) {
      signal.throwIfAborted()
      const chunk = await reader.read()
      if (chunk.done) {
        buffer += decoder.decode()
        if (buffer.trim()) consume(buffer)
        break
      }
      totalBytes += chunk.value.byteLength
      if (totalBytes > 8 * 1024 * 1024) throw new Error('ChatGPT response exceeded the size limit.')
      buffer += decoder.decode(chunk.value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) consume(line)
    }
    signal.throwIfAborted()
    if (!completed || !answer.trim())
      throw new Error('ChatGPT response was interrupted or contained no description.')
    if (answer.length > MAX_DESCRIPTION_LENGTH)
      throw new Error('The description exceeded the text limit.')
    return answer.trim()
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}
