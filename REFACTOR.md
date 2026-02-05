# PicMachine Web — Migration from Supabase

> Created: 2026-02-05

## Why

Supabase free tier is full. Need to move auth + image storage to free-tier alternatives.

---

## Current State

| Feature | Current (Supabase) | Notes |
|---------|-------------------|-------|
| Auth | Email/password only | No Google/social login |
| Storage | Private bucket `images` | Signed URLs, 1-hour expiry |
| Database | **Not used** | All metadata from storage file listings |
| Frontend | Vanilla JS (no build system) | Static HTML/CSS/JS |
| Hosting | Vercel (static site) | No serverless functions |

**Supabase features used:** Auth + Storage only. No database, no edge functions.

---

## Proposed Stack

| Layer | Service | Tier | Why This |
|-------|---------|------|----------|
| **Auth** | Clerk | Free (10k MAU) | Already set up for Pocket Clone. Adds Google social login (killer feature). |
| **Storage** | Cloudflare R2 | Free (10GB/mo) | S3-compatible, no egress fees, signed URLs built-in. Best free image storage. |
| **Database** | None needed | — | No tables in current app. If metadata needed later, Neon is available. |
| **API** | Vercel Serverless Functions | Free (Hobby) | Needed for R2 signed URLs + upload (can't expose R2 keys to frontend) |
| **Hosting** | Vercel | Free (Hobby) | Already deployed here |

### Why Cloudflare R2 for Storage?

| Option | Free Tier | Egress | Signed URLs | Verdict |
|--------|-----------|--------|-------------|---------|
| **Cloudflare R2** | 10GB storage, 10M reads/mo | Free | Yes (S3-compatible) | Best option |
| Vercel Blob | 256MB on Hobby | Paid after 256MB | Yes | Too small for images |
| Uploadthing | 2GB | Limited | Yes | Small, vendor lock-in |
| AWS S3 | 5GB (12 months) | Paid | Yes | Requires credit card |
| New Supabase project | 1GB storage | 2GB/mo | Yes | Same problem will recur |

**R2 wins:** 10GB free, zero egress costs, industry-standard S3 API.

### Why Clerk for Auth (not Supabase Auth standalone)?

- Already have Clerk account from Pocket Clone
- Google OAuth built-in (just enable in dashboard)
- CDN SDK works with vanilla JS (same pattern as Pocket Clone)
- Shared user identity across projects if desired
- Free 10k MAU — more than enough

---

## Architecture Change

```
BEFORE (Supabase)                    AFTER (Clerk + R2 + Vercel)
┌─────────────────────┐             ┌─────────────────────────────┐
│ Static Site          │             │ Vercel                      │
│ ├── index.html       │             │ ├── public/                 │
│ ├── app.js           │             │ │   ├── index.html          │
│ ├── style.css        │             │ │   ├── app.js              │
│ └── supabase-config  │             │ │   └── style.css           │
│         │            │             │ └── api/                    │
│         ▼            │             │     ├── images/index.ts     │
│ ┌─────────────────┐  │             │     │   (GET list, POST upload) │
│ │ Supabase        │  │             │     └── images/[key].ts     │
│ │ • Auth          │  │             │         (GET signed URL, DELETE) │
│ │ • Storage       │  │             │              │               │
│ └─────────────────┘  │             │     ┌────────┴────────┐     │
└─────────────────────┘             │     │ Clerk  │  R2    │     │
                                    │     │ (Auth) │(Images)│     │
                                    │     └────────┴────────┘     │
                                    └─────────────────────────────┘
```

---

## New Project Structure

```
PicMachine-web/
├── public/                     # Static frontend
│   ├── index.html             # + Clerk SDK mount
│   ├── app.js                 # Replace supabase → fetch + Clerk
│   └── style.css              # No changes
│
├── api/                       # Vercel Serverless Functions
│   └── images/
│       ├── index.ts           # GET (list images) / POST (upload presigned URL)
│       └── [key].ts           # GET (signed view URL) / DELETE (remove image)
│
├── lib/                       # Shared backend
│   ├── r2.ts                  # Cloudflare R2 S3 client
│   └── auth.ts                # Clerk token verification (reuse from Pocket Clone)
│
├── package.json
├── tsconfig.json
├── vercel.json
├── .env.local                 # R2 + Clerk secrets
└── .gitignore
```

---

## Environment Variables

| Variable | Purpose | Source |
|----------|---------|--------|
| `CLERK_PUBLISHABLE_KEY` | Frontend auth | Clerk dashboard (reuse existing or create new app) |
| `CLERK_SECRET_KEY` | Backend token verification | Clerk dashboard |
| `R2_ACCOUNT_ID` | Cloudflare account | Cloudflare dashboard |
| `R2_ACCESS_KEY_ID` | R2 API auth | R2 → Manage R2 API Tokens |
| `R2_SECRET_ACCESS_KEY` | R2 API auth | R2 → Manage R2 API Tokens |
| `R2_BUCKET_NAME` | Bucket name (e.g. `picmachine`) | Cloudflare R2 → Create Bucket |
| `R2_ENDPOINT` | S3-compatible endpoint | `https://<account-id>.r2.cloudflarestorage.com` |

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/images` | Clerk JWT | List user's images (with signed view URLs) |
| POST | `/api/images` | Clerk JWT | Generate presigned upload URL |
| GET | `/api/images/[key]` | Clerk JWT | Get signed view URL for single image |
| DELETE | `/api/images/[key]` | Clerk JWT | Delete image from R2 |
| DELETE | `/api/images?keys=a,b,c` | Clerk JWT | Batch delete images |

---

## Migration Mapping

### Auth Replacements

| Before (Supabase) | After (Clerk) |
|-------------------|---------------|
| `supabaseClient.auth.signInWithPassword()` | Clerk pre-built UI (email + Google) |
| `supabaseClient.auth.signUp()` | Clerk pre-built UI |
| `supabaseClient.auth.signOut()` | `Clerk.signOut()` |
| `supabaseClient.auth.getSession()` | `Clerk.user` / `Clerk.session` |
| `currentUser.id` | `Clerk.user.id` |
| `currentUser.email` | `Clerk.user.primaryEmailAddress` |
| No Google login | Enable Google OAuth in Clerk dashboard |

### Storage Replacements

| Before (Supabase Storage) | After (R2 via API) |
|---------------------------|-------------------|
| `storage.from('images').list(userId)` | `GET /api/images` |
| `storage.from('images').upload(path, file)` | `POST /api/images` → get presigned URL → `PUT` direct to R2 |
| `storage.from('images').createSignedUrl(path)` | `GET /api/images/[key]` |
| `storage.from('images').remove([path])` | `DELETE /api/images/[key]` |
| `storage.from('images').remove(paths)` | `DELETE /api/images?keys=...` |

### Upload Flow Change

```
BEFORE:
  Browser → supabaseClient.storage.upload() → Supabase Storage

AFTER:
  Browser → POST /api/images (get presigned URL)
         → PUT directly to R2 presigned URL (browser uploads to R2)
         → Reload image list
```

Direct-to-R2 upload avoids Vercel's 4.5MB body limit on serverless functions.

---

## What Changes, What Stays

### Changes (~60% of app.js)
- All `supabaseClient.auth.*` calls → Clerk SDK
- All `supabaseClient.storage.*` calls → `fetch('/api/images/*')`
- Auth UI → Clerk pre-built components
- `supabase-config.js` → deleted
- New: `api/` directory with serverless functions
- New: `lib/` directory with R2 client + auth helper
- New: `package.json`, `tsconfig.json`, `vercel.json`

### Stays the Same
- `style.css` — zero changes
- Gallery UI, slideshow, zoom/pan, swipe, fullscreen
- Theme toggle (localStorage)
- Image counter logic
- Delete confirmation modal
- Batch select in gallery mode

---

## New Feature: Google Login

With Clerk, enabling Google OAuth is a dashboard toggle:
1. Clerk Dashboard → Configure → SSO Connections → Google
2. Add Google OAuth credentials (or use Clerk's dev mode)
3. Clerk sign-in UI automatically shows "Continue with Google" button
4. No code changes needed — Clerk SDK handles it

---

## Setup Steps (for next session)

### 1. Cloudflare R2 Setup
1. Create Cloudflare account (free)
2. Go to R2 → Create Bucket → name: `picmachine`
3. R2 → Manage R2 API Tokens → Create Token (read/write)
4. Note: Account ID, Access Key ID, Secret Access Key, Endpoint
5. **Configure CORS on bucket** (required for browser → R2 presigned uploads):
   - R2 → Bucket Settings → CORS Policy
   ```json
   [
     {
       "AllowedOrigins": ["https://picmachine.vercel.app", "http://localhost:3000"],
       "AllowedMethods": ["GET", "PUT", "DELETE"],
       "AllowedHeaders": ["Content-Type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
   - Without this, presigned URL uploads from browser will fail with CORS error

### 2. Clerk Setup
- Option A: Reuse existing Clerk app (same users as Pocket Clone)
- Option B: Create new Clerk app "PicMachine" (separate user base)
- Either way: Enable Google OAuth in Clerk dashboard

### 3. Initialize Project
```bash
cd C:\Users\Kasutaja\Claude_Projects\PicMachine-web
npm init -y
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner @clerk/backend
npm install -D typescript @types/node
```

### 4. Create `vercel.json`
```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/$1" }
  ],
  "outputDirectory": "public"
}
```
Frontend serves from `public/`, API routes from `api/`. No build step needed for frontend (vanilla JS).

### 5. Clerk Frontend SDK
Add to `index.html` before `app.js`:
```html
<script
  async
  crossorigin="anonymous"
  data-clerk-publishable-key="pk_..."
  src="https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js"
  type="text/javascript"
></script>
```
Same CDN pattern as Pocket Clone — no npm/build needed for frontend.

### 6. Build + Deploy
Same pattern as Pocket Clone: Vercel serverless + static public folder.

---

## Risk Notes

- **Data migration**: Existing images in Supabase need to be downloaded and re-uploaded to R2 (or start fresh)
- **User accounts**: New Clerk accounts — existing Supabase users won't carry over
- **R2 bucket permissions**: Must be private (no public access). All access via presigned URLs from API.
- **Vercel body limit**: Use presigned URLs for upload to bypass 4.5MB limit

---

## Future: Database Layer (Scaffolding)

> Not part of initial migration. Build separately when ready to add smart features.

### When to Activate

Add Neon PostgreSQL when implementing any of these:
- AI auto-categorization (store tags/categories per image)
- User-created albums/buckets
- Favorites / ratings
- Image captions or notes
- Share links with permissions
- View counts / analytics

### Database: Neon PostgreSQL (Free Tier)

- Same provider as Pocket Clone — reuse account
- Free: 0.5GB storage, 190 compute hours/mo
- Option A: New database in same Neon project (separate from Pocket Clone)
- Option B: Same database, separate schema (`picmachine.*`)

### Schema Sketch

```sql
-- images: metadata for every uploaded file
CREATE TABLE images (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,              -- Clerk user ID
  r2_key      TEXT NOT NULL UNIQUE,       -- R2 object key (userId/timestamp_filename)
  filename    TEXT NOT NULL,              -- Original filename
  size_bytes  INTEGER,
  mime_type   TEXT,
  category    TEXT,                       -- AI-assigned category (nullable until categorized)
  album_id    UUID REFERENCES albums(id) ON DELETE SET NULL,
  is_favorite BOOLEAN DEFAULT FALSE,
  caption     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_images_user ON images(user_id);
CREATE INDEX idx_images_album ON images(album_id);
CREATE INDEX idx_images_category ON images(user_id, category);

-- albums: user-created groupings
CREATE TABLE albums (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_albums_user ON albums(user_id);
```

### Additional Env Vars (when activated)

| Variable | Purpose | Source |
|----------|---------|--------|
| `DATABASE_URL` | Neon connection string | Neon dashboard |

### Additional Dependencies (when activated)

```bash
npm install drizzle-orm @neondatabase/serverless
npm install -D drizzle-kit
```

### New Files (when activated)

```
lib/
├── db.ts              # Drizzle + Neon client (same pattern as Pocket Clone)
└── schema.ts          # Drizzle schema (images + albums tables)

drizzle.config.ts      # Drizzle Kit config
```

### API Changes (when activated)

| Endpoint | Change |
|----------|--------|
| `POST /api/images` | After R2 upload → insert row into `images` table |
| `GET /api/images` | Query `images` table instead of R2 ListObjects (faster, filterable) |
| `DELETE /api/images/[key]` | Delete from R2 + delete row from `images` |
| `POST /api/albums` | New — create album |
| `PATCH /api/images/[key]` | New — update category, album, favorite, caption |
| `GET /api/albums` | New — list user's albums |
| `POST /api/categorize` | New — send image to AI, store result |

### Migration Path

1. Add Neon + Drizzle (same setup as Pocket Clone)
2. Run `drizzle-kit push` to create tables
3. Backfill: list all R2 objects → insert rows into `images` table
4. Switch `GET /api/images` from R2 ListObjects to DB query
5. Add new endpoints as features are built

---

## Cost Summary

| Service | Cost |
|---------|------|
| Clerk | Free (10k MAU) |
| Cloudflare R2 | Free (10GB storage, 10M reads/mo, zero egress) |
| Vercel | Free (Hobby) |
| Neon | Free when activated (0.5GB, 190 compute hrs/mo) |
| **Total** | **$0/month** |
