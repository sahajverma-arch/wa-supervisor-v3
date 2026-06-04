import { constants } from 'node:fs';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import type * as Puppeteer from 'puppeteer';
import { toErrorMessage } from './errors.js';

const require = createRequire(import.meta.url);

function resolveBackendCacheDirectory() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.cache', 'puppeteer');
}

export function getPuppeteerCacheDirectory() {
  return resolveBackendCacheDirectory();
}

export function applyPuppeteerCacheDirectory() {
  const cacheDirectory = getPuppeteerCacheDirectory();
  process.env.PUPPETEER_CACHE_DIR = cacheDirectory;
  return cacheDirectory;
}

const configuredCacheDirectory = applyPuppeteerCacheDirectory();
const puppeteer = require('puppeteer') as typeof Puppeteer;

async function pathExists(targetPath: string) {
  try {
    await access(targetPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export type PuppeteerBrowserDiagnostics = {
  cacheDirectory: string;
  cacheDirectoryExists: boolean;
  executablePath: string | null;
  executablePathExists: boolean;
  browserDirectory: string | null;
  browserDirectoryExists: boolean;
  browserInstallRootDirectory: string | null;
  browserInstallRootDirectoryExists: boolean;
  available: boolean;
  error?: unknown;
};

export async function inspectPuppeteerBrowserDiagnostics(): Promise<PuppeteerBrowserDiagnostics> {
  const cacheDirectory = configuredCacheDirectory;
  await mkdir(cacheDirectory, { recursive: true });

  let executablePath: string | null = null;
  let executablePathExists = false;
  let browserDirectory: string | null = null;
  let browserDirectoryExists = false;
  let browserInstallRootDirectory: string | null = null;
  let browserInstallRootDirectoryExists = false;
  let error: unknown;

  try {
    executablePath = await puppeteer.executablePath();
    executablePathExists = await pathExists(executablePath);
    browserDirectory = path.dirname(executablePath);
    browserDirectoryExists = await pathExists(browserDirectory);
    browserInstallRootDirectory = path.dirname(browserDirectory);
    browserInstallRootDirectoryExists = await pathExists(browserInstallRootDirectory);
  } catch (caughtError) {
    error = caughtError;
  }

  const cacheDirectoryExists = await pathExists(cacheDirectory);
  const available = Boolean(executablePath && executablePathExists);

  return {
    cacheDirectory,
    cacheDirectoryExists,
    executablePath,
    executablePathExists,
    browserDirectory,
    browserDirectoryExists,
    browserInstallRootDirectory,
    browserInstallRootDirectoryExists,
    available,
    error
  };
}

async function installChromeIntoConfiguredCache() {
  const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const cliPath = require.resolve('puppeteer/lib/cjs/puppeteer/node/cli.js');
  const installResult = spawnSync(process.execPath, [cliPath, 'browsers', 'install', 'chrome'], {
    cwd: backendRoot,
    env: {
      ...process.env,
      PUPPETEER_CACHE_DIR: configuredCacheDirectory
    },
    stdio: 'inherit'
  });

  if (installResult.status !== 0) {
    throw new Error(`Puppeteer Chrome install failed with exit code ${installResult.status ?? 1}`);
  }
}

export async function ensurePuppeteerBrowserAvailable() {
  const diagnostics = await inspectPuppeteerBrowserDiagnostics();
  if (diagnostics.available) {
    return diagnostics;
  }

  await installChromeIntoConfiguredCache();
  return inspectPuppeteerBrowserDiagnostics();
}

export function formatPuppeteerMissingChromeMessage(diagnostics: PuppeteerBrowserDiagnostics) {
  const expectedExecutable = diagnostics.executablePath ?? '(unresolved)';
  const browserDirectory = diagnostics.browserDirectory ?? '(unresolved)';
  const browserInstallRootDirectory = diagnostics.browserInstallRootDirectory ?? '(unresolved)';
  const parts = [
    'Chrome is not available for Puppeteer.',
    `Configured cache directory: ${diagnostics.cacheDirectory}`,
    `Expected browser executable: ${expectedExecutable}`,
    `Expected browser directory: ${browserDirectory}`,
    `Expected browser install root: ${browserInstallRootDirectory}`
  ];

  if (diagnostics.error) {
    parts.push(`Probe error: ${toErrorMessage(diagnostics.error)}.`);
  }

  parts.push(
    'Remediation:',
    '1. Ensure the backend build runs the Chrome install step with the same PUPPETEER_CACHE_DIR value.',
    '2. Confirm Render is deploying the backend workspace, including backend/.cache/puppeteer.',
    '3. Rebuild the service if the cache directory was changed or the browser download failed.'
  );

  return parts.join(' ');
}
