/** Bounds provider response bodies and keeps upstream errors free of request content or secrets. */

/** Reads a response with a strict byte limit and cancels incomplete streams. */
export const readBoundedBytes = async (
  response: Response,
  maximum: number,
): Promise<Uint8Array> => {
  if (Number(response.headers.get('content-length')) > maximum) {
    await response.body?.cancel()
    throw new Error('Provider response exceeded the size limit.')
  }
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Provider returned an empty response.')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const result = await reader.read()
      if (result.done) break
      size += result.value.byteLength
      if (size > maximum) throw new Error('Provider response exceeded the size limit.')
      chunks.push(result.value)
    }
    return Buffer.concat(chunks)
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

/** Parses bounded provider JSON as untrusted data. */
export const readProviderJson = async (response: Response): Promise<unknown> =>
  JSON.parse(new TextDecoder().decode(await readBoundedBytes(response, 4 * 1024 * 1024)))

/** Converts HTTP errors to bounded actionable messages without logging response bodies. */
export const requireProviderSuccess = async (
  response: Response,
  provider: string,
): Promise<void> => {
  if (response.ok) return
  await response.body?.cancel()
  const detail =
    response.status === 401 || response.status === 403
      ? 'Check your account or API key.'
      : response.status === 429
        ? 'Usage limit reached. Try again later.'
        : 'Check the selected model, voice, and network connection.'
  throw new Error(`${provider}: HTTP ${response.status}. ${detail}`)
}
