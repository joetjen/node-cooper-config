import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect } from 'chai';
import { loadFileSync } from 'cooper';
import { main } from '../src/cli.cjs';
import { HEADER, PACKAGE_ROOT, project, cleanup } from './support/project.js';

/**
 * The `cooper-config` command: `init` scaffolds a project's configuration,
 * `check` loads it the way the application will. `main` is driven in
 * process with captured output; one test runs the real `bin`.
 */

/**
 * Runs `main(args)` in `cwd`, capturing what it writes.
 * @param {string} cwd
 * @param {string[]} args
 */
function cli(cwd, args) {
  let stdout = '';
  let stderr = '';
  const env = { COOPER_ENV: 'test' };
  const status = main(args, {
    cwd,
    env,
    stdout: (/** @type {string} */ text) => (stdout += text),
    stderr: (/** @type {string} */ text) => (stderr += text),
  });
  return { status, stdout, stderr };
}

const ENVIRONMENTS = ['dev', 'test', 'prod'];

describe('the cooper-config command', () => {
  afterEach(cleanup);

  describe('init', () => {
    it('writes config/config.casc with a version header, a comment and the environment import last', () => {
      const root = project({ 'package.json': '{}' });
      expect(cli(root, ['init']).status).to.equal(0);
      const text = fs.readFileSync(path.join(root, 'config', 'config.casc'), 'utf8');
      expect(text).to.match(/^#@version = 1\.0\n/);
      expect(text).to.match(/\n# /);
      const lines = text.trim().split('\n');
      expect(lines[lines.length - 1]).to.equal('import "${COOPER_ENV}/*.casc"');
    });

    it('writes one .casc file in each of config/dev, config/test and config/prod', () => {
      const root = project({ 'package.json': '{}' });
      cli(root, ['init']);
      for (const env of ENVIRONMENTS) {
        const files = fs.readdirSync(path.join(root, 'config', env)).filter((f) => f.endsWith('.casc'));
        expect(files, env).to.have.length(1);
      }
    });

    it('writes into the project root found from the working directory', () => {
      const root = project({ 'package.json': '{}', 'src/.keep': '' });
      cli(path.join(root, 'src'), ['init']);
      expect(fs.existsSync(path.join(root, 'config', 'config.casc'))).to.equal(true);
    });

    it('writes under --root when given', () => {
      const root = project();
      cli(process.cwd(), ['init', '--root', root]);
      expect(fs.existsSync(path.join(root, 'config', 'config.casc'))).to.equal(true);
    });

    it('scaffolds a configuration that loads under every environment', () => {
      const root = project({ 'package.json': '{}' });
      cli(root, ['init']);
      for (const env of ENVIRONMENTS) {
        expect(() => loadFileSync(path.join(root, 'config', 'config.casc'), { dotenv: false, cache: false, env: { COOPER_ENV: env } }), env).to.not.throw();
      }
    });

    it('reports every file it wrote', () => {
      const root = project({ 'package.json': '{}' });
      const run = cli(root, ['init']);
      expect(run.stdout).to.include(path.join('config', 'config.casc'));
      for (const env of ENVIRONMENTS) expect(run.stdout).to.include(path.join('config', env));
    });

    it('refuses to overwrite an existing file, writing nothing at all', () => {
      const root = project({ 'package.json': '{}', 'config/config.casc': `${HEADER}mine = 1\n` });
      const run = cli(root, ['init']);
      expect(run.status).to.equal(1);
      expect(run.stderr).to.include('config.casc');
      expect(fs.readFileSync(path.join(root, 'config', 'config.casc'), 'utf8')).to.equal(`${HEADER}mine = 1\n`);
      expect(fs.existsSync(path.join(root, 'config', 'dev'))).to.equal(false);
    });
  });

  describe('check', () => {
    it('reports a configuration that loads, with exit code 0', () => {
      const root = project({ 'package.json': '{}', 'config/config.casc': `${HEADER}port = 1\n` });
      const run = cli(root, ['check']);
      expect(run.status, run.stderr).to.equal(0);
      expect(run.stdout).to.include('config.casc');
      expect(run.stdout).to.match(/loads/);
    });

    it('reports the formatted error of one that does not, with exit code 1', () => {
      const root = project({ 'package.json': '{}', 'config/config.casc': `${HEADER}a = = 1\n` });
      const run = cli(root, ['check']);
      expect(run.status).to.equal(1);
      expect(run.stderr).to.include('line 2, column 5');
    });

    it('reports a refused secrets policy as a failure', () => {
      const root = project({ 'package.json': '{}', 'config/config.casc': `${HEADER}cooper-secrets = keep\n` });
      expect(cli(root, ['check']).status).to.equal(1);
    });

    it('resolves ${COOPER_ENV} from the environment it runs in', () => {
      const root = project({ 'package.json': '{}', 'config/config.casc': `${HEADER}import "\${COOPER_ENV}/*.casc"\n`, 'config/test/a.casc': `${HEADER}a = = 1\n` });
      expect(cli(root, ['check']).status).to.equal(1);
    });

    it('says so when there is no configuration file, which is not a failure', () => {
      const root = project({ 'package.json': '{}' });
      const run = cli(root, ['check']);
      expect(run.status).to.equal(0);
      expect(run.stdout).to.match(/no configuration file/);
    });

    it('checks the file named by --path, relative to the project root', () => {
      const root = project({ 'package.json': '{}', 'etc/app.casc': `${HEADER}a = = 1\n` });
      expect(cli(root, ['check', '--path', 'etc/app.casc']).status).to.equal(1);
    });

    it('refuses a --path that does not exist', () => {
      const root = project({ 'package.json': '{}' });
      expect(cli(root, ['check', '--path', 'missing.casc']).status).to.equal(1);
    });
  });

  describe('usage', () => {
    it('help prints the commands, with exit code 0', () => {
      const run = cli(process.cwd(), ['help']);
      expect(run.status).to.equal(0);
      expect(run.stdout).to.include('init').and.to.include('check');
    });

    it('an unknown command is a usage error, exit code 2', () => {
      const run = cli(process.cwd(), ['frobnicate']);
      expect(run.status).to.equal(2);
      expect(run.stderr).to.include('frobnicate');
    });

    it('no command at all is a usage error', () => {
      expect(cli(process.cwd(), []).status).to.equal(2);
    });

    it('an unknown flag is a usage error', () => {
      expect(cli(process.cwd(), ['check', '--nope']).status).to.equal(2);
    });

    it('a flag missing its value is a usage error', () => {
      expect(cli(process.cwd(), ['check', '--path']).status).to.equal(2);
    });
  });

  it('the installed bin runs check and exits with its status', () => {
    const root = project({ 'package.json': '{}', 'config/config.casc': `${HEADER}a = = 1\n` });
    const run = spawnSync(process.execPath, [path.join(PACKAGE_ROOT, 'bin', 'cooper-config.cjs'), 'check'], { cwd: root, encoding: 'utf8' });
    expect(run.status).to.equal(1);
    expect(run.stderr).to.include('line 2, column 5');
  });
});
