(function () {
  "use strict";
  var cs = new CSInterface();
  var core = window.YT2PRCore;
  var os = require("os"), path = require("path"), fs = require("fs");
  var $ = function (id) { return document.getElementById(id); };

  var extDir = cs.getSystemPath("extension");
  var binDir = path.join(cs.getSystemPath("userData"), "YT2PR", "bin");
  var duration = 0, job = null;

  // (Re)charge le script Premiere à chaque ouverture, pour qu'une mise à jour de host.jsx soit prise en compte.
  var loadHost = '$.evalFile("' + path.join(extDir, "jsx", "host.jsx").replace(/\\/g, "/") + '");';
  cs.evalScript(loadHost);

  var verFile = path.join(extDir, ".version");
  try { $("updmsg").textContent = "Version installée : " + fs.readFileSync(verFile, "utf8"); } catch (e) { $("updmsg").textContent = "Version installée : d'origine"; }
  $("branch").value = localStorage.getItem("yt2pr.branch") || core_branch();
  $("token").value = localStorage.getItem("yt2pr.token") || "";
  function core_branch() { return window.YT2PRUpdater.DEFAULT_BRANCH; }

  $("update").onclick = function () {
    localStorage.setItem("yt2pr.branch", $("branch").value.trim());
    localStorage.setItem("yt2pr.token", $("token").value.trim());
    $("update").disabled = true; $("updmsg").textContent = "Mise à jour…";
    window.YT2PRUpdater.update({ extDir: extDir, branch: $("branch").value.trim(), token: $("token").value.trim() }, log)
      .then(function (r) {
        try { fs.writeFileSync(verFile, r.version); } catch (e) {}
        if (r.needsRestart) { $("updmsg").textContent = "Mis à jour (" + r.version + "). Le manifest a changé : redémarrez Premiere Pro."; $("update").disabled = false; return; }
        $("updmsg").textContent = r.changed.length ? "Mis à jour (" + r.version + "), rechargement…" : "Déjà à jour (" + r.version + ").";
        if (r.changed.length) setTimeout(function () { location.reload(); }, 600); else $("update").disabled = false;
      })
      .catch(function (e) { $("updmsg").textContent = "Échec : " + e.message; $("update").disabled = false; });
  };

  function setStatus(msg, cls) { $("status").textContent = msg; $("status").className = "status " + (cls || ""); }
  function log(msg) { var l = $("log"); l.textContent += msg + "\n"; l.scrollTop = l.scrollHeight; }
  function progress(p) { $("progress").classList.remove("hidden"); $("bar").style.width = Math.round(p * 100) + "%"; }
  function busy(b) { $("info").disabled = b; }

  // Dossier par défaut : à côté du projet Premiere, sinon Vidéos/Movies de l'utilisateur.
  function defaultOutDir(cb) {
    var saved = localStorage.getItem("yt2pr.outdir");
    if (saved) return cb(saved);
    cs.evalScript("yt2prProjectDir()", function (dir) {
      var base = dir && dir !== "undefined" && dir !== "EvalScript error." ? dir : path.join(os.homedir(), process.platform === "darwin" ? "Movies" : "Videos");
      cb(path.join(base, "YT2PR_downloads"));
    });
  }

  ["format", "cookies", "autoimport", "autoinsert"].forEach(function (id) {
    var el = $(id), key = "yt2pr." + id, v = localStorage.getItem(key);
    if (v !== null) { if (el.type === "checkbox") el.checked = v === "1"; else el.value = v; }
    el.addEventListener("change", function () { localStorage.setItem(key, el.type === "checkbox" ? (el.checked ? "1" : "0") : el.value); });
  });
  defaultOutDir(function (d) { $("outdir").value = d; });
  $("outdir").addEventListener("change", function () { localStorage.setItem("yt2pr.outdir", $("outdir").value); });

  $("paste").onclick = function () {
    (navigator.clipboard && navigator.clipboard.readText ? navigator.clipboard.readText() : Promise.reject())
      .then(function (t) { $("url").value = t.trim(); }).catch(function () { $("url").focus(); setStatus("Collez le lien avec Ctrl/Cmd+V."); });
  };
  $("browse").onclick = function () {
    var r = window.cep.fs.showOpenDialogEx(false, true, "Dossier de destination", $("outdir").value);
    if (r.data && r.data[0]) { $("outdir").value = r.data[0]; localStorage.setItem("yt2pr.outdir", r.data[0]); }
  };
  $("togglelog").onclick = function (e) { e.preventDefault(); $("log").classList.toggle("hidden"); };

  $("info").onclick = function () {
    var url = $("url").value.trim();
    if (!core.isSupportedUrl(url)) return setStatus("Lien invalide.", "err");
    busy(true); setStatus("Analyse du lien…");
    core.ensureYtdlp(binDir, log, progress)
      .then(function (y) { return core.fetchInfo(y, url, $("cookies").value); })
      .then(function (i) {
        duration = i.duration;
        $("title").textContent = i.title;
        $("duration").textContent = i.duration ? "Durée : " + core.formatSeconds(i.duration) : "";
        $("thumb").src = i.thumbnail || "";
        $("meta").classList.remove("hidden");
        setStatus("");
      })
      .catch(function (e) { setStatus("Impossible d'analyser : " + e.message.split("\n").pop(), "err"); log(e.message); })
      .then(function () { busy(false); $("progress").classList.add("hidden"); });
  };
  $("url").addEventListener("input", function () { duration = 0; $("meta").classList.add("hidden"); });

  /* ---------- File d'attente : un seul téléchargement à la fois ---------- */
  var MAX_PARALLEL = 1, running = 0, waiting = [], importChain = Promise.resolve();

  // Les imports dans Premiere sont faits un par un (chacun voit les pistes déjà occupées par le précédent).
  function importInPremiere(file, insert) {
    importChain = importChain.then(function () {
      return new Promise(function (resolve) {
        var esc = file.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        cs.evalScript(loadHost + 'yt2prImport("' + esc + '", "' + insert + '")', function (res) { resolve(res); });
      });
    });
    return importChain;
  }

  function makeCard(label) {
    var el = document.createElement("div"); el.className = "job";
    el.innerHTML = '<div class="jt"></div><div class="jbar"><div></div></div><div class="jstatus"></div><button class="jx">Annuler</button>';
    el.querySelector(".jt").textContent = label;
    $("jobs").insertBefore(el, $("jobs").firstChild);
    return {
      el: el,
      status: function (m, cls) { var n = el.querySelector(".jstatus"); n.textContent = m; n.className = "jstatus " + (cls || ""); },
      progress: function (p) { el.querySelector(".jbar > div").style.width = Math.round(p * 100) + "%"; },
      button: el.querySelector(".jx")
    };
  }

  function shortLabel(o) {
    var t = o.url.replace(/^https?:\/\/(www\.)?/, "");
    t = t.length > 48 ? t.slice(0, 45) + "…" : t;
    return t + (o.start || o.end ? "  [" + (o.start || "0") + " → " + (o.end || "fin") + "]" : "");
  }

  function startJob(j) {
    running++;
    j.card.status("Démarrage…");
    j.handle = core.startDownload(j.opts, {
      log: function (m) { log("[" + j.n + "] " + m); },
      status: function (m) { j.card.status(m); },
      progress: function (p) { j.card.progress(p); }
    });
    j.card.button.onclick = function () { j.handle.cancel(); };

    j.handle.promise.then(function (file) {
      log("[" + j.n + "] Fichier : " + file);
      if (!j.autoimport) { j.card.status("Terminé : " + file, "ok"); return; }
      j.card.status("Import dans Premiere…");
      return importInPremiere(file, j.autoinsert).then(function (res) {
        try { var r = JSON.parse(res); j.card.status(r.ok ? "Terminé ! " + r.msg : "Téléchargé, mais : " + r.msg, r.ok ? "ok" : "err"); }
        catch (e) { log("Réponse Premiere : " + res); j.card.status("Téléchargé, mais import impossible. Réponse de Premiere : " + res, "err"); }
      });
    }).catch(function (e) {
      j.card.status(e.message.split("\n")[0] === "Annulé." ? "Annulé." : "Erreur : " + e.message.split("\n").slice(0, 2).join(" "), "err");
      log("[" + j.n + "] " + (e.stack || e.message));
    }).then(function () {
      running--; j.done = true;
      j.card.button.textContent = "Fermer";
      j.card.button.onclick = function () { j.card.el.remove(); };
      pump();
    });
  }

  function pump() { while (running < MAX_PARALLEL && waiting.length) startJob(waiting.shift()); }

  var jobCount = 0;
  $("go").onclick = function () {
    var url = $("url").value.trim();
    if (!core.isSupportedUrl(url)) return setStatus("Lien invalide.", "err");
    var opts = { url: url, start: $("start").value, end: $("end").value, duration: duration,
      format: $("format").value, cookies: $("cookies").value, outDir: $("outdir").value, binDir: binDir };
    try { core.resolveRange(opts.start, opts.end, opts.duration); } catch (e) { return setStatus(e.message, "err"); }

    var j = { n: ++jobCount, opts: opts, autoimport: $("autoimport").checked, autoinsert: $("autoinsert").checked, card: makeCard(shortLabel(opts)) };
    j.card.status(running < MAX_PARALLEL ? "Démarrage…" : "En attente (file d'attente : un téléchargement à la fois)…");
    j.card.button.onclick = function () {
      var i = waiting.indexOf(j);
      if (i !== -1) { waiting.splice(i, 1); j.card.status("Annulé.", "err"); j.card.button.textContent = "Fermer"; j.card.button.onclick = function () { j.card.el.remove(); }; }
    };
    waiting.push(j); pump();

    // Formulaire prêt pour le lien suivant.
    $("url").value = ""; $("start").value = ""; $("end").value = ""; duration = 0;
    $("meta").classList.add("hidden"); setStatus("");
  };
})();
