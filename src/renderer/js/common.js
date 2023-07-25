// common.js
// Este arquivo contém imports e rotinas comuns a todas as telas do software
// Aqui é importado (biblioteca) e definido (funções):
// - bibliotecas do Electron
// - funções de manipulação de arquivo (fs)
// - funções de navegação do sistema de arquivo (path/userData)
// - funções de navegação interna do sete (dashboard)
// - funções para criar notificações (erro, pergunta, etc) com SweetAlert2
// - funções que retornam as opções comuns dos wizards e de validação dos formulários

// Variáveis Basicas
const appTitle = "SETE - Software Eletrônico de Gestão do Transporte Escolar";
let appVersion = (typeof sete != "undefined") ? "DESKTOP" : "WEB";

var userData = {};
var userRole = "";
var userconfig;

// Variáveis globais utilizadas para navegação
var lastPage = "./dashboard-main.html";
var currentPage = "./dashboard-main.html";

// Variáveis do electron
var electron, app, ipcRenderer, remote, shell, dialog, win, versao, path, userDataDir;
var htmlToImage;

// Var que indica se estamos ou não no Electron (desktop)
var isElectron = window?.sete?.isElectron;

// Rodando via browser
userconfig = {
    get: (key) => localStorage.getItem(key),
    set: (key, value) => localStorage.setItem(key, value),
    delete: (key) => localStorage.removeItem(key),
    clear: () => localStorage.clear(),
    keys: () => Object.keys(localStorage),
};

fetch("../../package.json")
    .then((res) => res.json())
    .then((res) => {
        let vs = res?.version;
        versao = "SETE WEB " + vs;
    });

// Verifica se estamos ou não rodando no Electron
if (isElectron) {
    // // Rodando via Electron
    // // Imports Principais do Electron
    // electron = require("electron");
    // ipcRenderer = electron.ipcRenderer;
    // remote = electron.remote;
    // shell = electron.shell;
    // app = remote.app;
    // dialog = remote.dialog;
    // win = remote.getCurrentWindow();
    // versao = app.getVersion();
    // // Imports de I/O do NodeJS
    // fs = require("fs-extra");
    // // Imports de Armazenamento
    // var Store = require("electron-store");
    // userconfig = new Store();
    // // Imports de biblioteca de caminhos (para acessar e navegar no sistema de arquivos)
    // // app.getPath retorna a pasta do SO que armazina os dados de configuração do app
    // path = require("path");
    // userDataDir = app.getPath("userData");
    // // HTML To Image
    // htmlToImage = require("html-to-image");
} else {
}

// Previne click do meio no desktop
// Apenas no electron

// StackOverflow bug: https://stackoverflow.com/questions/49164924/electron-prevent-multiple-instance-with-middle-click
// The following function will catch all non-left (middle and right) clicks
function handleNonLeftClick(e) {
    // e.button will be 1 for the middle mouse button.
    if (e.button === 1) {
        e.preventDefault();
    }
}

if (isElectron) {
    window.onload = () => {
        // Attach the listener to the whole document.
        document.addEventListener("auxclick", handleNonLeftClick);
    };
}

// Função de Navegação Dash
function navigateDashboard(target) {
    lastPage = currentPage;
    currentPage = target;
    desabilitaMenu();
    $("#content").load(target);
    window.scrollTo(0, 0);
}

// Função de Navegação do Software
function navigatePage(target) {
    desabilitaMenu();
    document.location.href = target;
}

// Função que converte uma lista em um mapa
function convertListToMap(list, campoID = "ID") {
    var mapa = new Map();
    list.forEach((l) => mapa.set(String(l[campoID]), l));

    return mapa;
}

// Estrutura básica de validação dos formulários
function templateWizardValidacao() {
    return {
        highlight: function (element) {
            $(element).closest(".form-group").removeClass("has-success").addClass("has-error");
            $(element).closest(".form-check").removeClass("has-success").addClass("has-error");
        },
        success: function (element) {
            $(element).closest(".form-group").removeClass("has-error").addClass("has-success");
            $(element).closest(".form-check").removeClass("has-error").addClass("has-success");
        },
        errorPlacement: function (error, element) {
            $(element).closest(".form-group").append(error).addClass("has-error");
        },
    };
}

// Estrutura básica dos formulários wizard
function configWizardBasico(idElemento, usarValidador = true) {
    return {
        tabClass: "nav nav-pills",
        nextSelector: ".btn-next",
        previousSelector: ".btn-back",

        onNext: function (tab, navigation, index) {
            if (usarValidador) {
                var $valid = $(idElemento).valid();
                if (!$valid) {
                    validadorFormulario.focusInvalid();
                    return false;
                } else {
                    window.scroll(0, 0);
                }
            } else {
                window.scroll(0, 0);
                return true;
            }
        },

        onTabClick: function (tab, navigation, index) {
            if (usarValidador) {
                var $valid = $(idElemento).valid();
                if (!$valid) {
                    return false;
                } else {
                    window.scroll(0, 0);
                    return true;
                }
            } else {
                window.scroll(0, 0);
                return true;
            }
        },

        onTabShow: function (tab, navigation, index) {
            var $total = navigation.find("li").length;
            var $current = index + 1;

            var $wizard = navigation.closest(".card-wizard");

            // If it's the last tab then hide the last button and show the finish instead
            if ($current >= $total) {
                $($wizard).find(".btn-next").hide();
                $($wizard).find(".btn-finish").show();
            } else {
                $($wizard).find(".btn-next").show();

                $($wizard).find(".btn-finish").hide();
            }
        },
    };
}

function onlynumber(evt) {
    var theEvent = evt || window.event;
    var key = theEvent.keyCode || theEvent.which;
    key = String.fromCharCode(key);
    //var regex = /^[0-9.,]+$/;
    var regex = /^[0-9.]+$/;
    if (!regex.test(key)) {
        theEvent.returnValue = false;
        if (theEvent.preventDefault) theEvent.preventDefault();
    }
}

// https://stackoverflow.com/questions/175739/built-in-way-in-javascript-to-check-if-a-string-is-a-valid-number
function isNumeric(str) {
    if (typeof str != "string") return false; // we only process strings!
    return (
        !isNaN(str) && // use type coercion to parse the _entirety_ of the string (`parseFloat` alone does not do this)...
        !isNaN(parseFloat(str))
    ); // ...and ensure strings of whitespace fail
}

function strToNumber(str) {
    if (String(str).includes(".") && String(str).includes(",")) {
        return Number(String(str).replace(".", "").replace(",", "."));
    } else if (String(str).includes(".") && !String(str).includes(",")) {
        return Number(String(str));
    } else {
        return Number(String(str).replace(".", "").replace(",", "."));
    }
}

function numberToMoney(num) {
    return Number(Number(num).toFixed(2)).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function mostraSeTemUpdate(modal = true) {
    fetch(PACKAGE_JSON)
        .then((res) => res.json())
        .then(async (pkg) => {
            if (typeof sete != 'undefined') {
                if (sete?.isElectron) {
                    let currVersion = await sete.APP_VERSION();
                    appVersion = currVersion;
                    let remoteVersion = pkg.version;
    
                    if (currVersion != remoteVersion) {
                        $.notifyClose();
                        $.notify(
                            {
                                icon: "ml-1 fa fa-cloud-download menu-icon",
                                title: "Saiu uma nova versão do SETE",
                                message: "Clique aqui para entrar na página do SETE",
                                url: "https://transportes.fct.ufg.br/p/31448-sete-sistema-eletronico-de-gestao-do-transporte-escolar",
                                target: "_blank",
                            },
                            {
                                type: "warning",
                                delay: 0,
                            }
                        );
                    }
                }
            }
        });
}

function truncateText(str, n = 50) {
    return str.substr(0, n - 1) + (str.length > n ? "&hellip;" : "");
}

// Pega o Tipo do Objeto
function typeOf(obj) {
    return {}.toString.call(obj).split(" ")[1].slice(0, -1).toLowerCase();
}
