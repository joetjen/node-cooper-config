# cooper-config cheatsheet

## Startup (once, eagerly)

```sh
node --import cooper-config/register app.js     # ESM
node --require cooper-config/register app.js    # CJS
```

```js
import 'cooper-config/register';                // as the first import
import { load } from 'cooper-config';
load(options?);                                  // or by hand, with options
```

| | |
| --- | --- |
| loaded | once, at startup, the whole document; never lazily, never reloaded or watched |
| before `load()` | every read throws `CooperConfigError` saying how to load |
| `load()` again | replaces what is stored |
| `load()` fails | throws; nothing stored, the previous configuration stays |
| no `config/config.casc` | empty configuration, not an error |
| explicit `path` missing | error |
| `register` fails | message on stderr, exit code 1 |

## `load(options?)` → the configuration

| Option | Default |
| --- | --- |
| `path` | `config/config.casc`, relative to the root |
| `root` | dir of nearest `package.json` above `process.cwd()`, else `process.cwd()` |
| `env`, `dotenv`, `dotenvEnv`, `dotenvFiles`, `dotenvDir`, `dotenvOverride` | cooper's |
| `resolvers`, `tags`, `importSchemes` | cooper's; synchronous only |
| `modules` | cooper's; also resolves `cooper-secrets` names |
| `cache`, `watchEnv` | cooper's |
| anything else | `TypeError` listing the supported options |

`CooperConfigError`: `.file`, `.formatted` (`file:line:col: stage error: message`), `.cause` (cooper's `CooperError`).

## Reading

```ts
get(path, fallback?)   // value | fallback (default undefined)
require(path)          // value, or CooperConfigError naming the path
has(path)              // boolean; a present nil counts
all()                  // the whole tree
// path: 'a.b.c' | ['key.with.dots', 'c']
```

Deep-frozen; blocks are null-prototype objects; class instances are left alone.

## Conversion

| CASC | you get |
| --- | --- |
| `16MiB` | `16777216` (bytes; `bigint` if unsafe) |
| `30s` | `30000` (ms; `bigint` if unsafe) |
| `1500us` | **error**, never rounded |
| `10.0.0.1` / `10.0.0.0/8` | `'10.0.0.1'` / `'10.0.0.0/8'` |
| `::1` / `fe80::/10` | `'::1'` / `'fe80::/10'` |
| blocks, lists, tuples | walked; shapes kept |
| everything else | as cooper returns it |

`convert(tree, { modules? })` does this to any cooper result.

## Secrets: `cooper-secrets`, per top-level block

```text
db {
  cooper-secrets = keep        # reveal (default) | keep | "Acme.Secret"
  *password = ${DB_PASSWORD}
}
```

| value | a secret arrives as |
| --- | --- |
| absent / `reveal` | revealed, converted |
| `keep` | cooper `Secret` |
| `"Acme.Secret"` | `new Class(v)` or `fn(v)` from `modules['Acme.Secret']` (a specifier is `require()`d; default export accepted) |

The key is removed. **Refused:** at the root, nested, an unknown value, or an unmapped, invalid or non-callable name.

## `${COOPER_ENV}`

`COOPER_ENV` (non-empty, unchanged) → else `NODE_ENV` (`development`/`local` → `dev`,
`testing` → `test`, `production` → `prod`, anything else unchanged) → else `"dev"`.

```text
config/config.casc     ...shared...  then, last:  import "${COOPER_ENV}/*.casc"
config/{dev,test,prod}/*.casc
```

`config/<COOPER_ENV>/` must exist and hold at least one `.casc` file.
A glob that matches nothing is an `import` error and the load fails.
`NODE_ENV=development`/`production` load `dev/`/`prod/` and `.env.dev`/`.env.prod`; a real
`COOPER_ENV=development` is never mapped and needs `development/`.

## CLI

```sh
cooper-config init  [--root DIR]               # scaffold; never overwrites (exit 1)
cooper-config check [--path FILE] [--root DIR] # 0 loads, 1 error, 2 usage
```
