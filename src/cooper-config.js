import { createRequire } from 'node:module';

// Named `requireCjs`, not `require`: this module exports a `require` of
// its own.
const requireCjs = createRequire(import.meta.url);
const api = requireCjs('./cooper-config.cjs');

/** @type {string} */
const version = api.version;
/** @type {typeof api.load} */
const load = api.load;
/** @type {typeof api.get} */
const get = api.get;
/** @type {typeof api.require} */
const requireValue = api.require;
/** @type {typeof api.has} */
const has = api.has;
/** @type {typeof api.all} */
const all = api.all;
/** @type {typeof api.convert} */
const convert = api.convert;
/** @type {typeof api.CooperConfigError} */
const CooperConfigError = api.CooperConfigError;

export { version, load, get, requireValue as require, has, all, convert, CooperConfigError };

export default { version, load, get, require: requireValue, has, all, convert, CooperConfigError };
