# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **The README opens with a warning**: under heavy development, not for
  production use before `1.0.0`. Things can and will break, and the
  specification can and will change, between any two releases until
  then. The package description says so too.

## [0.2.0] - 2026-10-19

### Changed

- Requires `@joetjen/cooper` 0.2 (`^0.2.0`). Nothing this package uses
  changed: 0.2 adds the `cooper` executable with its conformance adapter
  and the CASC.md §9.5 error categories, and removes cooper's own old
  conformance corpus, which this package never read.

## [0.1.0] - 2026-10-08

Published as **`@joetjen/cooper-config`**, beside `@joetjen/cooper`.

### Added

- TypeScript declarations, generated from the JSDoc when the package is
  packed, for both entry points and both module systems; `test/types`
  compiles an ES-module and a CommonJS application against them.
- Project scaffold mirroring `node-cooper`: `package.json` (Node.js 20+,
  `@joetjen/cooper` ^0.1.1 from npm as the only runtime dependency), the dual CJS/ESM entry-point
  convention, Mocha/Chai/fast-check tests, `tsc --checkJs`
  type-checking, TypeDoc API docs, GitHub Actions for CI, docs and a
  monthly dependency audit, and the Apache License 2.0.
- `load(options?)`: loads `config/config.casc` under the project root
  (the nearest `package.json` above the working directory) once,
  synchronously, and stores it process-wide. It accepts `path`, `root` and
  every cooper load option, `dotenvDir` included (`.env` files are
  cooper's to find, at the project root by default, and the
  `.env.<env>` one is named by `COOPER_ENV`: `.env.dev`, `.env.prod`). An unknown option is
  a `TypeError`. A missing
  default file is an empty configuration. A failed load stores nothing.
- `@joetjen/cooper-config/register`, a preload entry for `--import`/`--require`
  that calls `load()` with defaults and exits with code 1 and the error's
  message on failure.
- `get`, `require`, `has` and `all`, which read by a dotted path or an
  array of segments and return deep-frozen values. Reading before
  `load()` throws an error that says how to load.
- `convert(tree, { modules? })`: byte sizes become byte counts, durations
  become whole milliseconds (anything else is refused), and IP addresses
  become their strings, with a prefix as `address/prefix`.
- Per-block secret handling with the `cooper-secrets` key (`reveal`,
  `keep`, or a module name resolved through `modules`), refused at the
  root, when nested, and for unknown or unresolvable values.
- `CooperConfigError`, which carries the file, cooper's formatted error
  and the cause.
- The `cooper-config` command: `init` scaffolds `config/` with a
  `${COOPER_ENV}` overlay per environment and never overwrites; `check`
  loads the configuration and reports.
