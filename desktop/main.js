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

const os = require('os');

// Sudo options
const sudoOptions = {
    name: 'GFlow Desktop',
};

// IPC Handlers
ipcMain.handle('get-interfaces', async () => {
    const interfaces = os.networkInterfaces();
    const list = Object.keys(interfaces).map(name => ({
        name,
        addresses: interfaces[name].map(a => a.address)
    }));
    return list;
});

ipcMain.handle('start-sniffer', async (event, interfaceName) => {
    const targetInterface = interfaceName || 'eth0';
    console.log(`Starting sniffer on interface: ${targetInterface}`);
    const command = `INTERFACE=${targetInterface} "${backendPath}" -mode sniffer`;

    // Notify UI
    mainWindow.webContents.send('backend-status', 'starting');

    sudo.exec(command, sudoOptions, (error, stdout, stderr) => {
        if (error) {
            console.warn('Backend failed:', error.message);
            mainWindow.webContents.send('backend-status', 'failed', error.message);
            // Fallback to client mode hint
            mainWindow.webContents.send('backend-log', 'Local sniffer failed. Connecting to Dockerized backend...');
            return;
        }
        console.log('Backend started.');
        mainWindow.webContents.send('backend-status', 'running');
        mainWindow.webContents.send('backend-log', stdout);
    });
});

ipcMain.handle('stop-sniffer', async () => {
    exec('pkill g-flow-engine');
    mainWindow.webContents.send('backend-status', 'stopped');
});

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

    // Note: Auto-start removed. User must click "Start" in UI.

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
