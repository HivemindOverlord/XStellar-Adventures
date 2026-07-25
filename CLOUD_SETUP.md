# Cloud setup guide

One-time manual steps to wire this repo up to Neon, Railway, Vercel, and Google Play. Everything after this is automatic: push to `main` deploys the server and web client within minutes; pushing a `v*.*.*` tag builds and publishes the Android app.

## 1. Database — Neon

1. In the [Neon console](https://console.neon.tech), create a new project (any region close to your Railway region).
2. Open the project's **Connection Details** and copy the pooled connection string — it looks like `postgresql://user:password@ep-xxxx-pooler.region.aws.neon.tech/neondb?sslmode=require`.
3. Keep this — you'll paste it into Railway as `DATABASE_URL` in step 2.4.

## 2. Server — Railway

1. In Railway, **New Project → Deploy from GitHub repo**, pick `hivemindoverlord/XStellar-Adventures`.
2. When Railway asks for a root directory / working directory, set it to `server`. If it doesn't ask upfront, set it under **Settings → Root Directory**.
3. Set the build/start commands (Settings → Deploy):
   - Build command: `npm install --prefix .. && npm run build -w shared && npm run build -w server` (the server imports `@xstellar/shared`, so the workspace needs installing from the repo root, not just `server/`)

     If Railway only lets you set a root directory *and* doesn't let you `cd ..`, instead leave root directory unset (repo root) and use:
     - Build command: `npm install && npm run build -w shared && npm run build -w server`
     - Start command: `npm run start -w server` — but first add `"start": "node dist/index.js"` is already in `server/package.json`, so this works as-is.
4. Add environment variables (Settings → Variables):
   - `DATABASE_URL` — the Neon connection string from step 1.2
   - `JWT_SECRET` — any long random string (e.g. generate with `openssl rand -hex 32`)
   - `CLIENT_ORIGIN` — the Vercel URL from step 3 (you can circle back and set this after step 3)
   - `PORT` — Railway sets this automatically; the server already reads `process.env.PORT`, no action needed
5. Run the Prisma migration once against the Neon database. Easiest from your own machine or this Claude session:
   ```
   DATABASE_URL="<neon connection string>" npm run prisma:migrate -w server
   ```
6. Deploy. Once live, copy the public Railway URL (Settings → Networking → generate a domain if one isn't already assigned) — you'll need it for the client's `VITE_SERVER_URL`.

## 3. Web client — Vercel

1. In Vercel, **Add New → Project**, import `hivemindoverlord/XStellar-Adventures`.
2. Set **Root Directory** to `client`.
3. Framework preset: Vite (should auto-detect).
4. Add an environment variable: `VITE_SERVER_URL` = the Railway server URL from step 2.6 (e.g. `https://xstellar-adventures-production.up.railway.app`).
5. Deploy. Copy the resulting Vercel URL (e.g. `https://xstellar-adventures.vercel.app`) — this is your production web URL.
6. Go back to Railway and set `CLIENT_ORIGIN` to this Vercel URL (needed for CORS + Socket.io), then redeploy the server.

From this point on, every push to `main` auto-deploys both the server (Railway) and client (Vercel) — no GitHub Actions involved for these two.

## 4. GitHub repo variable for the Android build

The Android app's WebView needs to know which URL to load. In the GitHub repo:

**Settings → Secrets and variables → Actions → Variables tab → New repository variable**

- Name: `PRODUCTION_WEB_URL`
- Value: your Vercel URL from step 3.5 (e.g. `https://xstellar-adventures.vercel.app`)

## 5. Android signing secrets

Already generated and sent to you separately as `GITHUB_SECRETS_TO_ADD.txt`. Add each of the 4 values as a **secret** (not a variable) under the same Secrets and variables → Actions page, **Secrets** tab:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Back up that file to a password manager, then delete it from disk. This keystore signs every future release — if it's lost, this app listing can never be updated again on Google Play.

## 6. Google Play Console

You said you already have a developer account, so:

1. In [Play Console](https://play.google.com/console), create a new app: name "XStellar Adventures", default language, Game category, Free.
2. Complete the required setup tasks Play Console lists for a new app (store listing text/icon, content rating questionnaire, target audience, data safety form, privacy policy URL). Google **will not let the API publish a release until these are done at least minimally** — the workflow only automates the *binary upload*, not the store listing.
3. Note the app's package name must match `com.portertech.xstellaradventures` (already set in `client/capacitor.config.ts` and `client/android/app/build.gradle`). If you'd rather use a different application ID, tell me before the first Play Store upload — it can't be changed afterward.
4. Create an API service account:
   - In Play Console: **Setup → API access → Choose or create a Google Cloud project**, then **Create new service account** (this opens Google Cloud Console).
   - In Google Cloud Console, on that service account: **Keys → Add key → Create new key → JSON**. This downloads a `.json` file — treat it like a password.
   - Back in Play Console's API access page, grant the new service account **Admin (all permissions)** or at minimum **Release** permissions for this app, and finish linking it.
5. Add that JSON file's entire contents as one more GitHub secret:
   - Name: `PLAY_SERVICE_ACCOUNT_JSON`
   - Value: paste the whole JSON file content
6. Google Play requires **at least one manual upload** through the Play Console web UI before the API can publish further releases (a platform requirement, not something CI can bypass). Build a signed AAB locally or download the artifact from the first `ci.yml`/`android-release.yml` run, and upload it once by hand to the Internal Testing track to bootstrap the listing. Every release after that can go through the automated workflow.

## 7. Shipping updates going forward

- **Gameplay, art, UI, balance changes**: just push to `main`. Vercel redeploys the web client, and every installed Android app (and anyone on the web) sees it on next load — no rebuild, no store review.
- **Native changes** (new Capacitor plugin, permission, app icon/splash, minSdk bump): push a tag like `git tag v1.0.1 && git push origin v1.0.1`. This triggers `.github/workflows/android-release.yml`, which builds, signs, and uploads a new AAB to the Play Console **internal** track by default. Promote it to production from the Play Console UI, or re-run the workflow manually (Actions tab → Run workflow) and pick a different track.
