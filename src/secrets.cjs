'use strict';

/**
 * @fileoverview How a top-level block's secrets arrive: the
 * `cooper-secrets` key (cooper_prx's design).
 *
 * ```casc
 * database {
 *   cooper-secrets = keep            # reveal | keep | "Acme.OwnedSecret"
 *   *password      = ${DB_PASSWORD}
 * }
 * ```
 *
 * **A key in the document, not a load option**, so one document means the
 * same thing to every Cooper integration that reads it: the Praxis one
 * has no options to take it from, and a document shared between them
 * should not depend on which one loaded it.
 *
 * **Named for the library that consumes it.** `secrets` reads better and is
 * an ordinary thing for an application to want as a real setting; this
 * name takes nothing from anybody.
 */

const path = require('node:path');
const util = require('node:util');
const { createRequire } = require('node:module');
const { fileURLToPath } = require('node:url');
const { ModuleRef } = require('cooper');
const CooperConfigError = require('./error.cjs');

/** The key a top-level block states its secret handling under. */
const POLICY_KEY = 'cooper-secrets';

/**
 * How one block wants its secrets: revealed, kept as cooper `Secret`s, or
 * revealed and handed to the application's own wrapper.
 * @typedef {{mode: 'reveal'} | {mode: 'keep'} | {mode: 'wrap', wrap: (value: unknown) => unknown}} Policy
 */

/** @type {Policy} */
const REVEAL = Object.freeze({ mode: 'reveal' });
/** @type {Policy} */
const KEEP = Object.freeze({ mode: 'keep' });

/**
 * The policy the block `name` states with `said`, the value of its
 * `cooper-secrets` key (`undefined` when it has none).
 *
 * The two modes are atoms (`keep`, `reveal`), and a wrapper is a string,
 * because a CASC atom cannot hold the dots a module name has. A wrapper
 * is resolved here, once per block and whether or not the block holds a
 * secret, so a typo in the name fails at startup rather than never.
 *
 * @param {unknown} said
 * @param {string} name -- the block, for messages
 * @param {Record<string, unknown> | Map<string, unknown> | undefined} modules -- cooper's `modules` load option
 * @returns {Policy}
 * @throws {CooperConfigError} for anything that is no policy, or a wrapper that cannot be resolved
 */
function policyOf(said, name, modules) {
  if (said === undefined || said === Symbol.for('reveal')) return REVEAL;
  if (said === Symbol.for('keep')) return KEEP;
  if (typeof said === 'string') return { mode: 'wrap', wrap: wrapper(said, name, modules) };
  throw new CooperConfigError(
    `"${POLICY_KEY}" in ${JSON.stringify(name)} is ${display(said)}, which is no policy: write the atom reveal or keep, ` +
      'or a string naming a module (mapped by the modules load option) whose result wraps each secret',
  );
}

/**
 * The function that wraps one revealed secret for the module `named`,
 * resolved through `modules` exactly as `!module("Name")` is (CASC.md
 * §7.5): the same PascalCase name, the same mapping. A class is called
 * with `new`, any other function plainly.
 *
 * Refused rather than crashed when the name leads nowhere callable: a
 * policy naming the wrong module is a typo in a configuration file, and
 * a `TypeError` from deep inside the conversion is the least useful way
 * to learn that.
 *
 * @param {string} named
 * @param {string} block
 * @param {Record<string, unknown> | Map<string, unknown> | undefined} modules
 * @returns {(value: unknown) => unknown}
 */
function wrapper(named, block, modules) {
  const prefix = `"${POLICY_KEY}" in ${JSON.stringify(block)} names ${JSON.stringify(named)}`;
  const invalid = ModuleRef.validate(named);
  if (invalid !== null) throw new CooperConfigError(`${prefix}, which is not a module name: ${invalid}`);
  const target = modules instanceof Map ? modules.get(named) : modules && Object.hasOwn(modules, named) ? modules[named] : undefined;
  if (target === undefined) {
    throw new CooperConfigError(`${prefix}, which the modules load option does not map: map the name to the function or class that wraps a secret`);
  }
  const ref = new ModuleRef(named, target);
  const loaded = ref.specifier === undefined ? ref.value : required(ref.specifier, prefix);
  const callable = callableOf(loaded);
  if (callable === null) {
    throw new CooperConfigError(`${prefix}, which the modules load option maps to something that is not a function or class -- a module wrapping a secret needs one`);
  }
  return isClass(callable) ? (value) => new callable(value) : (value) => callable(value);
}

/**
 * The module at `specifier`, loaded synchronously -- `load()` is
 * synchronous, so `ModuleRef#load()`'s dynamic `import()` is not an
 * option. An ES module needs a Node with `require(esm)` (20.19+, 22.12+);
 * on an older one, map the name to the imported value instead.
 * @param {string} specifier -- as `ModuleRef` resolved it (a relative one already absolute)
 * @param {string} prefix
 * @returns {unknown}
 */
function required(specifier, prefix) {
  const target = specifier.startsWith('file:') ? fileURLToPath(specifier) : specifier;
  try {
    // Bare specifiers resolve from the working directory, the base
    // `ModuleRef` resolves a relative one against.
    return createRequire(path.join(process.cwd(), 'cooper-config.cjs'))(target);
  } catch (err) {
    throw new CooperConfigError(`${prefix}, whose module ${JSON.stringify(specifier)} could not be loaded: ${/** @type {Error} */ (err).message}`, { cause: err });
  }
}

/**
 * The function in a loaded module: the module itself when it is one, else
 * its default export (what `require()` of an ES module, or a transpiled
 * one, hands back), else `null`.
 * @param {unknown} loaded
 * @returns {Function | null}
 */
function callableOf(loaded) {
  if (typeof loaded === 'function') return loaded;
  if (loaded !== null && typeof loaded === 'object' && 'default' in loaded && typeof loaded.default === 'function') return loaded.default;
  return null;
}

/**
 * Whether `fn` is a class, which cannot be called without `new`. The
 * source text is the only reliable test JavaScript offers.
 * @param {Function} fn
 * @returns {fn is new (value: unknown) => unknown}
 */
function isClass(fn) {
  return /^class[\s{]/.test(Function.prototype.toString.call(fn));
}

/**
 * A policy value as a message shows it: an atom as CASC writes it.
 * @param {unknown} value
 * @returns {string}
 */
function display(value) {
  if (typeof value === 'symbol') return `:${value.description}`;
  if (value === null) return 'nil';
  return util.inspect(value);
}

module.exports = { POLICY_KEY, REVEAL, policyOf };
