import { AsyncLocalStorage } from 'node:async_hooks';
import { constants } from 'node:fs';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import type * as Puppeteer from 'puppeteer';
import { logger } from './logger.js';
import { serializeError } from './errors.js';
import { toErrorMessage } from './errors.js';

const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer') as typeof Puppeteer & Record<string, any>;
let whatsappWebPuppeteer: (typeof Puppeteer & Record<string, any>) | null = null;
try {
  const whatsappWebRequire = createRequire(require.resolve('whatsapp-web.js/package.json'));
  whatsappWebPuppeteer = whatsappWebRequire('puppeteer') as typeof Puppeteer & Record<string, any>;
} catch {
  whatsappWebPuppeteer = null;
}

type PuppeteerSessionContext = {
  sessionKey: string;
  authPath: string;
};

const puppeteerSessionContext = new AsyncLocalStorage<PuppeteerSessionContext>();
const patchedPuppeteerLaunchSymbol = Symbol.for('wa-supervisor-v3.puppeteer.launch.patched');
const patchedBrowserSymbol = Symbol.for('wa-supervisor-v3.puppeteer.browser.patched');
const patchedPageSymbol = Symbol.for('wa-supervisor-v3.puppeteer.page.patched');

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

function getSessionMetadata() {
  return puppeteerSessionContext.getStore() ?? null;
}

function withSessionContext<T>(context: PuppeteerSessionContext, task: () => Promise<T> | T) {
  return puppeteerSessionContext.run(context, task);
}

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

function sanitizePuppeteerLaunchOptions(options: Record<string, unknown> | undefined) {
  if (!options) return null;

  const { args, executablePath, headless, userDataDir, defaultViewport, protocolTimeout, dumpio, timeout, devtools, browser, ignoreDefaultArgs, pipe } = options as Record<string, unknown>;

  return {
    args,
    executablePath,
    headless,
    userDataDir,
    defaultViewport,
    protocolTimeout,
    dumpio,
    timeout,
    devtools,
    browser,
    ignoreDefaultArgs,
    pipe
  };
}

function logPageError(page: any, eventName: string, error: unknown, extra: Record<string, unknown> = {}) {
  logger.error(`PUPPETEER_PAGE_${eventName}_ERROR`, {
    ...extra,
    error: serializeError(error)
  });
}

function attachPageInstrumentation(page: any) {
  if (!page || page[patchedPageSymbol]) return page;
  page[patchedPageSymbol] = true;

  const session = getSessionMetadata();
  const getPageUrl = () => {
    try {
      return typeof page.url === 'function' ? page.url() : null;
    } catch {
      return null;
    }
  };

  page.on('console', (message: any) => {
    logger.info('PUPPETEER_PAGE_CONSOLE', {
      sessionKey: session?.sessionKey ?? null,
      authPath: session?.authPath ?? null,
      url: getPageUrl(),
      type: typeof message.type === 'function' ? message.type() : null,
      text: typeof message.text === 'function' ? message.text() : null,
      location: typeof message.location === 'function' ? message.location() : null
    });
  });

  page.on('pageerror', (error: unknown) => {
    logPageError(page, 'PAGEERROR', error, {
      sessionKey: session?.sessionKey ?? null,
      authPath: session?.authPath ?? null,
      url: getPageUrl()
    });
  });

  page.on('error', (error: unknown) => {
    logPageError(page, 'ERROR', error, {
      sessionKey: session?.sessionKey ?? null,
      authPath: session?.authPath ?? null,
      url: getPageUrl()
    });
  });

  page.on('crash', () => {
    logger.error('PUPPETEER_PAGE_CRASH', {
      sessionKey: session?.sessionKey ?? null,
      authPath: session?.authPath ?? null,
      url: getPageUrl()
    });
  });

  page.on('close', () => {
    logger.info('PUPPETEER_PAGE_CLOSED', {
      sessionKey: session?.sessionKey ?? null,
      authPath: session?.authPath ?? null,
      url: getPageUrl()
    });
  });

  return page;
}

async function attachBrowserInstrumentation(browser: any, launchOptions?: Record<string, unknown>) {
  if (!browser || browser[patchedBrowserSymbol]) return browser;
  browser[patchedBrowserSymbol] = true;

  const session = getSessionMetadata();

  logger.info('PUPPETEER_BROWSER_STARTED', {
    sessionKey: session?.sessionKey ?? null,
    authPath: session?.authPath ?? null,
    pid: browser.process?.()?.pid ?? null,
    launchOptions: sanitizePuppeteerLaunchOptions(launchOptions)
  });

  browser.on('disconnected', () => {
    logger.error('PUPPETEER_BROWSER_DISCONNECTED', {
      sessionKey: session?.sessionKey ?? null,
      authPath: session?.authPath ?? null
    });
  });

  const browserProcess = browser.process?.();
  if (browserProcess) {
    browserProcess.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      logger.error('PUPPETEER_BROWSER_PROCESS_EXIT', {
        sessionKey: session?.sessionKey ?? null,
        authPath: session?.authPath ?? null,
        pid: browserProcess.pid ?? null,
        code,
        signal
      });
    });

    browserProcess.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
      logger.info('PUPPETEER_BROWSER_PROCESS_CLOSE', {
        sessionKey: session?.sessionKey ?? null,
        authPath: session?.authPath ?? null,
        pid: browserProcess.pid ?? null,
        code,
        signal
      });
    });

    browserProcess.on('error', (error: unknown) => {
      logger.error('PUPPETEER_BROWSER_PROCESS_ERROR', {
        sessionKey: session?.sessionKey ?? null,
        authPath: session?.authPath ?? null,
        pid: browserProcess.pid ?? null,
        error: serializeError(error)
      });
    });
  }

  const attachExistingPages = async () => {
    try {
      const pages = await browser.pages();
      logger.info('PUPPETEER_BROWSER_PAGES', {
        sessionKey: session?.sessionKey ?? null,
        authPath: session?.authPath ?? null,
        count: pages.length,
        urls: pages.map((page: any) => {
          try {
            return typeof page.url === 'function' ? page.url() : null;
          } catch {
            return null;
          }
        })
      });
      pages.forEach((page: any) => attachPageInstrumentation(page));
    } catch (error) {
      logger.error('PUPPETEER_BROWSER_PAGES_ERROR', {
        sessionKey: session?.sessionKey ?? null,
        authPath: session?.authPath ?? null,
        error: serializeError(error)
      });
    }
  };

  await attachExistingPages();

  const originalNewPage = browser.newPage.bind(browser);
  browser.newPage = async (...args: unknown[]) => {
    const page = await originalNewPage(...args);
    return attachPageInstrumentation(page);
  };

  return browser;
}

export function installPuppeteerRuntimeInstrumentation() {
  const modulesToPatch = whatsappWebPuppeteer && whatsappWebPuppeteer !== puppeteer ? [puppeteer, whatsappWebPuppeteer] : [puppeteer];

  for (const module of modulesToPatch) {
    const anyModule = module as any;
    if (anyModule[patchedPuppeteerLaunchSymbol]) continue;
    anyModule[patchedPuppeteerLaunchSymbol] = true;

    const originalLaunch = anyModule.launch.bind(anyModule);
    const originalConnect = anyModule.connect.bind(anyModule);

    anyModule.launch = async (launchOptions?: any) => {
      logger.info('PUPPETEER_LAUNCH_CONFIG', {
        sessionKey: getSessionMetadata()?.sessionKey ?? null,
        authPath: getSessionMetadata()?.authPath ?? null,
        module: module === puppeteer ? 'root' : 'whatsapp-web.js',
        launchOptions: sanitizePuppeteerLaunchOptions(launchOptions)
      });
      const browser = await originalLaunch(launchOptions);
      return attachBrowserInstrumentation(browser, launchOptions);
    };

    anyModule.connect = async (connectOptions?: any) => {
      logger.info('PUPPETEER_CONNECT_CONFIG', {
        sessionKey: getSessionMetadata()?.sessionKey ?? null,
        authPath: getSessionMetadata()?.authPath ?? null,
        module: module === puppeteer ? 'root' : 'whatsapp-web.js',
        connectOptions
      });
      const browser = await originalConnect(connectOptions);
      return attachBrowserInstrumentation(browser, connectOptions);
    };
  }

  return puppeteer;
}

export function withPuppeteerSessionContext<T>(context: PuppeteerSessionContext, task: () => Promise<T> | T) {
  return withSessionContext(context, task);
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
