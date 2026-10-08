'use strict';

/**
 * @fileoverview A cooper result as the application reads it -- the port
 * of `CooperConfig.Convert` and cooper_prx's `converted`.
 *
 * **Cooper's typed literals arrive untagged**, because what reads the
 * configuration -- a database driver, an HTTP server, the application's
 * own code -- has never heard of cooper:
 *
 * | CASC | cooper | the application |
 * | --- | --- | --- |
 * | `1GiB` | `ByteSize` | `1073741824` (bytes; a `bigint` beyond a safe integer) |
 * | `14d` | `Duration` | `1209600000` (milliseconds; a `bigint` beyond a safe integer) |
 * | `10.0.0.1` | `IPv4` | `'10.0.0.1'` |
 * | `10.0.0.0/8` | `IPv4` with a prefix | `'10.0.0.0/8'` |
 *
 * IPv6 follows IPv4. A block stays a plain (null-prototype) object, a list
 * an array and a tuple a `Tuple`, each walked; everything else -- strings,
 * numbers, booleans, `null`, `bigint`s, atoms (`Symbol`s), dates,
 * `ModuleRef`s -- passes through as cooper returns it.
 *
 * Milliseconds, because that is the unit `setTimeout`, `AbortSignal.
 * timeout` and most Node library options take. **A duration that is not a
 * whole number of them is refused rather than rounded**: a silently
 * shortened timeout is far harder to find than a startup that stopped
 * and said why.
 *
 * Secrets follow the block's `cooper-secrets` policy (see `secrets.cjs`).
 *
 * Every block, list and tuple in the result is frozen, so the
 * configuration the application reads cannot be changed under it.
 */

const { Secret, ByteSize, Duration, IPv4, IPv6, Tuple } = require('@joetjen/cooper');
const CooperConfigError = require('./error.cjs');
const { POLICY_KEY, REVEAL, policyOf } = require('./secrets.cjs');
const { isBlock } = require('./key-path.cjs');

/**
 * @typedef {object} ConvertOptions
 * @property {Record<string, unknown> | Map<string, unknown>} [modules] -- cooper's `modules` load option, which a `cooper-secrets` module name is resolved through
 */

/**
 * Converts `tree`, a cooper result, into the configuration the application
 * reads. Never mutates `tree`.
 *
 * @param {Record<string, unknown>} tree
 * @param {ConvertOptions} [options]
 * @returns {Readonly<Record<string, any>>} a deep-frozen, null-prototype object
 * @throws {CooperConfigError} for a duration that is not whole milliseconds, or a `cooper-secrets` key it refuses
 */
function convert(tree, options = {}) {
  // **At the root it is refused.** A top-level key names a block, so a
  // policy written here would govern nothing -- silently, which is the
  // one outcome worse than a refusal. A document-wide policy is an
  // intuitive reading and the wrong one: a block is what holds secrets.
  if (Object.hasOwn(tree, POLICY_KEY)) {
    throw new CooperConfigError(
      `"${POLICY_KEY}" is at the root of the document, where a key names a top-level block: ` +
        'write it at the top of each block whose secrets it governs',
    );
  }
  /** @type {Record<string, unknown>} */
  const out = Object.create(null);
  for (const [name, value] of Object.entries(tree)) {
    if (isBlock(value)) {
      const policy = policyOf(value[POLICY_KEY], name, options.modules);
      out[name] = block(withoutPolicy(value), policy, [name]);
    } else {
      out[name] = converted(value, REVEAL, [name]);
    }
  }
  return Object.freeze(out);
}

/**
 * `settings` without the policy key. **The key is this library's, not the
 * application's**: the application asked for a port and a password, so
 * what it is handed does not hold it.
 * @param {Record<string, unknown>} settings
 * @returns {Record<string, unknown>}
 */
function withoutPolicy(settings) {
  /** @type {Record<string, unknown>} */
  const rest = Object.create(null);
  for (const [key, value] of Object.entries(settings)) if (key !== POLICY_KEY) rest[key] = value;
  return rest;
}

/**
 * One value, as the application reads it.
 * @param {unknown} value
 * @param {import('./secrets.cjs').Policy} policy -- of the top-level block it is in
 * @param {string[]} at -- where it is, for messages
 * @returns {unknown}
 */
function converted(value, policy, at) {
  if (value instanceof Secret) return secret(value, policy, at);
  if (value instanceof ByteSize) return integer(value.bytes);
  if (value instanceof Duration) return milliseconds(value.nanoseconds, at);
  // `toString()` is the address, with `/prefix` when it has one -- the
  // form every Node API that takes an address or a CIDR block reads.
  if (value instanceof IPv4 || value instanceof IPv6) return value.toString();
  if (value instanceof Tuple) return new Tuple(value.items.map((item, i) => converted(item, policy, [...at, String(i)])));
  if (Array.isArray(value)) return Object.freeze(value.map((item, i) => converted(item, policy, [...at, String(i)])));
  if (isBlock(value)) {
    // **Nested, the policy key is refused rather than scoped.** Somebody
    // who wrote it one level down meant it to do something, and a key that
    // reads as governing a subtree while governing nothing is worse than a
    // refusal naming where it is.
    if (Object.hasOwn(value, POLICY_KEY)) {
      throw new CooperConfigError(
        `"${POLICY_KEY}" belongs at the top of a top-level block and this one is nested, at ${JSON.stringify(at.join('.'))}: ` +
          'it governs every depth beneath the block it is written in, so one further down would govern nothing',
      );
    }
    return block(value, policy, at);
  }
  return value;
}

/**
 * A block, each value converted, frozen.
 * @param {Record<string, unknown>} value
 * @param {import('./secrets.cjs').Policy} policy
 * @param {string[]} at
 * @returns {Readonly<Record<string, unknown>>}
 */
function block(value, policy, at) {
  /** @type {Record<string, unknown>} */
  const out = Object.create(null);
  for (const [key, item] of Object.entries(value)) out[key] = converted(item, policy, [...at, key]);
  return Object.freeze(out);
}

/**
 * One secret, as its block's policy asks. Revealed or re-wrapped, the
 * value is converted *first*: a secret holding a byte size is unusual but
 * not forbidden, and what the application's type receives is a value, not
 * a cooper literal.
 * @param {Secret} value
 * @param {import('./secrets.cjs').Policy} policy
 * @param {string[]} at
 * @returns {unknown}
 */
function secret(value, policy, at) {
  if (policy.mode === 'keep') return value;
  const revealed = converted(value.reveal(), policy, at);
  return policy.mode === 'wrap' ? policy.wrap(revealed) : revealed;
}

/**
 * A count as a `number` when that is exact, else the `bigint`.
 * @param {bigint | number} count
 * @returns {number | bigint}
 */
function integer(count) {
  const big = BigInt(count);
  return big <= BigInt(Number.MAX_SAFE_INTEGER) && big >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(big) : big;
}

/**
 * `nanoseconds` as whole milliseconds, or a refusal naming the value.
 * @param {bigint | number} nanoseconds
 * @param {string[]} at
 * @returns {number | bigint}
 */
function milliseconds(nanoseconds, at) {
  const ns = BigInt(nanoseconds);
  if (ns % 1_000_000n !== 0n) {
    throw new CooperConfigError(
      `a duration of ${ns}ns at ${JSON.stringify(at.join('.'))} is not a whole number of milliseconds, ` +
        'which is the unit cooper-config hands a duration out in',
    );
  }
  return integer(ns / 1_000_000n);
}

module.exports = { convert };
