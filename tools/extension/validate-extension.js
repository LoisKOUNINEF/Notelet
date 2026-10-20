#!/usr/bin/env node

// Checks a packaged extension before it is released: its manifest, the store ZIP's contents and
// that every version agrees (`--browser chrome|firefox`, `--tag vX.Y.Z` on a release). Runs after
// package-extension.js --zip, on dist/<browser> and dist/<name>-<browser>-<version>.zip.
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { print, errorExit } from '../utils/index.js';

const browser = argValue('--browser');
const tag = argValue('--tag');
const OUTPUT = path.resolve('dist', browser ?? '');
const GECKO_ID = 'notelet@kouninef.dev';
const MAX_ZIP_BYTES = 5 * 1024 * 1024;
const REQUIRED_ENTRIES = ['manifest.json', 'index.html', 'background.js'];
const FORBIDDEN_ENTRY = /(^|\/)(\.DS_Store|extension\/)|\.(map|gz|br)$/;

function validateExtension() {
  if (browser !== 'chrome' && browser !== 'firefox') {
    throw new Error('Pass the browser to validate: --browser chrome or --browser firefox.');
  }
  const { name, version } = readJson(path.resolve('package.json'));
  const archive = path.resolve('dist', `${name}-${browser}-${version}.zip`);
  if (!fs.existsSync(archive)) {
    throw new Error(`No package found at ${path.relative(process.cwd(), archive)}. Run package:extension:${browser} first.`);
  }

  const manifest = readJson(path.join(OUTPUT, 'manifest.json'));
  const entries = listEntries(archive);
  const errors = [
    ...checkManifest(manifest, entries),
    ...checkContents(archive, entries),
    ...checkVersions(manifest, version),
  ];
  if (errors.length) {
    throw new Error(`${path.basename(archive)} isn't releasable:\n  - ${errors.join('\n  - ')}`);
  }
  print.boldSuccess(`${path.basename(archive)}: manifest, contents and versions OK (${entries.length} files)\n`);
}

function checkManifest(manifest, entries) {
  const errors = [];
  if (manifest.manifest_version !== 3) errors.push(`manifest_version is ${manifest.manifest_version}, expected 3`);
  ['name', 'description', 'version'].forEach((key) => {
    if (!manifest[key]) errors.push(`manifest has no "${key}"`);
  });

  const files = new Set(entries);
  referencedFiles(manifest).forEach((file) => {
    if (!files.has(file)) errors.push(`manifest references "${file}", missing from the package`);
  });

  const permissions = manifest.permissions ?? [];
  if (browser === 'chrome') {
    if (!manifest.background?.service_worker) errors.push('Chrome manifest has no background.service_worker');
    if (!manifest.side_panel?.default_path) errors.push('Chrome manifest has no side_panel.default_path');
    if (!permissions.includes('sidePanel')) errors.push('Chrome manifest lacks the "sidePanel" permission');
    if (manifest.browser_specific_settings) errors.push('Chrome manifest has browser_specific_settings');
  } else {
    const gecko = manifest.browser_specific_settings?.gecko;
    if (!manifest.background?.scripts?.length) errors.push('Firefox manifest has no background.scripts');
    if (manifest.background?.service_worker) errors.push('Firefox manifest has a background.service_worker');
    if (!manifest.sidebar_action?.default_panel) errors.push('Firefox manifest has no sidebar_action.default_panel');
    if (gecko?.id !== GECKO_ID) errors.push(`Firefox add-on id is "${gecko?.id}", expected "${GECKO_ID}" (it can never change)`);
    if (!gecko?.data_collection_permissions) errors.push('Firefox manifest has no gecko.data_collection_permissions');
    if (manifest.side_panel || permissions.includes('sidePanel')) errors.push('Firefox manifest still has Chrome\'s side panel');
  }
  return errors;
}

// Every file path the manifest points to, relative to the package's root.
function referencedFiles(manifest) {
  return [
    ...Object.values(manifest.icons ?? {}),
    ...Object.values(manifest.action?.default_icon ?? {}),
    ...Object.values(manifest.sidebar_action?.default_icon ?? {}),
    manifest.side_panel?.default_path,
    manifest.sidebar_action?.default_panel,
    manifest.background?.service_worker,
    ...(manifest.background?.scripts ?? []),
  ].filter(Boolean).map((file) => file.replace(/^\.?\//, ''));
}

function checkContents(archive, entries) {
  const errors = [];
  REQUIRED_ENTRIES.forEach((entry) => {
    if (!entries.includes(entry)) errors.push(`"${entry}" missing from the package's root`);
  });
  entries.filter((entry) => FORBIDDEN_ENTRY.test(entry)).forEach((entry) => {
    errors.push(`"${entry}" shouldn't be packaged`);
  });
  // The fonts' licenses (SIL OFL) must ship with them.
  const fontDirs = new Set(entries.filter((entry) => entry.endsWith('.woff2')).map((entry) => path.posix.dirname(entry)));
  fontDirs.forEach((dir) => {
    if (!entries.includes(`${dir}/LICENSE.txt`)) errors.push(`"${dir}" has fonts but no LICENSE.txt`);
  });
  const size = fs.statSync(archive).size;
  if (size > MAX_ZIP_BYTES) errors.push(`package is ${size} bytes, over the ${MAX_ZIP_BYTES} bytes sanity cap`);
  return errors;
}

// package.json is the source of truth; the built manifest, the source manifest and the release
// tag must all agree with it.
function checkVersions(manifest, version) {
  const errors = [];
  if (manifest.version !== version) errors.push(`built manifest version ${manifest.version} ≠ package.json ${version}`);
  const source = readJson(path.resolve('src', 'extension', 'manifest.json'));
  if (source.version !== version) errors.push(`src/extension/manifest.json version ${source.version} ≠ package.json ${version}`);
  if (tag && tag !== `v${version}`) errors.push(`tag ${tag} ≠ v${version} (package.json)`);
  return errors;
}

function listEntries(archive) {
  const result = spawnSync('unzip', ['-Z1', archive], { encoding: 'utf-8' });
  if (result.error || result.status !== 0) {
    throw new Error(`Couldn't list ${path.basename(archive)}: the "unzip" command is needed. ${result.error?.message ?? result.stderr}`);
  }
  return result.stdout.split('\n').filter((entry) => entry && !entry.endsWith('/'));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

try {
  validateExtension();
} catch (err) {
  errorExit(err, 'validate-extension');
}
