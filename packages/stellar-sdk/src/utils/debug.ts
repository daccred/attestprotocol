/**
 * Opt-in debug logging for the Stellar SDK.
 *
 * Production code paths must never call `console.log` directly; use this
 * helper instead. Debug output is gated on the `STELLAR_SDK_DEBUG=1`
 * environment variable so it stays silent for end users.
 */

const isDebug = (): boolean => {
  if (typeof process === 'undefined' || !process?.env) {
    return false
  }
  return process.env.STELLAR_SDK_DEBUG === '1'
}

/**
 * Emit a `console.debug` line only when `STELLAR_SDK_DEBUG=1` is set.
 *
 * Safe to call from production paths because it is a no-op by default.
 */
// eslint-disable-next-line no-console
export const debug = (...args: unknown[]): void => {
  if (isDebug()) {
    // eslint-disable-next-line no-console
    console.debug(...args)
  }
}
