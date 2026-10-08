'use strict';

/**
 * @fileoverview The options `load()` takes, and the check that refuses
 * any other.
 */

/**
 * @typedef {object} LoadOptions
 * @property {string} [path] -- the CASC file; a relative one against the project root (default `config/config.casc`)
 * @property {string} [root] -- the project root (default: the directory of the nearest `package.json` above `process.cwd()`, else `process.cwd()`)
 * @property {Record<string, string>} [env] -- cooper: an override layer for `${...}`, on top of `process.env` and `.env` files
 * @property {boolean} [dotenv] -- cooper: load `.env` files (default `true`)
 * @property {string | null} [dotenvEnv] -- cooper: the `<env>` in `.env.<env>` (default `COOPER_ENV`)
 * @property {string[]} [dotenvFiles] -- cooper: replaces the default `.env` file list
 * @property {string} [dotenvDir] -- cooper: where `.env` files are read from (default: the project root, the nearest `package.json` above `process.cwd()`)
 * @property {boolean} [dotenvOverride] -- cooper: let `.env` files outrank `process.env`
 * @property {Record<string, Function> | Map<string, Function>} [resolvers] -- cooper: one function per `!{name:...}`; synchronous, since `load()` is
 * @property {Record<string, Function> | Map<string, Function>} [tags] -- cooper: one function per `!name(...)`; synchronous
 * @property {Record<string, Function>} [importSchemes] -- cooper: one loader per `import "scheme://..."`; synchronous
 * @property {Record<string, unknown> | Map<string, unknown>} [modules] -- cooper: what each `!module("Name")` -- and each `cooper-secrets` module name -- means
 * @property {boolean} [cache] -- cooper: use cooper's file cache (default `true`)
 * @property {boolean} [watchEnv] -- cooper: let the cache poll the environment names the load read
 */

/** This library's own options. */
const OWN = ['path', 'root'];

/**
 * Every option handed to cooper's `loadFileSync` unchanged. Enumerated,
 * as `cooper_config` does, so a typo or an option from a newer version is
 * refused instead of silently dropped -- a `modules` misspelt as `module`
 * would otherwise leave a secrets policy unresolvable with no hint why.
 * cooper's own `root` and `file` are left out: `root` is this library's
 * (the project root, not the import base, which stays the file's
 * directory), and `file` is for `loadString` only.
 */
const COOPER = ['env', 'dotenv', 'dotenvEnv', 'dotenvFiles', 'dotenvDir', 'dotenvOverride', 'resolvers', 'tags', 'importSchemes', 'modules', 'cache', 'watchEnv'];

const SUPPORTED = [...OWN, ...COOPER];

/**
 * Checks `options` and splits it into this library's part and cooper's.
 * @param {unknown} options
 * @returns {{path: string | undefined, root: string | undefined, cooper: Record<string, unknown>}}
 * @throws {TypeError} for options that are not an object, an unknown key, or a `path`/`root` that is not a string
 */
function parse(options) {
  if (options === undefined) return { path: undefined, root: undefined, cooper: {} };
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError(`cooper-config load() takes an options object, not ${typeof options === 'string' ? JSON.stringify(options) : String(options)}; pass { path } to name a file`);
  }
  const given = /** @type {Record<string, unknown>} */ (options);
  const unknown = Object.keys(given).filter((key) => !SUPPORTED.includes(key));
  if (unknown.length > 0) {
    throw new TypeError(
      `cooper-config load() received unknown option(s): ${unknown.join(', ')}. Supported options: ${SUPPORTED.join(', ')}. ` +
        'If one of these was added in a newer cooper/cooper-config, check the versions you have installed.',
    );
  }
  for (const key of OWN) {
    if (given[key] !== undefined && typeof given[key] !== 'string') {
      throw new TypeError(`cooper-config load() option ${key} must be a string, not ${String(given[key])}`);
    }
  }
  /** @type {Record<string, unknown>} */
  const cooper = {};
  for (const key of COOPER) if (given[key] !== undefined) cooper[key] = given[key];
  return { path: /** @type {string | undefined} */ (given.path), root: /** @type {string | undefined} */ (given.root), cooper };
}

module.exports = { parse, SUPPORTED };
