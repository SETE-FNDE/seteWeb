// Preload Script
const { contextBridge, ipcRenderer } = require("electron");

// this should print out the value of MY_ENVIRONMENT_VARIABLE
console.log(process.env.BASE_URL);
console.log(process.env.BASE_URL);
console.log(process.env.BASE_URL);

contextBridge.exposeInMainWorld("sete", {
    APP_VERSION: process.env.npm_package_version,
    BASE_URL: process.env.BASE_URL,
    isElectron: process ? true : false,
    
    // Listeners
    abrirSite: (site) => ipcRenderer.send("abrir:site", site),
    salvarPlanilhaModelo: () => ipcRenderer.invoke("salvar:planilha-modelo"),
    salvarNovaMalha: () => ipcRenderer.invoke("salvar:nova-malha"),
    iniciaGeracaoRotas: (paramRoteirizacao) => ipcRenderer.send("worker:inicia-geracao-rotas", paramRoteirizacao),
    finalizaGeracaoRotas: (callback) => ipcRenderer.on("sete:finaliza-geracao-rotas", callback),
    erroGeracaoRotas: (callback) => ipcRenderer.on("sete:erro-geracao-rotas", callback)

});
