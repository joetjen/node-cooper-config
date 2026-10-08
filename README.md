# cooper-config

cooper-config loads your application's [CASC](https://github.com/joetjen/cooper/blob/main/guides/casc/CASC.md)
configuration once, at startup, with [`cooper`](https://github.com/joetjen/node-cooper),
and gives the rest of the program four functions to read it with.

It does not parse anything itself. `cooper` handles lexing, imports,
merging, `${...}`/`@{...}`/`%{...}` resolution and secrets. This library
finds the file, converts cooper's typed values into what ordinary code
expects, applies each block's secrets policy, and stores the result.

It is the Node counterpart of [`cooper_config`](https://github.com/joetjen/cooper_config)
(Elixir, Mix) and `cooper_prx` (Praxis). All three read the same
document the same way.

```text
# config/config.casc
#@version = 1.0

server {
  port    = 8080
  timeout = 30s
}

database {
  host      = "db.internal"
  pool.size = 10
  *password = ${DB_PASSWORD}
  max_blob  = 16MiB
}

import "${COOPER_ENV}/*.casc"
```

```js
import '@joetjen/cooper-config/register';            // loads config/config.casc, once
import { get, require } from '@joetjen/cooper-config';

get('server.port');                          // 8080
get('server.timeout');                       // 30000 (milliseconds)
get('database.max_blob');                    // 16777216 (bytes)
require('database.password');                // the revealed DB_PASSWORD
get('database.pool.size', 5);                // 10, or 5 if absent
```

## Install

```sh
npm install @joetjen/cooper-config
```

`@joetjen/cooper` comes along as a dependency. You need Node.js 20 or
later. TypeScript declarations ship with the package, for `import` and
`require` alike.
`require('@joetjen/cooper-config')` works the same way as `import`.

## Startup: loaded once, eagerly

Load the configuration before anything reads it. Either preload it:

```sh
node --import @joetjen/cooper-config/register app.js     # ES modules
node --require @joetjen/cooper-config/register app.js    # CommonJS
```

or import `@joetjen/cooper-config/register` as the first line of your entry
point, or call `load()` yourself when you need options:

```js
import { load } from '@joetjen/cooper-config';

load({ modules: { 'Acme.Secret': Secret } });
```

**That is the only time the configuration is read.** Nothing is loaded
lazily on first access, reloaded, or watched for changes. This is
deliberate, and it matches the Elixir and Praxis libraries:

- **A broken configuration stops the program at startup.** It does not
  wait for the first request that happens to touch the bad value. A typo
  in a secrets policy or an unresolvable `${VAR}` fails before the
  process accepts any work, and the error says which file is wrong.
- **Every reader sees the same configuration.** No part of the program
  can observe it half-loaded or changing under it.
- **Reading is cheap and synchronous.** `get` is a lookup in a frozen
  object, with no I/O and no error paths other than a missing key.

Reading before anything has been loaded throws a `CooperConfigError`
that tells you how to load it. Calling `load()` again replaces the
stored configuration, which is useful in tests. A load that fails stores
nothing and leaves the previous configuration in place.

The `register` entry stops the process with exit code 1 and the error's
message when loading fails. A missing `config/config.casc` is not a
failure: the application starts with an empty configuration.

## `load(options?)`

Synchronous. It loads and stores the configuration and returns it, as
`all()` would.

| Option | Default | |
| --- | --- | --- |
| `path` | `config/config.casc` | The CASC file. A relative path is resolved against the project root. A `path` that does not exist is an error. |
| `root` | the nearest directory above `process.cwd()` holding a `package.json`, else `process.cwd()` | The project root. |
| `env` | `{}` | cooper: an override layer for `${...}`, on top of `process.env` and `.env` files. |
| `dotenv` | `true` | cooper: read `.env`, `.env.<COOPER_ENV>` and `.env.local` from `dotenvDir`. |
| `dotenvEnv` | `COOPER_ENV` | cooper: the `<env>` in `.env.<env>` -- `.env.dev`, `.env.prod`, ..., never `.env.production`. |
| `dotenvFiles` | | cooper: replaces the `.env` file list; a relative entry resolves against `dotenvDir`. |
| `dotenvDir` | the project root | cooper: where `.env` files are read from -- by default the nearest `package.json` above `process.cwd()`, wherever the process started. |
| `dotenvOverride` | `false` | cooper: let `.env` files outrank `process.env`. |
| `resolvers` | | cooper: one function per `!{name:...}`. |
| `tags` | | cooper: one function per `!name(...)`. |
| `importSchemes` | | cooper: one loader per `import "scheme://..."`. |
| `modules` | | cooper: what each `!module("Name")` means. A `cooper-secrets` module name is resolved through it too. |
| `cache` | `true` | cooper: use cooper's file cache. |
| `watchEnv` | | cooper: let that cache poll the environment names the load read. |

Every cooper option is passed through unchanged. `load()` is
synchronous, so resolvers, tags and import schemes must return their
values directly, not as Promises. An option not in this table throws a
`TypeError` that lists the supported options. A typo should fail loudly;
a misspelt `modules` would otherwise leave a secrets policy unresolved
with no hint why.

The project root is found the same way from any working directory, so
a script run from `bin/` or a test runner started in a subdirectory
still finds `config/`. cooper's own `root` option (the base for bare
imports) is not exposed. Imports always resolve against the directory of
the file that contains them.

A load error is a `CooperConfigError`. It has the following fields:

- `file`: the absolute path of the file being loaded.
- `formatted`: what went wrong, as `file:line:column: stage error: message` for a cooper error.
- `cause`: cooper's `CooperError`.
- `message`: `formatted` under a line naming the file.

## Reading

```js
import { get, require, has, all } from '@joetjen/cooper-config';
```

| | |
| --- | --- |
| `get(path, fallback?)` | The value at `path`, or `fallback` (default `undefined`) when nothing is there. |
| `require(path)` | The value at `path`. Throws a `CooperConfigError` naming the path when nothing is there. |
| `has(path)` | Whether anything is at `path`. |
| `all()` | The whole configuration. |

`path` is a dotted string (`'database.pool.size'`) or an array of
segments (`['feature.flags', 'beta']`) for a key that contains a dot. A
path walks only blocks, by their own keys. It never indexes into a list
and never reaches `toString` or `constructor`. A present `nil` is
`null`: `has` is `true` and `get` returns `null`, not the fallback.

Every value handed out is deep-frozen: each block, list and tuple. Blocks
are null-prototype objects, as cooper returns them. An instance of a
class, such as a `Secret`, a date, or your own secret wrapper, is left as
it is.

## Conversion

cooper tags its typed literals. Those tags are removed here, because the
code reading the configuration (a database driver, an HTTP server, your
own modules) knows nothing about cooper:

| CASC | cooper returns | your application gets |
| --- | --- | --- |
| `16MiB` | `ByteSize` | `16777216` (bytes, a `bigint` beyond `Number.MAX_SAFE_INTEGER`) |
| `30s` | `Duration` | `30000` (milliseconds, a `bigint` beyond `Number.MAX_SAFE_INTEGER`) |
| `1500us` | `Duration` | **an error**: not a whole number of milliseconds |
| `10.0.0.1`, `::1` | `IPv4`, `IPv6` | `'10.0.0.1'`, `'::1'` |
| `10.0.0.0/8`, `fe80::/10` | `IPv4`, `IPv6` with a prefix | `'10.0.0.0/8'`, `'fe80::/10'` |
| block `{ ... }` | object | object, walked |
| list `[...]`, tuple `(...)` | array, `Tuple` | array, `Tuple`, walked |
| `*key = ...` | `Secret` | see [Secrets](#secrets) |
| anything else | | unchanged: strings, numbers, booleans, `null`, `bigint`s, atoms (`Symbol`s), dates, `ModuleRef`s |

Durations are converted to milliseconds because that is the unit
`setTimeout`, `AbortSignal.timeout` and most Node library options use. A
duration that is not a whole number of milliseconds is refused rather
than rounded. A silently shortened timeout is much harder to track down
than a startup that stops and says why.

`convert(tree, { modules? })` applies this conversion, including
secrets, to any cooper result. `load()` uses it internally.

## Secrets

A secret is **revealed** by default. Configuration readers expect a
password, not a wrapper. The protection a `Secret` gives is against
being printed, and by the time the configuration is stored, the value is
on its way to the code that uses it.

A top-level block can choose otherwise with a `cooper-secrets` key:

```text
database {
  cooper-secrets = keep                # reveal | keep | "Acme.Secret"
  *password      = ${DB_PASSWORD}
}
```

| `cooper-secrets` | each secret in the block arrives as |
| --- | --- |
| absent, or `reveal` | the revealed value, converted |
| `keep` | cooper's `Secret`, as is (call `reveal()` where you use it) |
| `"Acme.Secret"` | the revealed, converted value, wrapped by what `modules` maps `Acme.Secret` to |

A wrapper name is resolved exactly like `!module("Name")`. It must be a
dot-separated PascalCase name, and `load()`'s `modules` option maps it
either to a class (called with `new`), to a function (called plainly), or
to a module specifier string. A specifier is loaded with `require()`,
then the module itself or its default export is used. This option is for
a codebase that already has its own secret type: it keeps the leak
protection of `keep` while your code reveals values through a type you
own.

The policy covers every depth of its block, and the key itself is
removed before your application sees the block. It is refused at load
time in these cases:

- at the document root, where it would apply to nothing (a top-level key
  names a block);
- nested below a top-level block, where it would appear to govern a
  subtree while governing nothing;
- a value other than `reveal`, `keep` or a string;
- a name that is not a module name, that `modules` does not map, or that
  maps to something that cannot be called. This is checked even when the
  block contains no secret, so a typo fails at startup.

The key lives in the document rather than in an option so that one
document means the same thing to every Cooper integration that reads it.

## Per-environment configuration: `${COOPER_ENV}`

cooper always defines `${COOPER_ENV}`, in every implementation. It is
`COOPER_ENV` when that is set and non-empty, else `NODE_ENV`, else
`"dev"`, read from the same layers as every other `${...}` (`.env`
files, the real environment, the `env` option). A real `COOPER_ENV` is
used exactly as set. Every Cooper names its environments `dev`,
`staging`, `test` and `prod`, and maps the `NODE_ENV` fallback onto them
through one table: `development` and `local` become `dev`, `testing`
becomes `test`, `production` becomes `prod`; anything else (`staging`,
`qa`, ...) is used unchanged.

```text
config/
  config.casc          shared settings, then: import "${COOPER_ENV}/*.casc"
  dev/dev.casc         overrides for COOPER_ENV=dev
  test/test.casc
  prod/prod.casc
```

- **Put the environment import last.** Later statements override
  earlier ones, so an overlay imported first would be overridden by the
  settings it is meant to adjust.
- **`${COOPER_ENV}` must name an existing `config/<env>/` directory
  holding at least one `.casc` file.** A glob import that matches no
  files is an `import`-stage load error (`import "production/*.casc"
  matched no files (searched under .../config)`), so the application
  does not start. This is deliberate: a misspelt environment fails
  loudly instead of silently running without its overlay.
- **`NODE_ENV=development` and `NODE_ENV=production` just work** with
  `dev/` and `prod/` directories: with `COOPER_ENV` unset, the fallback
  maps them to `dev` and `prod`. The same name picks the `.env` file:
  `.env.dev` and `.env.prod`, never `.env.development` or
  `.env.production`. A real `COOPER_ENV` is never mapped, so
  `COOPER_ENV=development` needs a `development/` directory.
- Only `${...}` can appear in an import path. Imports are resolved
  while the document is parsed, before any `%{...}` reference exists.

## The `cooper-config` command

```sh
npx cooper-config init               # scaffold config/ in the project
npx cooper-config check              # load it the way the application will
npx cooper-config check --path config/other.casc --root ./service
```

`init` writes `config/config.casc` and one `.casc` file in each of
`config/dev/`, `config/test/` and `config/prod/`. The entry file
contains a version header, a comment, and the `${COOPER_ENV}` import as
its last line. If any of these files already exists, `init` writes
nothing and exits with code 1.

`check` loads the configuration without storing it, using the
environment it runs in (including `COOPER_ENV`). It prints that the
configuration loads and exits with code 0, or prints the formatted
error and exits with code 1. A missing default file is reported but is
not a failure. `check` cannot pass `modules`, `resolvers`, `tags` or
`importSchemes`, so a document that depends on them should be checked
by starting the application. A usage error exits with code 2.

## Development

```sh
npm install
npm run precommit
```

`npm run precommit` type-checks the JSDoc (`tsc --checkJs --noEmit`) and
runs the Mocha suite. `npm run docs` builds the TypeDoc reference into
`doc/`. See [CONTRIBUTING.md](CONTRIBUTING.md) and the
[cheatsheet](guides/CHEATSHEET.md).

## License

Apache-2.0, see [LICENSE](LICENSE).
