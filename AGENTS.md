# AGENTS.md

Instructions for AI agents working in this Node.js codebase.

`cooper-config` loads an application's CASC configuration once, at
startup, with [`cooper`](../node-cooper) (`node-cooper`), and gives the
application functions to read it. It is the Node counterpart of the
Elixir [`cooper_config`](https://github.com/joetjen/cooper_config) and
the Praxis `cooper_prx`. Those two are the references for behaviour: the
conversion table, the secrets policy, and the eager-only lifecycle all
come from them. A difference from them needs a reason written down in
the code that makes it.

## Communication

- Every response starts with the user's first name. Determine it from
  `git config user.name` (take the first name); if that's unavailable
  or ambiguous, ask once. Remember the answer for the rest of the
  session rather than re-deriving or re-asking.

## Before every commit

- Run `npm run precommit` (type-check via `tsc --checkJs --noEmit`,
  then the full test suite) and make sure it passes. No exceptions.

## Design rules that are not up for convenience

- **Eager only.** The configuration is loaded once, at startup. Never
  add lazy loading on first access, reloading, or file watching. A
  configuration error must stop the program before it does any work.
- **No parsing here.** Everything about CASC is `cooper`'s. A language
  question or bug goes to `node-cooper` (and, if it is the reference's,
  to the Elixir `cooper` first).
- **Unknown options are refused.** `src/options.cjs` lists every option.
  An option added to cooper is added there in the same change.
- **The secrets policy lives in the document** (`cooper-secrets`), not in
  an option, so that one document means the same thing to every Cooper
  integration.

## Language: plain JS + JSDoc, not TypeScript

- Source is plain `.cjs`/`.js`. No `.ts` files and no build step.
  Type safety comes from JSDoc annotations checked by
  `tsc --checkJs --noEmit` (`npm run typecheck`).
- Keep JSDoc annotations current with the code they describe.

## Tests

- Tests are written first: red, then implement, then green. Test names
  read as sentences.
- Tests must stay current with behavior. A change to what code does
  needs its tests updated in the same commit.
- Tests live in `test/` and run via Mocha/Chai (`npm test`, or
  `npm run autotest` to watch). Every test loads from a throwaway
  project (`test/support/project.js`) with `dotenv: false` and an
  explicit `COOPER_ENV`, so the developer's own files and environment
  cannot leak in.
- Prefer a `fast-check` property where the input space is large (the
  conversions, paths), and use examples for fixed scenarios.
- The store is process-wide. Anything that needs a process where nothing
  has been loaded, or that tests the `register` entry or the `bin`, runs
  a real `node` child process.

## Documentation

- Every documentation surface touched by a change is part of that
  change: JSDoc, README, `guides/CHEATSHEET.md`, `CHANGELOG.md`, and
  comments explaining non-obvious behavior.
- Every exported function needs a JSDoc block.
- Update `CHANGELOG.md` under `[Unreleased]` for every user-facing
  change, following [Keep a Changelog](https://keepachangelog.com/).
  Releases are cut with `npm version`, which runs `auto-changelog`.

## Dual entry points (ESM/CJS parity)

- `src/*.cjs` is the real implementation. **This is the file to
  change.** `src/cooper-config.js` and `src/register.js` are thin ESM
  wrappers over it, so ESM and CJS share one process-wide store.
- If you add or rename an export, update both entry points and
  `test/entry-points.spec.js`.

## Dependency boundaries

- `cooper` is the only runtime dependency, and it stays that way. It is
  unpublished, so `package.json` depends on it as `file:../node-cooper`.
  CI checks it out next to this repository.

## Git workflow, commits, versioning

- [git flow](https://nvie.com/posts/a-successful-git-branching-model/):
  no direct commits to `main` or `develop`; work on `feature/*`,
  `release/*`, `hotfix/*` or `support/*`.
- [Conventional Commits](https://www.conventionalcommits.org/).
- [Semantic Versioning](https://semver.org/), bumped with
  `npm version <major|minor|patch>`.

## License

Apache-2.0. Never MIT.
