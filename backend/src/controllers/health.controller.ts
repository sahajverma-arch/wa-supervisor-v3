import type { Request, Response } from 'express';
import { supabase } from '../supabase/client.js';
import { listManagedSessions } from '../services/whatsapp.service.js';

export async function healthHandler(_req: Request, res: Response) {
  const { error } = await supabase.from('employees').select('id').limit(1);
  res.json({
    ok: true,
    uptime: process.uptime(),
    whatsappActiveSessions: listManagedSessions().length,
    supabase: error ? 'error' : 'ok'
  });
}
