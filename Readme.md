# HonestAds (Cloudflare Worker)

HonestAds is a single Cloudflare Worker that mirrors Google’s Ads Transparency Center without rate limits or authentication. Suggestions refresh as you type, creatives stream automatically the moment you start tracking a domain/advertiser, and the gallery behaves like a lightweight photo wall—click any creative to open a dialog with every field the RPC exposes.

## Highlights

- **Instant suggestions** – type a keyword, party, NGO, or domain and the worker autocompletes the same suggestions you would see on Google’s site.
- **Auto-tracking** – select (or deselect) suggestions and the worker immediately refreshes creatives without an extra “load” step.
- **Gallery-first UI** – creatives appear in a responsive grid with lazy-loaded previews; clicking a card reveals the metadata + raw JSON.
- **Structural filters** – include/exclude advertisers or domains, or filter by “only advertisers with ≥ N ads” / “only domains with ≥ N advertisers”.
- **One-click exports** – open the export dialog, choose JSON/CSV, pick the columns, and download.
- **Zero backend dependencies** – static assets + proxy live inside a single Worker, so it happily serves a custom domain (e.g. `honestads.eu`).

## Local development

```bash
cd workers/honestads-worker
wrangler login          # first time only
wrangler dev            # http://127.0.0.1:8787
```

The UI proxies `/anji/_/rpc/*` through the worker, so the browser never hits `adstransparency.google.com` directly. No extra environment variables are required for local dev.

## Deploy manually

```bash
cd workers/honestads-worker
wrangler deploy
```

By default the worker is reachable at `https://honestads-worker.<account>.workers.dev`. If you want to attach a custom domain (e.g. `honestads.eu`), deploy first and then use the Cloudflare dashboard (Workers → your worker → Triggers → Add custom domain). Cloudflare provisions the certificate automatically for zones you own.

## Continuous deployment

The repo ships with a GitHub Actions workflow (`.github/workflows/deploy.yml`) that runs `wrangler deploy --config workers/honestads-worker/wrangler.toml` on every push to `main`.

Create the following repository secrets before enabling the workflow:

| Secret | Description |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | API token with “Cloudflare Workers → Edit” and “Account → Workers Scripts → Edit” permissions. |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID (visible in the dashboard). |

Whenever the workflow runs, it deploys the latest worker to the default `*.workers.dev` hostname. If you later attach a custom domain through the dashboard, it will automatically serve the same build.

## Repository layout

```
.
├─ workers/
│  └─ honestads-worker/
│     ├─ public/          # HTML, CSS, JS served as static assets
│     ├─ src/worker.js    # Worker entry (serves assets + proxies RPCs)
│     └─ wrangler.toml    # Worker configuration
├─ .github/
│  ├─ workflows/deploy.yml
│  └─ CODEOWNERS
├─ .vscode/
│  └─ launch.json         # Runs `npx wrangler dev` from VS Code
└─ Readme.md
```

Everything else from the legacy Python CLI has been removed—the worker is the project.

## Notes on custom domains

- To add a custom domain, open the Cloudflare dashboard (Workers → honestads-worker → Triggers) and click “Add custom domain”.
- Cloudflare provisions SSL automatically as long as the zone lives in your account.
- If you prefer to stay on `*.workers.dev`, no additional work is required.

## Support / tweaks

- **Base URL override** – set `window.HONEST_ADS_CONFIG.baseUrl` before loading `app.js` if you ever need to proxy through another worker.
- **Suggestion metadata** – advertiser cards show recency/lifetime ads + domains reached; domain cards show how many advertisers are currently active there.
- **Feel free to fork** – the UI is pure static assets, so adding logos, themes, or extra filters is a matter of editing `public/index.html`, `styles.css`, and `app.js`.
