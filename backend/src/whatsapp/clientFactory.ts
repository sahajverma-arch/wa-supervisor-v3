import { createRequire } from 'node:module';
import type * as WhatsAppWeb from 'whatsapp-web.js';
import { resolveWhatsAppAuthPath } from '../utils/env.js';

const require = createRequire(import.meta.url);
const whatsappWeb = require('whatsapp-web.js') as typeof WhatsAppWeb;
const { Client, LocalAuth } = whatsappWeb;

export async function createWhatsappClient(sessionKey: string) {
  const authPath = await resolveWhatsAppAuthPath();

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
