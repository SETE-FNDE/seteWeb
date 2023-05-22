// modais.js
// Este arquivo contém um conjunto de modais genéricos que podem ser utilizados por outras parte do sistema
// modais.js
// Este arquivo contém um conjunto de modais genéricos que podem ser utilizados por outras parte do sistema
let Swal2 = Swal;

/**
 * Cria um modal de erro..
 * @param {Array<String>} mensagens - Um array com as mensagens de erro.
 * @param {String} titulo - Título do modal, por padrão mostra "Ops... tivemos um problema.".
 */
function criarModalErro(mensagens, titulo = "Ops... tivemos um problema") {
    let msgErro = "<ul>";
    if (typeof mensagens == "string") {
        msgErro += `<li>${mensagens}</li>`;
    } else {
        for (const value of Object.values(mensagens)) {
            msgErro += `<li>${value}</li>`;
        }
    }

    msgErro = msgErro + "</ul><br />";
    msgErro =
        msgErro +
        `Caso o erro persista, contate a equipe de suporte (0800 616161) ou 
    utilize o sistema de chamado de suporte da equipe CECATE-UFG (<a>https://suporte.transportesufg.eng.br/</a>)`;

    return Swal2.fire({
        html: msgErro,
        title: titulo,
        icon: "error",
        type: "error",
        confirmButtonText: "Fechar",
        confirmButtonColor: "orange",
        showCancelButton: true,
        cancelButtonText: '<i class="fa fa-phone"></i> 0800 616161',
        cancelButtonColor: "green",
        showDenyButton: true,
        denyButtonText: '<i class="fa fa-envelope"></i> Abrir chamado',
        denyButtonColor: "gray",
    }).then((result) => {
        if (result.isDenied) {
            if (isElectron) {
                // envia IPC para processo main abrir o site de suporte no navegador
                window.sete.abrirSite(SUPORTE_URL);
            } else {
                window.open(SUPORTE_URL, "_blank").focus();
            }
        }
    });
}

/**
 * Processa uma mensagem de erro comum.
 * @param {Object} err - O erro gerado.
 */
function criarModalErroComum(err) {
    if (err?.response?.data?.messages) {
        criarModalErro(err.response.data.messages);
    } else {
        criarModalErro([err?.request?.responseURL, err?.message]);
    }
}

// Função genérica para relatar erros
function errorFn(msg, err = "", title = "Ops... tivemos um problema!") {
    return criarModalErro(msg);
}

/**
 * Cria um modal de loading, onde o usuário não pode sair do modal
 * @param {String} titulo - O título do modal.
 * @param {String} descricao - A mensagem a ser exibida. Por padrão mostra "Aguarde, estamos processando...".
 */
function criarModalLoading(titulo, descricao = "Aguarde, estamos processando...") {
    return Swal2.fire({
        title: titulo,
        text: descricao,
        imageUrl: "img/icones/processing.gif",
        closeOnClickOutside: false,
        allowOutsideClick: false,
        showConfirmButton: false,
    });
}

/**
 * Cria um modal para confirmar uma ação
 * @param {String} titulo - Título do modal.
 * @param {String} descricao - Descrição do modal.
 * @param {String} labelBotao - Label que será utilizado pelo botão. Por padrão é: "Sim, Remover".
 */
function criarModalConfirmacaoAcao(titulo, descricao, labelBotao = "Sim, Remover") {
    return Swal2.fire({
        title: titulo,
        text: descricao,
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#d33",
        cancelButtonColor: "#3085d6",
        cancelButtonText: "Cancelar",
        confirmButtonText: labelBotao,
    });
}

function criarModalQuestionar(titulo, descricao) {
    return Swal2.fire({
        title: titulo,
        text: descricao,
        icon: "question",
        showCancelButton: true,
        confirmButtonColor: "#3085d6",
        cancelButtonColor: "#d33",
        cancelButtonText: "Cancelar",
        confirmButtonText: "Sim",
    });
}

// Função genérica para crair um dialogo que questiona se o usuário tem certeza
function goaheadDialog(msgTitle, msgDesc) {
    return criarModalQuestionar(titulo, descricao);
}

function criarModalConfirmarCancelar(titulo = "Cancelar Edição?", descricao = "Se você cancelar nenhum alteração será feita.") {
    return Swal2.fire({
        title: titulo,
        text: descricao,
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#d33",
        cancelButtonColor: "#3085d6",
        cancelButtonText: "Voltar a editar",
        confirmButtonText: "Sim, cancelar",
    });
}

// Função genérica para criar um diálogo de sucesso
function criarModalSucesso(msgTitle = "Parabéns!", msgDesc = "A operação ocorreu com sucesso.") {
    return Swal2.fire({
        title: msgTitle,
        text: msgDesc,
        icon: "success",
        button: "Fechar",
    });
}
