# FinDocs

Two apps in one repo; `package.json` in each is the source of truth for versions (README is older).
- `client/` – React 19 + Vite 7 + Tailwind 4 + TypeScript, React Hook Form + Zod
- `server/` – Express 5 + TypeScript; Google OAuth, uploads to the user's Google Drive, JWT with sealed tokens

## Map
- Server: `src/routes/` (auth, submit, consignments) → `src/storage/` (Drive / local providers) ; `src/middleware/` (auth, upload) ; `src/consignment/` photo → Excel reader using Gemini (prompt, schema, normalize, excel)
- Client: `src/components/` (Dashboard, SubmissionForm, ConsignmentReader, ...), `src/api/client.ts`, `src/validation/schemas.ts`

## Commands (no CI – run these yourself)
- `cd server && npm test && npm run build`
- `cd client && npm run build` (runs `tsc` then `vite build`)

## Rules
- Keep file validation (MIME + signature, 5 MB/file, 25 MB total) and rate limits intact.
- Consignment reader: see README "How accuracy is protected" before changing extraction or normalisation.

## Token hygiene
- Both `package-lock.json` files, `dist/` and `.env` files are read-denied in `.claude/settings.json`; use `.env.example`.
- Say which side (client or server) a task is on so only that half gets explored.

## Compact instructions
When compacting, keep: the current task, files changed, decisions made, failing checks. Drop file dumps.
