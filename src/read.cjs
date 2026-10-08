'use strict';

/**
 * @fileoverview Reading a project's configuration: the file found, loaded
 * with cooper, and converted -- everything `load()` does except storing
 * the result. The CLI's `check` uses it on its own, so checking a
 * configuration never replaces one.
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadFileSync, CooperError } = require('cooper');
const CooperConfigError = require('./error.cjs');
const { parse } = require('./options.cjs');
const { projectRoot, configFile } = require('./project.cjs');
const { convert } = require('./convert.cjs');

/**
 * What one read found.
 * @typedef {object} Reading
 * @property {string} file -- the absolute path of the CASC file
 * @property {boolean} exists -- false only for a missing default file
 * @property {Readonly<Record<string, any>>} config -- the converted, deep-frozen configuration
 */

/**
 * Reads the configuration `options` describe.
 *
 * **A missing default file is an empty configuration**, as in cooper_prx:
 * a project that has no `config/config.casc` yet has nothing to
 * configure, not a reason to refuse to start. A `path` that was asked for
 * by name and is not there is a mistake, and is refused.
 *
 * @param {import('./options.cjs').LoadOptions} [options]
 * @param {string} [cwd] -- where the project root is searched from (default `process.cwd()`)
 * @returns {Reading}
 * @throws {TypeError} for bad options
 * @throws {CooperConfigError} when the file does not load or convert
 */
function read(options, cwd = process.cwd()) {
  const parsed = parse(options);
  const root = parsed.root === undefined ? projectRoot(cwd) : path.resolve(cwd, parsed.root);
  const file = configFile({ root, path: parsed.path });
  if (parsed.path === undefined && !fs.existsSync(file)) {
    return { file, exists: false, config: Object.freeze(Object.create(null)) };
  }
  try {
    const tree = loadFileSync(file, parsed.cooper);
    const modules = /** @type {import('./convert.cjs').ConvertOptions['modules']} */ (parsed.cooper.modules);
    return { file, exists: true, config: convert(tree, { modules }) };
  } catch (err) {
    throw failure(file, err);
  }
}

/**
 * The error a failed read throws: what went wrong, under a line naming
 * the file.
 * @param {string} file
 * @param {unknown} err
 * @returns {CooperConfigError}
 */
function failure(file, err) {
  const formatted = err instanceof CooperError ? formatCooperError(err, file) : /** @type {Error} */ (err).message ?? String(err);
  return new CooperConfigError(`failed to load CASC configuration from ${JSON.stringify(file)}:\n\n${formatted}`, { file, formatted, cause: err });
}

/**
 * A cooper error as one line: where (its own file, which may be an import,
 * else the file being loaded, with line and column when it has them),
 * which stage, and its message.
 * @param {InstanceType<typeof CooperError>} err
 * @param {string} file
 * @returns {string}
 */
function formatCooperError(err, file) {
  const where = (err.file ?? file) + (err.line !== undefined ? `:${err.line}:${err.column}` : '');
  return `${where}: ${err.stage} error: ${err.message}`;
}

module.exports = { read };
