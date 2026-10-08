import path from 'node:path';
import { expect } from 'chai';
import { CooperError } from '@joetjen/cooper';
import { load, all, get, CooperConfigError } from '../src/cooper-config.js';
import { projectRoot, configFile } from '../src/project.cjs';
import { HEADER, project, write, cleanup, hermetic } from './support/project.js';

/**
 * `load()`: finding the project and its file, handing every cooper option
 * through, and what is (and is not) stored when a load fails.
 */

describe('load()', () => {
  afterEach(cleanup);

  describe('the project root', () => {
    it('is the directory of the nearest package.json above the working directory', () => {
      const root = project({ 'package.json': '{}', 'src/deep/er/.keep': '' });
      process.chdir(path.join(root, 'src', 'deep', 'er'));
      expect(projectRoot()).to.equal(root);
    });

    it('is the working directory itself when it holds a package.json', () => {
      const root = project({ 'package.json': '{}' });
      process.chdir(root);
      expect(projectRoot()).to.equal(root);
    });

    it('falls back to the working directory when no package.json is found above it', () => {
      // A temp directory has no package.json between it and the file
      // system root on any machine these tests run on.
      const dir = project({ 'a/.keep': '' });
      process.chdir(path.join(dir, 'a'));
      expect(projectRoot()).to.equal(path.join(dir, 'a'));
    });
  });

  describe('the configuration file', () => {
    it('defaults to config/config.casc under the project root', () => {
      expect(configFile({ root: '/srv/app' })).to.equal(path.join('/srv/app', 'config', 'config.casc'));
    });

    it('is the path option when one is given, a relative one against the project root', () => {
      expect(configFile({ root: '/srv/app', path: 'etc/app.casc' })).to.equal(path.join('/srv/app', 'etc', 'app.casc'));
      expect(configFile({ root: '/srv/app', path: '/etc/app.casc' })).to.equal('/etc/app.casc');
    });

    it('loads config/config.casc of the project found from the working directory', () => {
      const root = project({ 'package.json': '{}', 'config/config.casc': `${HEADER}port = 4000\n`, 'lib/.keep': '' });
      process.chdir(path.join(root, 'lib'));
      load(hermetic());
      expect(all()).to.deep.equal({ port: 4000 });
    });

    it('loads config/config.casc under an explicit root option', () => {
      const root = project({ 'config/config.casc': `${HEADER}port = 4001\n` });
      load(hermetic({ root }));
      expect(get('port')).to.equal(4001);
    });

    it('loads the file named by the path option instead', () => {
      const root = project({ 'config/config.casc': `${HEADER}which = "default"\n`, 'other.casc': `${HEADER}which = "other"\n` });
      load(hermetic({ root, path: 'other.casc' }));
      expect(get('which')).to.equal('other');
    });

    it('loads an empty configuration when the default file does not exist', () => {
      const root = project();
      expect(load(hermetic({ root }))).to.deep.equal({});
      expect(all()).to.deep.equal({});
    });

    it('refuses a path option naming a file that does not exist', () => {
      const root = project();
      expect(() => load(hermetic({ root, path: 'missing.casc' })))
        .to.throw(CooperConfigError, /missing\.casc/);
    });
  });

  describe('what it stores', () => {
    it('returns the configuration it stored', () => {
      const root = project({ 'config/config.casc': `${HEADER}a { b = 1 }\n` });
      expect(load(hermetic({ root }))).to.equal(all());
    });

    it('replaces the stored configuration when called again', () => {
      const first = project({ 'config/config.casc': `${HEADER}only_first = 1\n` });
      const second = project({ 'config/config.casc': `${HEADER}only_second = 2\n` });
      load(hermetic({ root: first }));
      load(hermetic({ root: second }));
      expect(all()).to.deep.equal({ only_second: 2 });
    });

    it('stores nothing when the load fails, keeping what was there', () => {
      const good = project({ 'config/config.casc': `${HEADER}kept = true\n` });
      const bad = project({ 'config/config.casc': `${HEADER}a = = 1\n` });
      load(hermetic({ root: good }));
      expect(() => load(hermetic({ root: bad }))).to.throw(CooperConfigError);
      expect(all()).to.deep.equal({ kept: true });
    });
  });

  describe('a load error', () => {
    /** @returns {CooperConfigError} */
    function failure(/** @type {string} */ source) {
      const root = project({ 'config/config.casc': source });
      try {
        load(hermetic({ root }));
      } catch (err) {
        return /** @type {CooperConfigError} */ (err);
      }
      throw new Error('expected load() to fail');
    }

    it('is a CooperConfigError naming the file', () => {
      const err = failure(`${HEADER}a = = 1\n`);
      expect(err).to.be.instanceOf(CooperConfigError);
      expect(err.file).to.match(/config[\\/]config\.casc$/);
      expect(err.message).to.include(err.file);
    });

    it("carries cooper's error as its cause and its formatted text in the message", () => {
      const err = failure(`${HEADER}a = = 1\n`);
      expect(err.cause).to.be.instanceOf(CooperError);
      expect(err.formatted).to.include('line 2, column 5');
      expect(err.formatted).to.include('parser');
      expect(err.message).to.include(err.formatted);
    });

    it('is raised for an undefined ${...} reference, at the resolve stage', () => {
      const err = failure(`${HEADER}a = \${COOPER_CONFIG_SURELY_UNSET_VAR}\n`);
      expect(/** @type {CooperError} */ (err.cause).stage).to.equal('resolve');
    });
  });

  describe('options', () => {
    it('refuses an unknown option, listing the supported ones', () => {
      const root = project();
      expect(() => load(/** @type {any} */ ({ root, wachEnv: true })))
        .to.throw(TypeError, /unknown option\(s\): wachEnv.*Supported options: path, root, env, dotenv, dotenvEnv, dotenvFiles, dotenvDir, dotenvOverride, resolvers, tags, importSchemes, modules, cache, watchEnv/s);
    });

    it('refuses options that are not an object', () => {
      expect(() => load(/** @type {any} */ ('config.casc'))).to.throw(TypeError, /options/);
    });

    it('passes env through to cooper', () => {
      const root = project({ 'config/config.casc': `${HEADER}region = \${REGION}\n` });
      load(hermetic({ root, env: { REGION: 'eu-west' } }));
      expect(get('region')).to.equal('eu-west');
    });

    it('passes the dotenv options through to cooper', () => {
      const root = project({ 'config/config.casc': `${HEADER}from = \${FROM_FILE}\n`, 'vars.env': 'FROM_FILE=dotenv\n' });
      load({ root, env: {}, dotenvFiles: [path.join(root, 'vars.env')], dotenvOverride: true, dotenvEnv: null });
      expect(get('from')).to.equal('dotenv');
    });

    it('passes dotenvDir through to cooper, the .env files read from there', () => {
      // `.env` handling is cooper's: by default it reads them from the
      // project root itself; nothing here adds to that.
      const root = project({ 'config/config.casc': `${HEADER}from = \${FROM_DIR}\n`, 'secrets/.env': 'FROM_DIR=dotenv-dir\n' });
      load({ root, env: {}, dotenvDir: path.join(root, 'secrets'), dotenvEnv: null });
      expect(get('from')).to.equal('dotenv-dir');
    });

    it('reads the .env.<env> file COOPER_ENV names, .env.prod for NODE_ENV=production', () => {
      // Every Cooper names the file by COOPER_ENV, as the config/<env>/
      // overlay is named, so one environment never reads two spellings.
      const root = project({
        'config/config.casc': `${HEADER}from = \${FROM_FILE}\n`,
        '.env.prod': 'FROM_FILE=prod\n',
        '.env.production': 'FROM_FILE=production\n',
      });
      load({ root, dotenvDir: root, cache: false, env: { COOPER_ENV: '', NODE_ENV: 'production' } });
      expect(get('from')).to.equal('prod');
    });

    it('passes resolvers through to cooper', () => {
      const root = project({ 'config/config.casc': `${HEADER}v = !{vault:db/password}\n` });
      load(hermetic({ root, resolvers: { vault: (/** @type {string} */ p) => `secret-for-${p}` } }));
      expect(get('v')).to.equal('secret-for-db/password');
    });

    it('passes tags through to cooper', () => {
      const root = project({ 'config/config.casc': `${HEADER}v = !twice(21)\n` });
      load(hermetic({ root, tags: { twice: (/** @type {number} */ n) => n * 2 } }));
      expect(get('v')).to.equal(42);
    });

    it('passes importSchemes through to cooper', () => {
      const root = project({ 'config/config.casc': `${HEADER}import "mem://base"\n` });
      load(hermetic({ root, importSchemes: { mem: () => `${HEADER}from_mem = true\n` } }));
      expect(get('from_mem')).to.equal(true);
    });

    it('passes modules through to cooper', () => {
      class Client {}
      const root = project({ 'config/config.casc': `${HEADER}client = !module("Acme.Client")\n` });
      load(hermetic({ root, modules: { 'Acme.Client': Client } }));
      expect(get('client').value).to.equal(Client);
    });

    it('passes cache: false through to cooper, so an edited file is read again', () => {
      const root = project({ 'config/config.casc': `${HEADER}v = 1\n` });
      load(hermetic({ root, cache: false }));
      write(root, { 'config/config.casc': `${HEADER}v = 2\n` });
      load(hermetic({ root, cache: false }));
      expect(get('v')).to.equal(2);
    });
  });

  describe("cooper's cache, on by default", () => {
    it('picks up a file added where a glob import looks on a fresh load', () => {
      // The cache is cooper's: nothing here fingerprints anything, so this
      // holds only because cooper expands the import again on a hit.
      const root = project({ 'config/config.casc': `${HEADER}import "parts/*.casc"\n`, 'config/parts/a.casc': `${HEADER}a = 1\n` });
      load(hermetic({ root }));
      write(root, { 'config/parts/b.casc': `${HEADER}b = 2\n` });
      load(hermetic({ root }));
      expect(all()).to.deep.equal({ a: 1, b: 2 });
    });
  });

  describe('per-environment configuration with ${COOPER_ENV}', () => {
    const files = {
      'config/config.casc': `${HEADER}level = "info"\nimport "\${COOPER_ENV}/*.casc"\n`,
      'config/dev/app.casc': `${HEADER}level = "debug"\n`,
      'config/test/app.casc': `${HEADER}level = "warn"\n`,
      'config/prod/app.casc': `${HEADER}# nothing overridden\n`,
    };

    it('imports the overlay COOPER_ENV names', () => {
      const root = project(files);
      load({ root, dotenv: false, env: { COOPER_ENV: 'test' } });
      expect(get('level')).to.equal('warn');
    });

    it('falls back to NODE_ENV when COOPER_ENV is empty', () => {
      const root = project(files);
      load({ root, dotenv: false, env: { COOPER_ENV: '', NODE_ENV: 'prod' } });
      expect(get('level')).to.equal('info');
    });

    it('fails with an import error when COOPER_ENV names no existing directory', () => {
      // A glob matching no files is an error in cooper, so a misnamed
      // environment stops the load rather than skipping its overlay.
      const root = project(files);
      try {
        load({ root, dotenv: false, cache: false, env: { COOPER_ENV: 'production' } });
        expect.fail('expected load() to fail');
      } catch (err) {
        expect(err).to.be.instanceOf(CooperConfigError);
        expect(/** @type {CooperError} */ (/** @type {CooperConfigError} */ (err).cause).stage).to.equal('import');
        expect(/** @type {CooperConfigError} */ (err).formatted).to.match(/"production\/\*\.casc" matched no files/);
      }
    });

    // The values many Node tools set: cooper's NODE_ENV fallback maps
    // them onto the names every Cooper uses, so dev/ and prod/ just work.
    it('imports the dev/ overlay for NODE_ENV=development when COOPER_ENV is unset', () => {
      const root = project(files);
      load({ root, dotenv: false, cache: false, env: { COOPER_ENV: '', NODE_ENV: 'development' } });
      expect(get('level')).to.equal('debug');
    });

    it('imports the prod/ overlay for NODE_ENV=production when COOPER_ENV is unset', () => {
      const root = project({ ...files, 'config/prod/app.casc': `${HEADER}level = "error"\n` });
      load({ root, dotenv: false, cache: false, env: { COOPER_ENV: '', NODE_ENV: 'production' } });
      expect(get('level')).to.equal('error');
    });

    it('fails for a real COOPER_ENV=development against a dev/ directory, which is never translated', () => {
      const root = project(files);
      expect(() => load({ root, dotenv: false, cache: false, env: { COOPER_ENV: 'development' } }))
        .to.throw(CooperConfigError, /development\/\*\.casc/);
    });

    it('falls back to dev when neither is set', () => {
      const root = project(files);
      load({ root, dotenv: false, env: { COOPER_ENV: '', NODE_ENV: '' } });
      expect(get('level')).to.equal('debug');
    });
  });
});
