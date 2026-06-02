import { access, readdir } from 'node:fs/promises';
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

export function getWhatsAppAuthPath() {
  return process.env.WHATSAPP_AUTH_PATH?.trim() || path.resolve(process.cwd(), '.wwebjs_auth');
}

export function isPersistentWhatsAppAuthPath(authPath = getWhatsAppAuthPath()) {
  const normalized = path.resolve(authPath);
  return normalized.startsWith(path.resolve('/var/data'));
}

export async function inspectWhatsAppAuthStorage(authPath = getWhatsAppAuthPath()) {
  const normalized = path.resolve(authPath);
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
    sessionCount,
    persistent: isPersistentWhatsAppAuthPath(normalized)
  };
}
