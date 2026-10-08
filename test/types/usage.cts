// The same, for a CommonJS TypeScript application.

import config = require('@joetjen/cooper-config');

const port: unknown = config.get('server.port');
const installed: string = config.version;

void [port, installed];
