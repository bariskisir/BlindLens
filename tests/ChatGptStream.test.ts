/** Verifies fragmented Responses streams, Unicode decoding, failures, and interrupted completions. */

import { describe, expect, it, vi } from 'vitest'
import { readChatGptStream } from '@main/services/ChatGptStream'

/** Delivers an SSE payload in arbitrary byte fragments, including split Unicode code points. */
const stream = (payload: string): Response => {
  const bytes = new TextEncoder().encode(payload)
  return new Response(
    new ReadableStream<Uint8Array>({
      /** Enqueues deliberately tiny network fragments. */
      start(controller) {
        for (let index = 0; index < bytes.length; index += 3)
          controller.enqueue(bytes.slice(index, index + 3))
        controller.close()
      },
    }),
  )
}

describe('ChatGPT response streaming', () => {
  it('handles fragmented text and a final event without a trailing newline', async () => {
    const delta = vi.fn()
    const result = await readChatGptStream(
      stream(
        'data: {"type":"response.output_text.delta","delta":"Merhaba 🌍"}\r\n\r\ndata: {"type":"response.completed","response":{"output":[{"content":[{"text":"Merhaba 🌍"}]}]}}',
      ),
      new AbortController().signal,
      delta,
    )
    expect(result).toBe('Merhaba 🌍')
    expect(delta).toHaveBeenCalledWith('Merhaba 🌍')
  })
  it.each(['response.failed', 'response.incomplete', 'error'])(
    'rejects the %s event instead of saving a successful empty answer',
    async (type) => {
      await expect(
        readChatGptStream(
          stream(`data: ${JSON.stringify({ type })}\n`),
          new AbortController().signal,
          vi.fn(),
        ),
      ).rejects.toThrow('could not complete')
    },
  )
  it('rejects a disconnected response even after receiving partial text', async () => {
    await expect(
      readChatGptStream(
        stream('data: {"type":"response.output_text.delta","delta":"partial"}\n'),
        new AbortController().signal,
        vi.fn(),
      ),
    ).rejects.toThrow('interrupted')
  })
  it('honors cancellation before accepting a completed response', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(readChatGptStream(stream(''), controller.signal, vi.fn())).rejects.toThrow()
  })
})
