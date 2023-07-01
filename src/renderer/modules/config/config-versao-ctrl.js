// Scripts específicos da página
// Serão rodados quando o DOM tiver terminado de carregar
$(() => {
    // $("#appVersion").text(app.getVersion());
    // $("#archVersion").text(platform?.os?.architecture + " bits");
    fetch("../../package.json")
    .then((res) => res.json())
    .then((pkg) => $("#appVersion").text(pkg.version))

    if (typeof platform != "undefined") {
        $("#archVersion").text(platform?.os?.architecture + " bits");
        $("#platformVersion").text(platform?.name + " (" + platform?.version + ")");
        $("#osVersion").text(platform?.os?.family + " " + platform?.os?.version);
    } else {
        let userAgent = navigator.userAgent;
        let browserName;

        if (userAgent.match(/chrome|chromium|crios/i)) {
            browserName = "chrome";
        } else if (userAgent.match(/firefox|fxios/i)) {
            browserName = "firefox";
        } else if (userAgent.match(/safari/i)) {
            browserName = "safari";
        } else if (userAgent.match(/opr\//i)) {
            browserName = "opera";
        } else if (userAgent.match(/edg/i)) {
            browserName = "edge";
        } else {
            browserName = "No browser detection";
        }

        $("#archVersion").text(navigator.platform);
        $("#platformVersion").text(navigator.userAgent);
        $("#osVersion").text("NAVEGADOR " + browserName);
    
    }
});
