'use strict';

/**
 * @fileoverview A path into the configuration -- `'database.pool.size'`,
 * or `['dotted.key', 'inner']` for a key that itself contains a dot --
 * and looking one up.
 */

/**
 * A path as the reading functions accept it.
 * @typedef {string | readonly string[]} KeyPath
 */

/**
 * The segments of `keyPath`.
 * @param {KeyPath} keyPath
 * @returns {readonly string[]}
 * @throws {TypeError} for an empty path, an empty dotted segment, or anything not a string or an array of strings
 */
function segments(keyPath) {
  if (typeof keyPath === 'string') {
    const parts = keyPath.split('.');
    // An empty segment is a typo (`a..b`, a trailing dot), never a key
    // somebody meant: CASC cannot write an empty key bare.
    if (parts.some((part) => part === '')) {
      throw new TypeError(`${JSON.stringify(keyPath)} is not a configuration path: a dotted path has no empty segments`);
    }
    return parts;
  }
  if (Array.isArray(keyPath) && keyPath.length > 0 && keyPath.every((part) => typeof part === 'string')) return keyPath;
  throw new TypeError(
    `${describeValue(keyPath)} is not a configuration path: pass a dotted string ('database.pool.size') or a non-empty array of strings`,
  );
}

/**
 * How a path reads in a message: dotted when that is unambiguous, else
 * the segments as a JSON array.
 * @param {readonly string[]} parts
 * @returns {string}
 */
function describe(parts) {
  return parts.some((part) => part.includes('.')) ? JSON.stringify(parts) : JSON.stringify(parts.join('.'));
}

/**
 * Whether `value` is a configuration block: a plain object, which is all a
 * CASC block ever becomes. A class instance (a `Secret`, a `Tuple`, an
 * application's own type) is a value, never something a path walks into.
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isBlock(value) {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

/**
 * Walks `tree` along `parts`. Only a block's own keys are followed, so a
 * path can never reach `toString` or `constructor`.
 * @param {unknown} tree
 * @param {readonly string[]} parts
 * @returns {{found: true, value: unknown} | {found: false}}
 */
function lookup(tree, parts) {
  let here = tree;
  for (const part of parts) {
    if (!isBlock(here) || !Object.hasOwn(here, part)) return { found: false };
    here = here[part];
  }
  return { found: true, value: here };
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function describeValue(value) {
  if (Array.isArray(value)) return '[' + value.map((v) => (typeof v === 'string' ? JSON.stringify(v) : String(v))).join(', ') + ']';
  return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

module.exports = { segments, describe, lookup, isBlock };
