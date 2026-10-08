'use strict';

/**
 * @fileoverview The `cooper-config` command.
 *
 * ```text
 * cooper-config init  [--root DIR]               scaffold config/ in the project
 * cooper-config check [--path FILE] [--root DIR] load the configuration and report
 * ```
 *
 * `main` takes its working directory, environment and output as
 * arguments, so it runs in a test exactly as it does from `bin/`.
 */

const fs = require('node:fs');
const path = require('node:path');
const version = require('./version.cjs');
const CooperConfigError = require('./error.cjs');
const { read } = require('./read.cjs');
const { projectRoot } = require('./project.cjs');

/**
 * What `main` runs against.
 * @typedef {object} IO
 * @property {string} cwd -- the working directory the project root is found from
 * @property {Record<string, string>} [env] -- an override layer for `${...}`, on top of `process.env` (default none)
 * @property {(text: string) => void} stdout
 * @property {(text: string) => void} stderr
 */

const USAGE = `Usage: cooper-config <command> [options]

Commands:
  init   [--root DIR]               scaffold config/config.casc and config/{dev,test,prod}/
  check  [--path FILE] [--root DIR] load the configuration as the application will, and report
  help                              show this text

Options:
  --root DIR   the project root (default: the nearest directory above the
               working directory holding a package.json)
  --path FILE  the CASC file, relative to the project root
               (default: config/config.casc)
`;

/** The environments `init` scaffolds a directory for. */
const ENVIRONMENTS = ['dev', 'test', 'prod'];

/** The entry document `init` writes. The environment import is last so it overrides what comes before it. */
const ENTRY = `#@version = 1.0

# The application's configuration, loaded once at startup by cooper-config.
#
# Settings every environment shares go here. Each environment's own
# overrides live in config/<environment>/ and are imported last, so they
# win. \${COOPER_ENV} is COOPER_ENV if set, else NODE_ENV (development and
# local as dev, testing as test, production as prod), else "dev".

import "\${COOPER_ENV}/*.casc"
`;

/**
 * One environment's overlay. A file in each directory, because a glob
 * import that matches no files is a load error in cooper: without one,
 * the entry document's import would fail for the three environments a
 * project starts with.
 * @param {string} env
 * @returns {string}
 */
const overlay = (env) => `#@version = 1.0

# Overrides for the ${env} environment (COOPER_ENV=${env}), imported after
# config/config.casc. Add more .casc files here as the configuration grows.
`;

/**
 * Runs the command `argv` names.
 * @param {string[]} argv -- the arguments after the program name
 * @param {IO} io
 * @returns {number} the exit code: 0 success, 1 failure, 2 usage error
 */
function main(argv, io) {
  const [command, ...rest] = argv;
  if (command === 'help' || command === '--help' || command === '-h') {
    io.stdout(USAGE);
    return 0;
  }
  if (command === '--version' || command === '-v') {
    io.stdout(`${version}\n`);
    return 0;
  }
  if (command === 'init') return withFlags(rest, ['--root'], io, (flags) => init(flags, io));
  if (command === 'check') return withFlags(rest, ['--path', '--root'], io, (flags) => check(flags, io));
  io.stderr(command === undefined ? `cooper-config: no command given\n\n${USAGE}` : `cooper-config: unknown command ${JSON.stringify(command)}\n\n${USAGE}`);
  return 2;
}

/**
 * Parses `--flag VALUE` pairs, then runs `run`; a usage error otherwise.
 * @param {string[]} args
 * @param {string[]} allowed
 * @param {IO} io
 * @param {(flags: Record<string, string>) => number} run
 * @returns {number}
 */
function withFlags(args, allowed, io, run) {
  /** @type {Record<string, string>} */
  const flags = {};
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];
    if (!allowed.includes(flag)) {
      io.stderr(`cooper-config: unknown option ${JSON.stringify(flag)}\n\n${USAGE}`);
      return 2;
    }
    if (value === undefined || value.startsWith('--')) {
      io.stderr(`cooper-config: ${flag} needs a value\n\n${USAGE}`);
      return 2;
    }
    flags[flag] = value;
  }
  return run(flags);
}

/**
 * The project root the flags name, or the one found from `io.cwd`.
 * @param {Record<string, string>} flags
 * @param {IO} io
 * @returns {string}
 */
function rootOf(flags, io) {
  return flags['--root'] === undefined ? projectRoot(io.cwd) : path.resolve(io.cwd, flags['--root']);
}

/**
 * Scaffolds the configuration. **Refuses if any file it would write
 * exists, and then writes none**: a half-scaffolded directory next to a
 * configuration somebody wrote by hand is worse than being told to look.
 * @param {Record<string, string>} flags
 * @param {IO} io
 * @returns {number}
 */
function init(flags, io) {
  const root = rootOf(flags, io);
  /** @type {Array<[string, string]>} */
  const files = [
    [path.join('config', 'config.casc'), ENTRY],
    ...ENVIRONMENTS.map((env) => /** @type {[string, string]} */ ([path.join('config', env, `${env}.casc`), overlay(env)])),
  ];
  const existing = files.map(([name]) => name).filter((name) => fs.existsSync(path.join(root, name)));
  if (existing.length > 0) {
    io.stderr(`cooper-config: refusing to overwrite ${existing.join(', ')} in ${root}; nothing was written\n`);
    return 1;
  }
  for (const [name, contents] of files) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), contents, { flag: 'wx' });
    io.stdout(`created ${name}\n`);
  }
  return 0;
}

/**
 * Loads the configuration as the application will -- the same file, the
 * same `${COOPER_ENV}` -- without storing it, and reports.
 * @param {Record<string, string>} flags
 * @param {IO} io
 * @returns {number}
 */
function check(flags, io) {
  const root = rootOf(flags, io);
  try {
    const reading = read({ root, path: flags['--path'], env: io.env ?? {} }, io.cwd);
    const shown = path.relative(io.cwd, reading.file) || reading.file;
    io.stdout(
      reading.exists
        ? `${shown} loads (COOPER_ENV and the rest of the environment as this process sees them)\n`
        : `no configuration file at ${shown}: the application starts with an empty configuration\n`,
    );
    return 0;
  } catch (err) {
    if (!(err instanceof CooperConfigError)) throw err;
    io.stderr(`cooper-config: ${err.message}\n`);
    return 1;
  }
}

module.exports = { main };
