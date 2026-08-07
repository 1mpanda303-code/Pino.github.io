# Luma Learning Lab Deployment

This is the standalone deployment repository for Luma Learning Lab. It contains the public application shell, schemas, Cloudflare Pages Functions, and D1 migration only.

## Private library boundary

The 100-video personal library, links, and bilingual transcripts are intentionally excluded from this repository and from the deployed static files. A new visitor sees an empty library until they restore their own workspace from Cloudflare D1 or add their own videos.

The local personal-library seed is generated outside this repository at:

```text
D:\AI\Codex\workspace\project5\private-library\luma-personal-library-workspace.json
```

It is ignored by Git. Do not add it, `public/data/catalog.json`, `public/data/episodes/`, `src/data/episodes.json`, `.env`, API keys, sync passwords, or account tokens to a commit.

## First personal-library migration

1. Run `node scripts/generate-private-library-workspace.mjs` from `D:\AI\Codex\workspace\project5` if the local seed needs to be regenerated.
2. In the workbench, use the upper-right restore button to select `private-library/luma-personal-library-workspace.json`.
3. The package merges the 100 videos into the current browser workspace without replacing existing reports, highlights, or study records.
4. Open upper-right cloud sync, connect with the personal sync password, then upload the merged workspace to D1.
5. On another device, open cloud sync and download the D1 snapshot. The personal library will appear after the restore completes.

## Cloudflare D1 sync

Cloudflare Pages is required for `/api/sync`; GitHub Pages can host only the empty static shell.

1. Create a D1 database, then apply `migrations/0001_workspace_snapshots.sql`.
2. Bind the database to the Pages project as `DB`.
3. Create a production secret named `SYNC_SECRET`. Keep its value in Cloudflare only.
4. Deploy the repository and use the same value as the personal sync password in the app.

The snapshot endpoint rejects stale revisions and responses are `Cache-Control: no-store`. The current 100-video seed is about 920 KB UTF-8, below the endpoint's 2 MB payload limit. If the personal workspace grows close to that limit, export a backup and split or archive content before uploading.

## Local verification

```powershell
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm preview
```

Open `http://127.0.0.1:4175`. Verify that an empty browser profile has no video titles or transcripts before restoring a personal D1 snapshot.

## Publishing

Follow `D:\AI\Codex\workspace\project5\docs\03_AI更新与GitHub上传交接SOP.md` and the newest handoff in `docs/update-handoffs/`. Stage only the files listed by that handoff. Never use `git add .` for this repository.
