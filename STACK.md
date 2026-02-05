# PicMachine Web — Stack Reference

> Last updated: 2026-02-05

## Overview

| Field | Value |
|-------|-------|
| **Purpose** | Cloud image viewer — upload, store, and browse photos with slideshow |
| **Status** | Active — production |
| **Repo** | https://github.com/keeltekool/PicMachine_Web |
| **Live** | https://picmachine.vercel.app |
| **Local path** | `C:\Users\Kasutaja\Claude_Projects\PicMachine-web\` |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla JS, HTML, CSS (no framework, no build step) |
| Auth | Clerk (CDN SDK — browser, `@clerk/backend` — server) |
| Storage | Cloudflare R2 (S3-compatible) via `@aws-sdk/client-s3` |
| API | Vercel Serverless Functions (TypeScript, ES modules) |
| Hosting | Vercel (static `public/` + serverless `api/`) |
| Presigning | `@aws-sdk/s3-request-presigner` |

## Services

| Service | Purpose | Env Var(s) |
|---------|---------|------------|
| Clerk | Auth (Google OAuth + email) | `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` |
| Cloudflare R2 | Image storage (S3-compatible) | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT` |
| Vercel | Hosting + Serverless API | *(deployment platform)* |
| GitHub | Source code | *(no env var)* |

**Env vars stored in:** Vercel production, `.env.local` (local dev)

## Project Structure

```
PicMachine-web/
├── public/             # Static frontend (served by Vercel)
│   ├── index.html      # Main HTML — Clerk CDN script, all UI screens
│   ├── app.js          # All frontend logic — auth, upload, viewer, gallery
│   └── style.css       # All styles — themes, viewer, gallery, animations
├── api/                # Vercel Serverless Functions
│   └── images/
│       ├── index.ts    # GET list / POST upload URL / DELETE batch
│       └── [key].ts    # GET single view URL / DELETE single image
├── lib/                # Shared server utilities
│   ├── auth.ts         # Clerk JWT verification (verifyToken)
│   └── r2.ts           # R2 S3 client — list, get/put presigned URLs, delete
├── package.json        # ES module, dependencies
├── tsconfig.json       # TypeScript config (ES2020, strict)
├── vercel.json         # outputDirectory: "public"
└── .env.local          # Local secrets (not committed)
```

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/images` | Bearer JWT | List user images with signed view URLs |
| POST | `/api/images` | Bearer JWT | Get presigned upload URL (body: `{filename, contentType}`) |
| DELETE | `/api/images?keys=a,b` | Bearer JWT | Batch delete images |
| GET | `/api/images/[key]` | Bearer JWT | Get signed view URL for single image |
| DELETE | `/api/images/[key]` | Bearer JWT | Delete single image |

## Auth Flow

1. Browser loads Clerk CDN SDK (`@clerk/clerk-js@latest`)
2. `Clerk.load()` → mounts sign-in UI or restores session
3. Authenticated requests: `Clerk.session.getToken()` → `Authorization: Bearer <JWT>`
4. Server: `verifyToken(jwt, { secretKey })` → extracts `sub` (userId)
5. All R2 keys prefixed with `userId/` for isolation

## Upload Flow (Presigned URL)

1. Browser → `POST /api/images` with `{filename, contentType}`
2. Server generates presigned PUT URL → returns `{uploadUrl, key}`
3. Browser → `PUT uploadUrl` with raw file body (direct to R2, bypasses Vercel 4.5MB limit)
4. Browser reloads image list

## Gotchas

| Issue | Fix |
|-------|-----|
| Vercel ES module imports need `.js` extensions | `from "../../lib/auth.js"` not `"../../lib/auth"` |
| `echo` adds `\n` to Vercel env vars | Use `printf "value" \| vercel env add` |
| Clerk CDN script is `async` | Must wait for `window.Clerk` before calling `.load()` |
| `Content-Type: application/json` on GET/DELETE | Causes unnecessary CORS preflight — only set when body exists |
| R2 CORS must allow PUT from app origin | Configure in Cloudflare dashboard |
