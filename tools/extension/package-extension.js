#!/usr/bin/env node

// Turns the Nutin build in dist/src into an unpacked extension for one browser, in dist/<browser>
// (`--browser chrome|firefox`). Runs after `builder.js` (see the build:extension scripts), so
// tools/builder stays untouched, and dist/src (which the tests use) too.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';
import esbuild from 'esbuild';
import { print, errorExit, getFilesRecursive } from '../utils/index.js';

const isProd = process.argv.includes('--prod');
const zip = process.argv.includes('--zip');
const browser = process.argv[process.argv.indexOf('--browser') + 1];
const SOURCE = path.resolve('src', 'extension');
const BUILD = path.resolve('dist', 'src');
const OUTPUT = path.resolve('dist', browser ?? '');

// Firefox's add-on id: storage.sync and addons.mozilla.org need one, and it can never change.
const GECKO_ID = 'notelet@kouninef.dev';
const TARGETS = { chrome: 'chrome116', firefox: 'firefox140' };
const LOAD_HINT = {
  chrome: 'unpacked in chrome://extensions',
  firefox: 'in about:debugging (This Firefox → Load Temporary Add-on → its manifest.json)',
};

async function packageExtension() {
  if (!(browser in TARGETS)) {
    throw new Error('Pass the browser to package for: --browser chrome or --browser firefox.');
  }
  if (!fs.existsSync(path.join(BUILD, 'index.html'))) {
    throw new Error('No build found in dist/src. Run the Nutin build first.');
  }

  fs.rmSync(OUTPUT, { recursive: true, force: true });
  fs.cpSync(BUILD, OUTPUT, { recursive: true });
  await bundleBackground();
  writeManifest();
  copyFontLicenses();
  // The builder copies src/extension's sources (and, in dev, tsc's output) like any other folder.
  fs.rmSync(path.join(OUTPUT, 'extension'), { recursive: true, force: true });
  if (isProd) removeCompressedFiles();

  print.boldSuccess(`\nExtension ready: load ${path.relative(process.cwd(), OUTPUT)} ${LOAD_HINT[browser]}\n`);
  if (zip) zipForStore();
}

async function bundleBackground() {
  await esbuild.build({
    entryPoints: [path.join(SOURCE, 'background.ts')],
    outfile: path.join(OUTPUT, 'background.js'),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: [TARGETS[browser]],
    minify: isProd,
    sourcemap: !isProd,
    legalComments: 'none',
  });
}

// The extension's version follows package.json's. src/extension/manifest.json is Chrome's.
function writeManifest() {
  const manifest = JSON.parse(fs.readFileSync(path.join(SOURCE, 'manifest.json'), 'utf-8'));
  const { version } = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf-8'));
  manifest.version = version;
  const output = browser === 'firefox' ? toFirefox(manifest) : manifest;
  fs.writeFileSync(path.join(OUTPUT, 'manifest.json'), JSON.stringify(output, null, 2));
}

// Firefox has a sidebar instead of the side panel, and background scripts instead of a service
// worker. The toolbar button toggles the sidebar (see background.ts), the shortcut does it natively.
function toFirefox(manifest) {
  const { side_panel: sidePanel, minimum_chrome_version: _, commands, ...rest } = manifest;
  const { _execute_action: toggle, ...otherCommands } = commands ?? {};
  return {
    ...rest,
    background: { scripts: ['background.js'], type: 'module' },
    permissions: manifest.permissions.filter((permission) => permission !== 'sidePanel'),
    sidebar_action: {
      default_panel: sidePanel.default_path,
      default_title: manifest.action.default_title,
      default_icon: manifest.action.default_icon,
    },
    commands: { ...otherCommands, ...(toggle ? { _execute_sidebar_action: toggle } : {}) },
    browser_specific_settings: {
      gecko: { id: GECKO_ID, strict_min_version: '140.0', data_collection_permissions: { required: ['none'] } },
    },
  };
}

// The fonts' licenses (SIL OFL) must ship with them; the builder only copies the font files.
function copyFontLicenses() {
  const fonts = path.resolve('src', 'assets', 'fonts');
  if (!fs.existsSync(fonts)) return;
  getFilesRecursive(fonts, ['.txt']).forEach((file) => {
    const dest = path.join(OUTPUT, 'assets', 'fonts', path.relative(fonts, file));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(file, dest);
  });
}

// Pre-compressed copies only matter to a web server: the browser reads the plain files.
function removeCompressedFiles() {
  getFilesRecursive(OUTPUT, ['.gz', '.br']).forEach((file) => fs.rmSync(file));
}

// The archive the store takes (Chrome Web Store, addons.mozilla.org): dist/<browser>'s content at
// the zip's root. Reproducible: same sources, same bytes (sorted entries, fixed timestamps, no
// extra attributes), so CI can check it and the store upload matches the GitHub Release's.
function zipForStore() {
  const { name, version } = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf-8'));
  const archive = path.resolve('dist', `${name}-${browser}-${version}.zip`);
  fs.rmSync(archive, { force: true });
  const files = fs.readdirSync(OUTPUT, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(OUTPUT, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .filter((file) => !file.endsWith('.map') && path.basename(file) !== '.DS_Store')
    .sort();
  const mtime = buildTimestamp();
  files.forEach((file) => fs.utimesSync(path.join(OUTPUT, file), mtime, mtime));
  const result = spawnSync('zip', ['-X', '-D', '-q', archive, '-@'], {
    cwd: OUTPUT,
    input: files.join('\n'),
    stdio: ['pipe', 'inherit', 'inherit'],
    env: { ...process.env, TZ: 'UTC' },
  });
  if (result.error || result.status !== 0) {
    throw new Error(`Couldn't create ${path.relative(process.cwd(), archive)}: the "zip" command is needed. ${result.error?.message ?? ''}`);
  }
  const checksum = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
  fs.writeFileSync(`${archive}.sha256`, `${checksum}  ${path.basename(archive)}\n`);
  print.boldSuccess(`Store package: ${path.relative(process.cwd(), archive)} (sha256 ${checksum})\n`);
}

// SOURCE_DATE_EPOCH (CI sets it to the commit's time) or a fixed date: zip can't store times
// before 1980.
function buildTimestamp() {
  const epoch = Number(process.env.SOURCE_DATE_EPOCH);
  return new Date(Number.isFinite(epoch) && epoch > 315532800 ? epoch * 1000 : Date.UTC(1980, 1, 1));
}

packageExtension().catch((err) => {
  errorExit(err, 'package-extension');
});
