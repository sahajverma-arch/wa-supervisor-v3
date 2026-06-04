# WhatsApp Supervisor Console V3

Read-only manager console for supervised WhatsApp employee accounts.

## What this project does

- Managers connect employee WhatsApp accounts through QR onboarding.
- Employee cards appear immediately after connect is requested.
- Chats and messages sync into Supabase and stream to the UI over Socket.IO.
- The product is view-only. There is no send box, reply flow, edit flow, or reaction flow.

## Project structure

- `frontend/` Next.js App Router manager console
- `backend/` Express + Socket.IO + whatsapp-web.js control plane
- `supabase/schema.sql` production database schema

## Setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Copy the backend `.env.example` file to `.env` and fill in Supabase credentials.
4. Copy the frontend `.env.example` file to `.env.local` and point it at the backend.
5. Install dependencies:
   - `cd backend && npm install`
   - `cd ../frontend && npm install`
6. Start the backend first, then the frontend:
   - `npm run dev` inside `backend/`
   - `npm run dev` inside `frontend/`

## Notes

- `whatsapp-web.js` runs only in the backend.
- WhatsApp auth storage is resolved at runtime to a writable local directory. A persistent disk is optional, not required.
- Session state is stored directly on the `employees` table.
- Initial history sync backfills 25 chats and 50 messages per chat.
