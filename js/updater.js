/* Mise à jour du panneau depuis GitHub : télécharge les fichiers et remplace ceux installés. */
(function (root) {
  "use strict";
  var fs = require("fs");
  var path = require("path");
  var https = require("https");

  var REPO = "lexitstudio-a11y/yt2pr";
  var DEFAULT_BRANCH = "claude/youthful-bohr-jy4rq8";
  var INCLUDE = /^(index\.html|CSXS\/.+|css\/.+|js\/.+|jsx\/.+)$/;

  function get(url, headers) {
    return new Promise(function (resolve, reject) {
      var h = Object.assign({ "User-Agent": "YT2PR-updater" }, headers);
      https.get(url, { headers: h }, function (res) {
        var chunks = [];
        res.on("data", function (c) { chunks.push(c); });
        res.on("end", function () {
          var body = Buffer.concat(chunks);
          if (res.statusCode === 200) return resolve(body);
          var hint = res.statusCode === 404 ? " (branche introuvable, ou dépôt privé : renseignez un jeton GitHub)"
            : res.statusCode === 403 ? " (limite d'appels GitHub atteinte, réessayez plus tard ou renseignez un jeton)"
            : res.statusCode === 401 ? " (jeton GitHub invalide)" : "";
          reject(new Error("GitHub HTTP " + res.statusCode + hint));
        });
      }).on("error", reject);
    });
  }

  // opts: {extDir, branch?, token?}. Retourne {version, changed:[…], needsRestart}
  async function update(opts, log) {
    var branch = opts.branch || DEFAULT_BRANCH;
    var auth = opts.token ? { Authorization: "Bearer " + opts.token } : {};
    var api = "https://api.github.com/repos/" + REPO;

    log("Recherche de la dernière version (" + branch + ")…");
    var tree = JSON.parse(await get(api + "/git/trees/" + encodeURIComponent(branch) + "?recursive=1",
      Object.assign({ Accept: "application/vnd.github+json" }, auth)));
    var files = tree.tree.filter(function (n) { return n.type === "blob" && INCLUDE.test(n.path); });
    if (!files.length) throw new Error("Aucun fichier de l'extension trouvé sur la branche " + branch + ".");

    // Tout télécharger d'abord : on n'écrit rien si un téléchargement échoue.
    var downloaded = [];
    for (var i = 0; i < files.length; i++) {
      var p = files[i].path;
      var url = api + "/contents/" + p.split("/").map(encodeURIComponent).join("/") + "?ref=" + encodeURIComponent(branch);
      downloaded.push({ path: p, data: await get(url, Object.assign({ Accept: "application/vnd.github.raw" }, auth)) });
    }

    var changed = [];
    downloaded.forEach(function (f) {
      var dest = path.join(opts.extDir, f.path);
      var old = fs.existsSync(dest) ? fs.readFileSync(dest) : null;
      if (old && old.equals(f.data)) return;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, f.data);
      changed.push(f.path);
    });
    return {
      version: tree.sha.slice(0, 7),
      changed: changed,
      needsRestart: changed.indexOf("CSXS/manifest.xml") !== -1
    };
  }

  root.YT2PRUpdater = { update: update, DEFAULT_BRANCH: DEFAULT_BRANCH };
  if (typeof module !== "undefined" && module.exports) module.exports = root.YT2PRUpdater;
})(typeof window !== "undefined" ? window : globalThis);
