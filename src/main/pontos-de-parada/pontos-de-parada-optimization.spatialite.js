// Main class that does the routing optimization
// It calls each individual algorithm

// Imports and Algorithms
// var ClarkeWrightSchoolBusRouting = require("./clarke-wright-schoolbus-routing.js");
// var TwoOpt = require("./twoopt.js");
// var SchoolBusKMeans = require("./kmeans.js");
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");
const RoutingGraph = require("../routing/routing-graph");
const dbscan = require("@cdxoo/dbscan");
const haversine = require("haversine-distance");

class PontosDeParadaOptimizationWorker {
    constructor(cachedODMatrix, paramPontosDeParada, spatialiteDB) {
        this.cachedODMatrix = cachedODMatrix;
        this.paramPontosDeParada = paramPontosDeParada;
        this.spatialiteDB = spatialiteDB;
        this.reverseMap = new Map();

        this.graph = new RoutingGraph(this.cachedODMatrix, this.spatialiteDB, true);
        // Add Stops to routing graph
        this.paramPontosDeParada["stops"].forEach((s) => {
            this.graph.addStopVertex(s["key"], s["lat"], s["lng"], s["passengers"]);
        });
    }

    async buildSpatialIndex() {
        // return Promise.all(this.graph.buildSpatialVertex());
        return await this.graph.buildSpatialVertexSync();
    }

    buildSpatialMatrix() {
        return Promise.all(this.graph.buildSpatialMatrix());
        // return await this.graph.buildSpatialVertexSync();
    }
    
    clusterPCD(parametros) {
        let clustersDict = {};
        let alunosSemClusters = [];
        
        for (let alunoPCD of parametros.alunosComDef) {
            alunoPCD["distancia_ponto"] = 0;
            clustersDict[alunoPCD.key] = {
                "ALUNOS": [alunoPCD],
                "CENTRO": {
                    lat: alunoPCD.lat,
                    lng: alunoPCD.lng
                },
                "PCD": true,
                "DISTANCIA_MEDIA": 0
            }
        }

        for (let aluno of parametros.alunosSemDef) {
            let pertoDePCD = false;
            let menorDistancia = Number.MAX_SAFE_INTEGER;
            let alunoPCDMaisPerto = null;
            for (let alunoPCD of parametros.alunosComDef) {
                let avertex = this.graph.getVertex(aluno.key);
                let bvertex = this.graph.getVertex(alunoPCD.key);
                let primeiraperna = avertex.get("distVertexOSM");
                let distcorpo = avertex.get("spatialDistEdges").get(alunoPCD.key) || bvertex.get("spatialDistEdges").get(aluno.key);
                let ultimaperna = bvertex.get("distVertexOSM");
                let distancia = primeiraperna + distcorpo + ultimaperna;
                console.log(aluno.nome, alunoPCD.nome, distancia);

                if (distancia <= parametros.maxTravDist && distancia <= menorDistancia) {
                    pertoDePCD = true;
                    menorDistancia = distancia;
                    alunoPCDMaisPerto = alunoPCD;
                }
            }
            console.log("------")
            console.log(aluno.nome, pertoDePCD, alunoPCDMaisPerto?.nome)
            console.log("------")

            if (pertoDePCD) {
                aluno["distancia_ponto"] = menorDistancia;
                clustersDict[alunoPCDMaisPerto.key]["ALUNOS"].push(aluno);
            } else {
                alunosSemClusters.push(aluno);
            }
        }

        // Calcula distancia media
        for (let alunoPCD of parametros.alunosComDef) {
            let cluster = clustersDict[alunoPCD.key];
            let dist_media = cluster.ALUNOS.map((a) => a.distancia_ponto).reduce((acc, cur) => (acc = acc + cur), 0) / cluster.ALUNOS.length;
            clustersDict[alunoPCD.key]["DISTANCIA_MEDIA"] = dist_media;
        }

        return { alunosSemClusters, clusters: Object.values(clustersDict) };
    }

    runDBSCAN(dataset) {
        let maxTravDist = this.paramPontosDeParada["maxTravDist"];
        let dbscanResult = dbscan({
            dataset: dataset,
            epsilon: maxTravDist,
            minimumPoints: 2,
            distanceFunction: (a, b) => {
                let distancia = 0;
                if (a.key != b.key) {
                    let avertex = this.graph.getVertex(a.key);
                    let bvertex = this.graph.getVertex(b.key);

                    let primeiraperna = avertex.get("distVertexOSM");
                    let distcorpo = avertex.get("spatialDistEdges").get(b.key) || bvertex.get("spatialDistEdges").get(a.key);
                    let ultimaperna = bvertex.get("distVertexOSM");
                    distancia = primeiraperna + distcorpo + ultimaperna;
                }
                return distancia;
            },
        });

        return dbscanResult;
    }

    async processDBSCAN(dbscanAlg, alunosSemClusters) {
        let clusters = [];

        // Primeiro, vamos processar os pontos outliers (noise)
        for (let indexAlunoOutlier of dbscanAlg.noise) {
            let alunoOutlier = alunosSemClusters[indexAlunoOutlier]
            alunoOutlier["distancia_ponto"] = 0;
            clusters.push({
                "ALUNOS": [alunoOutlier],
                "CENTRO": {
                    "lat": alunoOutlier.lat,
                    "lng": alunoOutlier.lng,
                },
                "PCD": false,
                "DISTANCIA_MEDIA": 0
            })
        }

        // Demais alunos
        for (let indexCluster of dbscanAlg.clusters) {
            let alunosDoCluster = alunosSemClusters.filter((_, ix) => indexCluster.includes(ix));
            let clat = 0;
            let clng = 0;
            for (let el of alunosDoCluster) {
                clng = clng + Number(el.lng);
                clat = clat + Number(el.lat);
            }
            clat = clat / alunosDoCluster.length;
            clng = clng / alunosDoCluster.length;

            let { dbNodeID, nodeGeoJSON } = await this.graph.getRawSpatialVertex(clat, clng);
            let geoJSON = JSON.parse(nodeGeoJSON);
            
            // Calcula distancia até o ponto
            let distanciaMedia = 0;
            for (let el of alunosDoCluster) {
                let elVertex = this.graph.getVertex(el.key);
                let elNodeID = elVertex.get("dbNodeID");
                let distPrimeiraPerna = elVertex.get("distVertexOSM");
                let distPonto = await this.graph.getRawSpatialDistance(elNodeID, dbNodeID);
                let distanciaAoPonto = distPrimeiraPerna + distPonto;
                console.log(distanciaAoPonto, distPrimeiraPerna, distPonto);
                
                el["distancia_ponto"] = Number(distanciaAoPonto).toFixed(2);
                distanciaMedia = distanciaMedia + distanciaAoPonto;
            }
            distanciaMedia = distanciaMedia / alunosDoCluster.length;

            clusters.push({
                "ALUNOS": [...alunosDoCluster],
                "CENTRO": {
                    "lat": geoJSON.coordinates[1],
                    "lng": geoJSON.coordinates[0],
                },
                "PCD": false,
                "DISTANCIA_MEDIA": distanciaMedia
            })
            console.log(dbNodeID, nodeGeoJSON);

            
        }
        
        return clusters;
    }

    optimize() {
        return new Promise((resolve, reject) => {
            // Activate spatial db
            this.spatialiteDB.spatialite(async (dbError) => {
                if (dbError) {
                    reject("ERRO AO ABRIR MALHA");
                }

                await this.buildSpatialIndex();
                this.buildSpatialMatrix()
                    .then(() => this.clusterPCD(this.paramPontosDeParada))
                    .then(async ({ clusters, alunosSemClusters }) => {
                        let dbscanAlg = this.runDBSCAN(alunosSemClusters);
                        let dbscanClusters = await this.processDBSCAN(dbscanAlg, alunosSemClusters);
                        let clusterFinais = clusters.concat(dbscanClusters);



                        resolve({ clusters: clusterFinais, cachedODMatrix: this.graph.cachedODMatrix });
                    });
            });
        });
    }
}

if (isMainThread) {
    module.exports = class PontosDeParadaOptimization {
        constructor(app, dbPath) {
            this.app = app;
            this.dbPath = dbPath;

            this.worker = new Worker(__filename, {
                workerData: {
                    dbPath: this.dbPath,
                },
            });

            this.worker.on("message", (payload) => {
                console.log("MESSAGE", payload);
                if (!payload.error) {
                    app.emit("worker:finaliza-geracao-pontos-de-parada", payload.result);
                } else {
                    app.emit("worker:obtem-erro-geracao-pontos-de-parada", payload.result);
                }
            });

            this.worker.on("error", (err) => {
                app.emit("worker:obtem-erro-geracao-pontos-de-parada", err);
                console.log("ERROR", err);
            });

            this.worker.on("exit", (code) => {
                console.log("WORKER EXITING WITH CODE", code);
            });
        }

        quit() {
            this.worker.terminate();
        }

        optimize(cachedODMatrix, paramPontosDeParada) {
            this.worker.postMessage({ cachedODMatrix, paramPontosDeParada });
        }
    };
} else {
    console.log("WORKER STARTED");
    console.log(workerData);

    let { dbPath } = workerData;

    var spatialite = require("spatialite");
    var spatialiteDB = new spatialite.Database(dbPath);

    parentPort.on("message", (processData) => {
        let { cachedODMatrix, paramPontosDeParada } = processData;
        var pontosDeParadaWorker = new PontosDeParadaOptimizationWorker(cachedODMatrix, paramPontosDeParada, spatialiteDB);
        pontosDeParadaWorker
            .optimize()
            .then((res) => {
                console.log("WORKER FINISHED");
                parentPort.postMessage({ error: false, result: res });
            })
            .catch((err) => {
                console.log("WORKER ERROR");
                parentPort.postMessage({ error: true, result: err });
            });
    });
}
