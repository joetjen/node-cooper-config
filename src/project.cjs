'use strict';

/**
 * @fileoverview Where a project's configuration is: the project root, and
 * the CASC file under it.
 */

const fs = require('node:fs');
const path = require('node:path');

/** The configuration file, relative to the project root. */
const DEFAULT_FILE = path.join('config', 'config.casc');

/**
 * The project root: the directory of the nearest `package.json` found
 * walking up from `cwd`, else `cwd` itself.
 *
 * The nearest `package.json` rather than the working directory, so a
 * program started from a subdirectory (a script in `bin/`, a test runner
 * in a workspace package) still finds its own `config/`. The fallback
 * keeps a script with no `package.json` at all working, the way the
 * references read `config/config.casc` from the working directory.
 *
 * @param {string} [cwd] -- where to start (default `process.cwd()`)
 * @returns {string} an absolute path
 */
function projectRoot(cwd = process.cwd()) {
  const start = path.resolve(cwd);
  for (let dir = start; ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    if (path.dirname(dir) === dir) return start;
  }
}

/**
 * The CASC file to load: `path` when given (a relative one against
 * `root`), else `config/config.casc` under `root`.
 *
 * A relative `path` is taken against the project root, not the working
 * directory, for the same reason the root is searched for: the program's
 * working directory is an accident of how it was started.
 *
 * @param {{root: string, path?: string}} where
 * @returns {string} an absolute path
 */
function configFile(where) {
  return path.resolve(where.root, where.path ?? DEFAULT_FILE);
}

module.exports = { projectRoot, configFile, DEFAULT_FILE };
