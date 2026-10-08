import { createRequire } from 'node:module';
import { expect } from 'chai';
import * as esm from '../src/cooper-config.js';
import esmDefault from '../src/cooper-config.js';

const require = createRequire(import.meta.url);
const cjs = require('../src/cooper-config.cjs');
const pkg = require('../package.json');

/**
 * The ESM entry is a thin wrapper over the CJS implementation; both must
 * expose the same objects, so one process-wide store backs both.
 */

describe('public API: entry points', () => {
  const NAMES = ['version', 'load', 'get', 'require', 'has', 'all', 'convert', 'CooperConfigError'];

  it('the ESM named exports, the ESM default export and the CJS module expose the same objects', () => {
    for (const name of NAMES) {
      expect(/** @type {any} */ (esm)[name], `esm ${name}`).to.exist;
      expect(/** @type {any} */ (esm)[name], `esm ${name} === cjs`).to.equal(cjs[name]);
      expect(/** @type {any} */ (esmDefault)[name], `default ${name}`).to.equal(cjs[name]);
    }
  });

  it('exports nothing else', () => {
    expect(Object.keys(cjs).sort()).to.deep.equal([...NAMES].sort());
  });

  it('version is the one in package.json', () => {
    expect(esm.version).to.equal(pkg.version);
  });
});
