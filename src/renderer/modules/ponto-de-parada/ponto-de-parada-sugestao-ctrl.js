/**
 * SETE Desktop: renderer/modules/ponto-de-parada/ponto-de-parada-sugestao-ctrl.js
 *
 * Script de controle da tela de sugestão de pontos de parada.
 * A tela mostrará um wizard, one a primeira etapa permitirá o usuário parametrizar a ferramenta.
 * A segunda tela mostrará o resultado da simulação.
 * Por fim, deve-se permitir que o usuário salve os pontos de parada gerados.
 */

// Mapas (config = para parametrização, rotagerada = para simulação)
var mapaConfig = novoMapaOpenLayers("mapaPontosDeParadaSugestaoConfig", cidadeLatitude, cidadeLongitude);
var mapaRotaGerada = novoMapaOpenLayers("mapaPontosDeParadasSugestaoGerados", cidadeLatitude, cidadeLongitude);

// Desenha elementos
// Onde vamos adicionar os elementos
var vSource = mapaConfig["vectorSource"];
var gSource = mapaRotaGerada["vectorSource"];

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

// Variável para armazenar as rotas geradas
var rotasGeradas = new Map();

// Variáveis que armazenará todos os usuários e escolas que podem utilizar a ferramenta
var alunoMap = new Map(); // Mapa que associa id aluno -> dados do aluno
var escolaMap = new Map(); // Mapa que associa id escola -> dados da escola
var nomeEscolaMap = new Map(); // Mapa que associa nome escola -> dados da escola
var nomeRotaMap = new Map(); // Mapa que associa nome rota  -> dados da rota

// Variáveis qeu contém apenas os usuários escolhidos para o processo de simulação
var alunos = new Array();
var alunosTurno = new Array();
var alunosComDef = new Array();
var alunosSemDef = new Array();
var escolas = new Array();


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
        Swal2.fire({
            title: "Preparando a ferramenta...",
            imageUrl: "img/icones/processing.gif",
            closeOnClickOutside: false,
            allowOutsideClick: false,
            showConfirmButton: false,
            html: `<br />
            <div class="progress" style="height: 20px;">
                <div id="pbar" class="progress-bar" role="progressbar" 
                     aria-valuenow="0" aria-valuemin="0" aria-valuemax="100" 
                     style="width: 0%;">
                </div>
            </div>`,
        });

        preprocessarEscolas()
            .then(() => preprocessarAlunos())
            .then(() => {
                // faz seleção inicial e finaliza modal
                $("#turnoManha").trigger("click");
                setTimeout(() => {
                    Swal2.close();
                }, 500);
            })
            .catch((err) => {
                let code = err.code;
                if (code == "erro:aluno") {
                    informarNaoExistenciaDado("Não há nenhum aluno georeferenciado", "Gerenciar alunos", "a[name='aluno/aluno-listar-view']", "#alunoMenu");
                } else if (code == "erro:escola") {
                    informarNaoExistenciaDado(
                        "Não há nenhuma escola georeferenciada",
                        "Gerenciar escolas",
                        "a[name='escola/escola-listar-view']",
                        "#escolaMenu"
                    );
                } else if (code == "erro:vinculo") {
                    informarNaoExistenciaDado(
                        "As escolas dos alunos escolhidos não estão georeferenciadas",
                        "Escolas: " + err.data,
                        "a[name='escola/escola-listar-view']",
                        "#escolaMenu"
                    );
                } else {
                    errorFn(`Erro ao utilizar a ferramenta de sugestão de rotas. 
                         Entre em contato com a equipe de suporte`);
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


// Preprocessa alunos
async function preprocessarAlunos() {
    // Numero de operações a serem realizadas
    var totalOperacoes = 1;

    // Barra de progresso (valor atual)
    var progresso = 0;

    function updateProgresso() {
        progresso++;
        let progressoPorcentagem = Math.round(100 * (progresso / totalOperacoes));
        $(".progress-bar").css("width", progressoPorcentagem + "%");
        $(".progress-bar").text(progressoPorcentagem + "%");
    }
    
    let numAlunosTemGPS = 0;
    let alunosRawList = [];
    try {
        alunosRawList = await restImpl.dbGETColecao(DB_TABLE_ALUNO);
        totalOperacoes = alunosRawList.length;

        for (let alunoRaw of alunosRawList) {
            try {
                let alunoRawDetalhes = await restImpl.dbGETEntidade(DB_TABLE_ALUNO, "/" + alunoRaw.id_aluno);
                let alunoJSON = parseAlunoREST(alunoRawDetalhes);
                alunoJSON["escola"] = alunoRaw["escola"];
                alunoJSON["ESCOLA"] = alunoRaw["escola"];

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

                // Deficiência NEP
                alunoJSON["DEF"] = false;
                alunoJSON["TIPO_DEF"] = "";

                if (alunoJSON["DEF_CAMINHAR"]) {
                    alunoJSON["DEF"] = true;
                    alunoJSON["TIPO_DEF"] = alunoJSON["TIPO_DEF"] + "Caminhar, ";
                }
                if (alunoJSON["DEF_ENXERGAR"]) {
                    alunoJSON["DEF"] = true;
                    alunoJSON["TIPO_DEF"] = alunoJSON["TIPO_DEF"] + "Enxergar, ";
                }
                if (alunoJSON["DEF_MENTAL"]) {
                    alunoJSON["DEF"] = true;
                    alunoJSON["TIPO_DEF"] = alunoJSON["TIPO_DEF"] + "Mental, ";
                }
                if (alunoJSON["DEF_OUVIR"]) {
                    alunoJSON["DEF"] = true;
                    alunoJSON["TIPO_DEF"] = alunoJSON["TIPO_DEF"] + "Ouvir, ";
                }

                // Verifica escola do aluno
                if (alunoJSON["ESCOLA"] != "Sem escola cadastrada" && alunoJSON["ESCOLA"] != "Não Informada") {
                    let escolaJSON = nomeEscolaMap.get(alunoJSON["ESCOLA"]);
                    alunoJSON["TEM_ESCOLA"] = true;
                    alunoJSON["ESCOLA_ID"] = escolaJSON["ID"];
                    alunoJSON["ESCOLA_NOME"] = escolaJSON["NOME"];

                    if (escolaJSON["GPS"]) {
                        alunoJSON["ESCOLA_TEM_GPS"] = true;
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

                alunoMap.set(String(alunoJSON["ID"]), alunoJSON);
            } catch (error) {
                console.log(error);
                console.log("ERRO ao tentar recuperar os dados de " + alunoRaw.nome);
            } finally {
                updateProgresso();
            }
        }
    } catch (err) {
        alunosRawList = [];
    }

    if (numAlunosTemGPS == 0) {
        return Promise.reject({ code: "erro:aluno" });
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
    return escolaMap;
}


function mapeiaAlunosParaDadoEspacial(mapaAlunos) {
    let alunosArray = [];
    for (const [aID, a] of mapaAlunos.entries()) {
        if (a["GPS"]) {
            alunosArray.push({
                key: a["ID_ALUNO"],
                id: aID,
                tipo: "aluno",
                nome: a["NOME"],
                lat: a["LOC_LATITUDE"],
                lng: a["LOC_LONGITUDE"],
                turno: a["TURNOSTR"],
                nivel: a["NIVELSTR"],
                temDef: a["DEF"] ? "Sim" : "Não",
                tipoDef: a["TIPO_DEF"],
                temEscola: a["TEM_ESCOLA"],
                nomeRota: a["ROTA_NOME"],
                temRota: a["ROTA"],
                school: String(a["ESCOLA_ID"]),
                escolaID: String(a["ESCOLA_ID"]),
                escolaNome: a["ESCOLA_NOME"],
                escolaTemGPS: a["ESCOLA_TEM_GPS"] ? "Sim" : "Não",
                passengers: 1,
            })
        }
    }
    return alunosArray;
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
    alunos = mapeiaAlunosParaDadoEspacial([...alunoMap]);
    escolas = mapeiaEscolasParaDadoEspacial([...escolaMap]);
    drawAlunos(alunos, mapaConfig);
    drawEscolas(escolas, mapaConfig);

    setTimeout(() => {
        mapaConfig["map"].getView().fit(vSource.getExtent(), {
            padding: [40, 40, 40, 40],
        });
        mapaRotaGerada["map"].getView().fit(gSource.getExtent(), {
            padding: [40, 40, 40, 40],
        });
    }, 500);
}

///////////////////////////////////////////////////////////////////////////////
// Rotinas de desenho no mapa
///////////////////////////////////////////////////////////////////////////////

function drawClusters(arrClusters, mapa) {
    let grupoDeCamadas = new Array();
    let numPonto = 1;
    for (let cluster of arrClusters) {
        let ponto = "P" + numPonto++;
        let camada = mapa["createLayer"](ponto, `Ponto: ${ponto}`, true);
        camada["vectorSource"] = camada["source"];
        camada["layer"].set("tipo", "CAMADA_PONTO_DE_PARADA");
        
        let clusterAlunosSemDef = cluster.ALUNOS.filter(a => a.temDef != "Sim");
        let clusterAlunosComDef = cluster.ALUNOS.filter(a => a.temDef == "Sim");
        drawAlunos(clusterAlunosSemDef, camada);
        drawAlunos(clusterAlunosComDef, camada, "img/icones/aluno-marcador-v4.png");

        let pontoDeParada = gerarMarcadorNumerico(Number(cluster.CENTRO.lat), Number(cluster.CENTRO.lng), ponto, tamanho_fonte = 0.6, x_offset = -15);
        pontoDeParada.setId(ponto);
        pontoDeParada.set("ID", ponto);
        pontoDeParada.set("nome", `Ponto: ${ponto}`);
        pontoDeParada.set("alunos", cluster.ALUNOS.length);
        pontoDeParada.set("alunos_com_def", clusterAlunosComDef.length);
        pontoDeParada.set("distancia_media", Number(cluster.DISTANCIA_MEDIA).toFixed(2) + " metros")
        pontoDeParada.set("tipo", "ponto_parada")

        camada["source"].addFeature(pontoDeParada);
        grupoDeCamadas.unshift(camada["layer"]);
    }
    mapa["addGroupLayer"]("Pontos de Parada", grupoDeCamadas); 

    return grupoDeCamadas;
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

var selectGerado = new ol.interaction.Select({
    hitTolerance: 5,
    multi: false,
    condition: ol.events.condition.singleClick,
    filter: (feature, layer) => {
        if (
            (feature.getGeometry().getType() == "Point" &&
                (feature.getProperties().tipo == "aluno" || feature.getProperties().tipo == "escola" || feature.getProperties().tipo == "ponto_parada")) ||
            (feature.getGeometry().getType() == "LineString" && feature.getProperties().tipo == "rota")
        ) {
            return true;
        } else {
            return false;
        }
    },
});
mapaRotaGerada["map"].addInteraction(selectGerado);

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
            temDef: {
                title: "Deficiência",
                visible: (e) => e.getProperties().tipo == "aluno",
            },
            tipoDef: {
                title: "Tipo de Deficiência",
                visible: (e) => e.getProperties().tipo == "aluno" && e.getProperties().temDef == "Sim",
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

var popupGerado = new ol.Overlay.PopupFeature({
    popupClass: "default anim",
    select: selectGerado,
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
            temDef: {
                title: "Deficiência",
                visible: (e) => e.getProperties().tipo == "aluno",
            },
            tipoDef: {
                title: "Tipo de Deficiência",
                visible: (e) => e.getProperties().tipo == "aluno" && e.getProperties().temDef == "Sim",
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
            alunos: {
                title: "Número de Alunos",
                visible: (e) => e.getProperties().tipo == "ponto_parada",
            },
            alunos_com_def: {
                title: "Número de Alunos com Deficiência",
                visible: (e) => e.getProperties().tipo == "ponto_parada",
            },
            distancia_media: {
                title: "Distância Média dos Alunos",
                visible: (e) => e.getProperties().tipo == "ponto_parada",
            },
            distancia_ponto: {
                title: "Distância ao Ponto de Parada",
                visible: (e) => e.getProperties().tipo == "aluno",
            }
        },
    },
});
mapaRotaGerada["map"].addOverlay(popupGerado);

//////////////////////////////////////////////////////////////
// Hover
//////////////////////////////////////////////////////////////
// Adaptado de 
// https://viglino.github.io/ol-ext/examples/geom/map.cluster.convexhull.html

// Add hover interaction that draw hull in a layer
var vetorHover = new ol.layer.Vector({ source: new ol.source.Vector() });
vetorHover.setMap(mapaRotaGerada["map"]);

var hover = new ol.interaction.Hover({
    cursor: "pointer",
    layerFilter: function (l) {
        return l.get("tipo") == "CAMADA_PONTO_DE_PARADA";
    },
});
mapaRotaGerada["map"].addInteraction(hover);

hover.on("enter", async function (e) {
    var h = e.feature.get("convexHull");
    
    if (!h) {
        var clusterElements = e.layer.getSource().getFeatures();
        // calculate convex hull
        if (clusterElements && clusterElements.length) {
            var c = [];
            for (var i = 0, f; (f = clusterElements[i]); i++) {
                c.push(f.getGeometry().getCoordinates());
            }
            h = ol.coordinate.convexHull(c);
        }
        e.feature.set("convexHull", h);
    }
    vetorHover.getSource().clear();
    vetorHover.getSource().addFeature(new ol.Feature(new ol.geom.Polygon([h])));
});
hover.on("leave", function (e) {
    vetorHover.getSource().clear();
});

//////////////////////////////////////////////////////////////
// Realiza a Simulação
//////////////////////////////////////////////////////////////

// Trigger para Iniciar Simulação
function initSimulation() {
    criarModalLoading("Simulando...");

    // Juntar dados em um objeto
    let pontosDeParadaInputData = {
        maxTravDist: Number($("#maxDist").val()),
        alunosSemDef,
        alunosComDef,
        stops: alunosTurno,
        schools: escolas,
    };

    window.sete.iniciaGeracaoPontosDeParada(pontosDeParadaInputData);
}

// Renderers
if (isElectron) {
    // Trigger para finalizar simulação
    window.sete.onSucessoGeracaoPontosDeParada((evt, clusters) => {
        // Limpa
        mapaRotaGerada.rmGroupLayer();
        $(".sidebar-PontosParadaGerados .ol-layerswitcher ul .ol-layer-group").remove();
        // gSource.clear();
        
        // Desenha
        drawEscolas(escolas, mapaRotaGerada);
        drawClusters(clusters, mapaRotaGerada);
        mapaRotaGerada["activateSidebarLayerSwitcher"](".sidebar-PontosParadaGerados");

        setTimeout(() => {
            mapaRotaGerada["map"].updateSize();
            mapaRotaGerada["map"].getView().fit(mapaConfig["vectorSource"].getExtent(), {
                padding: [40, 40, 40, 40],
            });
            Swal2.close();
        }, 300);
    });

    // Trigger de erro
    window.sete.onErroGeracaoPontosDeParada((evt, err) => {
        criarModalErro("Erro no processo de simulação de rota!");
        
        Swal2.close();
    });
}

////////////////////////////////////////////////////////////////////////////////
// Validar Formulário
////////////////////////////////////////////////////////////////////////////////
var validadorFormulario = $("#wizardSugestaoRotaForm").validate({
    rules: {
        turno: {
            required: true,
        },
        maxDist: {
            required: true,
            number: true,
            min: 0,
            max: 20000,
        },
    },
    messages: {
        turno: {
            required: "Por favor selecione o turno dos(as) alunos(as)",
        },
        maxDist: {
            required: "Por favor informe a distância máxima percorrida por rota",
            min: "Por favor selecione um valor igual ou axima de 0 metros",
            max: "Por favor selecione um valor abaixo de 20000 metros",
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
    if (alunosTurno.length == 0) {
        errorFn(
            `Não é possível gerar os pontos de parada para este turno. Para esta combinação de parâmetros não há nenhum aluno georeferenciado`,
            "",
            "Nenhum aluno georeferenciado neste caso"
        );
        formValido = false;
    }

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
// Replota dados
////////////////////////////////////////////////////////////////////////////////


$("input[type=radio][name=turno]").on("change", (evt) => {
    // Limpando dados do mapa
    vSource.clear();
    gSource.clear();

    // Pega turno
    let turno = Number(evt.currentTarget.value);

    // Faz filtro
    alunosTurno = new Map([...alunoMap].filter(([aID, a]) => a.turno == turno));
    alunosSemDef = new Map([...alunosTurno].filter(([aID, a]) => !a.DEF));
    alunosComDef = new Map([...alunosTurno].filter(([aID, a]) => a.DEF));

    alunosTurno = mapeiaAlunosParaDadoEspacial(alunosTurno);
    alunosSemDef = mapeiaAlunosParaDadoEspacial(alunosSemDef);
    alunosComDef =mapeiaAlunosParaDadoEspacial(alunosComDef);

    let escolasSet = new Set([...alunosTurno.values()].filter(a => a.ESCOLA_ID).map(a => a.ESCOLA_ID));
    escolas = [...escolaMap].filter(e => escolasSet.has(e[1].ID));
    escolas = mapeiaEscolasParaDadoEspacial(escolas);
    
    drawAlunos(alunosSemDef, mapaConfig);
    drawAlunos(alunosComDef, mapaConfig, "img/icones/aluno-marcador-v4.png");
    drawEscolas(escolas, mapaConfig);
    
    setTimeout(() => {
        mapaConfig["map"].getView().fit(vSource.getExtent(), {
            padding: [40, 40, 40, 40],
        });
        mapaRotaGerada["map"].getView().fit(gSource.getExtent(), {
            padding: [40, 40, 40, 40],
        });
    }, 500);
});

////////////////////////////////////////////////////////////////////////////////
// Salvar Pontos
////////////////////////////////////////////////////////////////////////////////
