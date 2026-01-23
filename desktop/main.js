const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const sudo = require('sudo-prompt');
const { exec } = require('child_process');

let mainWindow;
const backendPath = path.join(__dirname, 'resources', 'g-flow-engine');

// Sudo options
const sudoOptions = {
    name: 'G-Flow Desktop',
};

function startBackend() {
    console.log('Starting G-Flow Backend...');
    // We launch it in 'sniffer' mode. 
    // Note: In production, you might want to stream logs to the UI.
    const command = `"${backendPath}" -mode sniffer`;

    sudo.exec(command, sudoOptions, (error, stdout, stderr) => {
        if (error) {
            console.error('Backend failed to start:', error);
            // In a real app, send this error to the UI
        }
        console.log('Backend stdout:', stdout);
        console.log('Backend stderr:', stderr);
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

    const isDev = process.env.NODE_ENV === 'development';

    if (isDev) {
        mainWindow.loadURL('http://localhost:3000');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../frontend/out/index.html'));
    }

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
