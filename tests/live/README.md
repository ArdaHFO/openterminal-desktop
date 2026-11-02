These optional checks compare market indicators during simulated data outages.

# Opt-in indicator outage audit

These checks require network access. They do not run in the ordinary deterministic E2E suite. Run from the OpenTerminal repository root, with the regular web app on port 3000.

The commands below use the Windows workspace dependency layout created by `setup-windows.ps1`. After installing the root development dependencies with `npm ci`, run `.\setup-windows.ps1` from the repository root. It installs the server and web dependencies in their own directories, including the `server/node_modules/tsx` path used in these examples.

Use a separate API port and DATA_DIR. For example, in a separate PowerShell terminal:

```powershell
$env:API_PORT='4114'
$env:DATA_DIR=(Join-Path (Get-Location) 'outputs/indicator-outage/data')
$preload=(Resolve-Path tests/live/outage-preload.mjs).Path
$env:NODE_OPTIONS='--import='+([System.Uri]$preload).AbsoluteUri
node server/node_modules/tsx/dist/cli.mjs server/src/index.ts
```

Then, in another terminal without NODE_OPTIONS:

```powershell
node server/node_modules/tsx/dist/cli.mjs tests/live/indicator-outage.ts
python tests/live/indicator-oracle.py
npx playwright test --config tests/live/outage.config.ts
```

The collector requests real histories from the isolated API and records source metadata and actual application indicator series. The Python reference imports no application math and compares every timestamp and value in the complete visible series. The browser tests use those exact real snapshots and Python expected values so market changes do not make the comparison drift. Other widgets are stubbed. The browser tests are therefore captured-live checks, not a claim that each browser interaction makes a fresh provider request.

For fully live UI inspection, start a separate Next process with API_URL pointing at the isolated API, its own NEXT_DIST_DIR and port, and API_KEY_FILE pointing at its isolated DATA_DIR/.api-key. Restore auto-generated Next type paths after stopping that process. Never copy a key into a test result or screenshot.

With that separate web process on port 3202, run `npx playwright test --config tests/live/live.config.ts` for seven direct live 6M chart checks. These allow history requests through the Next proxy to the isolated API. They verify source metadata, prior context, all seven close-based indicator legends and the expected daily VWAP explanation. Ancillary widgets and search suggestions are stubbed. They complement the detailed numerical comparisons in the captured-live matrix.

The default matrix has seven instruments and eight ranges, with eight indicator states checked per chart. COMEX metal futures use contract volume; OANDA spot metals expose an explicitly labelled Tick VWAP, not traded volume. Session anchors are supplied by the feed metadata and respect New York daylight saving. Daily/weekly/monthly charts cannot supply an intraday session VWAP and must show an explanation.

For a focused metal audit, set `AUDIT_SYMBOLS=XAUUSD,XAGUSD,GC=F,SI=F`, `AUDIT_RANGES=1D,5D,1M`, `AUDIT_API` and `AUDIT_DIR` before running the collector. Pass that output directory to the Python reference. Separate normal and outage directories preserve both sets of snapshots. For direct live UI checks use `LIVE_SYMBOLS`, `LIVE_RANGES` and `LIVE_AUDIT_DIR`. Intraday UI checks now compare the actual displayed VWAP against the separate Python `vwap-oracle.py` computation of the exact response received by that browser.

Stop only the isolated processes when finished. Leave the user's normal API and web app running. Do not use the user's portfolio database for write tests.

## Replay VWAP outage audit

Start the fault-injected API with a fresh DATA_DIR on port 4117 and a separate Next process on port 3203 using API_URL=http://127.0.0.1:4117 and NEXT_DIST_DIR=.next-replay-vwap. Set API_KEY_FILE to that isolated data directory's .api-key. From the repository root run:

```powershell
node server/node_modules/tsx/dist/cli.mjs tests/live/replay-vwap-audit.ts
python tests/live/replay-vwap-reference.py outputs/replay-vwap
npx playwright test --config tests/live/replay.config.ts
```

The API matrix covers four metals, three native replay intervals and both 5D/1M periods (24 datasets). It validates closed bars, source/volume/session metadata, complete VWAP series and every session/midnight boundary prefix. The independent Python reference imports no application math.

The UI matrix repeats those 24 cases at two viewport sizes with actual selected-interval replay requests through the Next proxy. Automatic replay history, ancillary widgets and search suggestions are stubbed. Each UI checks initial/next/reset/end values, play/pause, maximize/restore and tick-versus-contract labelling against a Python calculation of the exact response received by that browser. Native slider transitions across the latest session reset and midnight are exercised in 5D. Every 1M boundary is checked numerically by the collector; the 1M UI checks also include stepping through its last two candles. No user portfolio writes are made.

## Other replay indicators

For the SMA20/50/200, EMA20, RSI14, Bollinger20/2 and MACD12/26/9 audit, use an isolated fault-injected API on port 4118 and a separate Next web process on port 3204, NEXT_DIST_DIR=.next-replay-indicators. Run from the repository root:

```powershell
node server/node_modules/tsx/dist/cli.mjs tests/live/replay-indicators-audit.ts
python tests/live/replay-indicators-reference.py outputs/replay-indicators
npx playwright test --config tests/live/replay-indicators.config.ts
```

The 24-dataset API matrix validates full numerical series and causal prefixes at readiness thresholds and session/midnight boundaries. The independent Python reference uses no application math. The 48-case live UI matrix tests each indicator individually at the initial replay position, then together during controls, off/on changes at the end, required-data notices, and the numerical legend components. A representative real XAUUSD 15m/1M series also visits the exact RSI, moving-average and MACD readiness boundaries through the first SMA200 point. Insufficient history is an expected state: a one-month 4h replay does not contain 200 bars. Do not fill it with future observations or a different resolution. The Python subprocess output buffer is explicitly bounded at 16 MiB to accommodate complete long-history reference series.
