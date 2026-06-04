import { createRequire } from 'node:module';
import type * as WhatsAppWeb from 'whatsapp-web.js';
import { resolveWhatsAppAuthPath } from '../utils/env.js';
import {
  applyPuppeteerCacheDirectory,
  formatPuppeteerMissingChromeMessage,
  ensurePuppeteerBrowserAvailable,
  inspectPuppeteerBrowserDiagnostics
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
  const authPath = await resolveWhatsAppAuthPath();
  const diagnostics = await ensurePuppeteerBrowserAvailable();

  if (!diagnostics.available) {
    throw new PuppeteerChromeUnavailableError(formatPuppeteerMissingChromeMessage(diagnostics), diagnostics, diagnostics.error);
  }

  return new Client({
    authStrategy: new LocalAuth({
      clientId: sessionKey,
      dataPath: authPath
    }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  });
}
