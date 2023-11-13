/**
 * SETE Desktop: renderer/modules/rota-sugestao-ctrl.js
 *
 * Script de controle da tela de reaproveitamento de rotas.
 * A tela mostrará um wizard, one a primeira etapa permitirá o usuário parametrizar a ferramenta.
 * A segunda tela mostrará o resultado da simulação.
 * Por fim, deve-se permitir que o usuário salve os alunos para a rota de aproveitamento.
 */

// Mapas (config = para parametrização, rotagerada = para simulação)
var mapaConfig = novoMapaOpenLayers("mapaRotaReaproveitamentoConfig", cidadeLatitude, cidadeLongitude);
var mapaRotaGerada = novoMapaOpenLayers("mapaRotaSugestaoGerada", cidadeLatitude, cidadeLongitude);

// Rotina para atualizar os mapas quando a tela redimensionar
window.onresize = function () {
    setTimeout(function () {
        if (mapaConfig != null) {
            mapaConfig["map"].updateSize();
        }
        if (mapaRotaGerada != null) {
            mapaRotaGerada["map"].updateSize();
        }
    }, 200);
};

// Escolheu a rota a ser analisada?
var escolheuRota = false;
var idRotaSelecionada = 0;

// Variáveis que armazenará todos os usuários e escolas que podem utilizar a ferramenta
var alunoMap = new Map(); // Mapa que associa id aluno -> dados do aluno
var escolaMap = new Map(); // Mapa que associa id escola -> dados da escola
var rotasMap = new Map(); // Mapa que associa id rota -> dados da rota
var nomeEscolaMap = new Map(); // Mapa que associa nome escola -> dados da escola

// Variáveis que contém apenas os usuários escolhidos para o processo de simulação
var alunosRota = [];
var demaisAlunos = [];
var alunosParaAproveitamento = [];
var escolasRota = [];
var demaisEscolas = [];

// Máscaras
$(".horamask").mask("00:00");

////////////////////////////////////////////////////////////////////////////////
// Init da tela
////////////////////////////////////////////////////////////////////////////////

function startTool() {
    criarModalLoading("Preparando a ferramenta");
    preprocessarEscolas()
        .then(() => preprocessarRotas())
        .then(() => preprocessarAlunos())
        .then(() => {
            // faz seleção inicial e finaliza modal
            $("#turnoManhaTarde").trigger("click");
            Swal2.close();
        })
        .catch((err) => {
            let code = err.code;
            if (code == "erro:malha") {
                informarNaoExistenciaDado("Malha não cadastrada", "Cadastrar malha", "a[name='rota/rota-malha-view']", "#veiculoMenu");
            } else if (code == "erro:aluno") {
                informarNaoExistenciaDado("Não há nenhum aluno georeferenciado", "Gerenciar alunos", "a[name='aluno/aluno-listar-view']", "#alunoMenu");
            } else if (code == "erro:escola") {
                informarNaoExistenciaDado("Não há nenhuma escola georeferenciada", "Gerenciar escolas", "a[name='escola/escola-listar-view']", "#escolaMenu");
            } else if (code == "erro:rota") {
                informarNaoExistenciaDado("Não há nenhuma rota digitalizada", "Gerenciar rotas", "a[name='rota/rota-listar-view']", "#rotaMenu");
            } else if (code == "erro:vinculo") {
                informarNaoExistenciaDado("As escolas dos alunos escolhidos não estão georeferenciadas", "Gerenciar escolas", "a[name='escola/escola-listar-view']", "#escolaMenu");
            } else {
                criarModalErro(`Erro ao utilizar a ferramenta de sugestão de rotas. Entre em contato com a equipe de suporte`);
            }
        });
}

// Informar não existência de dado
var informarNaoExistenciaDado = (titulo, msgConfirmacao, pagCadastroDado, pagMenu) => {
    return Swal2.fire({
        title: titulo,
        text: "Para utilizar a ferramenta de sugestão de rotas é necessário realizar esta ação antes",
        icon: "error",
        showCancelButton: true,
        confirmButtonColor: "#3085d6",
        cancelButtonColor: "#d33",
        cancelButtonText: "Retornar",
        confirmButtonText: msgConfirmacao,
    }).then((result) => {
        if (result.value) {
            $(pagCadastroDado).trigger("click");
            $(pagMenu).collapse();
        } else {
            navigateDashboard("./dashboard-main.html");
        }
    });
};

// Preprocessa alunos
async function preprocessarAlunos() {
    let numAlunosTemGPS = 0;
    let numEscolasTemGPS = 0;

    let alunos = [];
    try {
        alunos = await restImpl.dbGETColecao(DB_TABLE_ALUNO);

        for (let alunoRaw of alunos) {
            let alunoJSON = parseAlunoREST(alunoRaw);

            if (
                alunoJSON["LOC_LATITUDE"] != "" &&
                alunoJSON["LOC_LONGITUDE"] != "" &&
                alunoJSON["LOC_LATITUDE"] != undefined &&
                alunoJSON["LOC_LONGITUDE"] != undefined &&
                alunoJSON["LOC_LATITUDE"] != null &&
                alunoJSON["LOC_LONGITUDE"] != null
            ) {
                alunoJSON["GPS"] = true;
                numAlunosTemGPS++;
            } else {
                alunoJSON["GPS"] = false;
            }

            // Verifica escola do aluno
            if (alunoJSON["ESCOLA"] && nomeEscolaMap.has(alunoJSON["ESCOLA"])) {
                let escolaJSON = nomeEscolaMap.get(alunoJSON["ESCOLA"]);
                alunoJSON["TEM_ESCOLA"] = true;
                alunoJSON["ESCOLA_ID"] = escolaJSON["ID"];
                alunoJSON["ESCOLA_NOME"] = escolaJSON["NOME"];

                if (escolaJSON["GPS"]) {
                    alunoJSON["ESCOLA_TEM_GPS"] = true;
                    numEscolasTemGPS++;
                } else {
                    alunoJSON["ESCOLA_TEM_GPS"] = false;
                }

                if (alunoJSON["GPS"]) {
                    escolaJSON["TEM_ALUNO_COM_GPS"] = true;
                }

                escolaMap.set(String(escolaJSON["ID"]), escolaJSON);
                nomeEscolaMap.set(String(escolaJSON["NOME"]), escolaJSON);
            } else {
                alunoJSON["TEM_ESCOLA"] = false;
                alunoJSON["ESCOLA_ID"] = false;
                alunoJSON["ESCOLA_NOME"] = "Não está vinculado";
                alunoJSON["ESCOLA_TEM_GPS"] = false;
            }

            // Verifica rota do aluno
            if (alunoJSON["ROTA"] == "Sim") {
                try {
                    let rotasDoAluno = await restImpl.dbGETEntidade(DB_TABLE_ALUNO, `/${alunoJSON["ID"]}/rota`);
                    let idRotasDoAluno = rotasDoAluno.data.map((r) => r.id_rota);
                    let nomeDasRotas = idRotasDoAluno.map((k) => rotasMap.get(k).nome).join(",");
                    alunoJSON["TEM_ROTA"] = true;
                    alunoJSON["ROTA_ID"] = idRotasDoAluno;
                    alunoJSON["ROTA_NOME"] = nomeDasRotas;
                } catch (error) {
                    alunoJSON["TEM_ROTA"] = false;
                    alunoJSON["ROTA_ID"] = "";
                    alunoJSON["ROTA_NOME"] = "";
                }
            } else {
                alunoJSON["TEM_ROTA"] = false;
                alunoJSON["ROTA_ID"] = "";
                alunoJSON["ROTA_NOME"] = "";
            }

            alunoMap.set(String(alunoJSON["ID"]), alunoJSON);
        }
    } catch (err) {
        alunos = [];
    }

    if (numAlunosTemGPS == 0) {
        return Promise.reject({ code: "erro:aluno" });
    } else if (numEscolasTemGPS == 0) {
        return Promise.reject({ code: "erro:escola" });
    } else {
        return alunoMap;
    }
}

// Preprocessa escolas
async function preprocessarEscolas() {
    let numTemGPS = 0;

    try {
        let escolas = await restImpl.dbGETColecao(DB_TABLE_ESCOLA);

        for (let escolaRaw of escolas) {
            let escolaJSON = parseEscolaREST(escolaRaw);

            if (
                escolaJSON["LOC_LATITUDE"] != "" &&
                escolaJSON["LOC_LONGITUDE"] != "" &&
                escolaJSON["LOC_LATITUDE"] != undefined &&
                escolaJSON["LOC_LONGITUDE"] != undefined &&
                escolaJSON["LOC_LATITUDE"] != null &&
                escolaJSON["LOC_LONGITUDE"] != null
            ) {
                escolaJSON["GPS"] = true;
                numTemGPS++;
            } else {
                escolaJSON["GPS"] = false;
            }
            escolaJSON["TEM_ALUNO_COM_GPS"] = false;

            escolaMap.set(String(escolaJSON["ID"]), escolaJSON);
            nomeEscolaMap.set(escolaJSON["NOME"], escolaJSON);
        }
    } catch (err) {
        numTemGPS = 0;
    }

    if (numTemGPS == 0) {
        return Promise.reject({ code: "erro:escola" });
    } else {
        return escolaMap;
    }
}

// Preprocessa rotas
async function preprocessarRotas() {
    try {
        let numRotasComShape = 0;
        let rotas = await restImpl.dbGETColecao(DB_TABLE_ROTA);

        for (let rotaRaw of rotas) {
            try {
                let rotaID = rotaRaw["id_rota"];
                let rotaDetalheRaw = await restImpl.dbGETEntidade(DB_TABLE_ROTA, `/${rotaID}`);
                let rotaShape = await restImpl.dbGETEntidade(DB_TABLE_ROTA, `/${rotaID}/shape`);
                let rotaAlunos = await restImpl.dbGETEntidade(DB_TABLE_ROTA, `/${rotaID}/alunos`);

                let rotaJSON = parseRotaDBREST(rotaDetalheRaw);
                rotaJSON["SHAPE"] = rotaShape.data.shape;
                rotaJSON["ALUNOS"] = rotaAlunos.data;
                rotaJSON["NUM_ALUNOS"] = rotaAlunos?.data?.length;

                rotasMap.set(rotaID, rotaJSON);
                numRotasComShape++;
            } catch (errShape) {
                console.log(rotaRaw["id_rota"] + " não possui shape");
            }
        }

        if (numRotasComShape == 0) {
            return Promise.reject({ code: "erro:rota" });
        }
    } catch (err) {
        return Promise.reject({ code: "erro:rota" });
    }
}

// Plotar Rotas
$("#listarotas").on("change", async (evt) => {
    if (evt.currentTarget.value == "") {
        escolheuRota = false;
    } else {
        idRotaSelecionada = Number(evt.currentTarget.value);
        escolheuRota = true;
        mostraDadosRota(idRotaSelecionada);

        mapaConfig["vectorSource"].clear();
        filtraAlunosEscolasDaRota(idRotaSelecionada);
        drawAlunos(demaisAlunos, mapaConfig, "img/icones/aluno-marcador-v2.png", 0.5);
        drawEscolas(demaisEscolas, mapaConfig, 0.5);
        drawAlunos(alunosRota, mapaConfig);
        drawEscolas(escolasRota, mapaConfig);
        drawRota(idRotaSelecionada, mapaConfig);

        setTimeout(() => {
            mapaConfig["map"].getView().fit(mapaConfig["vectorSource"].getExtent(), {
                padding: [40, 40, 40, 40],
            });
        }, 300);
    }
});


function mostraDadosRota(idRotaSelecionada) {
    let rota = rotasMap.get(idRotaSelecionada);

    $("#dados-rota").empty();
    $("#dados-rota").append("<li><h6>Nome da Rota: " + rota.NOME + "</h6></li>");
    if (rota?.TEMPO) {
        $("#dados-rota").append("<li><h6>Distância: " + rota.KM + " km</h6></li>");
    } else {
        $("#dados-rota").append("<li><h6>Distância: Não definido</h6></li>");
    }
    if (rota?.TEMPO) {
        $("#dados-rota").append("<li><h6>Tempo: " + rota?.TEMPO + " min</h6></li>");
    } else {
        $("#dados-rota").append("<li><h6>Tempo: Não definido</h6></li>");
    }
}

function filtraAlunosEscolasDaRota(idRotaSelecionada) {
    // Verifica se é para mostrar apenas as rotas da manhã/tarde ou de tarde/noite
    let filtroTurno = Number($("input[name='turno']:checked").val());
    let filtroAnaliseManhaTarde = filtroTurno == 1 ? true : false;

    let rota = rotasMap.get(idRotaSelecionada);
    let alunosRotaRaw = rota["ALUNOS"];
    let arrAlunosRota = [];
    let arrDemaisAlunos = [];

    // Filtrar alunos e escolas pertinentes
    let alunosRotaSet = new Set(alunosRotaRaw.map((a) => a.id_aluno));
    let escolasRotaSet = new Set();
    let demaisEscolasSet = new Set();

    alunoMap.forEach((aluno) => {
        let alunoFiltrado = false;
        if (alunosRotaSet.has(aluno.id_aluno)) {
            alunoFiltrado = aluno["GPS"];
        } else if (filtroAnaliseManhaTarde) {
            // manhã-tarde
            alunoFiltrado = aluno["GPS"] && aluno["ESCOLA_TEM_GPS"] && (aluno["TURNO"] == 2 || aluno["TURNO"] == 3);
        } else {
            // noturno
            alunoFiltrado = aluno["GPS"] && aluno["ESCOLA_TEM_GPS"] && aluno["TURNO"] == 4;
        }

        if (alunoFiltrado) {
            if (!alunosRotaSet.has(aluno.id_aluno)) {
                arrDemaisAlunos.push(aluno);
                demaisEscolasSet.add(aluno["ESCOLA_ID"]);
            } else {
                arrAlunosRota.push(aluno);
                escolasRotaSet.add(aluno["ESCOLA_ID"]);
            }
        }
        return alunoFiltrado;
    });

    alunosRota = mapeiaAlunosParaDadoEspacial(arrAlunosRota);
    demaisAlunos = mapeiaAlunosParaDadoEspacial(arrDemaisAlunos);

    escolasRota = mapeiaEscolasParaDadoEspacial([...escolaMap].filter((e) => escolasRotaSet.has(e[1]["ID"])));
    demaisEscolas = mapeiaEscolasParaDadoEspacial([...escolaMap].filter((e) => demaisEscolasSet.has(e[1]["ID"])));
}

// Filtrar os alunos e escolas que estão georeferenciados
function processarVinculoAlunoEscolas(res) {
    let numVinculo = 0;
    let escolasVinculo = new Array();
    for (let vinculoRaw of res) {
        let aID = String(vinculoRaw["ID_ALUNO"]);
        let eID = String(vinculoRaw["ID_ESCOLA"]);
        let eNome = vinculoRaw["NOME"];

        let alunoJSON = alunoMap.get(aID);
        alunoJSON["ESCOLA_ID"] = eID;
        alunoJSON["ESCOLA_NOME"] = eNome;

        // Verificar se escola do aluno está georeferenciada
        let escolaAluno = escolaMap.get(String(eID));

        if (escolaAluno && escolaAluno["GPS"]) {
            alunoJSON["ESCOLA_TEM_GPS"] = true;
            alunoMap.set(aID, alunoJSON);

            escolaAluno["TEM_ALUNO_COM_GPS"] = true;
            escolaMap.set(String(eID), escolaAluno);

            numVinculo++;
            escolasVinculo.push(eNome);
        }
    }

    if (numVinculo == 0) {
        Promise.reject({ code: "erro:vinculo", data: escolasVinculo.join(", ") });
    } else {
        return alunoMap;
    }
}

// Filtrar os alunos que já possuem rota
function processarVinculoAlunoRota(res) {
    for (let vinculoRaw of res) {
        let aID = String(vinculoRaw["ID_ALUNO"]);
        let rID = String(vinculoRaw["ID_ROTA"]);
        let rNome = vinculoRaw["NOME"];

        let alunoJSON = alunoMap.get(aID);
        alunoJSON["TEM_ROTA"] = true;
        alunoJSON["ROTA"] = true;
        alunoJSON["ROTA_ID"] = rID;
        alunoJSON["ROTA_NOME"] = rNome;

        alunoMap.set(aID, alunoJSON);
    }
    return alunoMap;
}

function mapeiaAlunosParaDadoEspacial(arr) {
    return arr.map((a) => ({
        key: a["ID_ALUNO"],
        id: a["ID_ALUNO"],
        tipo: "aluno",
        nome: a["NOME"],
        lat: a["LOC_LATITUDE"],
        lng: a["LOC_LONGITUDE"],
        turno: a["TURNOSTR"],
        nivel: a["NIVELSTR"],
        temEscola: a["TEM_ESCOLA"],
        nomeRota: a["ROTA_NOME"],
        temRota: a["ROTA"],
        school: String(a["ESCOLA_ID"]),
        escolaID: String(a["ESCOLA_ID"]),
        escolaNome: a["ESCOLA_NOME"],
        escolaTemGPS: a["ESCOLA_TEM_GPS"] ? "Sim" : "Não",
        passengers: 1,
    }));
}

function mapeiaEscolasParaDadoEspacial(mapaEscolas) {
    let escolasArray = [];
    mapaEscolas.forEach(([eID, e]) => {
        if (e["GPS"] && e["TEM_ALUNO_COM_GPS"]) {
            escolasArray.push({
                key: eID,
                tipo: "escola",
                nome: e["NOME"],
                localizacao: e["LOCALIZACAO"],
                ensino: e["ENSINO"],
                horario: e["HORARIO"],
                lat: e["LOC_LATITUDE"],
                lng: e["LOC_LONGITUDE"],
            });
        }
    });

    return escolasArray;
}


///////////////////////////////////////////////////////////////////////////////
// Rotinas de desenho no mapa
///////////////////////////////////////////////////////////////////////////////

function drawAlunos(arrAlunos, camada, imgAluno = "img/icones/aluno-marcador.png", imgOpacity = 1) {
    arrAlunos.forEach((a) => {
        let p = new ol.Feature({
            ...a,
            geometry: new ol.geom.Point(ol.proj.fromLonLat([a["lng"], a["lat"]])),
        });
        p.setStyle(
            new ol.style.Style({
                image: new ol.style.Icon({
                    anchor: [12, 37],
                    anchorXUnits: "pixels",
                    anchorYUnits: "pixels",
                    opacity: imgOpacity,
                    src: imgAluno,
                }),
            })
        );
        camada["vectorSource"].addFeature(p);
    });
}

function drawEscolas(arrEscolas, camada, imgOpacity) {
    arrEscolas.forEach((e) => {
        let p = new ol.Feature({
            ...e,
            geometry: new ol.geom.Point(ol.proj.fromLonLat([e["lng"], e["lat"]])),
        });
        p.setStyle(
            new ol.style.Style({
                image: new ol.style.Icon({
                    anchor: [12, 37],
                    anchorXUnits: "pixels",
                    anchorYUnits: "pixels",
                    opacity: imgOpacity,
                    src: "img/icones/escola-marcador.png",
                }),
            })
        );
        camada["vectorSource"].addFeature(p);
    });
}

function drawRota(idRota, camada) {
    let rota = rotasMap.get(idRota);
    let rotaCor = "#1caac7";
    let rotaGeoJSON = new ol.format.GeoJSON().readFeatures(rota["SHAPE"]);

    rotaGeoJSON.forEach((f) => {
        f.set("nome", rota["NOME"]);
        f.set("km", rota["KM"]);
        f.set("tempo", rota["TEMPO"] != "" ? rota["TEMPO"] : "Não");
        f.set("num_alunos", rota["NUM_ALUNOS"]);
        f.set("tipo", "rota");
    });

    let rotaStyles = [
        new ol.style.Style({
            stroke: new ol.style.Stroke({
                color: "white",
                width: 7,
            }),
        }),
        new ol.style.Style({
            stroke: new ol.style.Stroke({
                color: rotaCor,
                width: 5,
            }),
        }),
    ];

    camada["vectorSource"].addFeatures(rotaGeoJSON);
    camada["vectorLayer"].setStyle(rotaStyles);
    camada["vectorLayer"].setZIndex(2);
}

///////////////////////////////////////////////////////////////////////////////
// Popup
///////////////////////////////////////////////////////////////////////////////
var selectConfig = new ol.interaction.Select({
    hitTolerance: 5,
    multi: false,
    condition: ol.events.condition.singleClick,
    filter: (feature, layer) => {
        if (
            (feature.getGeometry().getType() == "Point" && (feature.getProperties().tipo == "aluno" || feature.getProperties().tipo == "escola")) ||
            (feature.getGeometry().getType() == "LineString" && feature.getProperties().tipo == "rota")
        ) {
            return true;
        } else {
            return false;
        }
    },
});
mapaConfig["map"].addInteraction(selectConfig);
mapaRotaGerada["map"].addInteraction(selectConfig);

var popupConfig = new ol.Overlay.PopupFeature({
    popupClass: "default anim",
    select: selectConfig,
    closeBox: true,
    template: {
        title: (elem) => {
            return elem.get("nome") || elem.get("NOME");
        },
        attributes: {
            nivel: {
                title: "Série",
                visible: (e) => e.getProperties().tipo == "aluno",
            },
            turno: {
                title: "Turno",
                visible: (e) => e.getProperties().tipo == "aluno",
            },
            nomeRota: {
                title: "Nome da Rota",
                visible: (e) => e.getProperties().tipo == "aluno",
            },
            temRota: {
                title: "Tem Rota?",
                visible: (e) => e.getProperties().tipo == "aluno",
            },
            escolaNome: {
                title: "Escola",
                visible: (e) => e.getProperties().tipo == "aluno",
            },
            escolaTemGPS: {
                title: "Escola possui GPS?",
                visible: (e) => e.getProperties().tipo == "aluno",
            },
            ensino: {
                title: "Níveis",
                visible: (e) => e.getProperties().tipo == "escola",
            },
            horario: {
                title: "Horário de Funcionamento",
                visible: (e) => e.getProperties().tipo == "escola",
            },
            localizacao: {
                title: "Localização",
                visible: (e) => e.getProperties().tipo == "escola",
            },
            km: {
                title: "Tamanho da Rota",
                before: "",
                format: ol.Overlay.PopupFeature.localString(),
                after: " km",
                visible: (e) => e.getProperties().tipo == "rota",
            },
            tempo: {
                title: "Tempo estimado",
                before: "",
                format: ol.Overlay.PopupFeature.localString(),
                after: " min",
                visible: (e) => e.getProperties().tipo == "rota",
            },
            num_alunos: {
                title: "Número de alunos",
                visible: (e) => e.getProperties().tipo == "rota",
            },
        },
    },
});
mapaConfig["map"].addOverlay(popupConfig);
mapaRotaGerada["map"].addOverlay(popupConfig);

var selectRoute = new ol.interaction.Select({
    hitTolerance: 5,
    multi: false,
    condition: ol.events.condition.singleClick,
    filter: (feature, layer) => {
        if (feature.getGeometry().getType() == "LineString") {
            pickedRoute = feature.get("pickedRoute");
            pickedRouteLength = feature.get("pickedRouteLength");
            return true;
        } else {
            return false;
        }
    },
});
mapaRotaGerada["map"].addInteraction(selectRoute);

var popup = new ol.Overlay.PopupFeature({
    popupClass: "default anim",
    select: selectRoute,
    closeBox: true,
    template: {
        title: (elem) => {
            return "Rota " + elem.get("rota");
        },
        attributes: {
            numPassengers: {
                title: "Número de Passageiros",
            },
            travDistance: {
                title: "Tamanho da Rota", // attribute's title
                before: "", // something to add before
                format: ol.Overlay.PopupFeature.localString(), // format as local string
                after: " km", // something to add after
            },
            estTime: {
                title: "Tempo estimado", // attribute's title
                before: "", // something to add before
                format: ol.Overlay.PopupFeature.localString(), // format as local string
                after: " min", // something to add after
            },
        },
    },
});
mapaRotaGerada["map"].addOverlay(popup);

//////////////////////////////////////////////////////////////
// Realiza a Simulação
//////////////////////////////////////////////////////////////

function ordenaAlunosPorDistEscola(params) {
    // Ordena os alunos pela distância a escola
    let meanLat = params.escolasRota.map((e) => Number(e.lat)).reduce((acc, cur) => (acc = acc + cur), 0) / params.escolasRota.length;
    let meanLng = params.escolasRota.map((e) => Number(e.lng)).reduce((acc, cur) => (acc = acc + cur), 0) / params.escolasRota.length;
    let pontoEscola = turf.point([meanLng, meanLat]);

    params.demaisAlunos.sort((a, b) => {
        let pontoA = turf.point([Number(a.lng), Number(a.lat)]);
        let pontoB = turf.point([Number(b.lng), Number(b.lat)]);
        let distA = turf.distance(pontoA, pontoEscola);
        let distB = turf.distance(pontoB, pontoEscola);
        if (distA < distB) {
            return 1; // vêm depois
        } else if (distA > distB) {
            return -1;
        } else {
            return 0;
        }
    });

    return params.demaisAlunos;
}

function filtraAlunosQuePodemSerAproveitados(rota, arrDemaisAlunos, params) {
    // Agora, vamos analisar os alunos por rota
    let shp = rota.SHAPE;
    let shpJS = JSON.parse(shp);
    let shpWGS84 = turf.toWgs84(shpJS);
    let shpLineString = shpWGS84.features.filter((f) => f?.geometry?.type == "LineString").flatMap((f) => f?.geometry?.coordinates);

    let arrFiltro = [];
    let escolasRota = new Set(params.escolasRota.map((e) => Number(e.key)));
    let capacidade = params.maxCapacity;

    for (let aluno of arrDemaisAlunos) {
        let alunoPoint = turf.point([aluno.lng, aluno.lat]);
        let alunoDist = turf.pointToLineDistance(alunoPoint, shpLineString);

        // distance é retornada em km (por isso multiplicamos por 1000)
        // escola deve ser a mesma que a rota atende
        if (alunoDist * 1000 < params.maxTravDist && escolasRota.has(Number(aluno.escolaID)) && capacidade > 0) {
            arrFiltro.push(aluno);
            capacidade--;
        }
    }

    return arrFiltro;
}

// Trigger para Iniciar Simulação
function initSimulation() {
    // criarModalLoading("Simulando...");

    // Juntar dados em um objeto
    let params = {
        turno: Number($("input[name='turno']:checked").val()),
        maxTravDist: Number($("#maxDist").val()),
        maxCapacity: Number($("#maxCapacity").val()),
        busSpeed: Number($("#velMedia").val()) / 3.6, // converte de km/h para m/s
        rotasManha: [...rotasMap.keys()].filter((e) => rotasMap.get(e).turno_matutino == "S"),
        rotasTarde: [...rotasMap.keys()].filter((e) => rotasMap.get(e).turno_vespertino == "S"),
        rotasNoturno: [...rotasMap.keys()].filter((e) => rotasMap.get(e).turno_noturno == "S"),
        alunosRota,
        demaisAlunos,
        escolasRota,
        demaisEscolas,
    };

    let rota = rotasMap.get(idRotaSelecionada);

    let arrDemaisAlunos = ordenaAlunosPorDistEscola(params);
    alunosParaAproveitamento = filtraAlunosQuePodemSerAproveitados(rota, arrDemaisAlunos, params);

    // Desenha resultado
    mapaRotaGerada["vectorSource"].clear();
    drawAlunos(params.alunosRota, mapaRotaGerada);
    drawAlunos(alunosParaAproveitamento, mapaRotaGerada, "img/icones/aluno-marcador-v3.png");
    drawEscolas(params.escolasRota, mapaRotaGerada);
    drawRota(rota.id_rota, mapaRotaGerada);

    setTimeout(() => {
        mapaRotaGerada["map"].updateSize();
        mapaRotaGerada["map"].getView().fit(mapaRotaGerada["vectorSource"].getExtent(), {
            padding: [40, 40, 40, 40],
        });
        Swal2.close();
    }, 300);

    // window.sete.iniciaGeracaoRotas(routeGenerationInputData);
}

////////////////////////////////////////////////////////////////////////////////
// Validar Formulário
////////////////////////////////////////////////////////////////////////////////

// Mostra e esconde o campo para especificar a frota com base no input do usuário
$("input[name='tipoFrota']").on("click", (evt) => {
    if ($("#veiculosCustomizados").is(":checked")) {
        $("#divVeiculosCustomizados").show();
    } else {
        $("#divVeiculosCustomizados").hide();
    }
});

var validadorFormulario = $("#wizardSugestaoRotaForm").validate({
    rules: {
        turno: {
            required: true,
        },
        maxTime: {
            required: true,
            number: true,
            min: 1,
            max: 360,
        },
        maxDist: {
            required: true,
            number: true,
            min: 0,
            max: 10000,
        },
        velMedia: {
            required: true,
            number: true,
            min: 1,
            max: 120,
        },
        maxCapacity: {
            required: true,
            number: true,
            min: 1,
            max: 200,
        },
        horaFimTurno1: {
            required: true,
            horavalida: true,
        },
        horaInicioTurno2: {
            required: true,
            horavalida: true,
        },
    },
    messages: {
        turno: {
            required: "Por favor selecione o turno para análise",
        },
        maxTime: {
            required: "Por favor informe o tempo máximo desejado para cada rota",
            min: "Por favor selecione um valor acima de 0 minutos",
            max: "Por favor selecione um valor abaixo de 360 minutos (6 horas)",
        },
        maxDist: {
            required: "Por favor informe a distância máxima percorrida por rota",
            min: "Por favor selecione um valor acima de 0 km",
            max: "Por favor selecione um valor abaixo de 20 km",
        },
        velMedia: {
            required: "Por favor informe a velocidade média dos veículos",
            min: "Por favor selecione um valor acima de 0 km/h",
            max: "Por favor selecione um valor abaixo de 120 km/h",
        },
        maxCapacity: {
            required: "Por favor informe a capacidade máxima dos veículos",
            min: "Por favor selecione um valor acima de 0 assento",
            max: "Por favor selecione um valor abaixo de 100 assentos",
        },
    },
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
});

function validaDadosEscolhidos() {
    let formValido = true;
    let rota = rotasMap.get(idRotaSelecionada);

    // Verifica se escolheu rota
    if (!escolheuRota) {
        criarModalErro("Nenhuma rota escolhida", "Não é possível realizar o reaproveitamento de rotas.");
        formValido = false;
    } 
    // Verifica se rota tem escolas
    else if (escolasRota.length == 0) {
        criarModalErro("Rota não possuí escolas", "A rota escolhida não está vinculada a nenhuma escola.");
        formValido = false;
    }
    // Verifica se tem alunos e escolas escolhidas
    else if (demaisAlunos.length == 0) {
        criarModalErro(
            "Nenhum aluno georeferenciado neste caso",
            "Não é possível realizar o reaproveitamento de rotas. Para esta combinação de parâmetros não há nenhum aluno georeferenciado"
        );
        formValido = false;
    } 
    // Verifica se o turno final (ex: manhã) < turno início (ex: tarde)
    else if (moment($("#horaInicioTurno2").val(), "HH:mm", true).isSameOrBefore(moment($("#horaFimTurno1").val(), "HH:mm", true))) {
        criarModalErro("O horário de início do segundo turno é menor ou igual ao horário de fim do primeiro turno", "Problema no horário");
        formValido = false;
    }
    // Verifica se o tempo da rota é nulo
    else if (rota != null && (rota.TEMPO == 0 || rota.TEMPO == undefined || rota.TEMPO == null)) {
        criarModalErro("O tempo da rota é nulo ou zero", "Problema no horário");
        formValido = false;
    }
    // Verifica se o tempo entre os turnos é maior que o tempo da rota 2x (ida e volta)
    else if (rota != null &&
        moment($("#horaInicioTurno2").val(), "HH:mm", true).diff(moment($("#horaFimTurno1").val(), "HH:mm", true), "minutes")
        <= 
        2 * rota.TEMPO) {
        criarModalErro("O tempo de ida e volta da rota (" + 2 * rota.TEMPO + " min) " + 
                       " é maior que o intervalo entre os turnos (" + 
                       moment($("#horaInicioTurno2").val(), "HH:mm", true).diff(moment($("#horaFimTurno1").val(), "HH:mm", true), "minutes") + 
                       " min)",
        "Problema no horário");
        formValido = false;
    }

    // checa se os horários estão corretos
    return formValido;
}

$(".card-wizard").bootstrapWizard({
    tabClass: "nav nav-pills",
    nextSelector: ".btn-next",
    previousSelector: ".btn-back",

    onNext: function (tab, navigation, index) {
        var $valid = $("#wizardSugestaoRotaForm").valid();
        if (!$valid) {
            validadorFormulario.focusInvalid();
            return false;
        } else {
            // Após validação do form, vamos validar os dados no mapa
            if (validaDadosEscolhidos()) {
                window.scroll(0, 0);
                if (index == 1) {
                    initSimulation();
                    return true;
                }
            } else {
                return false;
            }
        }
    },

    onTabClick: function (tab, navigation, index) {
        var $valid = $("#wizardSugestaoRotaForm").valid();
        if (!$valid) {
            return false;
        } else {
            if (index == 1 && validaDadosEscolhidos()) {
                window.scroll(0, 0);
                return true;
            } else {
                return false;
            }
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
            startTool();
            $($wizard).find(".btn-next").show();
            $($wizard).find(".btn-finish").hide();
        }
    },
});

////////////////////////////////////////////////////////////////////////////////
// Replota selects
////////////////////////////////////////////////////////////////////////////////
function replotaSelectsDeRota() {
    // Verifica se é para mostrar apenas as rotas da manhã/tarde ou de tarde/noite
    let filtroTurno = Number($("input[name='turno']:checked").val());
    let filtroAnaliseManhaTarde = filtroTurno == 1 ? true : false;

    $("#listarotas").find("option").remove();
    $("#listarotas").append('<option value="">Selecione uma opção</option>');

    [...rotasMap.keys()]
        .sort((a, b) => {
            let nomeA = rotasMap.get(a)["NOME"]?.toLowerCase().trim();
            let nomeB = rotasMap.get(b)["NOME"]?.toLowerCase().trim();
            let parA = nomeA.split(" ");
            let parB = nomeB.split(" ");

            if (parA.length > 0 && parB.length > 0) {
                parA = parA[0];
                parB = parB[0];
                if (isNumeric(parA) && isNumeric(parB)) {
                    return parA - parB;
                }
            }
            return nomeA.localeCompare(nomeB);
        })
        .forEach((rotaKey) => {
            let rota = rotasMap.get(rotaKey);
            if (rota["SHAPE"] != "" && rota["SHAPE"] != null && rota["SHAPE"] != undefined) {
                if (filtroAnaliseManhaTarde && rota.turno_matutino == "S") {
                    $("#listarotas").append(`<option value="${rota["ID"]}">${rota["NOME"]}</option>`);
                } else if (!filtroAnaliseManhaTarde && rota.turno_vespertino == "S") {
                    $("#listarotas").append(`<option value="${rota["ID"]}">${rota["NOME"]}</option>`);
                }
            }
        });
}

$("input[type=radio][name=turno]").on("change", () => {
    mapaConfig["vectorSource"].clear();
    mapaRotaGerada["vectorSource"].clear();
    replotaSelectsDeRota();
});

////////////////////////////////////////////////////////////////////////////////
// Salvar Rotas
////////////////////////////////////////////////////////////////////////////////

$("#rota-sugestao-saveBtnSim").on("click", async () => {
    if (alunosParaAproveitamento.length == 0) {
        return Swal2.fire({
            icon: "success",
            button: "Fechar",
            title: "Não há ação a ser feita", 
            text: "Nenhum aluno selecionado"
        })
    }
    criarModalQuestionar(
        "Você deseja alocar os alunos a rota selecionada?", 
        "A rota dos alunos será substituída pela seguinte rota: " + rotasMap.get(idRotaSelecionada).NOME
    ).then(async (res) => {
        if (res.isConfirmed) {
            Swal2.fire({
                title: "Salvando as rotas...",
                imageUrl: "img/icones/processing.gif",
                closeOnClickOutside: false,
                allowOutsideClick: false,
                showConfirmButton: false,
                html: `
                <br />
                <div class="progress" style="height: 20px;">
                    <div id="pbar" class="progress-bar" role="progressbar" 
                         aria-valuenow="0" aria-valuemin="0" aria-valuemax="100" 
                         style="width: 0%;">
                    </div>
                </div>
                `,
            });

            var totalOperacoes = alunosParaAproveitamento.length + alunosParaAproveitamento.length;
            let progresso = 0;            
            function updateProgresso() {
                progresso++;
                let progressoPorcentagem = Math.round(100 * (progresso / totalOperacoes));
                $(".progress-bar").css("width", progressoPorcentagem + "%");
                $(".progress-bar").text(progressoPorcentagem + "%");
            }

            for (let aluno of alunosParaAproveitamento) {
                try {
                    await restImpl.dbDELETE(DB_TABLE_ALUNO, "/" + aluno.id + "/rota");
                } catch (error) {
                    console.log("ALUNO NÃO TEM ROTA", error);
                } finally {
                    updateProgresso();
                }

                try {
                    await restImpl.dbPOST(DB_TABLE_ALUNO, "/" + aluno.id + "/rota", {
                        id_rota: Number(idRotaSelecionada)
                    });
                } catch (error) {
                    console.log("ERRO AO ATUALIZAR A ROTA DO ALUNO", error);
                } finally {
                    updateProgresso();
                }
            }

            return Swal2.fire({
                title: "Mudanças feitas com sucesso",
                icon: "success",
                showCancelButton: false,
                confirmButtonClass: "btn-success",
                confirmButtonText: "Retornar ao painel",
                closeOnConfirm: false,
                closeOnClickOutside: false,
                allowOutsideClick: false,
                showConfirmButton: true,
            }).then(() => {
                navigateDashboard("./modules/rota/rota-listar-view.html");
            });
        }
    }); 
});
