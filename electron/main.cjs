const { app, BrowserWindow, shell } = require('electron');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

let mainWindow = null;

function probePort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(null));
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      const boundPort = address && typeof address === 'object' ? address.port : null;
      server.close(() => resolve(boundPort));
    });
  });
}

async function getAvailablePort() {
  // Prefer 3000 so localStorage settings persist at a stable origin
  const preferred = await probePort(3000);
  if (preferred) return preferred;
  const fallback = await probePort(0);
  if (fallback) return fallback;
  throw new Error('Unable to find an available local port for BooruSlide server');
}

function waitForServer(url, timeoutMs = 15000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve();
        } else if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Server health check returned status ${res.statusCode}`));
        } else {
          setTimeout(attempt, 100);
        }
      });
      req.on('error', () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error('Timed out waiting for local BooruSlide server to start'));
        } else {
          setTimeout(attempt, 100);
        }
      });
      req.end();
    };
    attempt();
  });
}

function createWindow(appUrl) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 620,
    title: 'BooruSlide',
    backgroundColor: '#0a0a0c',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(appUrl)) {
      return { action: 'allow' };
    }
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url).catch(() => undefined);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadURL(appUrl);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    const port = await getAvailablePort();
    const distDir = app.isPackaged
      ? path.join(process.resourcesPath, 'dist')
      : path.join(__dirname, '..', 'dist');
    const defaultGalleryDir = path.join(app.getPath('pictures'), 'BooruSlide');

    if (!process.env.GALLERY_DIR) {
      process.env.GALLERY_DIR = defaultGalleryDir;
    }
    fs.mkdirSync(process.env.GALLERY_DIR, { recursive: true });

    process.env.NODE_ENV = 'production';
    process.env.HOST = '127.0.0.1';
    process.env.PORT = String(port);
    process.env.BOORUSLIDE_DIST_DIR = distDir;

    const serverBundlePath = path.join(__dirname, '..', 'build', 'server.cjs');
    if (!fs.existsSync(serverBundlePath)) {
      throw new Error(`Missing bundled server at ${serverBundlePath}. Run "npm run build:server" first.`);
    }

    require(serverBundlePath);

    const appUrl = `http://127.0.0.1:${port}`;
    await waitForServer(`${appUrl}/api/health`);
    createWindow(appUrl);
  }).catch((err) => {
    console.error('Failed to launch BooruSlide Desktop:', err);
    app.quit();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
