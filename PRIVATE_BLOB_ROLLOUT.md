# Private Blob Store — Rollout Runbook (SEC-003)

Vercel Blob privacy is a property of the **store**, not the individual file. Private
blobs therefore live in a **separate private store** with its own token. The existing
public store is **kept, never deleted** — every old public URL keeps working (public
reads need no token), so there is no migration and no data loss.

Everything is gated by `NEXT_PUBLIC_PRIVATE_BLOB`. Until it is `true`, all code paths
behave exactly as before (writes stay public). Rollback = flip the flag back to
`false`; no env swap needed.

Wiring: **2-token** setup, both stores connected with symmetric prefixes.
- `BLOB_PUBLIC_READ_WRITE_TOKEN` → **public** store (prefix `BLOB_PUBLIC`).
- `BLOB_PRIVATE_READ_WRITE_TOKEN` → **private** store (prefix `BLOB_PRIVATE`).
- `src/lib/blobPrivacy.ts` → `blobToken()` returns the right one based on the flag.
- NOTE: the old unprefixed `BLOB_READ_WRITE_TOKEN` is a stale leftover — the code no
  longer reads it; it can be deleted from both projects.

---

## Manual steps (Vercel dashboard) — do once, shared by both repos

1. **Create the private store**
   - Vercel → project → **Storage** tab → **Create Database** → **Blob** →
     **Continue** → set Access = **Private** → name it (e.g. `iclosed-docs-private`).
   - CLI alternative: `vercel blob create-store iclosed-docs-private --access private`
   - Free (Hobby) plan supports this at the same price as public — no upgrade needed.

2. **Connect BOTH stores to BOTH Vercel projects** (customer web + admin panel),
   across **Production + Preview + Development**:
   - Private store → prefix **`BLOB_PRIVATE`** → `BLOB_PRIVATE_READ_WRITE_TOKEN`
   - Public store → prefix **`BLOB_PUBLIC`** → `BLOB_PUBLIC_READ_WRITE_TOKEN`
   - Tick "Add a read-write token env var" on each connection.
   - Delete the old unprefixed `BLOB_READ_WRITE_TOKEN` (stale, unused).

3. **Local dev**: in each repo run `vercel env pull` to refresh `.env.local`, then test
   uploads locally with `NEXT_PUBLIC_PRIVATE_BLOB=true`. (Requires the blob vars to be
   present in the **Development** environment, not just Production/Preview.)

4. **Flip on together**: set `NEXT_PUBLIC_PRIVATE_BLOB=true` in **both** repos'
   Production env, redeploy both. (Preview/Dev can be flipped first to test.)

---

## Two token helpers (in `blobPrivacy.ts`, both repos)

- **`blobToken()`** — flag-based. Which store do NEW uploads go to. Use for `put()`,
  `handleUpload({ token })`, and `del()` of the blob you just wrote.
- **`blobTokenForUrl(url)`** — URL-based. Which store an EXISTING blob lives in. Use
  for reads/deletes of a stored URL (download proxy, email attach, GDPR erase) so a
  private blob stays readable **even after a rollback** flips the flag back off.

## Code changes — customer web repo (DONE)

- `src/lib/blobPrivacy.ts` — added `blobToken()` + `blobTokenForUrl()`.
- `src/app/api/uploadblobstorage/route.ts` — `put()` + `del()` use `blobToken()`.
- `src/app/api/retainer/sign/route.ts` — `put()` uses `blobToken()`.
- `src/app/api/admin/backfill-retainer-pdfs/route.ts` — `put()` uses `blobToken()`.
- `src/app/api/documents/download/route.ts` — proxy `get()` uses `blobTokenForUrl(u)`.
- `src/app/api/blob/upload/route.ts` — `handleUpload({ token: blobToken() })`.
- `src/app/api/blob/aps-upload/route.ts` — `handleUpload({ token: blobToken() })`.

Client `upload()` calls already pass `access: BLOB_ACCESS` (flag-gated) — unchanged.

## Code changes — ADMIN repo (DONE, at D:\iclosed_dev_admin)

- `src/lib/blobPrivacy.ts` — added `blobToken()` + `blobTokenForUrl()`.
- `src/app/api/admin/uploadblobstorage/route.ts` — `put()` + `del()` use `blobToken()`.
- `src/app/api/admin/deals/[id]/uploadblobstorage/token/route.ts` — `handleUpload({ token: blobToken() })`.
- `src/app/api/admin/documents/download/route.ts` — proxy `get()` uses `blobTokenForUrl(u)`.
- `src/app/api/admin/send-lead-family-email/route.ts` — private `get()` uses `blobTokenForUrl()`.
- `src/app/api/admin/leads/[id]/erase/route.ts` — GDPR `del()` now splits URLs by store
  (public token for public URLs, private token for private URLs).
- `src/app/api/admin/backfill-private-blobs/route.ts` — migration tool made 2-token
  correct (reads public, `put()` uses private token, `del()` uses public token). **Not
  meant to be run** — the plan keeps existing public files in place, no migration.

Admin client side was already done: `access: BLOB_ACCESS` on uploads, `docDownloadHref`
on every viewer (DealDetail, UploadIdentificationDrawer, dealPdf) — audited, no gaps.

Both repos typecheck clean. `@vercel/blob` is 2.4.0 (private needs ≥ 2.3). ✅

---

## Post-deploy verification (both repos, flag ON)

- [ ] Open an OLD document (uploaded before the flip) → still opens (public URL). ✅
- [ ] Upload a NEW document → its `file_url` host contains `.private.blob.vercel-storage.com`. ✅
- [ ] Paste that private URL in a logged-OUT browser → blocked / not accessible. ✅
- [ ] Open the same doc while logged in as the owner → opens via `/api/documents/download`. ✅
- [ ] Log in as a DIFFERENT customer → that private doc returns 403. ✅
- [ ] Task-file upload (DynamicTaskDrawer) + APS upload (intake) both succeed. ✅
- [ ] Retainer signing produces a PDF that opens for the owner. ✅
