"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('desktopSetup', {
    getStatus: () => electron_1.ipcRenderer.invoke('desktop-setup:get-status'),
    saveRuntimeConfig: (payload) => electron_1.ipcRenderer.invoke('desktop-setup:save-runtime-config', payload),
});
console.log('[Preload] desktop setup bridge ready');
//# sourceMappingURL=preload.js.map