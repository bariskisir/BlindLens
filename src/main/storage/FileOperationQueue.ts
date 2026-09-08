/**
 * Serializes durable file operations so concurrent writes cannot overwrite one another.
 */

/** Runs operations sharing one key strictly in the order they were requested. */
export default class FileOperationQueue {
  private readonly tails = new Map<string, Promise<void>>()

  /** Runs one operation after every earlier operation queued for the same key. */
  public async run<Result>(key: string, operation: () => Promise<Result>): Promise<Result> {
    const previous = this.tails.get(key) ?? Promise.resolve()
    /** Releases this operation's gate even when the protected operation fails. */
    let release = (): void => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const tail = previous.catch(() => undefined).then(() => gate)
    this.tails.set(key, tail)
    await previous.catch(() => undefined)
    try {
      return await operation()
    } finally {
      release()
      if (this.tails.get(key) === tail) this.tails.delete(key)
    }
  }
}
