import { Buffer as NodeBuffer } from 'node:buffer'

/**
 * Minimal Buffer shim for non-Node runtimes (e.g., Deno, edge).
 * Ensures `Buffer` is available globally and provides a helper for buffer checks.
 */
export const BufferCompat: typeof NodeBuffer =
  typeof globalThis.Buffer !== 'undefined' ? globalThis.Buffer : NodeBuffer

if (typeof globalThis.Buffer === 'undefined') {
  ;(globalThis as any).Buffer = BufferCompat
}

export const isBuffer = (value: unknown): value is NodeBuffer =>
  BufferCompat?.isBuffer ? BufferCompat.isBuffer(value) : value instanceof Uint8Array
