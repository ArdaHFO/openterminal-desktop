# Analysis and workspace package

This document describes the workspace, charting, metals and replay additions in this edition. The standalone Windows desktop implementation is in `desktop/`; see [the desktop guide](../desktop/README.md) for the current build path. The older `launcher/` utility remains available for browser-based development.

## Instrument catalogue

`catalog/instruments.json` is the shared source for canonical identifiers, aliases, instrument types, feeds, currencies, units and configured capabilities. Both frontend normalization and backend metal/crypto routing read it. The Instruments widget filters by name/alias/type and loads the canonical symbol. Other listings remain accessible through global search, but are not presented as verified catalogue entries.

`GET /api/instruments?q=...` and `GET /api/instruments/:symbol` expose the catalogue. A missing entry returns 404, not guessed metadata. Capabilities describe configured functionality, not guaranteed provider availability.

## Workspaces

The bar below the clock saves named snapshots of widgets, placement, watchlist, active symbol and layout lock. Load restores a copy; edits do not mutate the saved snapshot. Rename, update and delete operate on saved layouts only. Presets for metals, stocks and crypto require a second click and automatically save the previous layout. Widget identifiers use UUIDs. Existing version 0/1 local workspaces migrate in place.

Lock disables dragging/resizing. Each widget can be maximized and restored (also Escape). Adding a widget scrolls only the workspace to its location, with no animated scroll that can race keyboard navigation.

## Charts

Horizontal levels require one chart click. Trend lines and measurements require two distinct candle times. Select Navigate to stop drawing. Drawings persist per canonical symbol, and can be individually deleted in the settings/details panel. SMA/EMA periods are configurable from 2 to 500 and persist per widget. Trend/ruler anchors appear only when their candles are present in the selected range. Replay hides drawings anchored after the visible prefix. Draw on the main price pane; the RSI/MACD panes do not accept price drawings.

## Metal analysis

The four configured instruments are XAUUSD, XAGUSD, GC=F and SI=F. Quote rows retain their source, price time and delay status. Spot prices are OANDA CFD prices and tick volume is not traded contract volume. COMEX charts use a continuous front-month proxy; Yahoo may quote a specific front contract. Rollover can change the apparent spread.

The ratio/spread chart joins daily closes by their New York trading-session dates, respecting the different CFD/futures session start hours. It is explicitly a derived close-only series, with no fabricated OHLC or volume. A failed history does not blank comparisons that still have both inputs. Snapshot differences are withheld when price timestamps differ by more than two minutes. USD/gram uses 31.1034768 grams per troy ounce. Optional TRY/gram is calculated using an explicitly manual positive USD/TRY rate, and is not a retail gold quote.

## Replay and strategy simulation

The replay widget loads historical OHLC data, exposes a visible prefix, and supports play/pause, speed, next candle, reset and a position slider. Its chart and calculations receive only the visible prefix; other linked quote widgets remain live. The Replay candle interval selector adds native 15-minute, hourly and four-hour candles. Intraday history is bounded to 5 calendar days or 31 days. Only closed candles are returned; a four-hour session-end bar is conservatively withheld until four hours after its opening timestamp. Native 240-minute TradingView bars are used for equities/metals, and Binance native 4h for crypto. No daily-to-intraday substitution or cross-session resampling is performed. Automatic retains the previous history ranges. Period/symbol/interval changes stop playback and reset the cursor. Maximize/restore now uses a stable portal target and preserves widget state, including replay position, inputs, filters, conversations and active media.

The included strategy is a configurable long-only fast/slow SMA crossover. Signals use completed prior candles and fills occur at the next candle's open. Fees and slippage are in basis points. Position sizing uses available quote-currency cash with no borrowing; equity marks an open position at the last shown close. Outputs include simulated fills, fees, equity, return, maximum drawdown and a simple buy-and-hold comparison. This model does not apply futures contract multipliers, funding, corporate actions, dividends, taxes or spread-based execution. Results depend on available provider bars and are not performance guarantees.

## Repeatable verification

* `npm test` runs provider/routing tests and mathematical/state regression tests.
* `npm run build -w server` compiles the API.
* `npm run build -w web` builds the web app.
* `npm run test:e2e` runs deterministic browser scenarios on desktop and compact viewports. Locally it uses installed Microsoft Edge in a temporary profile. In CI it uses Playwright Chromium.
* `npm run test:e2e:report` opens the local HTML report.

The browser suite uses port 3200 and `.next-e2e`. API responses are synthetic fixtures and real portfolios are never used. It covers snapshot persistence/CRUD, presets/backup, lock/maximize, scrolling, aliases/capabilities, all eight chart ranges, drawings/persistence/deletion/symbol isolation, configurable indicators, replay controls/cost validation, metal calculations and visible provider errors/recovery. Screenshots/traces for failures are under `test-artifacts/`. The existing CI workflow also runs the browser suite; editing that workflow does not itself constitute a successful remote CI run.

Live checks must be reported separately from these deterministic browser tests. Yahoo/Nasdaq outage checks use an isolated API process and separate database with a fetch preload that returns 503 only for those providers. Credentials and test databases are excluded from Git.

## Desktop package

The separately authorized desktop package is implemented in `desktop/`. It bundles Electron, Node, the production API and standalone frontend, manages its own loopback services, provides a native tray and backup menus, and retains user data outside the program directory. Updates use versioned installers; an automatic update feed and publisher signing are not configured. See `desktop/README.md` for building, migration, lifecycle behavior and repeatable checks.

## Live TV update (29 October 2026)

Cheddar Business now uses the public HLS source embedded by its official homepage, https://hls.livecdn.io/cheddar.com/cheddar/playlist.m3u8. CNBC's full TV feed is accessed through https://www.cnbc.com/live-tv/ and may require a CNBC+ or TV-provider subscription. Its channel button opens an explanatory panel and official-player link instead of pretending a free direct feed is configured.

TV channel selection survives maximize/restore. The player cleans up old network requests on channel changes, identifies connecting/playing/paused/autoplay-blocked states, uses bounded HLS recovery and a 25-second buffering timeout, and offers explicit retry and official-player links. Broadcast availability remains controlled by each provider.

## Complete function audit (29 October 2026)

The additional browser suite `tests/e2e/full-functions.spec.ts` exercises populated, empty, error and navigation paths across the remaining widgets. The original suite continues covering workspace, catalogue, metal and replay regressions. Tests intercept all API requests and never use the real portfolio or a paid AI provider.

Unlink now freezes the symbol visible at that moment. Content has bottom clearance for resize handles so last-row actions remain clickable. A heatmap with no valid market-cap rows renders an explicit empty state; multiple heatmaps have unique SVG clip IDs. Options expiry is scoped to the current symbol and zero IV is displayed. Screener sector selection resets when markets change, and numeric/sort filters are validated server-side. News, watchlist, portfolio and auxiliary feed errors are shown explicitly. AI request histories and retries do not append duplicate messages.

Portfolio calculation canonicalizes legacy aliases in memory without rewriting saved transactions. New records validate and normalize symbols and ISO timestamps; calculation orders offset timestamps by actual time. Malformed ledger values, oversells and deletions that break the remaining ledger are rejected. AI backend message roles/content are validated and an unconfigured backend returns 503 without contacting a provider.

The NYSE badge describes regular weekday hours only, with an explicit holiday/early-close limitation. Full receipts and the function matrix are in the task's `outputs/full-function-audit/` folder.
