import { expect } from 'chai';
import fc from 'fast-check';
import { loadStringSync, ByteSize, Duration, IPv4, IPv6, Tuple, LocalDate, ModuleRef } from '@joetjen/cooper';
import { convert, CooperConfigError } from '../src/cooper-config.js';
import { HEADER } from './support/project.js';

/**
 * `convert()`: a cooper result as the application reads it. Cooper's
 * typed literals lose their wrapper (what reads configuration has never
 * heard of cooper); everything else is walked or passed through.
 */

/**
 * `source` loaded by cooper, then converted.
 * @param {string} source
 */
const converted = (source) => convert(loadStringSync(HEADER + source, { dotenv: false, env: {} }));

describe('convert()', () => {
  describe('a byte size', () => {
    it('becomes its byte count', () => {
      expect(converted('a { size = 1GiB }')).to.deep.equal({ a: { size: 1073741824 } });
    });

    it('is a bigint when the count is beyond a safe integer', () => {
      expect(converted('a { size = 100000PiB }').a.size).to.equal(100000n * 1024n ** 5n);
    });

    it('is a number exactly when that number is a safe integer', () => {
      fc.assert(
        fc.property(fc.bigInt({ min: 0n, max: 2n ** 70n }), (bytes) => {
          const out = convert({ v: new ByteSize(bytes) }).v;
          expect(BigInt(out)).to.equal(bytes);
          expect(typeof out).to.equal(bytes <= BigInt(Number.MAX_SAFE_INTEGER) ? 'number' : 'bigint');
        }),
      );
    });
  });

  describe('a duration', () => {
    it('becomes whole milliseconds', () => {
      expect(converted('a { ttl = 14d }')).to.deep.equal({ a: { ttl: 1209600000 } });
    });

    it('refuses one that is not a whole number of milliseconds, naming it', () => {
      expect(() => converted('a { ttl = 1500us }')).to.throw(CooperConfigError, /1500000ns.*"a\.ttl".*whole number of milliseconds/);
    });

    it('converts any whole number of milliseconds exactly', () => {
      fc.assert(
        fc.property(fc.bigInt({ min: 0n, max: 2n ** 60n }), (ms) => {
          const out = convert({ v: new Duration(ms * 1_000_000n) }).v;
          expect(BigInt(out)).to.equal(ms);
          expect(typeof out).to.equal(ms <= BigInt(Number.MAX_SAFE_INTEGER) ? 'number' : 'bigint');
        }),
      );
    });

    it('refuses any duration with a sub-millisecond remainder', () => {
      fc.assert(
        fc.property(fc.bigInt({ min: 0n, max: 2n ** 50n }), fc.bigInt({ min: 1n, max: 999_999n }), (ms, rest) => {
          expect(() => convert({ v: new Duration(ms * 1_000_000n + rest) })).to.throw(CooperConfigError);
        }),
      );
    });
  });

  describe('an IP address', () => {
    it('an IPv4 address becomes its string', () => {
      expect(converted('a { host = 10.0.0.1 }')).to.deep.equal({ a: { host: '10.0.0.1' } });
    });

    it('an IPv4 block becomes "address/prefix"', () => {
      expect(converted('a { net = 10.0.0.0/8 }')).to.deep.equal({ a: { net: '10.0.0.0/8' } });
    });

    it('an IPv6 address becomes its string', () => {
      expect(converted('a { host = ::1 }')).to.deep.equal({ a: { host: '::1' } });
    });

    it('an IPv6 block becomes "address/prefix"', () => {
      expect(converted('a { net = fe80::/10 }')).to.deep.equal({ a: { net: 'fe80::/10' } });
    });

    it('any IPv4 address round-trips through its string', () => {
      fc.assert(
        fc.property(fc.array(fc.integer({ min: 0, max: 255 }), { minLength: 4, maxLength: 4 }), fc.option(fc.integer({ min: 0, max: 32 })), (octets, prefix) => {
          const out = convert({ v: new IPv4(octets, prefix) }).v;
          expect(out).to.equal(octets.join('.') + (prefix === null ? '' : `/${prefix}`));
        }),
      );
    });

    it('an IPv6 address with a prefix keeps it after the slash', () => {
      expect(convert({ v: new IPv6([0x2001, 0xdb8, 0, 0, 0, 0, 0, 0], 32) }).v).to.equal('2001:db8::/32');
    });
  });

  describe('structure', () => {
    it('a block stays a plain object, at every depth', () => {
      const out = converted('a { b { c { d = 1 } } }');
      expect(out).to.deep.equal({ a: { b: { c: { d: 1 } } } });
      expect(out.a.b.c).to.be.an('object');
    });

    it('a list is walked, its typed literals converted', () => {
      expect(converted('a { sizes = [1KiB, 2KiB] }')).to.deep.equal({ a: { sizes: [1024, 2048] } });
    });

    it('a tuple is walked and stays a Tuple', () => {
      const out = converted('a { pair = (1KiB, "x") }').a.pair;
      expect(out).to.be.instanceOf(Tuple);
      expect(out.toArray()).to.deep.equal([1024, 'x']);
    });

    it('a top-level value that is not a block is converted too', () => {
      expect(converted('size = 2KiB')).to.deep.equal({ size: 2048 });
    });
  });

  describe('everything else passes through as cooper returns it', () => {
    it('strings, numbers, booleans, nil and bigints', () => {
      expect(converted('a { s = "x", n = 1.5, b = true, z = nil, big = 9007199254740993 }')).to.deep.equal({
        a: { s: 'x', n: 1.5, b: true, z: null, big: 9007199254740993n },
      });
    });

    it('an atom stays a Symbol', () => {
      expect(converted('a { level = :info }').a.level).to.equal(Symbol.for('info'));
    });

    it('a date stays a LocalDate', () => {
      expect(converted('a { since = 2024-01-31 }').a.since).to.be.instanceOf(LocalDate);
    });

    it('a module reference stays a ModuleRef', () => {
      class Client {}
      const tree = loadStringSync(`${HEADER}a { c = !module("Acme.Client") }`, { dotenv: false, env: {}, modules: { 'Acme.Client': Client } });
      expect(convert(tree).a.c).to.be.instanceOf(ModuleRef);
    });
  });

  it('never mutates its input', () => {
    const tree = loadStringSync(`${HEADER}a { size = 1KiB, l = [1MiB] }`, { dotenv: false, env: {} });
    convert(tree);
    expect(tree.a.size).to.be.instanceOf(ByteSize);
    expect(tree.a.l[0]).to.be.instanceOf(ByteSize);
  });
});
