// Preload Script
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sete", {
    APP_VERSION: async () => await ipcRenderer.invoke("main:pegar-versao-sete"),
    BASE_URL: process.env.BASE_URL,
    isElectron: process ? true : false,

    // Handlers Main
    abrirSite: (site) => ipcRenderer.send("main:abrir-site", site),
    salvarPlanilhaModelo: () => ipcRenderer.invoke("main:salvar-planilha-modelo"),
    salvarMalhaOSM: (latitude, longitude) => ipcRenderer.invoke("main:salvar-malha-osm", latitude, longitude),
    salvarNovaMalha: (arquivo) => ipcRenderer.send("main:salvar-nova-malha", arquivo),
    abrirMalha: () => ipcRenderer.invoke("main:abrir-malha"),
    iniciaGeracaoRotas: (paramRoteirizacao) => ipcRenderer.send("main:inicia-geracao-rotas", paramRoteirizacao),
    iniciaGeracaoPontosDeParada: (paramPontosDeParada) => ipcRenderer.send("main:inicia-geracao-pontos-de-parada", paramPontosDeParada),

    // Handlers Renderer
    onFinalizaSalvarMalhaOSM: (callback) => ipcRenderer.on("renderer:finaliza-salvar-malha-osm", callback),
    onFinalizaSalvarNovaMalha: (callback) => ipcRenderer.on("renderer:finaliza-salvar-nova-malha", callback),
    onSucessoGeracaoRotas: (callback) => ipcRenderer.on("renderer:sucesso-geracao-rotas", callback),
    onErroGeracaoRotas: (callback) => ipcRenderer.on("renderer:erro-geracao-rotas", callback),
});
