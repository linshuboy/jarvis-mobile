type AsyncValueBackend<T> = {
  read: () => Promise<T | null>
  write: (value: T) => Promise<void>
  clear: () => Promise<void>
}

export type SerializedAsyncValue<T> = {
  read: () => Promise<T | null>
  write: (value: T) => Promise<void>
  clear: () => Promise<void>
  replace: (expected: T, value: T) => Promise<boolean>
  clearIfCurrent: (expected: T | null) => Promise<boolean>
}

export function createSerializedAsyncValue<T>(
  backend: AsyncValueBackend<T>,
  equals: (left: T | null, right: T | null) => boolean,
): SerializedAsyncValue<T> {
  let mutationTail: Promise<void> = Promise.resolve()

  function enqueueMutation<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
    const result = mutationTail.then(operation, operation)
    mutationTail = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  return {
    read: () => enqueueMutation(() => backend.read()),
    write: (value) => enqueueMutation(() => backend.write(value)),
    clear: () => enqueueMutation(() => backend.clear()),
    replace: (expected, value) =>
      enqueueMutation(async () => {
        const current = await backend.read()
        if (!equals(current, expected)) {
          return false
        }
        await backend.write(value)
        return true
      }),
    clearIfCurrent: (expected) =>
      enqueueMutation(async () => {
        const current = await backend.read()
        if (!equals(current, expected)) {
          return false
        }
        await backend.clear()
        return true
      }),
  }
}
