import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('desktopSetup', {
    getStatus: () => ipcRenderer.invoke('desktop-setup:get-status'),
    saveRuntimeConfig: (payload: { apiPort?: number; databaseUrl: string }) =>
        ipcRenderer.invoke('desktop-setup:save-runtime-config', payload),
});

console.log('[Preload] desktop setup bridge ready');
