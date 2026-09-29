/* Mini-implémentation de CSInterface (API CEP) suffisante pour ce panneau. */
(function () {
  function CSInterface() {}

  CSInterface.prototype.evalScript = function (script, callback) {
    window.__adobe_cep__.evalScript(script, callback || function () {});
  };

  // Retourne un chemin système natif (extension, userData, …)
  CSInterface.prototype.getSystemPath = function (type) {
    var p = decodeURI(window.__adobe_cep__.getSystemPath(type));
    p = p.replace(/^file:\/\//, "");
    if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1); // Windows : /C:/… -> C:/…
    return p;
  };

  CSInterface.prototype.openURLInDefaultBrowser = function (url) {
    if (window.cep && window.cep.util) window.cep.util.openURLInDefaultBrowser(url);
  };

  window.CSInterface = CSInterface;
})();
