#!/usr/bin/env node

// Turns the Nutin build in dist/src into an unpacked Chrome extension.
// Runs after `builder.js` (see the build:extension scripts), so tools/builder stays untouched.
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import esbuild from 'esbuild';
import { print, errorExit, getFilesRecursive } from '../utils/index.js';

const isProd = process.argv.includes('--prod');
const zip = process.argv.includes('--zip');
const SOURCE = path.resolve('src', 'extension');
const OUTPUT = path.resolve('dist', 'src');

async function packageExtension() {
  if (!fs.existsSync(path.join(OUTPUT, 'index.html'))) {
    throw new Error('No build found in dist/src. Run the Nutin build first.');
  }

  await bundleBackground();
  writeManifest();
  copyFontLicenses();
  // The builder copies src/extension's sources (and, in dev, tsc's output) like any other folder.
  fs.rmSync(path.join(OUTPUT, 'extension'), { recursive: true, force: true });
  if (isProd) removeCompressedFiles();

  print.boldSuccess(`\nExtension ready: load ${path.relative(process.cwd(), OUTPUT)} unpacked in chrome://extensions\n`);
  if (zip) zipForStore();
}

async function bundleBackground() {
  await esbuild.build({
    entryPoints: [path.join(SOURCE, 'background.ts')],
    outfile: path.join(OUTPUT, 'background.js'),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['chrome116'],
    minify: isProd,
    sourcemap: !isProd,
    legalComments: 'none',
  });
}

// The extension's version follows package.json's.
function writeManifest() {
  const manifest = JSON.parse(fs.readFileSync(path.join(SOURCE, 'manifest.json'), 'utf-8'));
  const { version } = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf-8'));
  manifest.version = version;
  fs.writeFileSync(path.join(OUTPUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
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

// Pre-compressed copies only matter to a web server: Chrome reads the plain files.
function removeCompressedFiles() {
  getFilesRecursive(OUTPUT, ['.gz', '.br']).forEach((file) => fs.rmSync(file));
}

// The archive the Chrome Web Store takes: dist/src's content at the zip's root.
function zipForStore() {
  const { name, version } = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf-8'));
  const archive = path.resolve('dist', `${name}-${version}.zip`);
  fs.rmSync(archive, { force: true });
  const result = spawnSync('zip', ['-r', '-X', '-q', archive, '.', '-x', '*.map', '.DS_Store'], { cwd: OUTPUT, stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    throw new Error(`Couldn't create ${path.relative(process.cwd(), archive)}: the "zip" command is needed. ${result.error?.message ?? ''}`);
  }
  print.boldSuccess(`Store package: ${path.relative(process.cwd(), archive)}\n`);
}

packageExtension().catch((err) => {
  errorExit(err, 'package-extension');
});
