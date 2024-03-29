/**
 * SETE Desktop: index.js
 *
 * Ponto de entrada da aplicação desktop.
 * Primeiramente, instanciamos o electron e criamos o processo main e renderer.
 * Logo em seguida, realiza-se a instanciação da base de dados.
 * Cria-se a janela do navegador no processo renderer e instancia-se a parte web.
 * Por fim, cria-se os listeners de IPC e o worker para a parte de roteirização.
 */

// Imports principais
const electron = require("electron");
const { app, dialog, BrowserWindow, ipcMain, shell } = electron;
const path = require("path");
const fs = require("fs-extra");

// Menu Direito
const contextMenu = require("electron-context-menu");

// Importa biblioteca para baixar dados via https
const https = require("https");

// Desabilita cache do http no electron
app.commandLine.appendSwitch("disable-http-cache");

// Arquivo de configuração (variáveis básicas)
const Store = require("electron-store");
const appconfig = new Store();
// Apaga cache da OD se tiver
if (appconfig.has("OD")) {
    appconfig.delete("OD");
}

// Bibliotecas para plotar logo do SETE e informações do sistema
const figlet = require("figlet");

const helper = require('./scripts/helper.js');
const config = require('../config.js');
// Plotando dados do sistema e SETE
console.log(figlet.textSync("SETE"));
console.log("SETE".padEnd(30), app.getVersion());
console.log("SISTEMA OPERACIONAL".padEnd(30), process.platform);
console.log("VERSAO DO SISTEMA OPERACIONAL".padEnd(30), process.getSystemVersion());
console.log("ARQUITETURA CPU".padEnd(30), process.arch);

// /////////////////////////////////////////////////////////////////////////////
// BANCO DE DADOS
// /////////////////////////////////////////////////////////////////////////////

// Path do banco de dados (dbPath), banco padrão (rawDBPath)
const dbPath = path.join(app.getPath("userData"), "db", "local.db");
const rawDBPath = path.join(__dirname, "db", "local.db");

// Verificando existência da base de dados
if (!fs.existsSync(dbPath)) {
    fs.copySync(rawDBPath, dbPath);
    console.log("COPIANDO A BASE DE DADOS DE: ", rawDBPath);
    console.log("PARA: ", dbPath);
} else {
    console.log("BASE SQLITE".padEnd(30), dbPath);
}

// Verificação se existe o template para criar a base de dados roteirizável
const malhaTemplatePath = path.join(app.getPath("userData"), "db", "osm_road_template");
const rawMalhaTemplatePath = path.join(__dirname, "db", "osm_road_template");

if (!fs.existsSync(malhaTemplatePath)) {
    fs.copySync(rawMalhaTemplatePath, malhaTemplatePath);
    console.log("COPIANDO O TEMPLATE DE MALHA DE: ", rawMalhaTemplatePath);
    console.log("PARA: ", malhaTemplatePath);
} else {
    console.log("TEMPLATE OSM".padEnd(30), malhaTemplatePath);
}

// Instanciação das bases de dados
const spatialite = require("spatialite");

// /////////////////////////////////////////////////////////////////////////////
// Criação do navegador e processo renderer
// /////////////////////////////////////////////////////////////////////////////

// Menu
contextMenu({
    showSaveImageAs: true,
    showInspectElement: false,
    labels: {
        cut: "Recortar",
        copy: "Copiar",
        paste: "Colar",
        saveImageAs: "Salvar imagem como…",
        lookUpSelection: 'Buscar "{selection}"',
        selectAll: "Selecionar todo o texto",
        searchWithGoogle: "Buscar no Google",
    },
});

// Ref global para a janela, senão o garbage colector apaga a janela
let appWindow;

function createEntryWindow() {
    // Cria a janela do navegador
    appWindow = new BrowserWindow({
        width: 1250,
        height: 450,
        minWidth: 1250,
        minHeight: 450,
        backgroundThrottling: false,
        show: false,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            nodeIntegration: true,
            nodeIntegrationInWorker: true,
            enableRemoteModule: true,
        },
    });

    if (config.DEV_TOOLS) {
        appWindow.webContents.openDevTools();
    }
    // Desabilita e esconde menu
    // appWindow.setMenu(null);
    appWindow.setMenuBarVisibility(false);

    // Agora carrega a página de login do SETE
    // Vamos verificar se estamos usando proxy
    const usingProxy = appconfig.get("PROXY_USE");
    if (!usingProxy) {
        let govUrl = config.GOVBR_URL;
        appWindow.loadURL(`file://${__dirname}/renderer/login-view.html`);
    } else {
        const proxyType = appconfig.get("PROXY_TYPE");
        const proxyAddress = appconfig.get("PROXY_ADDRESS");
        const proxyPort = appconfig.get("PROXY_PORT");
        const proxyString = `${proxyType}://${proxyAddress}:${proxyPort},direct://`;
        console.log("PROXY STRING", proxyString);

        appWindow.webContents.session.setProxy({ proxyRules: proxyString }).then(() => {
            appWindow.loadURL(`file://${__dirname}/renderer/login-view.html`);
        });
    }

    // Abre DevTools.
    // appWindow.webContents.openDevTools();

    // Desabilita navegação externa
    appWindow.webContents.on("will-navigate", (e, url) => {
        console.log("WILL-NAVIGATE", url);

        if (url.includes("censobasico.inep.gov")) {
            shell.openExternal(url);
            e.preventDefault();
        } else if (!url.includes("file:")) {
            e.preventDefault();
        }
    });

    // Bloqueia tentativa de abrir nova janela, redireciona para navegador do sistema
    appWindow.webContents.on("new-window", (e, url) => {
        console.log("NEW-WINDOW", url);
        e.preventDefault();
        shell.openExternal(url);
    });

    // Mostra o navegador quando o mesmo terminar de renderizar a página inicial
    appWindow.on("ready-to-show", () => {
        appWindow.maximize();
        appWindow.show();
    });

    // Tratamento quando o usuário fecha a janela do navegador
    appWindow.on("closed", () => {
        // Dereferencia a variável que armazena o navegador
        appWindow = null;
    });
}

// /////////////////////////////////////////////////////////////////////////////
// Rotinas do processo principal
// /////////////////////////////////////////////////////////////////////////////

// Rotina para atualização da malha
const MalhaUpdate = require("./main/malha/malha-update.js");

// Rotina para otimização da malha
const RouteOptimization = require("./main/routing/routing-optimization.js");

// Rotina para otimização dos pontos de parada
const PontosDeParadaOptimization = require("./main/pontos-de-parada/pontos-de-parada-optimization.js");

// Worker que vai lidar com a parte de roteirização
let routeOptimizer = new RouteOptimization(app, dbPath);

// Worker que vai lidar com a parte de roteirização
let pontosDeParadaOptimizer = new PontosDeParadaOptimization(app, dbPath);

// /////////////////////////////////////////////////////////////////////////////
// Funções para lidar com eventos do SETE
// On == funções que chamam o processo main, mas não esperam retorno
// Handle == funções que chamam o processo main e esperam um retorno
// /////////////////////////////////////////////////////////////////////////////

// Evento chamado para abrir uma página externa
function onAbrirSite(event, site) {
    shell.openExternal(site);
}

// Evento chamado que permite o usuário salvar a planilha modelo de importação de alunos
function handleSalvarPlanilhaModelo(event) {
    let salvou = false;

    let arqDestino = dialog.showSaveDialogSync(appWindow, {
        title: "Salvar Planilha Exemplo",
        buttonLabel: "Salvar",
        filters: [{ name: "XLSX", extensions: ["xlsx"] }],
    });

    if (arqDestino != "" && arqDestino != undefined) {
        let arqOrigem = path.join(__dirname, "renderer", "templates", "FormatoImportacaoAluno.xlsx");
        fs.copySync(arqOrigem, arqDestino);
        salvou = true;
    }

    return salvou;
}

// Evento chamado para salvar malha do OSM
function handleSalvarMalhaOSM(event, latitude, longitude) {
    let comecouSalvar = false;

    let arqDestino = dialog.showSaveDialogSync(appWindow, {
        title: "Salvar Malha OSM",
        buttonLabel: "Salvar Malha",
        filters: [{ name: "OSM", extensions: ["osm"] }],
    });

    if (arqDestino != "" && arqDestino != undefined) {
        console.log(arqDestino);
        comecouSalvar = true;
        const latmin = Number(latitude) - 0.25;
        const lngmin = Number(longitude) - 0.25;
        const latmax = Number(latitude) + 0.25;
        const lngmax = Number(longitude) + 0.25;

        const latstr = `${latmin},${lngmin},${latmax},${lngmax}`;

        const url = `https://overpass-api.de/api/interpreter?data=[out:xml][timeout:60];
    (node['highway']['highway'!='footway']['highway'!='pedestrian']['-highway'!='path'](${latstr});
    way['highway']['highway'!='footway']['highway'!='pedestrian']['-highway'!='path'](${latstr});
    relation['highway']['highway'!='footway']['highway'!='pedestrian']['-highway'!='path'](${latstr});)
    ;(._;>;);out meta;`;

        const arqMalha = fs.createWriteStream(arqDestino);
        https.get(url, (response) => {
            // Checa se a resposta deu erro
            if (response.statusCode !== 200) {
                console.log("Status da resposta foi " + response.statusCode);
                appWindow.webContents.send("renderer:finaliza-salvar-malha-osm", false);
            }
            response.pipe(arqMalha);
            response.on("end", () => {
                console.log("ARQUIVO SALVO", arqDestino);
                arqMalha.close();
                appWindow.webContents.send("renderer:finaliza-salvar-malha-osm", true);
            });
        });
    }

    return comecouSalvar;
}

// Evento chamado para atualizar a malha
function onSalvarNovaMalha(event, arquivo) {
    console.log("SALVANDO NOVA MALHA", arquivo, dbPath);
    const malha = new MalhaUpdate(arquivo, dbPath);
    malha
        .update()
        .then(() => {
            appconfig.delete("OD");
            appWindow.webContents.send("renderer:finaliza-salvar-nova-malha", true);
        })
        .catch(() => {
            appWindow.webContents.send("renderer:finaliza-salvar-nova-malha", false);
        });
}

// Evento chamado para carregar e retornar a malha ao renderer
function onAbrirMalha() {
    let arqOrigem = path.join(app.getPath("userData"), "malha.osm");
    return new Promise((resolve, reject) => {
        fs.readFile(arqOrigem, "utf8", (err, dataOSM) => {
            if (err) reject({ code: "erro:malha" });

            resolve(dataOSM);
        });
    });
}

// Evento que inicia a geração de rotas (feito de forma assíncrona para não bloquear o processo principal)
function onIniciaGeracaoRotas(event, routingArgs) {
    let cachedODMatrix = appconfig.get("OD", {
        nodes: {},
        dist: {},
        cost: {},
    });

    const minNumVehicles = Math.max(routingArgs.numVehicles, Math.floor(routingArgs.stops.length / routingArgs.maxCapacity));
    routingArgs.numVehicles = minNumVehicles;
    routeOptimizer.optimize(cachedODMatrix, routingArgs);
}

// Evento chamado pelo nosso worker quando ele terminar de gerar a rota
function onWorkerFinalizarGeracaoRotas(res) {
    // Set new cache
    const newODCache = res[0];
    appconfig.set("OD", newODCache);

    // Send generated routes
    const optRoutes = res.slice(1);
    appWindow.webContents.send("renderer:sucesso-geracao-rotas", optRoutes);
}

// Evento chamado pelo nosso worker quando ele encontra um erro ao gerar a rota
function onWorkerObtemErroGeracaoRotas(err) {
    appWindow.webContents.send("renderer:erro-geracao-rotas", err);
}

// Evento que inicia a geração de pontos de parada (feito de forma assíncrona para não bloquear o processo principal)
function onIniciaGeracaoPontosDeParada(event, paramPontosDeParada) {
    let cachedODMatrix = appconfig.get("OD", {
        nodes: {},
        dist: {},
        cost: {},
    });

    pontosDeParadaOptimizer.optimize(cachedODMatrix, paramPontosDeParada);
}

// Evento chamado pelo nosso worker quando ele terminar de gerar os pontos de parada
function onWorkerFinalizarGeracaoPontosDeParada({ clusters, cachedODMatrix }) {
    // Set new cache
    appconfig.set("OD", cachedODMatrix);

    // Send generated pontos de parada
    appWindow.webContents.send("renderer:sucesso-geracao-pontos-de-parada", clusters);
}

// Evento chamado pelo nosso worker quando ele encontra um erro ao gerar os pontos de parada
function onWorkerObtemErroGeracaoPontosDeParada(err) {
    appWindow.webContents.send("renderer:erro-geracao-pontos-de-parada", err);
}

// Registro dos listeners
function createListeners() {
    // Utils
    ipcMain.handle("main:pegar-versao-sete", () => app.getVersion());
    ipcMain.on("main:abrir-site", onAbrirSite);
    
    // Salvar e lidar com malha
    ipcMain.on("main:salvar-nova-malha", onSalvarNovaMalha);
    ipcMain.handle("main:salvar-planilha-modelo", handleSalvarPlanilhaModelo);
    ipcMain.handle("main:salvar-malha-osm", handleSalvarMalhaOSM);
    ipcMain.handle("main:abrir-malha", onAbrirMalha);

    // Roteirização
    ipcMain.on("main:inicia-geracao-rotas", onIniciaGeracaoRotas);
    app.on("worker:finaliza-geracao-rotas", onWorkerFinalizarGeracaoRotas);
    app.on("worker:obtem-erro-geracao-rotas", onWorkerObtemErroGeracaoRotas);

    // Pontos de parada
    ipcMain.on("main:inicia-geracao-pontos-de-parada", onIniciaGeracaoPontosDeParada);
    app.on("worker:finaliza-geracao-pontos-de-parada", onWorkerFinalizarGeracaoPontosDeParada);
    app.on("worker:obtem-erro-geracao-pontos-de-parada", onWorkerObtemErroGeracaoPontosDeParada);
}

// /////////////////////////////////////////////////////////////////////////////
// Handlers para eventos do Electron.
// Estes serão chamados quando o node terminar de carregar o electron
// /////////////////////////////////////////////////////////////////////////////

// Desabilita aceleração de hardware (vga) para evitar tela branca
app.disableHardwareAcceleration();

// Evento chamado quando precisamos logar utilizando o proxy
app.on("login", (event, webContents, details, authInfo, callback) => {
    event.preventDefault();
    console.log(authInfo);

    const proxyTemAutenticacao = appconfig.get("PROXY_HASAUTENTICATION");
    if (proxyTemAutenticacao) {
        const proxyUser = appconfig.get("PROXY_USER");
        const proxyPassword = appconfig.get("PROXY_PASSWORD");
        callback(proxyUser, proxyPassword);
    }
});

// Evento que será chamado quando o electron terminou de carregar
// Neste caso, registraremos os listeners
// Por fim, redirecionamos para a função de criação do processo renderer
app.on("ready", () => {
    createListeners();
    createEntryWindow();
});

// Evento quando todas as janelas tiverem terminadas
app.on("window-all-closed", () => {
    // No mac é comum a app ficar na dock até que o usuário explicitamente feche ela
    if (process.platform !== "darwin") {
        app.quit();
    }
});

// Evento gerado quando app vai terminar
app.on("will-quit", () => {
    routeOptimizer.quit();
});

// Evento chamado quando clicamos no ícone do app
app.on("activate", () => {
    // No mac é comum recriar o aplicativo quando o ícone está na dock
    if (appWindow === null) {
        routeOptimizer = new RouteOptimization(app, dbPath);
        createEntryWindow();
    }
});