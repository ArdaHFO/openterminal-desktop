OpenTerminal Desktop runs the market workspace in a Windows app with its own local services.

# OpenTerminal Desktop for Windows x64

The NSIS installer installs a native Electron window, a tray icon, a private Node runtime, the production API and Next standalone frontend. No system Node, npm, source checkout or command window is needed to run the installed application. Internet access is still required for external market data and TV providers.

## Install and use

After building an installer, run `outputs/desktop-package/OpenTerminal-Kurulum-1.0.0-x64.exe`. Compiled installers and local verification receipts are not included in the source tree. The installer is per-user, creates **OpenTerminal Desktop** shortcuts on the desktop and Start menu, and registers an uninstaller in Windows Installed Apps. Administrator access is not required. The default program directory is `%LOCALAPPDATA%\Programs\OpenTerminal Desktop` (the actual chosen directory is recorded by Windows).

User files are stored separately in `%LOCALAPPDATA%\OpenTerminal Desktop`. `data\terminal.db` contains portfolios, `profile\` contains saved layouts, watchlists, indicator settings and drawings, and `logs\` contains startup diagnostics. Uninstalling or reinstalling the program preserves this directory. Deleting it is a separate, manual action. Browser and desktop installations use independent copies of portfolio data after migration.

Closing the window exits by default. **OpenTerminal > Kapatınca tepside tut** changes this to hide in the tray. The tray menu can show, hide or fully exit the application. Only services started by this desktop process are stopped. Loopback ports are chosen dynamically, while the stable `openterminal://app` origin preserves layout state.

## Backups and migration

The **Yedekleme** menu exports/imports layouts and online SQLite portfolio backups. Select a new filename for a portfolio export. Layout import automatically saves the previous layout in `backups\`. Portfolio import validates a read-only source before stopping services, retains the current database, and attempts rollback if replacement startup fails.

For an existing browser workspace, select **Export layout** in the web toolbar and then **Yedekleme > Düzeni içe aktar** in the desktop application. It transfers layouts, named workspaces, watchlists, drawings and indicator periods. It does not export API keys or portfolios. A first-launch `--import-legacy-db=ABSOLUTE_PATH` can copy an existing OpenTerminal database read-only, only when the desktop database does not already exist.

## Controlled updates

Fully exit the app before running a newer installer. Program files are replaced while the separate data directory is retained. This build has no automatic update feed and no publisher signing certificate. Windows may identify it as an unsigned local application. This project does not change Windows security settings.

## Reproduce a build

Use Windows x64, Node **26.13.0**, and Python 3 for the build only. From the repository root, install the workspace development dependencies with `npm ci`, then:

```powershell
npm ci --prefix desktop --workspaces=false
node desktop/node_modules/electron/install.js
$env:NEXT_DIST_DIR='.next-desktop'
$env:NEXT_TELEMETRY_DISABLED='1'
npm run build
node desktop/stage.cjs
npm run installer --prefix desktop --workspaces=false
```

`stage.cjs` requires a fresh staging directory. `--resume` is only for retrying that same build staging directory. It uses the locked server production dependencies with lifecycle scripts disabled, then actually loads the shipped SQLite native module using the bundled Node runtime. It verifies `node.exe` against the official release checksum, includes its license, and copies only approved standalone directories. Next tracing can still collect local data in its raw build output, which is never itself distributed. A mandatory `beforePack` scan rejects credential files, user database files and the current local API key. `manifest.json` records the hashes of shipped service files.

The local installer uses a standard, CRC-verified ZIP payload without compression to avoid the Windows archive-tool pipe issue. This increases the installer size. The build wrapper creates that payload with Python and passes the finished application to electron-builder using its supported prepackaged mode. Python is not needed by the installed application.

The Electron renderer has Node integration disabled, context isolation, sandboxing, a content security policy and no exposed privileged API. The main process proxies only the registered application origin to its owned local frontend. Each launch generates a new backend secret in child-process memory. The renderer and installer do not receive this secret.

## Verification

```powershell
node --test desktop/policy.test.cjs
node --test desktop/services.test.cjs
node desktop/electron-check.cjs "--exe=ABSOLUTE_PATH_TO_UNPACKED_OR_INSTALLED_EXE"
```

The service and Electron suites create isolated test data. The Electron suite tests real protocol requests, synthetic portfolio CRUD, layout persistence, native backup/restore menus, restart, single-instance behavior, normal shutdown and termination of the actual main process. Live metal requests are separate provider-dependent checks. Test receipts are written under the ignored `outputs/desktop-audit` directory in this repository. The installed application exposes the test controller only when explicitly launched with `--self-test --test-root=ABSOLUTE_ISOLATED_PATH`.

These commands are instructions, not results from the publication preparation. No test suite, build or installer validation was run for this source publication. No fresh application screenshot or runtime validation was completed. The `finalize.cjs` script formats receipts from the original Windows release validation and contains release-specific expectations; it is not a general current test-result collector. The install/uninstall validation scripts intentionally operate on Windows installations and user data and should only be used in a controlled release-validation session.
