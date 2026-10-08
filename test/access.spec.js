import { spawnSync } from 'node:child_process';
import { expect } from 'chai';
import fc from 'fast-check';
import { load, get, has, all, require as requireValue, CooperConfigError } from '../src/cooper-config.js';
import { HEADER, PACKAGE_ROOT, project, cleanup, hermetic } from './support/project.js';

/**
 * Reading the stored configuration: `get`, `require`, `has` and `all`,
 * by a dotted string or an array of segments, and never before `load()`.
 */

const DOCUMENT = `${HEADER}
database {
  host = "db.local"
  pool { size = 10 }
  optional = nil
}
"dotted.key" { inner = "found" }
list = [1, 2, 3]
`;

/** Loads `DOCUMENT` from a throwaway project. */
function loadDocument() {
  load(hermetic({ root: project({ 'config/config.casc': DOCUMENT }) }));
}

describe('reading the configuration', () => {
  beforeEach(loadDocument);
  afterEach(cleanup);

  describe('get(path, fallback?)', () => {
    it('reads a nested value by a dotted path', () => {
      expect(get('database.pool.size')).to.equal(10);
    });

    it('reads a nested value by an array of segments', () => {
      expect(get(['database', 'pool', 'size'])).to.equal(10);
    });

    it('reaches a key that contains a dot through an array of segments', () => {
      expect(get(['dotted.key', 'inner'])).to.equal('found');
    });

    it('reads a whole block', () => {
      expect(get('database.pool')).to.deep.equal({ size: 10 });
    });

    it('answers undefined for a missing path when no fallback is given', () => {
      expect(get('database.port')).to.equal(undefined);
    });

    it('answers the fallback for a missing path', () => {
      expect(get('database.port', 5432)).to.equal(5432);
    });

    it('answers the fallback when a path runs through a value that is not a block', () => {
      expect(get('database.host.length', 'none')).to.equal('none');
      expect(get('list.0', 'none')).to.equal('none');
    });

    it('answers a present nil as null, not the fallback', () => {
      expect(get('database.optional', 'fallback')).to.equal(null);
    });

    it('does not reach inherited object properties', () => {
      expect(get('database.toString', 'none')).to.equal('none');
      expect(get('constructor', 'none')).to.equal('none');
    });

    it('refuses an empty path or an empty segment', () => {
      expect(() => get('')).to.throw(TypeError);
      expect(() => get('a..b')).to.throw(TypeError);
      expect(() => get([])).to.throw(TypeError);
      expect(() => get(/** @type {any} */ (42))).to.throw(TypeError);
    });
  });

  describe('require(path)', () => {
    it('answers the value at the path', () => {
      expect(requireValue('database.host')).to.equal('db.local');
    });

    it('answers a present nil as null', () => {
      expect(requireValue('database.optional')).to.equal(null);
    });

    it('throws a CooperConfigError naming a missing dotted path', () => {
      expect(() => requireValue('database.port')).to.throw(CooperConfigError, /"database\.port"/);
    });

    it('names a missing array path segment by segment when a segment holds a dot', () => {
      expect(() => requireValue(['dotted.key', 'nope'])).to.throw(CooperConfigError, /\["dotted\.key","nope"\]/);
    });
  });

  describe('has(path)', () => {
    it('is true for a present value, nil included', () => {
      expect(has('database.host')).to.equal(true);
      expect(has('database.optional')).to.equal(true);
    });

    it('is false for a missing one', () => {
      expect(has('database.port')).to.equal(false);
      expect(has(['dotted.key', 'nope'])).to.equal(false);
    });
  });

  describe('all()', () => {
    it('answers the whole configuration', () => {
      expect(all()).to.have.keys('database', 'dotted.key', 'list');
    });
  });

  describe('every value handed out is deep-frozen', () => {
    it('the whole tree, its blocks and its lists', () => {
      expect(Object.isFrozen(all())).to.equal(true);
      expect(Object.isFrozen(get('database'))).to.equal(true);
      expect(Object.isFrozen(get('database.pool'))).to.equal(true);
      expect(Object.isFrozen(get('list'))).to.equal(true);
    });

    it('so a write to it throws in strict mode and changes nothing', () => {
      expect(() => {
        get('database.pool').size = 99;
      }).to.throw(TypeError);
      expect(get('database.pool.size')).to.equal(10);
    });
  });

  describe('a dotted path and its segments agree', () => {
    it('for any key path into a loaded tree', () => {
      // Keys without dots, so the dotted form is unambiguous; quoted in the
      // document, since a bare `nil` or `true` is a value, not a key.
      const key = fc.stringMatching(/^[a-z][a-z0-9_]{0,6}$/);
      /** @param {string[]} segments @param {number} value */
      const nested = (segments, value) =>
        segments.reduceRight((inner, segment) => `"${segment}" { ${inner} }`, `"__leaf__" = ${value}`);
      fc.assert(
        fc.property(fc.array(key, { minLength: 1, maxLength: 4 }), fc.integer(), (segments, value) => {
          const source = `${HEADER}${nested(segments, value)}\n`;
          load(hermetic({ root: project({ 'config/config.casc': source }) }));
          const full = [...segments, '__leaf__'];
          expect(get(full.join('.'))).to.equal(value);
          expect(get(full)).to.equal(value);
          expect(has(full)).to.equal(true);
        }),
        { numRuns: 40 },
      );
    });
  });
});

describe('reading before load()', () => {
  // The store is process-wide and these specs share one process, so a
  // fresh `node` is the only place nothing has been loaded yet.
  for (const call of ["get('a')", "has('a')", 'all()', "require('a')"]) {
    it(`${call} throws an error that says how to load the configuration`, () => {
      const script = `const c = require('./src/cooper-config.cjs');
        try { c.${call}; process.exit(3); } catch (err) {
          process.stdout.write(err.name + ': ' + err.message); }`;
      const run = spawnSync(process.execPath, ['-e', script], { cwd: PACKAGE_ROOT, encoding: 'utf8' });
      expect(run.status, run.stderr).to.equal(0);
      expect(run.stdout).to.match(/^CooperConfigError: /);
      expect(run.stdout).to.include('load()');
      expect(run.stdout).to.include('@joetjen/cooper-config/register');
    });
  }
});
