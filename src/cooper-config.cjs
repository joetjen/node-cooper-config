'use strict';

/**
 * @fileoverview `cooper-config`: an application's CASC configuration,
 * loaded once at startup with `cooper`, and the functions it is read with.
 *
 * **Eager only.** `load()` (or the `cooper-config/register` preload)
 * reads the whole configuration once, as the program starts, and stores
 * it process-wide; `get`/`require`/`has`/`all` only ever read what was
 * stored. Nothing is loaded lazily on first access, reloaded, or watched:
 * a configuration problem stops the program at startup, where it is
 * cheap to find, rather than at whichever request first touches the bad
 * value. That is what the references -- `cooper_config` for Mix and
 * `cooper_prx` for Praxis -- do too.
 *
 * ```js
 * import { load, get } from 'cooper-config';
 *
 * load();                                    // config/config.casc under the project root
 * const size = get('database.pool.size', 10);
 * ```
 */

const version = require('./version.cjs');
const CooperConfigError = require('./error.cjs');
const { read } = require('./read.cjs');
const { convert } = require('./convert.cjs');
const { segments, describe, lookup } = require('./key-path.cjs');

/**
 * The stored configuration, or `null` before the first successful `load()`.
 * @type {Readonly<Record<string, any>> | null}
 */
let stored = null;

/**
 * Loads the configuration and stores it process-wide, replacing whatever
 * an earlier call stored. Synchronous: every resolver, tag and import
 * scheme passed through must return its value directly.
 *
 * The file is `config/config.casc` under the project root (the directory
 * of the nearest `package.json` above `process.cwd()`, else
 * `process.cwd()`), or `options.path`. A missing default file loads an
 * empty configuration; a missing `options.path` is an error.
 *
 * **Nothing is stored when the load fails**: whatever was there before
 * stays. A program with half its configuration is worse off than one told
 * why it has none.
 *
 * @param {import('./options.cjs').LoadOptions} [options]
 * @returns {Readonly<Record<string, any>>} the stored configuration, as `all()` returns it
 * @throws {TypeError} for an unknown option, or a `path`/`root` that is not a string
 * @throws {CooperConfigError} when the document does not load, or its conversion refuses a value
 */
function load(options) {
  stored = read(options).config;
  return stored;
}

/**
 * The stored configuration, or the error that says how to get one.
 * @returns {Readonly<Record<string, any>>}
 */
function current() {
  if (stored === null) {
    throw new CooperConfigError(
      'the configuration has not been loaded: call load() from cooper-config once at startup, before anything reads it, ' +
        'or start node with --import cooper-config/register (--require cooper-config/register for CommonJS)',
    );
  }
  return stored;
}

/**
 * The value at `path`, or `fallback` when there is none. A present `nil`
 * is `null`, not missing.
 *
 * @param {import('./key-path.cjs').KeyPath} path -- `'database.pool.size'`, or `['dotted.key', 'inner']` for a key holding a dot
 * @param {unknown} [fallback] -- answered when nothing is at `path` (default `undefined`)
 * @returns {any} the value, deep-frozen
 * @throws {CooperConfigError} before `load()`
 * @throws {TypeError} for a malformed path
 */
function get(path, fallback) {
  const found = lookup(current(), segments(path));
  return found.found ? found.value : fallback;
}

/**
 * The value at `path`, which must be there.
 *
 * @param {import('./key-path.cjs').KeyPath} path
 * @returns {any} the value, deep-frozen
 * @throws {CooperConfigError} naming `path` when nothing is there, or before `load()`
 * @throws {TypeError} for a malformed path
 */
function requireValue(path) {
  const parts = segments(path);
  const found = lookup(current(), parts);
  if (!found.found) throw new CooperConfigError(`the configuration has no value at ${describe(parts)}`);
  return found.value;
}

/**
 * Whether anything -- `null` included -- is at `path`.
 *
 * @param {import('./key-path.cjs').KeyPath} path
 * @returns {boolean}
 * @throws {CooperConfigError} before `load()`
 * @throws {TypeError} for a malformed path
 */
function has(path) {
  return lookup(current(), segments(path)).found;
}

/**
 * The whole configuration: a deep-frozen, null-prototype object.
 *
 * @returns {Readonly<Record<string, any>>}
 * @throws {CooperConfigError} before `load()`
 */
function all() {
  return current();
}

module.exports = { version, load, get, require: requireValue, has, all, convert, CooperConfigError };
