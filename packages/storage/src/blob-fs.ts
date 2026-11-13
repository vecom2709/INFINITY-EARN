import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import type { BlobStore } from './types.ts';

/** Dateisystem-Speicher (Node). Locator = absoluter Pfad. */
export class FsBlobStore implements BlobStore {
  readonly #base: string;
  constructor(baseDir: string) {
    this.#base = resolve(baseDir);
  }
  put(key: string, bytes: Uint8Array): string {
    if (key.includes('..') || isAbsolute(key)) throw new Error('INVALID_BLOB_KEY');
    const path = join(this.#base, key);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes, { flag: 'wx' });
    return path;
  }
  get(locator: string): Uint8Array | null {
    try {
      return readFileSync(locator);
    } catch {
      return null;
    }
  }
  overwrite(locator: string, bytes: Uint8Array): void {
    writeFileSync(locator, bytes);
  }
  delete(locator: string): void {
    if (!resolve(locator).startsWith(this.#base)) throw new Error('INVALID_BLOB_LOCATOR');
    rmSync(locator, { force: true });
  }
}
