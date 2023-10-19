// Main class that does the routing optimization
// It calls each individual algorithm

// Imports and Algorithms
var ClarkeWrightSchoolBusRouting = require("./clarke-wright-schoolbus-routing.js");
var TwoOpt = require("./twoopt.js");
var SchoolBusKMeans = require("./kmeans.js");
var { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

class RoutingOptimizationWorker {
    constructor(cachedODMatrix, routingParams, spatialiteDB) {
        this.cachedODMatrix = cachedODMatrix;
        this.routingParams = routingParams;
        this.spatialiteDB = spatialiteDB;
        this.reverseMap = new Map();

        routingParams["stops"].forEach((s) => {
            let key = Number(s["lat"]).toFixed(10) + "-" + Number(s["lng"]).toFixed(10);
            let stopsAtGivenLocation = [];
            if (this.reverseMap.has(key)) {
                stopsAtGivenLocation = this.reverseMap.get(key);
            }
            stopsAtGivenLocation.push(s);

            this.reverseMap.set(key, stopsAtGivenLocation);
        });

        console.log("--> --> --> PARAMETROS DE ROTEIRIZAÇÃO")
        console.log(routingParams)
        console.log("--> --> --> PARAMETROS DE ROTEIRIZAÇÃO")
    }

    getStops(rawCluster) {
        let stops = new Array();
        let stopsConsidered = new Map();

        rawCluster.forEach((rc) => {
            let key = Number(rc[0]).toFixed(10) + "-" + Number(rc[1]).toFixed(10);
            let stopsAtGivenLocation = this.reverseMap.get(key);

            if (!stopsConsidered.has(key)) {
                stops.push(...stopsAtGivenLocation)
                stopsConsidered.set(key, true);
            }
        });

        return stops;
    }

    optimize() {
        return new Promise((resolve, reject) => {
            // Activate spatial db
            this.spatialiteDB.spatialite((dbError) => {
                console.log("--> --> --> INICIO KMEANS");

                if (dbError) {
                    reject("ERRO AO ABRIR MALHA");
                }

                let routers = new Array();
                let busRoutes = new Array();
                let kmeans = new SchoolBusKMeans(this.routingParams);
                let routingGraph;

                kmeans.partition(this.routingParams["numVehicles"])
                    .then(async (clusters) => {
                        console.log("--> --> --> FINALIZOU KMEANS");
                        console.log("--> --> --> INICIOU CLARK AND WRIGHT + SpeedRoute");

                        let clusterizedStops = new Array();
                        clusters.forEach((c) => clusterizedStops.push(this.getStops(c.cluster)))
                        let clarkAlgorithmsPromise = new Array();

                        if (this.routingParams["multiplePass"]) {
                            console.log("--> --> --> --> INICIO DE MULTIPLE PASS");
                            let veiculos = this.routingParams["vehicles"];
                            let param = Object.assign({}, this.routingParams);
                            // veiculos = [3, 2, 2, 2, 2];

                            // Rodaremos o algoritmo para cada veículo
                            // Isto é, consideraremos a restrição de cada veículo
                            for (let v of veiculos) {
                                // Ajusta os parâmetros para a capacidade do veículo atual
                                param = Object.assign({}, param);
                                param["maxCapacity"] = v;

                                // Executa o algoritmo
                                let cwalg = new ClarkeWrightSchoolBusRouting(this.cachedODMatrix, param, this.spatialiteDB);
                                await cwalg.spatialRoute();

                                // Deixa apenas a maior rota, uma vez que estamos considerando apenas o veículo da rodada
                                let maiorRota;
                                let tamMaiorRota = 0;
                                for (let rota of cwalg.routes.values()) {
                                    if (rota.route.length > tamMaiorRota) {
                                        maiorRota = rota;
                                        tamMaiorRota = rota.route.length;
                                    }
                                }
                                cwalg.routes = new Map();
                                cwalg.routes.set(maiorRota.busID, maiorRota)

                                // Faz o push das promisses com os resultados
                                clarkAlgorithmsPromise.push(Promise.resolve(cwalg.routes));
                                routers.push(cwalg);
                                
                                // Remove os alunos atendidos da rota extraída de params
                                let setAlunosAtendidos = new Set(maiorRota.route);
                                let arrAlunosRestantes = param["stops"].filter(el => !setAlunosAtendidos.has(el.key));
                                param["stops"] = arrAlunosRestantes;

                                // Se não tem que atender mais nenhum aluno, saí do laço
                                if (arrAlunosRestantes.length == 0) {
                                    break;
                                }
                                
                                // Ajusta as escolas, para somente as dos estudantes atuais
                                let setEscolasAlunosRestantes = new Set();
                                let arrEscolasAlunosRestantes = new Array()
                                arrAlunosRestantes.forEach(student => setEscolasAlunosRestantes.add(student["school"]));
                                param["schools"].forEach(school => {
                                    if (setEscolasAlunosRestantes.has(school["key"])) {
                                        arrEscolasAlunosRestantes.push(school);
                                    }
                                })
                                param["schools"] = arrEscolasAlunosRestantes;
                            }
                        } else {
                            clusterizedStops.forEach((cs) => {
                                let param = Object.assign({}, this.routingParams);
                                param["stops"] = cs;
    
                                // Deixar apenas as escolas que atendem os alunos no conjunto
                                let clusterSchoolsSet = new Set()
                                cs.forEach(student => clusterSchoolsSet.add(student["school"]))
                                let clusterSchools = new Array()
                                this.routingParams.schools.forEach(school => {
                                    if (clusterSchoolsSet.has(school["key"])) {
                                        clusterSchools.push(school);
                                    }
                                })
                                param["schools"] = clusterSchools;
    
                                let cwalg = new ClarkeWrightSchoolBusRouting(this.cachedODMatrix, param, this.spatialiteDB);
                                clarkAlgorithmsPromise.push(cwalg.spatialRoute());
                                routers.push(cwalg);
                            })
                        }
                       

                        // let schoolBusRouter = new ClarkeWrightSchoolBusRouting(this.routingParams, this.spatialiteDB);
                        // schoolBusRouter.spatialRoute().then((busRoutes) => {
                        return Promise.all(clarkAlgorithmsPromise)
                    })
                    .then((busRoutesGenerated) => {
                        console.log("--> --> --> FINALIZOU CLARK AND WRIGHT + SpeedRoute");
                        console.log("--> --> --> INICIOU RECONSTRUÇÃO MALHA DAS ESCOLAS");

                        // Bus Routes
                        busRoutes = busRoutesGenerated;

                        // Routing Graph and rebuilding cache
                        var matrixMap = new Map();
                        routers.forEach((alg) => {
                            matrixMap = new Map([...matrixMap, ...alg.graph.matrix])

                            this.cachedODMatrix.nodes = {
                                ...this.cachedODMatrix.nodes,
                                ...alg.graph.cachedODMatrix.nodes
                            }

                            for (let n in alg.graph.cachedODMatrix.dist) {
                                this.cachedODMatrix.dist[n] = {
                                    ...this.cachedODMatrix.dist[n],
                                    ...alg.graph.cachedODMatrix.dist[n]
                                }
                            }

                            for (let n in alg.graph.cachedODMatrix.cost) {
                                this.cachedODMatrix.cost[n] = {
                                    ...this.cachedODMatrix.cost[n],
                                    ...alg.graph.cachedODMatrix.cost[n]
                                }
                            }
                        })
                        routingGraph = routers[0].graph;
                        routingGraph.setMatrix(matrixMap);
                        routingGraph.setCachedODMatrix(this.cachedODMatrix);

                        return Promise.all(routingGraph.buildInnerCityMatrix())
                    })
                    .then(() => {
                        console.log("--> --> --> FINALIZOU RECONSTRUÇÃO MALHA DAS ESCOLAS");
                        console.log("--> --> --> INICIOU 2-3-OPT");

                        // Run opt
                        let optimizedRoutes = new Array();

                        // Compute Route JSON (need to run at promise)
                        var promises = new Array();

                        // Iterate result
                        let i = 0;
                        for (i = 0; i < busRoutes.length; i++) {
                            var genRoutes = busRoutes[i];
                            // Print Routes
                            // console.log(genRoutes);

                            genRoutes.forEach((r) => {
                                // console.log("ANTES", r.route)
                                let optRoute = new TwoOpt(r, routingGraph).optimize();
                                // console.log("DEPOIS", optRoute.route)
                                optimizedRoutes.push(optRoute);
                            })

                            optimizedRoutes.forEach((r) => {
                                promises.push(r.toPlainJSON(routingGraph, this.spatialiteDB));
                            });
                        }

                        return Promise.all(promises)
                    })
                    .then((routesJSON) => {
                        console.log("--> --> --> FINALIZOU 2-3-OPT");
                        console.log("--> --> --> INICIOU TRADUÇÃO DE ROTA PARA GEOJSON");

                        var fc = new Map();
                        routesJSON.forEach((r) => {
                            var ckey = r["path"].map(a => a["id"]).join("-")
                            fc.set(ckey, r);
                        })
                        // console.log([...fc.values()]);
                        console.log("--> --> --> FINALIZOU TRADUÇÃO DE ROTA PARA GEOJSON");
                        resolve([this.cachedODMatrix, ...fc.values()])
                    })
            })
        });
    };
}


if (isMainThread) {
    module.exports = class RoutingOptimization {
        constructor(app, dbPath) {
            this.app = app;
            this.dbPath = dbPath;

            this.worker = new Worker(__filename, {
                workerData: {
                    "dbPath": this.dbPath
                }
            });

            this.worker.on('message', (payload) => {
                console.log("MESSAGE", payload)
                if (!payload.error) {
                    app.emit("worker:finaliza-geracao-rotas", payload.result)
                } else {
                    app.emit("worker:obtem-erro-geracao-rotas", payload.result)
                }
            });

            this.worker.on('error', (err) => {
                app.emit("worker:obtem-erro-geracao-rotas", err)
                console.log("ERROR", err)
            });

            this.worker.on('exit', (code) => {
                console.log("WORKER EXITING WITH CODE", code)
            });
        }

        quit() {
            this.worker.terminate();
        }

        optimize(cachedODMatrix, routingParams) {
            this.worker.postMessage({ cachedODMatrix, routingParams })
        }
    }
} else {
    console.log("WORKER STARTED");
    console.log(workerData)

    let { dbPath } = workerData;

    var spatialite = require("spatialite");
    var spatialiteDB = new spatialite.Database(dbPath);

    parentPort.on('message', processData => {
        let { cachedODMatrix, routingParams } = processData;
        var routerWorker = new RoutingOptimizationWorker(cachedODMatrix, routingParams, spatialiteDB)
        routerWorker.optimize()
            .then((res) => {
                console.log("WORKER FINISHED")
                parentPort.postMessage({ error: false, result: res })
                // process.exit(0)
            })
            .catch((err) => {
                console.log("WORKER ERROR")
                parentPort.postMessage({ error: true, result: err })
                // process.exit(1)
            })

    })
}
