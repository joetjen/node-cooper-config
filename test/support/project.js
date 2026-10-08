import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Throwaway projects on disk for the specs: a temp directory holding the
 * files a test names, removed again by `cleanup()` (call it from an
 * `afterEach`). Every test that loads works in one of these, so nothing
 * depends on this repository's own layout or the developer's files.
 */

/** This package's own root, for spawning `node` against it. */
export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The version header every test document starts with. */
export const HEADER = '#@version = 1.0\n';

/** @type {string[]} */
const made = [];

/**
 * A fresh temp directory holding `files` (relative path -> contents;
 * intermediate directories are created). Its real path is returned, since
 * macOS's temp directory is reached through a symlink and the project
 * root is compared as a real path.
 * @param {Record<string, string>} [files]
 * @returns {string}
 */
export function project(files = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cooper-config-')));
  made.push(dir);
  write(dir, files);
  return dir;
}

/**
 * Writes `files` under `dir`.
 * @param {string} dir
 * @param {Record<string, string>} files
 */
export function write(dir, files) {
  for (const [name, contents] of Object.entries(files)) {
    const file = path.join(dir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  }
}

/** Removes every directory `project()` made, and restores the working directory. */
const originalCwd = process.cwd();
export function cleanup() {
  process.chdir(originalCwd);
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Load options that keep the developer's own `.env` files and
 * `COOPER_ENV`/`NODE_ENV` out of a test: no file layers, and an explicit
 * environment (on top of `process.env`, as always).
 * @param {object} [extra]
 */
export function hermetic(extra = {}) {
  return { dotenv: false, env: { COOPER_ENV: 'test' }, ...extra };
}
