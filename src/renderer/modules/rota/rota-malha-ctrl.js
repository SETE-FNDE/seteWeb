// rota-malha-ctrl.js
// Este arquivo contém o script de controle da tela rota-malha-view. O memso
// permite importar os dados de uma rota no formato OSM

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
    // Listeners
    window?.sete?.onFinalizaSalvarMalhaOSM((evt, sucesso) => {
        sucesso ? criarModalSucesso() : criarModalErro("Erro ao baixar a malha deste município");
    });

    window?.sete?.onFinalizaSalvarNovaMalha((evt, sucesso) => {
        sucesso ? criarModalSucesso() : criarModalErro("Erro ao atualizar a malha deste município");
    });
}

$("#baixarMalha").on("click", () => {
    window?.sete?.salvarMalhaOSM(cidadeLatitude, cidadeLongitude).then((comecouSalvar) => {
        comecouSalvar ? criarModalLoading("Baixando a malha...", "Aguarde alguns minutinhos...") : null;
    });
});

$("#rota-malha-salvarNovaMalha").on("click", () => {
    let osmFilePath = $("#novaMalhaOSM")[0]?.files[0]?.path;
    if (osmFilePath) {
        criarModalLoading("Processando a malha...");
        window?.sete?.salvarNovaMalha(osmFilePath);
    }
});

// Wizard
$(".card-wizard").bootstrapWizard(configWizardBasico("", (usarValidador = false)));
