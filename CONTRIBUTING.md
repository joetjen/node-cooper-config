# Contributing to cooper-config

Thanks for considering a contribution. This document covers what you
need to know before opening an issue or a pull request.

## Getting started

```sh
git clone https://github.com/joetjen/node-cooper-config.git
cd node-cooper-config
npm install
npm test
```

That should complete with no failures on a clean checkout. If it
doesn't, please open an issue before doing anything else; that's a bug
in its own right.

## Project layout

- `src/cooper-config.{cjs,js}`: the public API (`load`, `get`,
  `require`, `has`, `all`, `convert`, `CooperConfigError`, `version`)
  and the process-wide store.
- `src/register.{cjs,js}`: the `@joetjen/cooper-config/register` preload entry.
- `src/read.cjs`: finding, loading and converting the file. Everything
  `load()` does except storing the result.
- `src/project.cjs`: the project root and the default file.
- `src/options.cjs`: the supported options and the check that refuses
  others.
- `src/convert.cjs`: cooper's typed values as the application reads
  them.
- `src/secrets.cjs`: the `cooper-secrets` policy.
- `src/key-path.cjs`: dotted and array paths, and looking them up.
- `src/cli.cjs`, `bin/cooper-config.cjs`: the command.
- `test/`: one spec per concern, plus `test/support/project.js` for
  throwaway projects.

## Making a change

1. **Tests first.** Write a failing test whose name reads as a sentence,
   then make it pass.
2. **Check it against the references.** `cooper_config` (Elixir) and
   `cooper_prx` (Praxis) do the same job. If this library behaves
   differently, say why in the code.
3. **Property tests where the input space is large**, using `fast-check`.
4. **Run the full verification pass before opening a PR:**

   ```sh
   npm run precommit
   npm run docs
   ```

## Commits and branches

This project uses [git flow](https://nvie.com/posts/a-successful-git-branching-model/)
(`feature/*` branches off `develop`) and
[Conventional Commits](https://www.conventionalcommits.org/). Add a line
under `[Unreleased]` in `CHANGELOG.md` for any user-facing change.

## Reporting bugs

Please include the smallest CASC document that reproduces the problem,
the options you passed to `load()`, what you expected, and what happened,
including the `CooperConfigError`'s `formatted` text. If the problem is
in how the document itself loads, it probably belongs to `node-cooper`.
