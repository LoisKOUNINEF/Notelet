#!/usr/bin/env node

// Turns the Nutin build in dist/src into an unpacked Chrome extension.
// Runs after `builder.js` (see the build:extension scripts), so tools/builder stays untouched.
import fs from 'fs';
import path from 'path';
import esbuild from 'esbuild';
import { print, errorExit, getFilesRecursive } from '../utils/index.js';

const isProd = process.argv.includes('--prod');
const SOURCE = path.resolve('src', 'extension');
const OUTPUT = path.resolve('dist', 'src');

async function packageExtension() {
  if (!fs.existsSync(path.join(OUTPUT, 'index.html'))) {
    throw new Error('No build found in dist/src. Run the Nutin build first.');
  }

  await bundleBackground();
  writeManifest();
  // The builder copies src/extension's sources (and, in dev, tsc's output) like any other folder.
  fs.rmSync(path.join(OUTPUT, 'extension'), { recursive: true, force: true });
  if (isProd) removeCompressedFiles();

  print.boldSuccess(`\nExtension ready: load ${path.relative(process.cwd(), OUTPUT)} unpacked in chrome://extensions\n`);
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

// Pre-compressed copies only matter to a web server: Chrome reads the plain files.
function removeCompressedFiles() {
  getFilesRecursive(OUTPUT, ['.gz', '.br']).forEach((file) => fs.rmSync(file));
}

packageExtension().catch((err) => {
  errorExit(err, 'package-extension');
});
