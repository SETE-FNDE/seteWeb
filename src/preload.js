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

    // Handlers Main
    abrirSite: (site) => ipcRenderer.send("main:abrir-site", site),
    salvarPlanilhaModelo: () => ipcRenderer.invoke("main:salvar-planilha-modelo"),
    salvarMalhaOSM: (latitude, longitude) => ipcRenderer.invoke("main:salvar-malha-osm", latitude, longitude),
    salvarNovaMalha: (arquivo) => ipcRenderer.send("main:salvar-nova-malha", arquivo),
    iniciaGeracaoRotas: (paramRoteirizacao) => ipcRenderer.send("worker:inicia-geracao-rotas", paramRoteirizacao),

    // Handlers Renderer
    onFinalizaSalvarMalhaOSM: (callback) => ipcRenderer.on("renderer:finaliza-salvar-malha-osm", callback),
    onFinalizaSalvarNovaMalha: (callback) => ipcRenderer.on("renderer:finaliza-salvar-nova-malha", callback),

    finalizaGeracaoRotas: (callback) => ipcRenderer.on("sete:finaliza-geracao-rotas", callback),
    erroGeracaoRotas: (callback) => ipcRenderer.on("sete:erro-geracao-rotas", callback),
});
