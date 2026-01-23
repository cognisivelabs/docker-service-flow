const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    // API to be exposed to the Frontend
    platform: process.platform
});
