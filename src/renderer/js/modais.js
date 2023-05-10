// modais.js
// Este arquivo contém um conjunto de modais genéricos que podem ser utilizados por outras parte do sistema

let Swal2 = Swal;

/**
 * Cria um modal de erro..
 * @param {String} mensagem - A mensagem de erro.
 * @param {String} titulo - Título do modal, por padrão mostra "Ops... tivemos um problema.".
 */
function criarModalErro(mensagem, titulo = "Ops... tivemos um problema") {
    let msgErro = "<ul>";
    if (typeof erro == "string" && erro != "") {
        mensagem = erro + mensagem;
    } else if (erro && erro?.response?.data?.messages) {
        for (const [key, value] of Object.entries(erro.response.data.messages)) {
            msgErro += `<li>${value}</li>`;
        }
        msg = msgErro + "</ul>";
    }

    return Swal2.fire({
        html: mensagem,
        title: titulo,
        icon: "error",
        type: "error",
        confirmButtonText: "Fechar",
        confirmButtonColor: "orange",
    });
}

/**
 * Cria um modal de erro com links para entrar em contato com o suporte.
 * @param {Object} erro - Erro encontrado.
 */
function criarModalErroSuporte(erro) {
    mensagem = `Caso o erro persista, contate a equipe de suporte (0800 616161) ou 
        utilize o sistema de chamado de suporte da equipe CECATE-UFG (<a>https://suporte.transportesufg.eng.br/</a>)`;
    let msgErro = "<ul>";
    if (typeof erro == "string" && erro != "") {
        mensagem = erro + mensagem;
    } else if (erro && erro?.response?.data?.messages) {
        for (const [key, value] of Object.entries(erro.response.data.messages)) {
            msgErro += `<li>${value}</li>`;
        }
        msg = msgErro + "</ul>";
    }

    return Swal2.fire({
        title: title,
        html: msg,
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
            shell.openExternal("https://suporte.transportesufg.eng.br/");
        }
    });
}

// Função genérica para relatar carregamento
function criarModalLoading(msgTitle, msgDesc = "Aguarde, estamos processando...") {
    return Swal2.fire({
        title: msgTitle,
        imageUrl: "img/icones/processing.gif",
        closeOnClickOutside: false,
        allowOutsideClick: false,
        showConfirmButton: false,
        text: msgDesc,
    });
}

// Função genérica para criar um diálogo de confirmação de exclusão
function criarModalConfirmacaoAcao(msgTitle, msgDesc, buttonDesc = "Sim, remover") {
    return Swal2.fire({
        title: msgTitle,
        text: msgDesc,
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#d33",
        cancelButtonColor: "#3085d6",
        cancelButtonText: "Cancelar",
        confirmButtonText: buttonDesc,
    });
}

// Função genérica para crair um dialogo que questiona se o usuário tem certeza
function goaheadDialog(msgTitle, msgDesc) {
    return Swal2.fire({
        title: msgTitle,
        text: msgDesc,
        icon: "question",
        showCancelButton: true,
        confirmButtonColor: "#3085d6",
        cancelButtonColor: "#d33",
        cancelButtonText: "Cancelar",
        confirmButtonText: "Sim",
    });
}

// Função genérica para criar um diálogo de cancelamento de edição
function criarModalConfirmarCancelar(msgTitle = "Cancelar Edição?", msgDesc = "Se você cancelar nenhum alteração será feita.") {
    return Swal2.fire({
        title: msgTitle,
        text: msgDesc,
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
