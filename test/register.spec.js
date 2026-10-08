import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect } from 'chai';
import { HEADER, PACKAGE_ROOT, project, cleanup } from './support/project.js';

/**
 * The preload entry, `@joetjen/cooper-config/register`: `load()` with defaults,
 * before the application's own code runs. Each test runs a real `node` in
 * a throwaway project that has this package installed (as a symlink), so
 * the package's `exports` map is what resolves the entry.
 */

/**
 * A throwaway project with this package in its `node_modules`.
 * @param {Record<string, string>} files
 */
function installedProject(files) {
  const root = project({ 'package.json': '{"name":"app","private":true}', ...files });
  fs.mkdirSync(path.join(root, 'node_modules', '@joetjen'), { recursive: true });
  fs.symlinkSync(PACKAGE_ROOT, path.join(root, 'node_modules', '@joetjen', 'cooper-config'), 'dir');
  return root;
}

/**
 * Runs `node <args>` in `cwd` with an environment free of the developer's
 * COOPER_ENV/NODE_ENV.
 * @param {string} cwd
 * @param {string[]} args
 */
function node(cwd, args) {
  const env = { ...process.env, COOPER_ENV: 'test' };
  delete env.NODE_ENV;
  return spawnSync(process.execPath, args, { cwd, env, encoding: 'utf8' });
}

describe('@joetjen/cooper-config/register', () => {
  afterEach(cleanup);

  it('node --import @joetjen/cooper-config/register loads the configuration before an ES module runs', () => {
    const root = installedProject({ 'config/config.casc': `${HEADER}port = 4000\n` });
    const run = node(root, ['--import', '@joetjen/cooper-config/register', '--input-type=module', '-e', "import { get } from '@joetjen/cooper-config'; console.log(get('port'));"]);
    expect(run.status, run.stderr).to.equal(0);
    expect(run.stdout.trim()).to.equal('4000');
  });

  it('node --require @joetjen/cooper-config/register loads it before a CommonJS script runs', () => {
    const root = installedProject({ 'config/config.casc': `${HEADER}port = 4001\n` });
    const run = node(root, ['--require', '@joetjen/cooper-config/register', '-e', "console.log(require('@joetjen/cooper-config').get('port'));"]);
    expect(run.status, run.stderr).to.equal(0);
    expect(run.stdout.trim()).to.equal('4001');
  });

  it('importing it from the application loads the configuration', () => {
    const root = installedProject({ 'config/config.casc': `${HEADER}port = 4002\n` });
    const script = "import '@joetjen/cooper-config/register'; import { get } from '@joetjen/cooper-config'; console.log(get('port'));";
    const run = node(root, ['--input-type=module', '-e', script]);
    expect(run.status, run.stderr).to.equal(0);
    expect(run.stdout.trim()).to.equal('4002');
  });

  it('reads ${COOPER_ENV} from the environment it starts in', () => {
    const root = installedProject({
      'config/config.casc': `${HEADER}import "\${COOPER_ENV}/*.casc"\n`,
      'config/test/app.casc': `${HEADER}env = "test"\n`,
    });
    const run = node(root, ['--import', '@joetjen/cooper-config/register', '--input-type=module', '-e', "import { get } from '@joetjen/cooper-config'; console.log(get('env'));"]);
    expect(run.stdout.trim(), run.stderr).to.equal('test');
  });

  it('a project with no configuration file starts with an empty configuration', () => {
    const root = installedProject({});
    const run = node(root, ['--import', '@joetjen/cooper-config/register', '--input-type=module', '-e', "import { all } from '@joetjen/cooper-config'; console.log(JSON.stringify(all()));"]);
    expect(run.status, run.stderr).to.equal(0);
    expect(run.stdout.trim()).to.equal('{}');
  });

  it('a configuration that fails to load stops the process before the application runs', () => {
    const root = installedProject({ 'config/config.casc': `${HEADER}a = = 1\n` });
    const run = node(root, ['--import', '@joetjen/cooper-config/register', '--input-type=module', '-e', "console.log('application ran');"]);
    expect(run.status).to.not.equal(0);
    expect(run.stdout).to.not.include('application ran');
    expect(run.stderr).to.include('failed to load CASC configuration');
    expect(run.stderr).to.include('line 2, column 5');
  });
});
