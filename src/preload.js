// Preload Script
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sete", {
    APP_VERSION: async () => await ipcRenderer.invoke("main:pegar-versao-sete"),
    BASE_URL: process.env.BASE_URL,
    isElectron: process ? true : false,

    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Handlers Main
    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    
    // Util
    abrirSite: (site) => ipcRenderer.send("main:abrir-site", site),
    salvarPlanilhaModelo: () => ipcRenderer.invoke("main:salvar-planilha-modelo"),

    // Malha
    salvarMalhaOSM: (latitude, longitude) => ipcRenderer.invoke("main:salvar-malha-osm", latitude, longitude),
    salvarNovaMalha: (arquivo) => ipcRenderer.send("main:salvar-nova-malha", arquivo),
    abrirMalha: () => ipcRenderer.invoke("main:abrir-malha"),

    // Roteirização
    iniciaGeracaoRotas: (paramRoteirizacao) => ipcRenderer.send("main:inicia-geracao-rotas", paramRoteirizacao),

    // Pontos de Parada
    iniciaGeracaoPontosDeParada: (paramPontosDeParada) => ipcRenderer.send("main:inicia-geracao-pontos-de-parada", paramPontosDeParada),

    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Handlers Renderer
    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    // Malha
    onFinalizaSalvarMalhaOSM: (callback) => {
        ipcRenderer.removeAllListeners("renderer:finaliza-salvar-malha-osm");
        ipcRenderer.on("renderer:finaliza-salvar-malha-osm", callback)
    },
    onFinalizaSalvarNovaMalha: (callback) => {
        ipcRenderer.removeAllListeners("renderer:finaliza-salvar-nova-malha");
        ipcRenderer.on("renderer:finaliza-salvar-nova-malha", callback)
    },
    
    // Roteirização
    onSucessoGeracaoRotas: (callback) => {
        ipcRenderer.removeAllListeners("renderer:sucesso-geracao-rotas");
        ipcRenderer.on("renderer:sucesso-geracao-rotas", callback)
    },
    onErroGeracaoRotas: (callback) => {
        ipcRenderer.removeAllListeners("renderer:erro-geracao-rotas");
        ipcRenderer.on("renderer:erro-geracao-rotas", callback)
    },

    // Pontos de Parada
    onSucessoGeracaoPontosDeParada: (callback) => {
        ipcRenderer.removeAllListeners("renderer:sucesso-geracao-pontos-de-parada");
        ipcRenderer.on("renderer:sucesso-geracao-pontos-de-parada", callback)
    },
    onErroGeracaoPontosDeParada: (callback) => {
        ipcRenderer.removeAllListeners("renderer:erro-geracao-pontos-de-parada");
        ipcRenderer.on("renderer:erro-geracao-pontos-de-parada", callback)
    },
});
