// Main class that does the routing optimization
// It calls each individual algorithm

// Imports and Algorithms
// var ClarkeWrightSchoolBusRouting = require("./clarke-wright-schoolbus-routing.js");
// var TwoOpt = require("./twoopt.js");
// var SchoolBusKMeans = require("./kmeans.js");
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");
const RoutingGraph = require("../routing/routing-graph");
const dbscan = require("@cdxoo/dbscan");

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

    optimize() {
        return new Promise((resolve, reject) => {
            // Activate spatial db
            this.spatialiteDB.spatialite(async (dbError) => {
                if (dbError) {
                    reject("ERRO AO ABRIR MALHA");
                }

                await this.buildSpatialIndex();
                this.buildSpatialMatrix().then(async () => {
                    let dbscanResult = this.runDBSCAN(this.paramPontosDeParada["stops"]);
                    let dbscanClusters = dbscanResult.clusters;
                    let maxTravDist = this.paramPontosDeParada["maxTravDist"];

                    for (let c of dbscanClusters) {
                        let cluster = this.paramPontosDeParada["stops"].filter((elt, ix) => c.includes(ix));
                        let clat = 0;
                        let clng = 0;
                        for (let el of cluster) {
                            clng = clng + Number(el.lng);
                            clat = clat + Number(el.lat);
                        }
                        clat = clat / cluster.length;
                        clng = clng / cluster.length;

                        let { dbNodeID, nodeGeoJSON } = await this.graph.getRawSpatialVertex(clat, clng);
                        for (let el of cluster) {
                            let elVertex = this.graph.getVertex(el.key);
                            let elNodeID = elVertex.get("dbNodeID");
                            let distPrimeiraPerna = elVertex.get("distVertexOSM");
                            let distPonto = await this.graph.getRawSpatialDistance(elNodeID, dbNodeID);
                            let distanciaTotal = distPrimeiraPerna + distPonto;
                            console.log(distanciaTotal, distPrimeiraPerna, distPonto);

                            if (distanciaTotal > maxTravDist) {
                                console.log(distanciaTotal, maxTravDist);
                                console.log("Violou a distancia maxima permitida");
                            }
                            console.log("nodeGeoJSON", nodeGeoJSON);
                        }
                    }

                    console.log("termino");
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
