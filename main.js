// Electron 主进程：桌面窗口外壳
// 负责：创建窗口、窗口置顶开关、画面缩放、本地存档路径暴露
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let alwaysOnTop = false;

// 存档目录：用户数据目录下 desktopFarm 子目录
function getSaveDir() {
  const base = app.getPath('userData');
  const dir = path.join(base, 'desktopFarm');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 640,
    minHeight: 480,
    title: '像素农场',
    backgroundColor: '#2c3e2d',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setAlwaysOnTop(alwaysOnTop);
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ====== IPC 通道：渲染进程与主进程通信 ======

// 获取存档目录路径
ipcMain.handle('save:getDir', () => getSaveDir());

// 读取存档文件
ipcMain.handle('save:read', (event, filename) => {
  const filePath = path.join(getSaveDir(), filename);
  if (!fs.existsSync(filePath)) return null;
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (e) {
    console.error('读取存档失败:', e);
    return null;
  }
});

// 写入存档文件
ipcMain.handle('save:write', (event, filename, content) => {
  const filePath = path.join(getSaveDir(), filename);
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  } catch (e) {
    console.error('写入存档失败:', e);
    return false;
  }
});

// 窗口置顶开关
ipcMain.handle('window:setAlwaysOnTop', (event, flag) => {
  alwaysOnTop = !!flag;
  if (mainWindow) mainWindow.setAlwaysOnTop(alwaysOnTop);
  return alwaysOnTop;
});

ipcMain.handle('window:getAlwaysOnTop', () => alwaysOnTop);
