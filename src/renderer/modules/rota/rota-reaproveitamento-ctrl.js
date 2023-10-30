/**
 * SETE Desktop: renderer/modules/rota-sugestao-ctrl.js
 *
 * Script de controle da tela de reaproveitamento de rotas.
 * A tela mostrará um wizard, one a primeira etapa permitirá o usuário parametrizar a ferramenta.
 * A segunda tela mostrará o resultado da simulação.
 * Por fim, deve-se permitir que o usuário salve as rotas geradas.
 */

// Mapas (config = para parametrização, rotagerada = para simulação)
var mapaConfig = novoMapaOpenLayers("mapaRotaReaproveitamentoConfig", cidadeLatitude, cidadeLongitude);
var mapaRotaGerada = novoMapaOpenLayers("mapaRotaSugestaoGerada", cidadeLatitude, cidadeLongitude);

// Desenha elementos
// Onde vamos adicionar os elementos
var mapaConfigVectorSource = mapaConfig["vectorSource"];
var mapaGeradoVectorSource = mapaRotaGerada["vectorSource"];

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

// Variável para armazenar as rotas geradas
var rotasGeradas = new Map();

// Variáveis que armazenará todos os usuários e escolas que podem utilizar a ferramenta
var alunoMap = new Map();      // Mapa que associa id aluno -> dados do aluno
var escolaMap = new Map();     // Mapa que associa id escola -> dados da escola
var rotasMap = new Map();      // Mapa que associa id rota -> dados da rota
var nomeEscolaMap = new Map(); // Mapa que associa nome escola -> dados da escola

// Variáveis que contém apenas os usuários escolhidos para o processo de simulação
var alunosRota = [];
var demaisAlunos = [];
var alunosParaAproveitamento = [];
var escolasRota = [];
var demaisEscolas = [];

var alunos = new Array();
var escolas = new Array();
var veiculos = [];

// Número da simulação
var numSimulacao = userconfig.get("SIMULATION_COUNT");
if (numSimulacao == undefined) {
    userconfig.set("SIMULATION_COUNT", 0);
    numSimulacao = 0;
}

// Máscaras
$('.horamask').mask('00:00');

////////////////////////////////////////////////////////////////////////////////
// Promessas
////////////////////////////////////////////////////////////////////////////////

function startTool() {
    // Esta ferramenta só funciona no Electron
    if (!isElectron) {
        Swal2.fire({
            title: "Funcionalidade indisponível",
            icon: "warning",
            html:
                "Esta funcionalidade está disponível apenas no SETE desktop. " +
                "Baixe a versão desktop para acessá-la. <br> " +
                "Clique " +
                '<a target="_blank" href="https://transportes.fct.ufg.br/p/31448-sete-sistema-eletronico-de-gestao-do-transporte-escolar">aqui</a> ' +
                "para baixar a versão desktop.",
        }).then(() => navigateDashboard(lastPage));
    } else {
        // Rodando no electron
        criarModalLoading("Preparando a ferramenta");
        window.sete.abrirMalha()
            .then((dataOSM) => convertOSMToGeoJSON(dataOSM))
            .then((osmGeoJSON) => plotMalha(osmGeoJSON))
            .then(() => preprocessarEscolas())
            .then(() => preprocessarRotas())
            .then(() => preprocessarAlunos())
            .then(() => listaElementos())
            .catch((err) => {
                let code = err.code;
                if (code == "erro:malha") {
                    informarNaoExistenciaDado("Malha não cadastrada", "Cadastrar malha", "a[name='rota/rota-malha-view']", "#veiculoMenu");
                } else if (code == "erro:aluno") {
                    informarNaoExistenciaDado("Não há nenhum aluno georeferenciado", "Gerenciar alunos", "a[name='aluno/aluno-listar-view']", "#alunoMenu");
                } else if (code == "erro:escola") {
                    informarNaoExistenciaDado(
                        "Não há nenhuma escola georeferenciada",
                        "Gerenciar escolas",
                        "a[name='escola/escola-listar-view']",
                        "#escolaMenu"
                    );
                } else if (code == "erro:rota") {
                    informarNaoExistenciaDado("Não há nenhuma rota digitalizada", "Gerenciar rotas", "a[name='rota/rota-listar-view']", "#rotaMenu");
                } else if (code == "erro:vinculo") {
                    informarNaoExistenciaDado(
                        "As escolas dos alunos escolhidos não estão georeferenciadas",
                        "Escolas: " + err.data,
                        "a[name='escola/escola-listar-view']",
                        "#escolaMenu"
                    );
                } else {
                    criarModalErro(`Erro ao utilizar a ferramenta de sugestão de rotas. Entre em contato com a equipe de suporte`);
                }
            });
    }
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

// Função le o arquivo osm da malha
function loadOSMFile() {
    let arqOrigem = path.join(userDataDir, "malha.osm");
    return new Promise((resolve, reject) => {
        fs.readFile(arqOrigem, "utf8", (err, dataOSM) => {
            if (err) reject({ code: "erro:malha" });
            console.log("antes");
            console.log(dataOSM);
            console.log("depois");
            resolve(dataOSM);
        });
    });
}

// Função converse osm para geojson
function convertOSMToGeoJSON(dataOSM) {
    let parser = new DOMParser();
    let xmlDoc = parser.parseFromString(dataOSM, "text/xml");
    let osmGeoJSON = osmtogeojson(xmlDoc);

    return Promise.resolve(osmGeoJSON);
}

// Plota malha
function plotMalha(osmGeoJSON) {
    let olConfigMap = mapaConfig["map"];

    let tileIndex = geojsonvt(osmGeoJSON, {
        extent: 4096,
        buffer: 256,
        maxZoom: 20,
        indexMaxZoom: 20,
        tolerance: 5,
    });
    let format = new ol.format.GeoJSON({
        // Data returned from geojson-vt is in tile pixel units
        dataProjection: new ol.proj.Projection({
            code: "TILE_PIXELS",
            units: "tile-pixels",
            extent: [0, 0, 4096, 4096],
        }),
    });

    let malhaVectorSource = new ol.source.VectorTile({
        tileUrlFunction: function (tileCoord) {
            // Use the tile coordinate as a pseudo URL for caching purposes
            return JSON.stringify(tileCoord);
        },
        tileLoadFunction: function (tile, url) {
            var tileCoord = JSON.parse(url);
            var data = tileIndex.getTile(tileCoord[0], tileCoord[1], tileCoord[2]);
            var geojson = JSON.stringify(
                {
                    type: "FeatureCollection",
                    features: data ? data.features : [],
                },
                osmMapReplacer
            );
            var features = format.readFeatures(geojson, {
                extent: malhaVectorSource.getTileGrid().getTileCoordExtent(tileCoord),
                featureProjection: olConfigMap.getView().getProjection(),
            });
            tile.setFeatures(features);
        },
    });
    mapaConfig["vectorLayer"].setZIndex(1);

    var malhaVectorLayer = new ol.layer.VectorTile({
        source: malhaVectorSource,
        zIndex: 1,
        maxZoom: 20,
        minZoom: 12,
        style: (feature, resolution) => {
            if (feature.getGeometry() instanceof ol.geom.LineString) {
                return new ol.style.Style({
                    stroke: new ol.style.Stroke({ color: "red", width: 2 }),
                });
            }
        },
    });
    olConfigMap.addLayer(malhaVectorLayer);
    return Promise.resolve(tileIndex);
}

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
                    let idRotasDoAluno = rotasDoAluno.data.map(r => r.id_rota);
                    let nomeDasRotas = idRotasDoAluno.map(k => rotasMap.get(k).nome).join(",")
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

        mapaConfig["vectorSource"].clear();
        
        filtraAlunosEscolasDaRota(idRotaSelecionada);

        drawAlunos(demaisAlunos, mapaConfig["vectorSource"], "img/icones/aluno-marcador-v2.png", 0.5);
        drawEscolas(demaisEscolas, mapaConfig["vectorSource"], 0.5);
        drawAlunos(alunosRota, mapaConfig["vectorSource"]);
        drawEscolas(escolasRota, mapaConfig["vectorSource"]);
        drawRotaConfig(idRotaSelecionada);

        setTimeout(() => {
            mapaConfig["map"].getView().fit(mapaConfig["vectorSource"].getExtent(), {
                padding: [40, 40, 40, 40],
            });
        }, 300);
    }
});

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
        } else if (filtroAnaliseManhaTarde) { // manhã-tarde
            alunoFiltrado = aluno["GPS"] && aluno["ESCOLA_TEM_GPS"] && (aluno["TURNO"] == 2 || aluno["TURNO"] == 3)
        } else { // noturno
            alunoFiltrado = aluno["GPS"] && aluno["ESCOLA_TEM_GPS"] && aluno["TURNO"] == 4
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

function drawRotaConfig(idRota) {
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

    mapaConfig["vectorSource"].addFeatures(rotaGeoJSON);
    mapaConfig["vectorLayer"].setStyle(rotaStyles);
    mapaConfig["vectorLayer"].setZIndex(2);
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


function listaElementos() {
    $("#turnoManhaTarde").trigger("click");
    Swal2.close();

    addInteraction();
}

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
        camada.addFeature(p);
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
        camada.addFeature(p);
    });
}

function getPoint(stopType, stopID) {
    let parada;
    if (stopType == "garage") {
        parada = garagens;
    } else if (stopType == "school" || stopType == "otherschool") {
        for (let i = 0; i < escolas.length; i++) {
            if (escolas[i].key == stopID) {
                parada = escolas[i];
                break;
            }
        }
    } else {
        for (let i = 0; i < alunos.length; i++) {
            if (alunos[i].key == stopID) {
                parada = alunos[i];
                break;
            }
        }
    }
    return new ol.geom.Point(ol.proj.fromLonLat([parada["lng"], parada["lat"]])).getCoordinates();
}

function drawRoutes(routesJSON) {
    let grupoDeCamadas = new Array();
    let numRota = 1;
    routesJSON.forEach((r) => {
        let rotaCor = proximaCor();
        let camada = mapaRotaGerada["createLayer"](r["id"], `<span class="corRota" style="background-color: ${rotaCor}">  </span>Rota: ${numRota}`, true);

        // Adiciona tempo de viagem estimado
        let estTime = Number((r["geojson"]?.properties?.travDistance / $("#velMedia").val()) * 60)?.toFixed(2);
        if (estTime) {
            r["geojson"].properties["estTime"] = estTime;
            r["estTime"] = estTime;
        } else {
            r["geojson"].properties["estTime"] = "Não calculado";
            r["estTime"] = "Não calculado";
        }

        // Make this dynamic
        pickedRoute = r;
        pickedRouteLength = r["purejson"].coordinates.length;
        pickedLayer = camada.layer;

        // Add Route Drawing
        let gjson = new ol.format.GeoJSON({ featureProjection: "EPSG:3857" }).readFeatures(r["geojson"]);
        let styles = new Array();
        styles.push(
            new ol.style.Style({
                stroke: new ol.style.Stroke({
                    color: "white",
                    width: 7,
                }),
            })
        );
        styles.push(
            new ol.style.Style({
                stroke: new ol.style.Stroke({
                    color: rotaCor,
                    width: 5,
                }),
            })
        );

        // Ponto inicial
        let geoMarker = new ol.Feature({
            type: "geoMarker",
            geometry: new ol.geom.Point(r["purejson"].coordinates[0]),
        });
        geoMarker.setStyle = new ol.style.Style({
            image: new ol.style.Circle({
                radius: 7,
                fill: new ol.style.Fill({ color: "black" }),
                stroke: new ol.style.Stroke({
                    color: "white",
                    width: 2,
                }),
            }),
        });

        // Add additional properties
        gjson.forEach((f) => {
            f.set("rota", numRota);
            f.set("pickedRoute", r);
            f.set("pickedRouteLength", r["purejson"].coordinates.length);
            f.set("marker", geoMarker);
        });

        // Poem setinhas nos pontos
        let pontosRota = new Array();
        for (let i = 1; i < r["path"].length; i++) {
            let parada = r["path"][i];
            pontosRota.push(getPoint(parada.type, parada.id));
        }
        let p = new ol.Feature({ geometry: new ol.geom.LineString(pontosRota) });

        // Desenha setinhas
        p.getGeometry().forEachSegment(function (start, end) {
            var dx = end[0] - start[0];
            var dy = end[1] - start[1];
            var rotation = Math.atan2(dy, dx);
            // arrows
            styles.push(
                new ol.style.Style({
                    geometry: new ol.geom.Point(end),
                    image: new ol.style.Icon({
                        src: "img/icones/arrow.png",
                        anchor: [0.75, 0.5],
                        rotateWithView: true,
                        rotation: -rotation,
                    }),
                })
            );
        });

        // Salva camada no grupoDeCamadas
        camada.source.addFeatures(gjson);
        camada.layer.setStyle(styles);
        camada.layer.setZIndex(1);

        // Adiciona para camadas
        rotasGeradas.set(numRota, {
            numRota,
            rotaCor,
            gjson,
            id: r["id"],
            payload: r,
            picked: r,
            length: pickedRouteLength,
            layer: pickedLayer,
        });

        numRota++;

        // let popup = buildPopup(r["id"], mapaRotaGerada["select"]);
        // mapaRotaGerada["map"].addOverlay(popup);
        grupoDeCamadas.unshift(camada.layer);
    });

    mapaRotaGerada["addGroupLayer"]("Rotas SIM-" + numSimulacao, grupoDeCamadas);
}

///////////////////////////////////////////////////////////////////////////////
// Popup
///////////////////////////////////////////////////////////////////////////////
var selectConfig = new ol.interaction.Select({
    hitTolerance: 5,
    multi: false,
    condition: ol.events.condition.singleClick,
    filter: (feature, layer) => {
        if 
        (
            (feature.getGeometry().getType() == "Point" && (feature.getProperties().tipo == "aluno" || feature.getProperties().tipo == "escola"))
            || 
            (feature.getGeometry().getType() == "LineString" && feature.getProperties().tipo == "rota")
        ) {
            return true;
        } else {
            return false;
        }
    },
});
var selectAlunoEscolaRotaGerada = new ol.interaction.Select({
    hitTolerance: 5,
    multi: false,
    condition: ol.events.condition.singleClick,
    filter: (feature, layer) => {
        if (feature.getGeometry().getType() == "Point" && (feature.getProperties().tipo == "aluno" || feature.getProperties().tipo == "escola")) {
            return true;
        } else {
            return false;
        }
    },
});
mapaConfig["map"].addInteraction(selectConfig);
mapaRotaGerada["map"].addInteraction(selectAlunoEscolaRotaGerada);

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
                title: 'Tamanho da Rota', 
                before: '',           
                format: ol.Overlay.PopupFeature.localString(),  
                after: ' km',        
                visible: (e) => e.getProperties().tipo == "rota"
            },
            tempo: {
                title: 'Tempo estimado',  
                before: '',           
                format: ol.Overlay.PopupFeature.localString(),  
                after: ' min',        
                visible: (e) => e.getProperties().tipo == "rota"
            },
            num_alunos: {
                title: "Número de alunos",
                visible: (e) => e.getProperties().tipo == "rota"
            },
        },
    },
});
var popupRotaGerada = new ol.Overlay.PopupFeature({
    popupClass: "default anim",
    select: selectAlunoEscolaRotaGerada,
    closeBox: true,
    template: {
        title: (elem) => {
            return elem.get("nome");
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
        },
    },
});
mapaConfig["map"].addOverlay(popupConfig);
mapaRotaGerada["map"].addOverlay(popupRotaGerada);

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

function filtraAlunosQuePodemSerAproveitados(rota, params) {
    debugger

    let shp = rota.SHAPE
    let shpJS = JSON.parse(shp)
    let shpWGS84 = turf.toWgs84(shpJS)
    let shpLineString = shpWGS84.features.filter(f => f?.geometry?.type == "LineString").flatMap(f => f?.geometry?.coordinates)
    
    let arrFiltro = [];

    for (aluno of params.demaisAlunos) {
        let alunoPoint = turf.point([aluno.lng, aluno.lat]);
        let alunoDist = turf.pointToLineDistance(alunoPoint, shpLineString);

        // distance é retornada em km (por isso multiplicamos por 1000)
        if (alunoDist * 1000 < params.maxTravDist) {
            arrFiltro.push(aluno);
        }
    }

    mapaConfig["vectorSource"].clear();
    drawAlunos(arrFiltro, mapaConfig["vectorSource"]);
    mapaConfig["map"].update();

    debugger

    // a = turf.point([alunos[0].lng, alunos[0].lat])
}


// Trigger para Iniciar Simulação
function initSimulation() {
    // criarModalLoading("Simulando...");

    // Juntar dados em um objeto
    let reaproveitamentoParams = {
        turno: Number($("input[name='turno']:checked").val()),
        maxTravDist: Number($("#maxDist").val()),
        maxCapacity: Number($("#maxCapacity").val()),
        busSpeed: Number($("#velMedia").val()) / 3.6, // converte de km/h para m/s
        rotasManha: [...rotasMap.keys()].filter(e => rotasMap.get(e).turno_matutino == "S"),
        rotasTarde: [...rotasMap.keys()].filter(e => rotasMap.get(e).turno_vespertino == "S"),
        rotasNoturno: [...rotasMap.keys()].filter(e => rotasMap.get(e).turno_noturno == "S"),
        alunosRota,
        demaisAlunos,
        escolasRota,
        demaisEscolas
    };

    let rota = rotasMap.get(idRotaSelecionada);

    let arrPossiveisAlunos = filtraAlunosQuePodemSerAproveitados(rota, reaproveitamentoParams);
    // window.sete.iniciaGeracaoRotas(routeGenerationInputData);
    Swal2.close();
}

// Renderers
if (isElectron) {
    // Trigger para finalizar simulação
    window.sete.onSucessoGeracaoRotas((evt, routesJSON) => {
        setTimeout(function () {
            // Aumenta o contador de simulações
            numSimulacao++;
            userconfig.set("SIMULATION_COUNT", numSimulacao);
            $("#numSimulacao").text(numSimulacao);

            // Apaga rotas anteriores desenhadas
            mapaRotaGerada["rmGroupLayer"]();

            // Desenha novas rotas
            rotasGeradas = new Map();
            drawRoutes(routesJSON);

            // Ativa grupo
            let switcher = mapaRotaGerada["activateSidebarLayerSwitcher"](".sidebar-RotasGeradas");

            // Atualiza o mapa
            mapaRotaGerada["map"].updateSize();
            mapaRotaGerada["map"].getView().fit(mapaGeradoVectorSource.getExtent(), {
                padding: [40, 40, 40, 40],
            });

            switcher.on("drawlist", function (e) {
                $(".ol-layer-vector").each((_, li) => {
                    let temBadge = $(li).find(".badge").length > 0 ? true : false;

                    if (!temBadge) {
                        let rotaID = Number($($(li).find("label")[0]).text().split(": ")[1]);
                        $($.parseHTML('<div class="badge badge-pill badge-warning pull-right"><i class="fa fa-map-o"></i></div>'))
                            .on("click", function () {
                                mapaRotaGerada["map"].getView().fit(mapaGeradoVectorSource.getExtent(), {
                                    padding: [40, 40, 40, 40],
                                });
                                iniciaAnimacao(rotaID);
                            })
                            .appendTo($(li));
                    }
                });
            });
            setTimeout(() => {
                $(".expend-layers").click();
                $(".ol-layerswitcher-buttons").hide();
                $(".layerswitcher-opacity").hide();
            }, 100);
            Swal2.close();
        }, 2000);
    });

    // Trigger de erro
    window.sete.onErroGeracaoRotas((evt, err) => {
        criarModalErro("Erro no processo de simulação de rota!");
    });
}

////////////////////////////////////////////////////////////////////////////////
// Validar Formulário
////////////////////////////////////////////////////////////////////////////////

// Mostra e esconde o campo para especificar a frota com base no input do usuário
$("input[name='tipoFrota']").on('click', (evt) => {
    if ($("#veiculosCustomizados").is(":checked")) {
        $("#divVeiculosCustomizados").show();
    } else {
        $("#divVeiculosCustomizados").hide();
    }
})


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
            horavalida: true
        },
        horaInicioTurno2: {
            required: true,
            horavalida: true
        }
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

    // Verifica se tem alunos e escolas escolhidas
    if (demaisAlunos.length == 0) {
        criarModalErro(
            "Nenhum aluno georeferenciado neste caso",
            "Não é possível realizar o reaproveitamento de rotas. Para esta combinação de parâmetros não há nenhum aluno georeferenciado"
        );
        formValido = false;
    } else if ($("input[name='tipoFrota']:checked").val() == "veiculosFrotaAtual" && 
                veiculos.reduce((a, b) => a + b, 0) < alunos.length) {
        criarModalErro(
            "O número de alunos " + String(alunos.length) + " é maior que a capacidade da frota " + String(veiculos.reduce((a, b) => a + b, 0)),
            "Não é possível realizar a sugestão de rotas. O número de alunos é maior que a capacidade da frota",
        );
        formValido = false;
    } else if (
        // verifica se o turno final (ex: manhã) < turno início (ex: tarde)
        moment($("#horaInicioTurno2").val(), "HH:mm", true).isSameOrBefore(moment($("#horaFimTurno1").val(), "HH:mm", true))
    ) {
        criarModalErro(
            "O horário de início do segundo turno é menor ou igual ao horário de fim do primeiro turno",
            "Problema no horário",
        );
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
                    return false;
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

    [...rotasMap.keys()].sort((a, b) => {
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
    }).forEach(rotaKey => {
        let rota = rotasMap.get(rotaKey);
        if (rota["SHAPE"] != "" && rota["SHAPE"] != null && rota["SHAPE"] != undefined) {
            if (filtroAnaliseManhaTarde && rota.turno_matutino == "S") {
                $('#listarotas').append(`<option value="${rota["ID"]}">${rota["NOME"]}</option>`);
            } else if (!filtroAnaliseManhaTarde && rota.turno_vespertino == "S") {
                $('#listarotas').append(`<option value="${rota["ID"]}">${rota["NOME"]}</option>`);
            }
        }
    })
}

$("input[type=radio][name=turno]").on("change", () => {
    mapaConfig["vectorSource"].clear();
    mapaRotaGerada["vectorSource"].clear();
    replotaSelectsDeRota();
});

////////////////////////////////////////////////////////////////////////////////
// Salvar Rotas
////////////////////////////////////////////////////////////////////////////////

$("#rota-sugestao-saveBtnSim").on("click", () => {
    let numRotas = $(".visible.ol-layer-vector").length;
    if (numRotas == 0) {
        errorFn("Nenhuma rota selecionada");
    } else {
        let rotasLabels = ["<strong>Note que os alunos selecionados serão transferidos para as rotas selecionadas.</strong>"];
        let rotasSelecionadas = [];
        $(".visible.ol-layer-vector").each((_, li) => {
            let lbl = $(li).find("label");
            rotasSelecionadas.push(Number(lbl.text().split(": ")[1]));
            rotasLabels.push(lbl.html());
        });

        Swal2.fire({
            title: "Você deseja salvar as rotas abaixo?",
            icon: "question",
            html: rotasLabels.join("<br />"),
            showCancelButton: true,
            cancelButtonText: "Cancelar",
            confirmButtonText: "Salvar",
        }).then((res) => {
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

                var numAlunos = 0;
                var numEscolas = 0;
                var numRotas = rotasSelecionadas.length;

                var rotasQueVamosSalvar = [];

                rotasSelecionadas.forEach((rID) => {
                    let rg = rotasGeradas.get(rID);
                    if (rg) {
                        let rgAlunos = rg.payload.path.filter((k) => k.type == "stop");
                        let rgEscolas = rg.payload.path.filter((k) => k.type == "otherschool" || k.type == "school");

                        rotasQueVamosSalvar.push({
                            id: "ROTA-SIM-" + numSimulacao + "-" + rID,
                            rota: rg,
                            alunos: rgAlunos,
                            escolas: rgEscolas,
                        });

                        numAlunos += rgAlunos.length;
                        numEscolas += rgEscolas.length;
                    }
                });

                var totalOperacoes = numAlunos + numAlunos + numEscolas + numRotas + 1;
                var progresso = 0;

                function updateProgresso() {
                    progresso++;
                    let progressoPorcentagem = Math.round(100 * (progresso / totalOperacoes));
                    $(".progress-bar").css("width", progressoPorcentagem + "%");
                    $(".progress-bar").text(progressoPorcentagem + "%");
                }

                // Promessas de Relações Antigas
                var promiseArrayRelacoesAntigas = new Array();

                // Remove das rotas atuais (se tiver vinculado)
                for (r of rotasQueVamosSalvar) {
                    for (a of r.alunos) {
                        console.log("REMOVER ROTA", a.id);
                        // Remove da escola atual (se tiver matriculado)
                        remotedb
                            .collection("municipios")
                            .doc(codCidade)
                            .collection("rotaatendealuno")
                            .where("ID_ALUNO", "==", a.id)
                            .get({ source: "cache" })
                            .then((snapshotDocumentos) => {
                                updateProgresso();
                                snapshotDocumentos.forEach((doc) => {
                                    promiseArrayRelacoesAntigas.push(doc.ref.delete());
                                });
                            });
                    }
                }

                Promise.all(promiseArrayRelacoesAntigas)
                    .then(() => {
                        var promiseArrayRelacoes = new Array();

                        // Adicionar as novas rotas
                        for (r of rotasQueVamosSalvar) {
                            r.alunos.forEach((a) =>
                                promiseArrayRelacoes.push(
                                    dbInserirPromise(DB_TABLE_ROTA_ATENDE_ALUNO, { ID_ROTA: r.id, ID_ALUNO: a.id }).then(() => updateProgresso())
                                    // console.log("TABLE_ATENDE_ALUNO", r.id, a.id)
                                )
                            );

                            r.escolas.forEach((e) =>
                                promiseArrayRelacoes.push(
                                    dbInserirPromise(DB_TABLE_ROTA_PASSA_POR_ESCOLA, { ID_ROTA: r.id, ID_ESCOLA: e.id }).then(() => updateProgresso())
                                    // console.log("TABLE_PASSA_POR_ESCOLA", r.id, e.id)
                                )
                            );

                            let rotaPayload = r.rota.payload;

                            let rotaJSON = {
                                TIPO: 1, // int
                                NOME: r.id, // string
                                KM: (rotaPayload.travDistance / 1000).toFixed(2), // text
                                TEMPO: rotaPayload.estTime, // text
                                TURNO_MATUTINO: $("#turnoManha").is(":checked"), // bool
                                TURNO_VESPERTINO: $("#turnoTarde").is(":checked"), // bool
                                TURNO_NOTURNO: $("#turnoNoite").is(":checked"), // bool
                                SHAPE: new ol.format.GeoJSON().writeFeatures(r.rota.gjson),

                                // campos default
                                HORA_IDA_INICIO: "",
                                HORA_IDA_TERMINO: "",
                                HORA_VOLTA_INICIO: "",
                                HORA_VOLTA_TERMINO: "",
                                DA_PORTEIRA: false,
                                DA_MATABURRO: false,
                                DA_COLCHETE: false,
                                DA_ATOLEIRO: false,
                                DA_PONTERUSTICA: false,
                            };
                            promiseArrayRelacoes.push(dbInserirPromise(DB_TABLE_ROTA, rotaJSON, r.id).then(() => updateProgresso()));
                            promiseArrayRelacoes.push(dbAtualizaVersao().then(() => updateProgresso()));
                        }
                        return Promise.all(promiseArrayRelacoes);
                    })
                    .then(() => {
                        return Swal2.fire({
                            title: "Rotas salvas com sucesso",
                            icon: "success",
                            showCancelButton: false,
                            confirmButtonClass: "btn-success",
                            confirmButtonText: "Retornar ao painel",
                            closeOnConfirm: false,
                            closeOnClickOutside: false,
                            allowOutsideClick: false,
                            showConfirmButton: true,
                        });
                    })
                    .then(() => {
                        navigateDashboard("./modules/rota/rota-listar-view.html");
                    })
                    .catch((err) => errorFn("Erro ao salvar as rotas sugeridas", err));
            }
        });
    }
});




////

var sketch;

/**
 * The help tooltip element.
 * @type {HTMLElement}
 */
var helpTooltipElement;

/**
 * Overlay to show the help messages.
 * @type {Overlay}
 */
var helpTooltip;

/**
 * The measure tooltip element.
 * @type {HTMLElement}
 */
var measureTooltipElement;

/**
 * Overlay to show the measurement.
 * @type {Overlay}
 */
var measureTooltip;

/**
 * Message to show when the user is drawing a polygon.
 * @type {string}
 */
var continuePolygonMsg = 'Click to continue drawing the polygon';

/**
 * Message to show when the user is drawing a line.
 * @type {string}
 */
var continueLineMsg = 'Click to continue drawing the line';

/**
 * Handle pointer move.
 * @param {import("../src/ol/MapBrowserEvent").default} evt The event.
 */
var pointerMoveHandler = function (evt) {
  if (evt.dragging) {
    return;
  }
  /** @type {string} */
  let helpMsg = 'Click to start drawing';

  if (sketch) {
    const geom = sketch.getGeometry();
    if (geom instanceof ol.geom.Polygon) {
      helpMsg = continuePolygonMsg;
    } else if (geom instanceof ol.geom.LineString) {
      helpMsg = continueLineMsg;
    }
  }

  helpTooltipElement.innerHTML = helpMsg;
  helpTooltip.setPosition(evt.coordinate);

  helpTooltipElement.classList.remove('hidden');
};

mapaConfig["map"].on('pointermove', pointerMoveHandler);

mapaConfig["map"].getViewport().addEventListener('mouseout', function () {
  helpTooltipElement.classList.add('hidden');
});




var typeSelect = document.getElementById('type');

var draw; // global so we can remove it later

/**
 * Format length output.
 * @param {LineString} line The line.
 * @return {string} The formatted length.
 */
var formatLength = function (line) {
  const length = ol.sphere.getLength(line);
  let output;
  if (length > 100) {
    output = Math.round((length / 1000) * 100) / 100 + ' ' + 'km';
  } else {
    output = Math.round(length * 100) / 100 + ' ' + 'm';
  }
  return output;
};

/**
 * Format area output.
 * @param {Polygon} polygon The polygon.
 * @return {string} Formatted area.
 */
var formatArea = function (polygon) {
  const area = ol.sphere.getArea(polygon);
  let output;
  if (area > 10000) {
    output = Math.round((area / 1000000) * 100) / 100 + ' ' + 'km<sup>2</sup>';
  } else {
    output = Math.round(area * 100) / 100 + ' ' + 'm<sup>2</sup>';
  }
  return output;
};

var style = new ol.style.Style({
  fill: new ol.style.Fill({
    color: 'rgba(255, 255, 255, 0.2)',
  }),
  stroke: new ol.style.Stroke({
    color: 'rgba(0, 0, 0, 0.5)',
    lineDash: [10, 10],
    width: 2,
  }),
  image: new ol.style.Circle({
    radius: 5,
    stroke: new ol.style.Stroke({
      color: 'rgba(0, 0, 0, 0.7)',
    }),
    fill: new ol.style.Fill({
      color: 'rgba(255, 255, 255, 0.2)',
    }),
  }),
});

function addInteraction() {
  const type = 'LineString';
  draw = new ol.interaction.Draw({
    source: mapaConfig["vectorSource"],
    type: type,
    style: function (feature) {
      const geometryType = feature.getGeometry().getType();
      if (geometryType === type || geometryType === 'Point') {
        return style;
      }
    },
  });
  mapaConfig["map"].addInteraction(draw);

  createMeasureTooltip();
  createHelpTooltip();

  let listener;
  draw.on('drawstart', function (evt) {
    // set sketch
    sketch = evt.feature;

    /** @type {import("../src/ol/coordinate.js").Coordinate|undefined} */
    let tooltipCoord = evt.coordinate;

    listener = sketch.getGeometry().on('change', function (evt) {
      const geom = evt.target;
      let output;
      if (geom instanceof ol.geom.Polygon) {
        output = formatArea(geom);
        tooltipCoord = geom.getInteriorPoint().getCoordinates();
      } else if (geom instanceof ol.geom.LineString) {
        output = formatLength(geom);
        tooltipCoord = geom.getLastCoordinate();
      }
      measureTooltipElement.innerHTML = output;
      measureTooltip.setPosition(tooltipCoord);
    });
  });

  draw.on('drawend', function () {
    measureTooltipElement.className = 'ol-tooltip ol-tooltip-static';
    measureTooltip.setOffset([0, -7]);
    // unset sketch
    sketch = null;
    // unset tooltip so that a new one can be created
    measureTooltipElement = null;
    createMeasureTooltip();
    unByKey(listener);
  });
}

/**
 * Creates a new help tooltip
 */
function createHelpTooltip() {
  if (helpTooltipElement) {
    helpTooltipElement.parentNode.removeChild(helpTooltipElement);
  }
  helpTooltipElement = document.createElement('div');
  helpTooltipElement.className = 'ol-tooltip hidden';
  helpTooltip = new ol.Overlay({
    element: helpTooltipElement,
    offset: [15, 0],
    positioning: 'center-left',
  });
  mapaConfig["map"].addOverlay(helpTooltip);
}

/**
 * Creates a new measure tooltip
 */
function createMeasureTooltip() {
  if (measureTooltipElement) {
    measureTooltipElement.parentNode.removeChild(measureTooltipElement);
  }
  measureTooltipElement = document.createElement('div');
  measureTooltipElement.className = 'ol-tooltip ol-tooltip-measure';
  measureTooltip = new ol.Overlay({
    element: measureTooltipElement,
    offset: [0, -15],
    positioning: 'bottom-center',
    stopEvent: false,
    insertFirst: false,
  });
  mapaConfig["map"].addOverlay(measureTooltip);
}

/**
 * Let user change the geometry type.
 */
typeSelect.onchange = function () {
    mapaConfig["map"].removeInteraction(draw);
  addInteraction();
};
