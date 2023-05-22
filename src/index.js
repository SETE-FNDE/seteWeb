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
const { app, BrowserWindow, ipcMain, shell } = electron;
const path = require("path");
const fs = require("fs-extra");

// Menu Direito
const contextMenu = require("electron-context-menu");

// Desabilita cache do http
app.commandLine.appendSwitch("disable-http-cache");

// Arquivo de configuração (variáveis básicas)
const Store = require("electron-store");

const appconfig = new Store();

// Bibliotecas para plotar logo do SETE e informações do sistema
const figlet = require("figlet");

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
const sqliteDB = require("knex")({
    client: "sqlite3",
    connection: {
        filename: dbPath,
    },
    useNullAsDefault: true,
});
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

    // Desabilita e esconde menu
    // appWindow.setMenu(null);
    appWindow.setMenuBarVisibility(false);

    // Agora carrega a página de login do SETE
    // Vamos verificar se estamos usando proxy
    const usingProxy = appconfig.get("PROXY_USE");

    if (!usingProxy) {
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
    appWindow.webContents.openDevTools();

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

// Carrega módulo de configuração do Proxy
const Proxy = require("./main/proxy/proxy.js");

// Worker que vai lidar com a parte de roteirização
let routeOptimizer = new RouteOptimization(app, dbPath);

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

    let arqDestino = dialog.showSaveDialogSync(win, {
        title: "Salvar Planilha Exemplo",
        buttonLabel: "Salvar",
        filters: [{ name: "XLSX", extensions: ["xlsx"] }],
    });

    if (arqDestino != "" && arqDestino != undefined) {
        let arqOrigem = path.join(__dirname, "templates", "FormatoImportacaoAluno.xlsx");
        fs.copySync(arqOrigem, arqDestino);
        Swal2.fire({
            icon: "success",
            title: "Planilha baixada com sucesso",
        });
        salvou = true;
    }

    return salvou;
}

// Evento chamado para atualizar a malha
// Evento para atualizar malha
function handleSalvarNovaMalha(event) {
    const malha = new MalhaUpdate(newOSMFile, dbPath);
    let promessa = new Promise();
    malha
        .update()
        .then(() => {
            appconfig.delete("OD");
            promessa.resolve();
        })
        .catch(() => {
            promessa.reject();
        });

    return promessa;
}

// Evento que inicia a geração de rotas (feito de forma assíncrona para não bloquear o processo principal)
function onIniciaGeracaoRotas(event, routingArgs) {
    let cachedODMatrix = appconfig.get("OD", {
        nodes: {},
        dist: {},
        cost: {},
    });

    cachedODMatrix = {
        nodes: {},
        dist: {},
        cost: {},
    };

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
    appWindow.webContents.send("sete:finaliza-geracao-rotas", optRoutes);
}

// Evento chamado pelo nosso worker quando ele encontra um erro ao gerar a rota
function onWorkerObtemErroGeracaoRotas(err) {
    appWindow.webContents.send("sete:erro-geracao-rotas", err);
}

// Registro dos listeners
function createListeners() {
    ipcMain.on("abrir:site", onAbrirSite);
    ipcMain.handle("salvar:planilha-modelo", handleSalvarPlanilhaModelo);
    ipcMain.handle("salvar:nova-malha", handleSalvarNovaMalha);

    ipcMain.on("worker:inicia-geracao-rotas", onIniciaGeracaoRotas);
    app.on("worker:finaliza-geracao-rotas", onWorkerFinalizarGeracaoRotas);
    app.on("worker:obtem-erro-geracao-rotas", onWorkerObtemErroGeracaoRotas);
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
