import { createRequire } from 'node:module';
import type * as WhatsAppWeb from 'whatsapp-web.js';
import { resolveWhatsAppAuthPath } from '../utils/env.js';
import {
  applyPuppeteerCacheDirectory,
  formatPuppeteerMissingChromeMessage,
  ensurePuppeteerBrowserAvailable,
  inspectPuppeteerBrowserDiagnostics,
  installPuppeteerRuntimeInstrumentation,
  withPuppeteerSessionContext
} from '../utils/puppeteerEnv.js';

const require = createRequire(import.meta.url);
const whatsappWeb = require('whatsapp-web.js') as typeof WhatsAppWeb;
const { Client, LocalAuth } = whatsappWeb;

class PuppeteerChromeUnavailableError extends Error {
  diagnostics;

  constructor(message: string, diagnostics: Awaited<ReturnType<typeof inspectPuppeteerBrowserDiagnostics>>, cause?: unknown) {
    super(message, cause ? { cause } : undefined);
    this.name = 'PuppeteerChromeUnavailableError';
    this.diagnostics = diagnostics;
  }
}

export async function createWhatsappClient(sessionKey: string) {
  applyPuppeteerCacheDirectory();
  installPuppeteerRuntimeInstrumentation();
  const authPath = await resolveWhatsAppAuthPath();
  const diagnostics = await ensurePuppeteerBrowserAvailable();

  if (!diagnostics.available) {
    throw new PuppeteerChromeUnavailableError(formatPuppeteerMissingChromeMessage(diagnostics), diagnostics, diagnostics.error);
  }

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: sessionKey,
      dataPath: authPath
    }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--no-zygote',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-sync',
        '--mute-audio',
        '--no-first-run'
      ]
    }
  });

  const originalInitialize = client.initialize.bind(client);
  client.initialize = async () =>
    withPuppeteerSessionContext(
      {
        sessionKey,
        authPath
      },
      () => originalInitialize()
    );

  return client;
}
