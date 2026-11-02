# Upstream provenance and edition changes

This source snapshot is an independent Windows desktop extension of [ErTasselli/OpenTerminal](https://github.com/ErTasselli/OpenTerminal), not an official upstream release.

- **Original repository:** https://github.com/ErTasselli/OpenTerminal
- **Local development base:** [`aed097c680cd8ec1c391ae06966babe7d6d91fc6`](https://github.com/ErTasselli/OpenTerminal/commit/aed097c680cd8ec1c391ae06966babe7d6d91fc6)
- **Base commit title:** `Merge pull request #36 from philipsorensen/fix/issue-23-error-boundaries`
- **Base commit date:** 6 October 2026
- **License:** MIT. The original [LICENSE](LICENSE), including `Copyright (c) 2026 OpenTerminal contributors`, is retained without modification.

The local working copy used for this publication was a shallow checkout at that revision, with the desktop and workflow changes present in its working tree. This repository starts from a clean source snapshot instead of copying local Git metadata, account data or generated release output. Changes in upstream revisions after the pinned base are not claimed to be included.

## What comes from upstream

The core terminal interface, npm workspace organization, Express API, Next.js frontend, market-data integrations, chart and analysis widgets, SQLite portfolio foundation and original screenshot collection come from OpenTerminal and its contributors. Those are not presented as newly authored features of this edition.

## What this edition changes

| Change | Representative source evidence |
| --- | --- |
| Windows application and installer | [desktop/main.cjs](desktop/main.cjs), [desktop/services.cjs](desktop/services.cjs), [desktop/policy.cjs](desktop/policy.cjs), [desktop/builder.cjs](desktop/builder.cjs), [desktop/stage.cjs](desktop/stage.cjs) |
| Backup/restore and migration | [desktop/migrate.cjs](desktop/migrate.cjs), [desktop/main.cjs](desktop/main.cjs) |
| Named workspaces, presets and layout controls | [web/components/WorkspaceBar.tsx](web/components/WorkspaceBar.tsx), [web/components/Workspace.tsx](web/components/Workspace.tsx), [web/store/terminal.ts](web/store/terminal.ts) |
| Drawings, indicator configuration and revised history handling | [web/components/widgets/ChartWidget.tsx](web/components/widgets/ChartWidget.tsx), [web/store/chartTools.ts](web/store/chartTools.ts), [web/lib/indicators.ts](web/lib/indicators.ts), [server/src/providers/chartHistory.ts](server/src/providers/chartHistory.ts) |
| Shared catalogue and metal analysis | [catalog/instruments.json](catalog/instruments.json), [server/src/catalog.ts](server/src/catalog.ts), [web/components/widgets/MetalsWidget.tsx](web/components/widgets/MetalsWidget.tsx) |
| Historical replay and strategy simulation | [web/components/widgets/ReplayWidget.tsx](web/components/widgets/ReplayWidget.tsx), [web/lib/research.ts](web/lib/research.ts), [server/src/providers/replayHistory.ts](server/src/providers/replayHistory.ts) |
| Portfolio validation and calculation | [server/src/ledger.ts](server/src/ledger.ts), [server/src/routes/portfolio.ts](server/src/routes/portfolio.ts) |
| Provider routing and widget recovery | [server/src/routes/market.ts](server/src/routes/market.ts), [server/src/providers/](server/src/providers/), [web/components/widgets/](web/components/widgets/) |
| Additional verification code | [tests/](tests/), [server/src/](server/src/), [desktop/](desktop/) |

Publication preparation also makes desktop output directories relative to this repository's ignored `outputs/` folder, creates the audit output directory before writing its report, collects dependency notices from existing hoisted or workspace install directories, and replaces the root presentation with bilingual documentation. It does not update dependency versions or alter the original source checkout.

## Images and validation scope

The files `chart.png`, `crypto.png`, `dashboard.png`, `heatmap.png` and `news.png` under `docs/screenshots/` are retained upstream images. `desktop-workspace.png` is a previously captured desktop development view dated 29 October 2026, reused without editing. It is not evidence of a new launch, current data availability or a freshly validated release.

No test suite, build, installer or migration validation was run to prepare this source snapshot. No fresh application screenshot or runtime validation was completed. Existing verification scripts are provided as source. Historic local receipts, binaries, dependencies, portfolio records, credentials and logs are not published. The `desktop/finalize.cjs` formatter contains expectations for an earlier local release and should not be treated as a generic current-results collector.

Market feeds and media remain subject to their providers' terms. This edition is not affiliated with or endorsed by those providers. Dependencies retain their own licenses; desktop staging includes runtime and collected dependency notices in generated distributions.
