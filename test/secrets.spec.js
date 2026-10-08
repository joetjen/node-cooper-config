import path from 'node:path';
import { expect } from 'chai';
import fc from 'fast-check';
import { loadStringSync, Secret } from 'cooper';
import { load, get, all, convert, CooperConfigError } from '../src/cooper-config.js';
import { HEADER, project, cleanup, hermetic } from './support/project.js';

/**
 * How a top-level block's secrets arrive: the `cooper-secrets` key, read
 * per block and removed before the application sees the block. Its design
 * is cooper_prx's; the key is in the document, not an option, so one
 * document means the same thing to every Cooper integration.
 */

/** A secret type an application might own, as a class. */
class OwnedSecret {
  /** @param {unknown} value */
  constructor(value) {
    this.value = value;
  }
}

/**
 * `source` loaded by cooper, then converted with `modules`.
 * @param {string} source
 * @param {Record<string, unknown>} [modules]
 */
const converted = (source, modules = {}) =>
  convert(loadStringSync(HEADER + source, { dotenv: false, env: {}, modules }), { modules });

describe('secrets (the cooper-secrets key)', () => {
  afterEach(cleanup);

  describe('the modes', () => {
    it('with no key, a secret is revealed', () => {
      expect(converted('db { *password = "hunter2" }')).to.deep.equal({ db: { password: 'hunter2' } });
    });

    it('reveal says the default out loud', () => {
      expect(converted('db { cooper-secrets = reveal\n *password = "hunter2" }')).to.deep.equal({ db: { password: 'hunter2' } });
    });

    it('keep leaves a secret a cooper Secret', () => {
      const out = converted('db { cooper-secrets = keep\n *password = "hunter2" }');
      expect(out.db.password).to.be.instanceOf(Secret);
      expect(out.db.password.reveal()).to.equal('hunter2');
    });

    it('a module name wraps each revealed secret in a class, called with new', () => {
      const out = converted('db { cooper-secrets = "Acme.OwnedSecret"\n *password = "hunter2" }', { 'Acme.OwnedSecret': OwnedSecret });
      expect(out.db.password).to.be.instanceOf(OwnedSecret);
      expect(out.db.password.value).to.equal('hunter2');
    });

    it('a module name wraps each revealed secret with a function, called plainly', () => {
      const wrap = (/** @type {unknown} */ value) => ({ wrapped: value });
      const out = converted('db { cooper-secrets = "Acme.Wrap"\n *password = "hunter2" }', { 'Acme.Wrap': wrap });
      expect(out.db.password).to.deep.equal({ wrapped: 'hunter2' });
    });

    it('a module name mapped to a specifier is required and its export used', () => {
      const specifier = path.join(project({ 'wrap.cjs': 'module.exports = (v) => ({ fromFile: v });' }), 'wrap.cjs');
      const out = converted('db { cooper-secrets = "Acme.Wrap"\n *password = "hunter2" }', { 'Acme.Wrap': specifier });
      expect(out.db.password).to.deep.equal({ fromFile: 'hunter2' });
    });

    it("a specifier's default export is used when the module itself is not callable", () => {
      const specifier = path.join(project({ 'wrap.mjs': 'export default (v) => ({ fromDefault: v });' }), 'wrap.mjs');
      const out = converted('db { cooper-secrets = "Acme.Wrap"\n *password = "hunter2" }', { 'Acme.Wrap': specifier });
      expect(out.db.password).to.deep.equal({ fromDefault: 'hunter2' });
    });

    it('a wrapped secret is converted before it is wrapped', () => {
      const out = converted('db { cooper-secrets = "Acme.OwnedSecret"\n *limit = 1KiB }', { 'Acme.OwnedSecret': OwnedSecret });
      expect(out.db.limit.value).to.equal(1024);
    });

    it('a revealed secret is converted too', () => {
      expect(converted('db { *limit = 1KiB }')).to.deep.equal({ db: { limit: 1024 } });
    });
  });

  describe('scope', () => {
    it('the key itself never reaches the application', () => {
      expect(converted('db { cooper-secrets = keep\n port = 5432 }')).to.deep.equal({ db: { port: 5432 } });
    });

    it('it governs every depth beneath its block, lists included', () => {
      const out = converted('db { cooper-secrets = keep\n primary { *password = "a" } }');
      expect(out.db.primary.password).to.be.instanceOf(Secret);
      // A map inside a list (CASC.md §6.10) may hold a secret...
      const written = converted('db { cooper-secrets = keep\n replicas = [{ *password = "b" }] }');
      expect(written.db.replicas[0].password).to.be.instanceOf(Secret);
      // ...and a resolver or tag can return a bare one there.
      const listed = convert({ db: { 'cooper-secrets': Symbol.for('keep'), replicas: [new Secret('b')] } });
      expect(listed.db.replicas[0]).to.be.instanceOf(Secret);
    });

    it('it governs only its own block', () => {
      const out = converted('db { cooper-secrets = keep\n *password = "a" }\napi { *token = "b" }');
      expect(out.db.password).to.be.instanceOf(Secret);
      expect(out.api.token).to.equal('b');
    });

    it('a secret outside any block is revealed', () => {
      expect(converted('*token = "b"')).to.deep.equal({ token: 'b' });
    });
  });

  describe('refusals', () => {
    it('at the document root', () => {
      expect(() => converted('cooper-secrets = keep\ndb { port = 1 }'))
        .to.throw(CooperConfigError, /"cooper-secrets" is at the root of the document/);
    });

    it('nested below a top-level block, naming where', () => {
      expect(() => converted('db { primary { cooper-secrets = keep } }'))
        .to.throw(CooperConfigError, /"cooper-secrets" belongs at the top of a top-level block.*"db\.primary"/s);
    });

    it('nested inside a list below a top-level block', () => {
      // As CASC writes a map inside a list (CASC.md §6.10), and as a
      // resolver or tag returns one.
      expect(() => converted('db { replicas = [{ cooper-secrets = keep }] }')).to.throw(CooperConfigError, /belongs at the top/);
      expect(() => convert({ db: { replicas: [{ 'cooper-secrets': Symbol.for('keep') }] } })).to.throw(CooperConfigError, /belongs at the top/);
    });

    it('an unknown mode', () => {
      expect(() => converted('db { cooper-secrets = shout }'))
        .to.throw(CooperConfigError, /"cooper-secrets" in "db" is :shout, which is no policy/);
    });

    it('any value that is neither an atom mode nor a string', () => {
      fc.assert(
        fc.property(fc.oneof(fc.integer(), fc.boolean(), fc.constant(null)), (value) => {
          expect(() => convert({ db: { 'cooper-secrets': value } })).to.throw(CooperConfigError, /which is no policy/);
        }),
      );
    });

    it('a string that is not a PascalCase module name', () => {
      expect(() => converted('db { cooper-secrets = "./wrap.js" }', { './wrap.js': OwnedSecret }))
        .to.throw(CooperConfigError, /"cooper-secrets" in "db" names "\.\/wrap\.js".*PascalCase/s);
    });

    it('a name the modules option does not map', () => {
      expect(() => converted('db { cooper-secrets = "Acme.Missing" }'))
        .to.throw(CooperConfigError, /"cooper-secrets" in "db" names "Acme\.Missing", which the modules load option does not map/);
    });

    it('a name mapped to something that is not callable', () => {
      expect(() => converted('db { cooper-secrets = "Acme.Plain" }', { 'Acme.Plain': { new: 1 } }))
        .to.throw(CooperConfigError, /"Acme\.Plain".*not a function or class/s);
    });

    it('a name mapped to a specifier that cannot be loaded', () => {
      expect(() => converted('db { cooper-secrets = "Acme.Gone" }', { 'Acme.Gone': '/nonexistent/wrap.cjs' }))
        .to.throw(CooperConfigError, /"Acme\.Gone".*could not be loaded/s);
    });

    it('even when the block holds no secret, so a typo fails at startup', () => {
      expect(() => converted('db { cooper-secrets = "Acme.Missing"\n port = 1 }')).to.throw(CooperConfigError);
    });
  });

  describe('through load()', () => {
    it("uses load()'s modules option to resolve the name", () => {
      const root = project({ 'config/config.casc': `${HEADER}db { cooper-secrets = "Acme.OwnedSecret"\n *password = "hunter2" }\n` });
      load(hermetic({ root, modules: { 'Acme.OwnedSecret': OwnedSecret } }));
      expect(get('db.password')).to.be.instanceOf(OwnedSecret);
    });

    it('a refusal is a load error that stores nothing', () => {
      const good = project({ 'config/config.casc': `${HEADER}kept = 1\n` });
      const bad = project({ 'config/config.casc': `${HEADER}cooper-secrets = keep\n` });
      load(hermetic({ root: good }));
      expect(() => load(hermetic({ root: bad }))).to.throw(CooperConfigError, /config\.casc/);
      expect(all()).to.deep.equal({ kept: 1 });
    });
  });
});
