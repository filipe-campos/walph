// Single log output point of main (eslint forbids `console` outside this file). Each module creates its own scope.

export interface Log {
  warn(message: string, ...details: unknown[]): void
  error(message: string, ...details: unknown[]): void
}

export function createLog(scope: string): Log {
  const prefix = `[${scope}]`
  return {
    warn: (message, ...details) => console.warn(prefix, message, ...details),
    error: (message, ...details) => console.error(prefix, message, ...details)
  }
}
