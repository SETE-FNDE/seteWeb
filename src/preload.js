// Preload Script
const { contextBridge, ipcRenderer } = require("electron");

// this should print out the value of MY_ENVIRONMENT_VARIABLE
console.log(process.env.BASE_URL);
console.log(process.env.BASE_URL);
console.log(process.env.BASE_URL);

contextBridge.exposeInMainWorld("sete", {
    BASE_URL: process.env.BASE_URL,
    isElectron: process ? true : false,
    abrirSite: (site) => ipcRenderer.send("abrirSite", site),
});
