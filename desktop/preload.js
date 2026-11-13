// Ponte mínima e segura entre a interface e o processo principal (apenas requisições à API do Open Finance)
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  http: (req) => ipcRenderer.invoke('http', req),
  update: {
    info: () => ipcRenderer.invoke('update:info'),
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    openPage: () => ipcRenderer.invoke('update:open-page'),
    on: (fn) => {
      const h = (ch) => (e, d) => fn(ch.replace('update:', ''), d);
      const subs = ['update:progress', 'update:downloaded', 'update:error'].map((ch) => { const f = h(ch); ipcRenderer.on(ch, f); return [ch, f]; });
      return () => subs.forEach(([ch, f]) => ipcRenderer.removeListener(ch, f));
    },
  },
});
