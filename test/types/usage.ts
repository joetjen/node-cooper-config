// Compiled, never run, by `npm run typecheck`: an ES-module TypeScript
// application reads the package's declarations by its published name.

import '@joetjen/cooper-config/register';
import { load, get, require as requireValue, has, all, convert, CooperConfigError, version } from '@joetjen/cooper-config';

const loaded: Readonly<Record<string, any>> = load({ path: 'config/app.casc', dotenv: false, env: { COOPER_ENV: 'test' } });
const port: unknown = get('server.port', 8080);
const host: unknown = requireValue(['server', 'host']);
const present: boolean = has('server.tls');
const everything: Readonly<Record<string, any>> = all();
const plain: Readonly<Record<string, any>> = convert({});
const installed: string = version;

try {
  load({ path: 'missing.casc' });
} catch (err) {
  if (err instanceof CooperConfigError) console.log(err.message);
}

// @ts-expect-error -- has() takes a path, not a number
has(42);

void [loaded, port, host, present, everything, plain, installed];
