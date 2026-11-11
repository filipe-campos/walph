export interface Deferred<T> {
  promise: Promise<T>
  resolve(value: T): void
  reject(reason: Error): void
}

/** Promise the test resolves or rejects whenever it wants (to order async responses). */
export function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => {}
  let reject: (reason: Error) => void = () => {}
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
