const { spawnSync } = require('node:child_process');
const { mkdirSync } = require('node:fs');
const { access } = require('node:fs/promises');
const path = require('node:path');

function resolveCacheDirectory() {
  return path.resolve(__dirname, '..', '.cache', 'puppeteer');
}

async function verifyInstalledBrowser(cacheDirectory) {
  const puppeteer = require('puppeteer');
  try {
    const executablePath = await puppeteer.executablePath();
    await access(executablePath);
    console.log('[wa-supervisor-v3] PUPPETEER_CHROME_INSTALLED', {
      cacheDirectory,
      executablePath
    });
  } catch (error) {
    console.error('[wa-supervisor-v3] PUPPETEER_CHROME_INSTALL_VERIFY_FAILED', {
      cacheDirectory,
      expectedLocation: path.join(cacheDirectory, 'chrome'),
      error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
      remediation: [
        'Ensure the install step ran with the same PUPPETEER_CACHE_DIR value used at runtime.',
        'Confirm the browser download was not discarded between build and runtime on Render.',
        'Rebuild the service if the cache directory or Puppeteer version changed.'
      ]
    });
    process.exitCode = 1;
  }
}

async function main() {
  const cacheDirectory = resolveCacheDirectory();
  process.env.PUPPETEER_CACHE_DIR = cacheDirectory;
  mkdirSync(cacheDirectory, { recursive: true });

  const cliPath = require.resolve('puppeteer/lib/cjs/puppeteer/node/cli.js');
  const installResult = spawnSync(process.execPath, [cliPath, 'browsers', 'install', 'chrome'], {
    cwd: path.resolve(__dirname, '..'),
    env: process.env,
    stdio: 'inherit'
  });

  if (installResult.status !== 0) {
    process.exit(installResult.status ?? 1);
  }

  await verifyInstalledBrowser(cacheDirectory);
}

main().catch(error => {
  console.error('[wa-supervisor-v3] PUPPETEER_CHROME_INSTALL_FAILED', {
    error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error)
  });
  process.exit(1);
});
