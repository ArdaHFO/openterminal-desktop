This Windows launcher opens an existing local OpenTerminal workspace in your web browser.

# Windows desktop launcher

`OpenTerminal.exe` starts the installed API and web app without a terminal window, waits for health checks, and opens the default browser. Concurrent launches share a Windows mutex. Reopening the executable reuses healthy services. Unrecognized services on ports 3000/4000 are never terminated.

The executable uses the install directory and Node executable captured by `build.ps1`. Keep the OpenTerminal project and its dependencies in their current location. This is a launcher for this local installation, not a portable distribution of the entire application.

Build with `powershell -NoProfile -File launcher/build.ps1` from the project. No administrator rights, Windows policy changes, or downloaded wrapper tools are required. Copy `launcher/dist/OpenTerminal.exe` to the user's actual Desktop folder after building.

`--no-browser` performs the same startup checks without opening a browser or showing dialogs. Exit code 0 indicates that API, web page and web-to-API proxy passed. Exit code 1 indicates an error. Logs are in `data/logs/launcher.log`, `api.launcher.log`, and `web.launcher.log`. Internal `--service api` and `--service web` modes supervise log output for the corresponding Node process.

The app uses the existing development server so subsequent source fixes remain available without rebuilding the desktop launcher. The first launch can take longer while Next.js compiles. Closing the browser leaves the local services running for quick reopening. They do not start automatically with Windows.
