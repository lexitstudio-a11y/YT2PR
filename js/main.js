(function () {
  "use strict";
  var cs = new CSInterface();
  var core = window.YT2PRCore;
  var os = require("os"), path = require("path"), fs = require("fs");
  var $ = function (id) { return document.getElementById(id); };

  var extDir = cs.getSystemPath("extension");
  var binDir = path.join(cs.getSystemPath("userData"), "YT2PR", "bin");
  var duration = 0, job = null;

  function setStatus(msg, cls) { $("status").textContent = msg; $("status").className = "status " + (cls || ""); }
  function log(msg) { var l = $("log"); l.textContent += msg + "\n"; l.scrollTop = l.scrollHeight; }
  function progress(p) { $("progress").classList.remove("hidden"); $("bar").style.width = Math.round(p * 100) + "%"; }
  function busy(b) {
    $("go").disabled = $("info").disabled = b;
    $("cancel").classList.toggle("hidden", !b);
  }

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

  $("cancel").onclick = function () { if (job) job.cancel(); };

  $("go").onclick = function () {
    var url = $("url").value.trim();
    $("log").textContent = "";
    busy(true); progress(0); setStatus("Démarrage…");
    job = core.startDownload({
      url: url, start: $("start").value, end: $("end").value, duration: duration,
      format: $("format").value, cookies: $("cookies").value, outDir: $("outdir").value, binDir: binDir
    }, { log: log, status: function (m) { setStatus(m); }, progress: progress });

    job.promise.then(function (file) {
      log("Fichier : " + file);
      if (!$("autoimport").checked) { setStatus("Terminé : " + file, "ok"); return; }
      var esc = file.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      cs.evalScript('yt2prImport("' + esc + '", "' + $("autoinsert").checked + '")', function (res) {
        try { var r = JSON.parse(res); setStatus(r.ok ? "Terminé ! " + r.msg : "Téléchargé, mais : " + r.msg, r.ok ? "ok" : "err"); }
        catch (e) { setStatus("Téléchargé : " + file + " (import Premiere impossible)", "err"); }
      });
    }).catch(function (e) {
      setStatus(e.message.split("\n")[0] === "Annulé." ? "Annulé." : "Erreur : " + e.message.split("\n").slice(0, 2).join(" "), "err");
      log(e.stack || e.message);
    }).then(function () { busy(false); job = null; });
  };
})();
