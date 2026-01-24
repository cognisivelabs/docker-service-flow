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
    const list = [];

    Object.keys(interfaces).forEach(name => {
        const details = interfaces[name];
        // Filter out obviously inactive ones if needed, but keeping all is safer.
        // We prioritize IPv4
        const ipv4 = details.find(d => d.family === 'IPv4');
        const address = ipv4 ? ipv4.address : (details[0]?.address || '');

        // Heuristics for type
        let type = 'Other';
        let icon = 'network';
        const lowerName = name.toLowerCase();

        if (lowerName.startsWith('docker') || lowerName.startsWith('br-') || lowerName.includes('vethernet')) {
            type = 'Docker Bridge';
            icon = 'docker';
        } else if (lowerName === 'lo' || lowerName === 'lo0') {
            type = 'Loopback';
            icon = 'loopback';
        } else if (lowerName.startsWith('en') || lowerName.startsWith('eth') || lowerName.startsWith('wl')) {
            type = 'Physical (Wi-Fi/Ethernet)';
            icon = 'physical';
        } else if (lowerName.startsWith('utun') || lowerName.startsWith('tun')) {
            type = 'VPN / Tunnel';
            icon = 'vpn';
        } else if (lowerName.startsWith('awdl') || lowerName.startsWith('llw')) {
            type = 'System / Internal';
            icon = 'system';
        }

        list.push({
            name,
            address,
            type,
            icon,
            details // keep full details just in case
        });
    });

    // Sort: Docker first, then Physical, then others
    list.sort((a, b) => {
        const score = (type) => {
            if (type === 'Docker Bridge') return 0;
            if (type === 'Physical (Wi-Fi/Ethernet)') return 1;
            if (type === 'Loopback') return 2;
            return 3;
        };
        return score(a.type) - score(b.type);
    });

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
