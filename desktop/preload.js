const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    platform: process.platform,
    // Methods
    getInterfaces: () => ipcRenderer.invoke('get-interfaces'),
    startSniffer: (interfaceName) => ipcRenderer.invoke('start-sniffer', interfaceName),
    stopSniffer: () => ipcRenderer.invoke('stop-sniffer'),
    // Listeners
    onBackendLog: (callback) => ipcRenderer.on('backend-log', (event, ...args) => callback(...args)),
    onBackendStatus: (callback) => ipcRenderer.on('backend-status', (event, ...args) => callback(...args)),
});
