# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.1] - 2026-11-05

### Added

- **Multiple Open WebUI connections.** Save your work and personal WebUI addresses and switch between them from the bottom bar. Each connection keeps its page open, so switching does not reload your chats or clear unfinished messages.
- **Separate accounts.** Sign into different accounts on the same WebUI address. Each saved connection keeps its own sign-in and browsing data.
- **Persistent sign-in.** Stay signed in across app restarts on compatible WebUI versions. Tether renews your sign-in automatically and retries interrupted renewals, including after restarting the app. Browser-based sign-in opens in your default browser and returns you to Tether.
- **Connection editing.** Rename a saved connection without interrupting its open page. Change its address to connect somewhere else, or remove it and sign out. Changing an address clears the previous sign-in.
- **Page controls.** Refresh the current WebUI or open it in your default browser. The title bar follows the page or chat you are viewing.
- **Optional local files and commands.** Install Open Terminal to let your connected WebUI accounts work on this computer. The first connection offers an install prompt with a **Not now** option. You can use WebUI without installing it and set it up later in Settings.
- **Access from another browser.** While Tether is running, sign into the same account on a compatible WebUI from another browser to use this computer's files and commands. You do not need to open incoming connections to your computer or configure your router. All signed-in, compatible WebUI connections remain connected when you switch tabs.
- **Computer names in WebUI.** Your terminal and new sign-in sessions use your computer's name. Set a custom device name in Settings, or leave it blank to use the name shown in the field.
- **Connection status.** The terminal indicator shows whether the selected WebUI is connected to this computer. It distinguishes **Connected to WebUI** from **Running locally · Not connected to WebUI**. Tether reconnects automatically when the connection drops and retries when WebUI does not yet support Tether.
- **Open Terminal setup and updates.** Install or update Open Terminal from Settings without installing Python yourself. Choose a specific Open Terminal version or use the latest, with optional updates at startup. Uninstalling stops local access and keeps your files and saved WebUI connections.
- **Starting folder.** Choose the folder Open Terminal uses for files and commands with a folder picker. Leaving it blank uses your user folder and shows that folder's path as a placeholder. Use **Restart to apply** after changing it.
- **Built-in terminal panel.** Open the bottom panel to read and copy Open Terminal output or run commands yourself in the **Shell** tab. Resize or collapse the panel without stopping the shell.
- **Background operation.** Keep Tether running when you close its window, start it minimized, and enable launch at login on macOS and Windows. Bring it forward from any app with **Cmd+Shift+T** on macOS or **Ctrl+Shift+T** on Windows and Linux. The shortcut can be changed or disabled.
- **Appearance and settings.** Choose light, dark, or system appearance and search Settings by name. The connection screen has slowly rotating chain artwork that pauses when the window is hidden and respects reduced-motion preferences.
- **App updates and release notes.** Check for Tether updates, see download progress, and restart to install from About. Click the version in the bottom bar to open About, then **Read changelog** to view release notes inside the app.
- **Factory reset.** Clear Tether's settings, saved connections, local sign-ins, and installed components after confirmation. Your hosted WebUI data and personal files are kept.
