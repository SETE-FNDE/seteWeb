// aluno-importar-ctrl.js
// Este arquivo contém o script de controle da tela aluno-importar-view. O memso
// permite importar os dados de alunos a partir de uma planilha.

// Base de dados
var alunos = [];
var ultArquivoAnalisado = "";

// Schema da planilha
var schema = {
    OBRIGATORIO_NOME: {
        prop: "OBRIGATORIO_NOME",
        type: String,
    },
    OBRIGATORIO_DATA_NASCIMENTO: {
        prop: "OBRIGATORIO_DATA_NASCIMENTO",
        type: String,
    },
    OBRIGATORIO_SEXO: {
        prop: "OBRIGATORIO_SEXO",
        type: String,
    },
    OBRIGATORIO_COR: {
        prop: "OBRIGATORIO_COR",
        type: String,
    },
    OBRIGATORIO_LOCALIZACAO: {
        prop: "OBRIGATORIO_LOCALIZACAO",
        type: String,
    },
    OBRIGATORIO_NIVEL_ENSINO: {
        prop: "OBRIGATORIO_NIVEL_ENSINO",
        type: String,
    },
    OBRIGATORIO_TURNO_ENSINO: {
        prop: "OBRIGATORIO_TURNO_ENSINO",
        type: String,
    },
    OPTATIVO_CPF: {
        prop: "OPTATIVO_CPF",
        type: String,
    },
    OPTATIVO_NOME_RESPONSAVEL: {
        prop: "NOME_RESPONSAVEL",
        type: String,
    },
    OPTATIVO_GRAU_PARENTESCO: {
        prop: "OPTATIVO_GRAU_PARENTESCO",
        type: String,
    },
    OPTATIVO_ENDERECO: {
        prop: "OPTATIVO_ENDERECO",
        type: String,
    },
    OPTATIVO_LATITUDE: {
        prop: "OPTATIVO_LATITUDE",
        type: String,
    },
    OPTATIVO_LONGITUDE: {
        prop: "OPTATIVO_LONGITUDE",
        type: String,
    },
};

$("#baixarPlanilha").on("click", () => {
    if (!isElectron) {
        saveAs("/src/renderer/templates/FormatoImportacaoAluno.xlsx", "FormatoImportacaoAluno.xlsx");
    } else {
        let arqDestino = dialog.showSaveDialogSync(win, {
            title: "Salvar Planilha Exemplo",
            buttonLabel: "Salvar",
            filters: [{ name: "XLSX", extensions: ["xlsx"] }],
        });

        if (arqDestino != "" && arqDestino != undefined) {
            let arqOrigem = path.join(__dirname, "templates", "FormatoImportacaoAluno.xlsx");
            console.log("Copiando de: ", arqOrigem, arqDestino);
            fs.copySync(arqOrigem, arqDestino);
            Swal2.fire({
                icon: "success",
                title: "Planilha baixada com sucesso",
            });
        }
    }
});

function preprocess(arquivo) {
    if (arquivo == undefined) {
        Swal2.fire({
            title: "Ops... tivemos um problema!",
            text: "É necessário informar o arquivo contendo a planilha para realizar a importação.",
            icon: "error",
            confirmButtonColor: "red",
            confirmButtonText: "Fechar",
        });
        return false;
    } else {
        Swal2.fire({
            title: "Pré-processando a planilha...",
            imageUrl: "img/icones/processing.gif",
            closeOnClickOutside: false,
            allowOutsideClick: false,
            showConfirmButton: false,
            text: "Aguarde, estamos pré-processando a planilha...",
        });
        parsePlanilha(arquivo);
        return true;
    }
}

function ExcelDateToJSDate(date) {
    return new Date(Math.round((date - 25569) * 86400 * 1000));
}

var dicionarioSexo = [
    { label: "masculino", value: 1 },
    { label: "MASCULINO", value: 1 },
    { label: "M", value: 1 },

    { label: "feminino", value: 2 },
    { label: "FEMININO", value: 2 },
    { label: "F", value: 2 },

    { label: "nenhum", value: 3 },
    { label: "NENHUM", value: 3 },
    { label: "não definido", value: 3 },
];

var dicionarioCor = [
    { label: "amarelo", value: 4 },
    { label: "AMARELO", value: 4 },

    { label: "branco", value: 1 },
    { label: "BRANCO", value: 1 },

    { label: "indigena", value: 5 },
    { label: "INDIGENA", value: 5 },

    { label: "pardo", value: 3 },
    { label: "PARDO", value: 3 },

    { label: "preto", value: 2 },
    { label: "PRETO", value: 2 },

    { label: "não declarada", value: 0 },
    { label: "NÃO DECLARADA", value: 0 },
];

var dicionarioLocalizacao = [
    { label: "rural", value: 2 },
    { label: "RURAL", value: 2 },
    { label: "Área Rural", value: 2 },

    { label: "urbana", value: 1 },
    { label: "URBANA", value: 1 },
    { label: "Área Urbana", value: 1 },
];

var dicionarioNivel = [
    { label: "creche", value: 1 },
    { label: "CRECHE", value: 1 },
    { label: "pré-escola", value: 1 },
    { label: "PRÉ-ESCOLA", value: 1 },
    { label: "infantil", value: 1 },
    { label: "INFANTIL", value: 1 },
    { label: "ensino infantil", value: 1 },
    { label: "ENSINO INFANTIL", value: 1 },

    { label: "fundamental", value: 2 },
    { label: "FUNDAMENTAL", value: 2 },
    { label: "ensino fundamental", value: 2 },
    { label: "ENSINO FUNDAMENTAL", value: 2 },

    { label: "médio", value: 3 },
    { label: "medio", value: 3 },
    { label: "ensino medio", value: 3 },
    { label: "MÉDIO", value: 3 },
    { label: "MEDIO", value: 3 },
    { label: "ENSINO MÉDIO", value: 3 },

    { label: "superior", value: 4 },
    { label: "SUPERIOR", value: 4 },
    { label: "ensino superior", value: 4 },
    { label: "ENSINO superior", value: 4 },

    { label: "outro", value: 5 },
    { label: "EJA", value: 5 },
];

var dicionarioGrauParentesco = [
    { label: "pai", value: 0 },
    { label: "PAI", value: 0 },
    { label: "mãe", value: 0 },
    { label: "MÃE", value: 0 },
    { label: "padrasto", value: 0 },
    { label: "madrasta", value: 0 },
    { label: "PADRASTO", value: 0 },
    { label: "MADRASTA", value: 0 },

    { label: "avó", value: 1 },
    { label: "avô", value: 1 },
    { label: "AVÓ", value: 1 },
    { label: "AVÔ", value: 1 },

    { label: "irmão", value: 2 },
    { label: "irmã", value: 2 },
    { label: "IRMÃO", value: 2 },
    { label: "IRMÃ", value: 2 },

    { label: "outro", value: 4 },
    { label: "OUTRO", value: 4 },
];

var dicionarioTurno = [
    { label: "manhã", value: 1 },
    { label: "MANHÃ", value: 1 },
    { label: "matutino", value: 1 },
    { label: "MATUTINO", value: 1 },

    { label: "tarde", value: 2 },
    { label: "TARDE", value: 2 },
    { label: "vespertino", value: 2 },
    { label: "VESPERTINO", value: 2 },

    { label: "integral", value: 3 },
    { label: "INTEGRAL", value: 3 },

    { label: "noturno", value: 4 },
    { label: "NOTURNO", value: 4 },
    { label: "noite", value: 4 },
    { label: "NOITE", value: 4 },
];

async function parsePlanilha(arquivo) {
    readXlsxFile(arquivo)
        .then((rows) => {
            let dadosLinhas = [];
            let cabecalho = rows[0];

            for (let i = 1; i < rows.length; i++) {
                let dado = {};
                for (let j = 0; j < cabecalho.length; j++) {
                    if (rows[i][j] && cabecalho[j]) {
                        dado[cabecalho[j]] = rows[i][j];
                    }
                }
                dadosLinhas.push(dado);
            }

            // Alunos a serem importados
            let erroDeProcessamento = false;
            let alunosErrosOpt = {};
            let numErros = 0;

            alunos = [];

            fuseSexo = new Fuse(dicionarioSexo, { keys: ["label"], includeScore: true });
            fuseCor = new Fuse(dicionarioCor, { keys: ["label"], includeScore: true });
            fuseLocalizacao = new Fuse(dicionarioLocalizacao, { keys: ["label"], includeScore: true });
            fuseNivel = new Fuse(dicionarioNivel, { keys: ["label"], includeScore: true });
            fuseGrauParentesco = new Fuse(dicionarioGrauParentesco, { keys: ["label"], includeScore: true });
            fuseTurno = new Fuse(dicionarioTurno, { keys: ["label"], includeScore: true });

            for (let linha of dadosLinhas) {
                let alunoJSON = {};

                try {
                    if (!linha["OBRIGATORIO_NOME"].toLowerCase().includes("exemplo")) {
                        ////////////////////////////////////////////////////////////
                        // TRATAMENTO DOS CAMPOS OBRIGATÓRIOS
                        ////////////////////////////////////////////////////////////
                        alunoJSON["nome"] = linha["OBRIGATORIO_NOME"].toUpperCase().trim();

                        if (typeOf(linha["OBRIGATORIO_DATA_NASCIMENTO"]) == "date") {
                            alunoJSON["data_nascimento"] = moment(linha["OBRIGATORIO_DATA_NASCIMENTO"]).format("DD/MM/YYYY");
                        } else if (typeOf(linha["OBRIGATORIO_DATA_NASCIMENTO"]) == "number") {
                            alunoJSON["data_nascimento"] = moment(ExcelDateToJSDate(linha["OBRIGATORIO_DATA_NASCIMENTO"])).format("DD/MM/YYYY");
                        } else {
                            alunoJSON["data_nascimento"] = moment(linha["OBRIGATORIO_DATA_NASCIMENTO"].trim(), "DD-MM-YYYY").format("DD/MM/YYYY");
                        }

                        alunoJSON["sexo"] = fuseSexo.search(linha?.OBRIGATORIO_SEXO)[0]?.item?.value;
                        alunoJSON["cor"] = fuseCor.search(linha?.OBRIGATORIO_COR)[0]?.item?.value;
                        alunoJSON["mec_tp_localizacao"] = fuseLocalizacao.search(linha?.OBRIGATORIO_LOCALIZACAO)[0]?.item?.value;
                        alunoJSON["nivel"] = fuseNivel.search(linha?.OBRIGATORIO_NIVEL_ENSINO)[0]?.item?.value;
                        alunoJSON["turno"] = fuseTurno.search(linha?.OBRIGATORIO_TURNO_ENSINO)[0]?.item?.value;

                        ////////////////////////////////////////////////////////////
                        // TRATAMENTO DOS CAMPOS OPTATIVOS
                        ////////////////////////////////////////////////////////////
                        if (linha["OPTATIVO_CPF"]) {
                            alunoJSON["cpf"] = linha["OPTATIVO_CPF"];
                        }

                        if (linha["OPTATIVO_NOME_RESPONSAVEL"]) {
                            alunoJSON["nome_responsavel"] = linha["OPTATIVO_NOME_RESPONSAVEL"];
                        }

                        if (linha["OPTATIVO_GRAU_PARENTESCO"]) {
                            if (fuseGrauParentesco.search(linha.OPTATIVO_GRAU_PARENTESCO)) {
                                alunoJSON["grau_responsavel"] = fuseGrauParentesco.search(linha.OPTATIVO_GRAU_PARENTESCO)[0]?.item?.value;
                            } else {
                                alunoJSON["grau_responsavel"] = -1;
                            }
                        }

                        if (linha["OPTATIVO_ENDERECO"]) {
                            alunoJSON["loc_endereco"] = linha["OPTATIVO_ENDERECO"];
                        }

                        if (linha["OPTATIVO_LATITUDE"] && linha["OPTATIVO_LONGITUDE"]) {
                            alunoJSON["loc_latitude"] = Number(String(linha["OPTATIVO_LATITUDE"]).replace(",", "."));
                            alunoJSON["loc_longitude"] = Number(String(linha["OPTATIVO_LONGITUDE"]).replace(",", "."));
                            alunoJSON["georef"] = "Sim";
                        } else {
                            alunoJSON["georef"] = "Não";
                        }

                        alunos.push(alunoJSON);
                        // promiseAlunos.push(dbInserirPromise("alunos", alunoJSON, idAluno));
                    }
                } catch (err) {
                    debugger;
                    erroDeProcessamento = true;
                    numErros++;

                    if (linha["OBRIGATORIO_NOME"]) {
                        alunosErrosOpt[linha["OBRIGATORIO_NOME"]] = linha["OBRIGATORIO_NOME"];
                    }
                }
            }

            let count = 0;
            for (let aluno of alunos) {
                aluno["SELECT"] = count++;
                dataTableImportar.row.add(aluno);
            }
            dataTableImportar.draw();

            if (erroDeProcessamento) {
                Swal2.fire({
                    icon: "warning",
                    title: "Aviso",
                    text: `Ocorreu um erro ao processar os seguintes ${numErros} alunos da planilha:`,
                    input: "select",
                    inputOptions: alunosErrosOpt,
                });
            } else {
                Swal2.close();
            }
        })
        .catch((err) => {
            errorFn("Ocorreu um erro ao processar a planilha", err);
        });
}

var dataTableImportar = $("#datatables").DataTable({
    columns: [{ data: "SELECT", width: "80px" }, { data: "nome", width: "40%" }, { data: "data_nascimento", width: "20%" }, { data: "georef" }],
    columnDefs: [
        {
            targets: 1,
            type: "locale-compare",
        },
        {
            targets: 0,
            checkboxes: {
                selectRow: true,
            },
        },
    ],
    order: [[1, "asc"]],
    select: {
        style: "multi",
        info: false,
    },
    autoWidth: false,
    bAutoWidth: false,
    lengthMenu: [
        [10, 50, -1],
        [10, 50, "Todas"],
    ],
    pagingType: "full_numbers",
    language: {
        search: "_INPUT_",
        searchPlaceholder: "Procurar alunos",
        lengthMenu: "Mostrar _MENU_ alunos por página",
        zeroRecords: "Não encontrei nenhum aluno com este filtro",
        info: "Mostrando página _PAGE_ de _PAGES_",
        infoEmpty: "Sem registros disponíveis",
        infoFiltered: "(Alunos filtrados a partir do total de _MAX_ alunos)",
        paginate: {
            first: "Primeira",
            last: "Última",
            next: "Próxima",
            previous: "Anterior",
        },
    },
    dom: "lfrtip",
});

$("#importarAlunos").on("click", () => {
    let rawDados = dataTableImportar.rows(".selected").data().toArray();

    if (rawDados.length == 0) {
        Swal2.fire({
            title: "Nenhum aluno selecionado",
            text: "Por favor, selecione pelo menos um aluno a ser importardo para prosseguir.",
            icon: "error",
            confirmButtonText: "Fechar",
        });
    } else {
        Swal2.fire({
            title: "Você quer importar os alunos selecionados?",
            text: "Você irá importar " + rawDados.length + " alunos para o banco de dados.",
            icon: "question",
            showCancelButton: true,
            confirmButtonColor: "#3085d6",
            cancelButtonColor: "#d33",
            cancelButtonText: "Cancelar",
            confirmButtonText: "Sim",
        }).then((result) => {
            if (result.isConfirmed) {
                realizaImportacao(rawDados);
            }
        });
    }
});

function realizaImportacao(rawDados) {
    Swal2.fire({
        title: "Importando os dados...",
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

    // Numero de operações a serem realizadas
    var totalOperacoes = rawDados.length;

    // Barra de progresso (valor atual)
    var progresso = 0;

    function updateProgresso() {
        progresso++;
        let progressoPorcentagem = Math.round(100 * (progresso / totalOperacoes));
        $(".progress-bar").css("width", progressoPorcentagem + "%");
        $(".progress-bar").text(progressoPorcentagem + "%");
    }

    let promiseAlunos = new Array();

    for (let aluno of rawDados) {
        delete aluno["SELECT"];
        delete aluno["georef"];
        aluno["cpf"] = String(aluno["cpf"]).replace(/\D/g, "");
        promiseAlunos.push(restImpl.dbPOST(DB_TABLE_IMPORTACAO, "/planilha/aluno", aluno).then(() => updateProgresso()));
    }

    Promise.all(promiseAlunos)
        .then(() => {
            return Swal2.fire({
                title: "Sucesso",
                text: "Os alunos foram importados com sucesso no sistema. " + "Clique abaixo para retornar ao painel.",
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
            $("a[name='aluno/aluno-listar-view']").trigger("click");
        })
        .catch((err) => {
            Swal2.close();
            errorFn("Erro ao importar os alunos", err);
        });
}

// Wizard
$(".card-wizard").bootstrapWizard({
    ...configWizardBasico("", (usarValidador = false)),
    ...{
        onTabShow: function (tab, navigation, index) {
            var $total = navigation.find("li").length;
            var $current = index + 1;

            var $wizard = navigation.closest(".card-wizard");

            // If it's the last tab then hide the last button and show the finish instead
            if ($current >= $total) {
                if ($("#arqPlanilha").length > 0) {
                    var arquivo;

                    if (isElectron && $("#arqPlanilha")[0].files[0]) {
                        arquivo = $("#arqPlanilha")[0].files[0].path;
                    } else {
                        arquivo = $("#arqPlanilha")[0].files[0];
                    }
                    if (ultArquivoAnalisado != arquivo) {
                        if (preprocess(arquivo)) {
                            $($wizard).find(".btn-next").hide();
                            $($wizard).find(".btn-finish").show();
                        } else {
                            setTimeout(() => $(".btn-back").trigger("click"), 200);
                            return false;
                        }
                    }
                } else {
                    Swal2.fire({
                        title: "Ops... tivemos um problema!",
                        text: "É necessário informar o arquivo contendo a planilha para realizar a importação.",
                        icon: "error",
                        confirmButtonColor: "red",
                        confirmButtonText: "Fechar",
                    });
                    setTimeout(() => $(".btn-back").trigger("click"), 200);
                    return false;
                }
            } else {
                $($wizard).find(".btn-next").show();
                $($wizard).find(".btn-finish").hide();
            }
        },
    },
});

action = "importarAluno";
