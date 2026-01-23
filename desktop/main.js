const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const util = require('util');

// Polyfill util.isObject and util.isFunction for sudo-prompt compatibility
if (!util.isObject) {
    util.isObject = (arg) => typeof arg === 'object' && arg !== null;
}
if (!util.isFunction) {
    util.isFunction = (arg) => typeof arg === 'function';
}

const sudo = require('sudo-prompt');
const { exec } = require('child_process');

let mainWindow;
const backendPath = path.join(__dirname, 'resources', 'g-flow-engine');

// Sudo options
const sudoOptions = {
    name: 'GFlow Desktop',
};

function startBackend() {
    console.log('Starting G-Flow Backend...');
    // We launch it in 'sniffer' mode. 
    // TODO: In the future, this should be configurable from the Settings UI.
    const command = `"${backendPath}" -mode sniffer`;

    sudo.exec(command, sudoOptions, (error, stdout, stderr) => {
        if (error) {
            console.warn('Local Backend failed to start (Expected on Mac/Windows with Docker Desktop):', error.message);
            console.log('App will attempt to connect to Dockerized Backend at localhost:8085');
            return;
        }
        console.log('Local Backend started successfully.');
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        backgroundColor: '#020617',
        titleBarStyle: 'hiddenInset',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    // Always load the built static file for now to verify the desktop build
    mainWindow.loadFile(path.join(__dirname, '../frontend/out/index.html'));

    // Start the backend AFTER the window is created (or before, depending on preference)
    // Asking for sudo right on launch might be aggressive. 
    // Better UX: Wait for user to click "Start Monitoring" in UI.
    // For now, let's just auto-start to prove the concept.
    startBackend();

    mainWindow.on('closed', () => {
        mainWindow = null;
        // Kill backend? 
        // sudo.exec unfortunately DOES NOT return a PID we can easily kill cross-platform.
        // We might need to run `pkill g-flow-engine`.
        exec('pkill g-flow-engine');
    });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
    exec('pkill g-flow-engine');
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});
