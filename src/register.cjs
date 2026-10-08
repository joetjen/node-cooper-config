'use strict';

/**
 * @fileoverview The preload entry: `node --import cooper-config/register`
 * (or `--require`, or `import 'cooper-config/register'` as the
 * application's first import) runs `load()` with its defaults before the
 * application's own code.
 *
 * A configuration that fails to load stops the process here, with the
 * error's message and exit code 1 rather than a stack trace: the trace
 * would point into this library, and what needs fixing is the document.
 */

const { load, CooperConfigError } = require('./cooper-config.cjs');

try {
  load();
} catch (err) {
  if (!(err instanceof CooperConfigError)) throw err;
  process.stderr.write(`cooper-config: ${err.message}\n`);
  process.exit(1);
}
