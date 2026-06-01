import { createRequire } from 'node:module';
import type * as WhatsAppWeb from 'whatsapp-web.js';
import { getWhatsAppAuthPath } from '../utils/env.js';

const require = createRequire(import.meta.url);
const whatsappWeb = require('whatsapp-web.js') as typeof WhatsAppWeb;
const { Client, LocalAuth } = whatsappWeb;

export function createWhatsappClient(sessionKey: string) {
  return new Client({
    authStrategy: new LocalAuth({
      clientId: sessionKey,
      dataPath: getWhatsAppAuthPath()
    }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  });
}
