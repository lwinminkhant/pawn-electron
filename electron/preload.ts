// Option B: the renderer installs its own `window.electron` bridge via
// `src/browser-bridge.ts`, which talks to the HTTP API at http://localhost:8787.
// This preload intentionally does nothing so Electron and web share one backend.
console.log('[Preload] no-op (HTTP API mode)');
export {};
