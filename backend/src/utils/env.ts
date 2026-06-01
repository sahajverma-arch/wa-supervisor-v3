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
