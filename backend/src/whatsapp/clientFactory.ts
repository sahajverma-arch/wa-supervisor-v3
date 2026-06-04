import { createRequire } from 'node:module';
import { access } from 'node:fs/promises';
import type * as Puppeteer from 'puppeteer';
import type * as WhatsAppWeb from 'whatsapp-web.js';
import { resolveWhatsAppAuthPath } from '../utils/env.js';

const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer') as typeof Puppeteer;
const whatsappWeb = require('whatsapp-web.js') as typeof WhatsAppWeb;
const { Client, LocalAuth } = whatsappWeb;

export async function createWhatsappClient(sessionKey: string) {
  const authPath = await resolveWhatsAppAuthPath();
  const executablePath = await puppeteer.executablePath();
  await access(executablePath);

  return new Client({
    authStrategy: new LocalAuth({
      clientId: sessionKey,
      dataPath: authPath
    }),
    puppeteer: {
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  });
}
