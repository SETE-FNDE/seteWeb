// Variáveis
var baseDados;
var ultArquivoAnalisado = "";

var dataTableCenso = $("#datatables").DataTable({
    columns: [
        { data: "SELECT", width: "5%" },
        { data: 'NOME', width: "95%" },
        { data: 'NUMERO', width: "200px" },
    ],
    columnDefs: [
        {
            targets: 1,
            type: 'locale-compare',
        },
        {
            targets: 0,
            'checkboxes': {
                'selectRow': true
            }
        }
    ],
    order: [[1, "asc"]],
    select: {
        style: 'multi',
        info: false
    },
    autoWidth: false,
    bAutoWidth: false,
    lengthMenu: [[10, 50, -1], [10, 50, "Todas"]],
    pagingType: "full_numbers",
    language: {
        "search": "_INPUT_",
        "searchPlaceholder": "Procurar escolas",
        "lengthMenu": "Mostrar _MENU_ escolas por página",
        "zeroRecords": "Não encontrei nenhuma escola com este filtro",
        "info": "Mostrando página _PAGE_ de _PAGES_",
        "infoEmpty": "Sem registros disponíveis",
        "infoFiltered": "(Escolas filtradas a partir do total de _MAX_ escolas)",
        "paginate": {
            "first": "Primeira",
            "last": "Última",
            "next": "Próxima",
            "previous": "Anterior"
        },
    },
    dom: 'lfrtip',
});

$("#datatables_filter input").on('keyup', function () {
    dataTableCenso.search(jQuery.fn.dataTable.ext.type.search["locale-compare"](this.value)).draw()
})

function tiraUndefined(obj) {
    Object.keys(obj).forEach(key => {
        if (obj[key] === undefined) {
            delete obj[key];
        }
    });
    return obj;
}

function callbackPreprocessCenso(err, arqProcessado, baseDadosProcessada) {
    dataTableCenso.clear();
    dataTableCenso.draw();
    if (err) {
        errorFn("Erro ao realizar o préprocessamento da base!");
        console.error(err)
        $('.card-wizard').bootstrapWizard('first')
    } else {
        ultArquivoAnalisado = arqProcessado;
        baseDados = baseDadosProcessada;
        setTimeout(() => Swal2.close(), 500)

        var count = 0;
        for (let [escolaID, escolaValues] of Object.entries(baseDadosProcessada)) {
            let escola = {
                ID: escolaID,
                NOME: escolaValues["NOME"],
                NUMERO: Object.keys(escolaValues["ALUNOS"]).length,
                SELECT: count++
            }
            if (Object.keys(escolaValues["ALUNOS"]).length > 0) {
                dataTableCenso.row.add(escola);
            }
        }
        dataTableCenso.draw();
        $("#datatables thead input[type='checkbox']").trigger('click');
    }
}

function preprocess(arquivo) {
    if (arquivo == undefined) {
        Swal2.fire({
            title: "Ops... tivemos um problema!",
            text: "É necessário informar o arquivo da base de dados para realizar a importação.",
            icon: "error",
            confirmButtonColor: "red",
            confirmButtonText: "Fechar",
        });
        return false;
    } else {
        Swal2.fire({
            title: "Importando a base de dados...",
            imageUrl: "img/icones/processing.gif",
            closeOnClickOutside: false,
            allowOutsideClick: false,
            showConfirmButton: false,
            text: "Aguarde, estamos pré-processando a base de dados..."
        })
        parseBaseCenso(arquivo, callbackPreprocessCenso);
        return true;
    }
}

function ConverteAlunoParaREST(aluno, idEscola) {
    let alunoJSON ={
        "id_escola": Number(idEscola),

        "nome": aluno["NOME"], // string
        "data_nascimento": aluno["DATA_NASCIMENTO"], // string
        "nome_responsavel": aluno["NOME_RESPONSAVEL"],
        
        "sexo": aluno["SEXO"], // int
        "cor": aluno["COR"], // int
        
        "mec_tp_localizacao": aluno["MEC_TP_LOCALIZACAO"],
        "turno": aluno["TURNO"], // int
        "nivel": aluno["NIVEL"],
        
        "def_caminhar": aluno["DEF_CAMINHAR"] ? "S" : "N", // str
        "def_ouvir": aluno["DEF_OUVIR"] ? "S" : "N", // str
        "def_enxergar": aluno["DEF_ENXERGAR"] ? "S" : "N", // str
        "def_mental": aluno["DEF_MENTAL"] ? "S" : "N", // str
    }

    if (aluno["mec_id_inep"]) alunoJSON["mec_id_inep"] = aluno["mec_id_inep"];
    if (aluno["mec_id_proprio"]) alunoJSON["mec_id_proprio"] = aluno["mec_id_proprio"];

    if (aluno["LOC_CEP"]) alunoJSON["loc_cep"] = aluno["LOC_CEP"];
    if (aluno["CPF"]) alunoJSON["cpf"] = String(aluno["CPF"]).replace(/\D/g, '');

    return alunoJSON;
}

function ConverteEscolaParaREST(escola) {
    let escolaJSON = Object.assign({}, escola);
    // Arrumando campos novos para os que já usamos. 
    // Atualmente os campos são em caixa alta (e.g. NOME ao invés de nome)
    // Entretanto, a API está retornando valores em minúsculo
    for (let attr of Object.keys(escolaJSON)) {
        escolaJSON[attr.toLowerCase()] = escolaJSON[attr];
        delete escolaJSON[attr]
    }

    // Transforma de boolean para "S" / "N"
    let propParaTransformar = ["MEC_IN_REGULAR", "MEC_IN_EJA", "MEC_IN_PROFISSIONALIZANTE", "MEC_IN_ESPECIAL_EXCLUSIVA",
        "ENSINO_FUNDAMENTAL", "ENSINO_PRE_ESCOLA", "ENSINO_MEDIO", "ENSINO_SUPERIOR",
        "HORARIO_MATUTINO", "HORARIO_VESPERTINO", "HORARIO_NOTURNO"];

    for (let prop of propParaTransformar) {
        if (escolaJSON[prop.toLowerCase()]) {
            escolaJSON[prop.toLowerCase()] = "S";
        } else {
            escolaJSON[prop.toLowerCase()] = "N";
        }
    }

    return escolaJSON;

}

async function realizaImportacao(rawDados) {
    Swal2.fire({
        title: "Importando os dados...",
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
        `
    })

    // Remover os dados selecionados do banco
    var dados = [].concat(rawDados);

    // Numero de operações a serem realizadas
    var numEscolas = dados.length;
    var numAlunos = 0;
    dados.forEach((escolaSelecionada) => {
        numAlunos += Object.keys(baseDados[escolaSelecionada["ID"]]["ALUNOS"]).length
    })
    var totalOperacoes = numEscolas + numAlunos; 

    // Barra de progresso (valor atual)
    var progresso = 0;

    function updateProgresso(n = 1) {
        progresso = progresso + n;
        let progressoPorcentagem = Math.round(100 * (progresso / totalOperacoes))
        $('.progress-bar').css('width', progressoPorcentagem + "%")
        $('.progress-bar').text(progressoPorcentagem + "%")
    }

    // Ao inserir os alunos, vamos guardar as escolas que eles estudam para
    // posteriormente adicionar na tabela escolatemalunos
    var relEscolaAluno = {};
    
    let censoEscolas = [];
    let censoAlunos = [];

    // Para cada escola
    for (let escolaSelecionada of dados) {
        // Zero dado da escola e aluno
        censoEscolas = [];
        censoAlunos = [];

        // Obtem uma cópia da escola
        let idEscola = escolaSelecionada["ID"];
        var escola = Object.assign({}, baseDados[idEscola])

        // Obtem uma cópia dos alunos
        var alunos = Object.assign({}, escola["ALUNOS"]);

        // Cria a chave desta escola no dicionário (para relacionar com os alunos)
        relEscolaAluno[idEscola] = new Array();

        // Para cada aluno desta escola
        for (var aluno of Object.values(alunos)) {
            // Constrói o ID do aluno utilizando o nome completo e a data de nascimento
            var idAluno = aluno["NOME"].replace(/ /g,"-") + "-" + 
                          aluno["DATA_NASCIMENTO"].replace(/\//g, "-")
            
            // Registra o vinculo deste aluno com esta escola (adiciona ao array)
            relEscolaAluno[idEscola].push(idAluno);

            // Insere o Aluno no Banco de Dados
            aluno = tiraUndefined(aluno);
            let alunoREST = ConverteAlunoParaREST(aluno, idEscola);
            censoAlunos.push(alunoREST);
        }

        if (Object.keys(escola["ALUNOS"]).length > 0) {
            // Apaga o atributo aluno da escola
            delete escola["ALUNOS"];

            // Adiciona esta escola no banco de dados
            escola = tiraUndefined(escola);
            let escolaREST = ConverteEscolaParaREST(escola);
            
            escolaREST["mec_co_municipio"] = codCidade;
            censoEscolas.push(escolaREST)
        }
        
        let payload = {
            "alunos": censoAlunos,
            "escolas": censoEscolas
        }

        let tam_update = censoAlunos.length + censoEscolas.length;
        try {
            await restImpl.dbPOST(DB_TABLE_CENSO, "", payload);
            updateProgresso(tam_update)
        } catch (error) {
            console.log(error);
            return errorFn("Erro ao importar os dados. Por favor contate a equipe de suporte em 0800 616161. " +
                           "Envie o arquivo da base de dados para verificar o que está acontecendo.", error);
        }
    }

    return Swal2.fire({
        title: "Parabéns!",
        text: "Os dados foram importados com sucesso.",
        icon: "success",
        type: "success",
        closeOnClickOutside: false,
        allowOutsideClick: false,
        button: "Fechar"
    })
    .then(() => {
        navigateDashboard("./dashboard-main.html");
    })
}

$('#importarAlunosCenso').on('click', () => {
    var rawDados = dataTableCenso.rows('.selected').data().toArray();
    if (rawDados.length == 0) {
        Swal2.fire({
            title: "Nenhuma escola selecionada",
            text: "Por favor, selecione pelo menos uma escola a ser importarda para prosseguir.",
            icon: "error",
            confirmButtonText: "Fechar"
        })
    } else {
        Swal2.fire({
            title: 'Você quer importar os dados selecionados?',
            text: "Você irá importar " + rawDados.length + " escolas para o banco de dados.",
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            cancelButtonText: "Cancelar",
            confirmButtonText: 'Sim'
        }).then((result) => {
            if (result.isConfirmed) {
                realizaImportacao(rawDados)
            }
        });
    }
});

// Wizard
$('.card-wizard').bootstrapWizard({
    'tabClass': 'nav nav-pills',
    'nextSelector': '.btn-next',
    'previousSelector': '.btn-back',

    onNext: function (tab, navigation, index) {
        window.scroll(0, 0);
        return true;
    },

    onTabClick: function (tab, navigation, index) {
        window.scroll(0, 0);
        return true;
    },

    onTabShow: function (tab, navigation, index) {
        var $total = navigation.find('li').length;
        var $current = index + 1;

        var $wizard = navigation.closest('.card-wizard');

        // If it's the last tab then hide the last button and show the finish instead
        if ($current >= $total) {
            var arquivo = $("#arqCenso")[0].files[0];
            if (ultArquivoAnalisado != arquivo) {
                if(preprocess(arquivo)) {
                    $($wizard).find('.btn-next').hide();
                    $($wizard).find('.btn-finish').show();
                } else {
                    setTimeout(() => $('.btn-back').trigger('click'), 200);
                    return false;
                }
            }
        } else {
            $($wizard).find('.btn-next').show();
            $($wizard).find('.btn-finish').hide();
        }
    }
});

Swal2.fire({
    title: "Erros no Sistema de Importação",
    text: "As mudanças de política de privacidade de dados (LGPD - Lei Geral de Proteção de Dados) têm dificultado a realização da importação de dados. Desta forma, você pode encontrar error ao tentar importar a sua base de dados do CENSO.",
    icon: "warning",
})
action = "importarCenso";