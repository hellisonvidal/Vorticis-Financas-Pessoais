// Ponte mínima e segura entre a interface e o processo principal (apenas requisições à API do Open Finance)
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  http: (req) => ipcRenderer.invoke('http', req),
});
