import { constants } from 'node:fs';
import { access, mkdir, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function splitOrigins(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
}

export function getClientOrigins() {
  const origins = splitOrigins(process.env.CLIENT_URLS);
  if (origins.length > 0) return origins;

  if (process.env.CLIENT_URL?.trim()) {
    return [process.env.CLIENT_URL.trim()];
  }

  throw new Error('CLIENT_URL or CLIENT_URLS is required');
}

function getWhatsAppAuthPathCandidates() {
  const envPath = process.env.WHATSAPP_AUTH_PATH?.trim();
  const cwdPath = path.resolve(process.cwd(), '.wwebjs_auth');
  const tmpPath = path.join(os.tmpdir(), 'wa-supervisor-v3', '.wwebjs_auth');

  return [envPath, cwdPath, tmpPath].filter((candidate): candidate is string => Boolean(candidate));
}

async function ensureWritableDirectory(authPath: string) {
  const normalized = path.resolve(authPath);
  await mkdir(normalized, { recursive: true });
  await access(normalized, constants.W_OK);
  return normalized;
}

let resolvedWhatsAppAuthPathPromise: Promise<string> | undefined;

export function resolveWhatsAppAuthPath() {
  if (!resolvedWhatsAppAuthPathPromise) {
    resolvedWhatsAppAuthPathPromise = (async () => {
      const errors: string[] = [];

      for (const candidate of getWhatsAppAuthPathCandidates()) {
        try {
          return await ensureWritableDirectory(candidate);
        } catch (error) {
          errors.push(`${path.resolve(candidate)}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      throw new Error(`Unable to create a writable WhatsApp auth directory. Tried: ${errors.join(' | ')}`);
    })();
  }

  return resolvedWhatsAppAuthPathPromise;
}

export async function inspectWhatsAppAuthStorage(authPath?: string) {
  const normalized = path.resolve(authPath ?? (await resolveWhatsAppAuthPath()));
  let exists = false;
  let sessionCount = 0;

  try {
    await access(normalized);
    exists = true;

    const entries = await readdir(normalized, { withFileTypes: true });
    sessionCount = entries.filter(entry => entry.isDirectory() && entry.name.startsWith('session-')).length;
  } catch {
    exists = false;
    sessionCount = 0;
  }

  return {
    authPath: normalized,
    exists,
    sessionCount
  };
}
