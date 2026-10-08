#!/usr/bin/env node
'use strict';

// The installed `cooper-config` command; everything it does is `main`'s.
const { main } = require('../src/cli.cjs');

process.exitCode = main(process.argv.slice(2), {
  cwd: process.cwd(),
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
});
