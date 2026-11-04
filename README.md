# Tether

Your [Open WebUI](https://github.com/open-webui/open-webui), wherever you work.

Tether extends Open WebUI beyond the browser. Interact with your AI right from your desktop, and give it the access to work directly on your computer.

Free for personal, non-commercial use. Commercial or organizational production use requires an Open WebUI Enterprise License. See [LICENSE](LICENSE).

## Development

Requires Node.js 22.16 or later and npm.

```sh
npm ci
npm run dev
```

`npm run build` checks types and compiles the app. `npm run lint` and `npm run format:check` check code style. Use `npm run build:unpack` for a local app bundle, or `build:mac`, `build:win`, and `build:linux` for installers on the corresponding platform.

The Electron, Svelte, and TypeScript scaffold comes from [Desktop](https://github.com/open-webui/desktop). Application code lives in `src/main`, the renderer bridge in `src/preload`, and the interface in `src/renderer`.

Pushing to the `release` branch runs Desktop’s release pipeline for Tether. Signing requires the Apple and Azure repository secrets referenced in [the workflow](.github/workflows/release.yml).
