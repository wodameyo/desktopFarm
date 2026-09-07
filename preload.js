// preload.js：通过 contextBridge 暴露安全的 API 给渲染进程
// 渲染进程只能调用此处显式暴露的方法，无法直接访问 Node API
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('farmAPI', {
  // 存档相关
  save: {
    getDir: () => ipcRenderer.invoke('save:getDir'),
    read: (filename) => ipcRenderer.invoke('save:read', filename),
    write: (filename, content) => ipcRenderer.invoke('save:write', filename, content)
  },
  // 窗口控制
  window: {
    setAlwaysOnTop: (flag) => ipcRenderer.invoke('window:setAlwaysOnTop', flag),
    getAlwaysOnTop: () => ipcRenderer.invoke('window:getAlwaysOnTop')
  }
});
