// relatorio-rota-ctrl.js
// Este arquivo contém o script de controle da tela relatorio-aluno-view. 

// Preenchimento da Tabela via SQL
var relatorios = new Map();

restImpl.dbGETEntidade(DB_TABLE_GRAFICOS, "/rotas")
    .then((res) => {
        for (let r of res.data) {
            if (r["titulo"].toLowerCase().includes("total") && !(r["nome"].toLowerCase().includes("total"))) {
                r["nome"] += " Total"
            }
            r["tipo"] = "barra";
            relatorios.set(r.nome, r);

            $("#menuRelatorio").append(
                `<a href="#" name="${r.nome}" class="list-group-item list-group-item-action">
                ${r.nome}
                </a>`);
        }

        $("#menuRelatorio a").on("click", (e) => {
            $(".card-report").fadeOut(300, () => {
                e.preventDefault()
                var $that = $(e.target);
                $($that).parent().find('a').removeClass('active');
                $that.addClass('active');

                var optName = $that.attr('name');
                var opt = relatorios.get(optName);

                // Grafico
                if (graficoAtual?.destroy) {
                    graficoAtual.destroy();
                }
                $("#grafico").empty();
                graficoAtual = plotGraphic("#grafico", opt);

                $(".card-report").fadeIn(300);
            });
        });

        $("#menuRelatorio a:first-child").trigger("click");
    }).catch((err) => {
        debugger
        console.log(err);
        errorFn(err);
    })


action = "relatorioRota";