/* Logique du téléchargeur (Node.js, exécutée dans le panneau CEP). Testable hors Premiere. */
(function (root) {
  "use strict";
  var fs = require("fs");
  var os = require("os");
  var path = require("path");
  var https = require("https");
  var cp = require("child_process");

  var IS_WIN = process.platform === "win32";
  var IS_MAC = process.platform === "darwin";

  /* ---------- Timecodes ---------- */

  // "90", "1:30", "01:02:03(.5)" -> secondes ; "" -> null ; invalide -> Error
  function parseTimecode(str) {
    str = (str || "").trim().replace(",", ".");
    if (!str) return null;
    var parts = str.split(":");
    if (parts.length > 3) throw new Error("Timecode invalide : " + str);
    var total = 0;
    for (var i = 0; i < parts.length; i++) {
      if (!/^\d+(\.\d+)?$/.test(parts[i])) throw new Error("Timecode invalide : " + str);
      total = total * 60 + parseFloat(parts[i]);
    }
    return total;
  }

  function formatSeconds(s) {
    s = Math.max(0, s);
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s - h * 3600 - m * 60;
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    var secStr = sec % 1 ? sec.toFixed(2) : String(Math.round(sec));
    return pad(h) + ":" + pad(m) + ":" + (sec < 10 ? "0" : "") + secStr;
  }

  // Retourne {start,end} (secondes ou null) après validation, ou lève une Error.
  function resolveRange(startStr, endStr, duration) {
    var start = parseTimecode(startStr), end = parseTimecode(endStr);
    if (start === null && end === null) return { start: null, end: null };
    if (start === null) start = 0;
    if (end !== null && end <= start) throw new Error("La fin doit être après le début.");
    if (duration && start >= duration) throw new Error("Le début dépasse la durée de la vidéo (" + formatSeconds(duration) + ").");
    if (duration && end !== null && end > duration) end = duration;
    if (start === 0 && end === null) return { start: null, end: null };
    return { start: start, end: end };
  }

  /* ---------- Arguments yt-dlp / ffmpeg ---------- */

  function isSupportedUrl(u) {
    return /^https?:\/\/[^\s]+$/i.test(u || "");
  }

  function buildYtdlpArgs(o) {
    var args = [
      "--no-playlist", "--newline", "--no-colors", "--windows-filenames",
      // Qualité maximale : meilleur flux vidéo + meilleur flux audio, sinon meilleur flux combiné.
      "-f", "bv*+ba/b",
      "--merge-output-format", "mkv",
      "--concurrent-fragments", "4",
      "--progress-template", "YT2PR %(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s",
      "--print-to-file", "after_move:filepath", o.pathFile,
      "-P", o.outDir,
      "-o", "%(title).120B [%(id)s]" + o.suffix + ".%(ext)s"
    ];
    if (o.ffmpegDir) args.push("--ffmpeg-location", o.ffmpegDir);
    if (o.cookies) args.push("--cookies-from-browser", o.cookies);
    if (o.range && o.range.start !== null) {
      var sec = "*" + o.range.start + "-" + (o.range.end === null ? "inf" : o.range.end);
      args.push("--download-sections", sec, "--force-keyframes-at-cuts");
    }
    args.push(o.url);
    return args;
  }

  // Décide de l'encodage final selon le format demandé et les codecs sources.
  function buildFfmpegPlan(format, vcodec, acodec, input, outBase) {
    var copyOk = vcodec === "h264" || vcodec === "hevc";
    var audioCopy = acodec === "aac" || acodec === "mp3";
    var aacArgs = audioCopy ? ["-c:a", "copy"] : ["-c:a", "aac", "-b:a", "320k"];
    if (format === "original") return null;
    if (format === "auto") format = copyOk ? "copy" : "prores";
    if (format === "copy") {
      var a = ["-c:v", "copy"].concat(aacArgs, ["-movflags", "+faststart"]);
      if (vcodec === "hevc") a.push("-tag:v", "hvc1");
      return { ext: ".mp4", args: a, label: "Remux (sans perte)" };
    }
    if (format === "prores") {
      return { ext: ".mov", label: "ProRes 422 HQ",
        args: ["-c:v", "prores_ks", "-profile:v", "3", "-vendor", "apl0", "-pix_fmt", "yuv422p10le", "-c:a", "pcm_s24le"] };
    }
    return { ext: ".mp4", label: "H.264 haute qualité",
      args: ["-c:v", "libx264", "-preset", "slow", "-crf", "12", "-pix_fmt", "yuv420p"].concat(aacArgs, ["-movflags", "+faststart"]) };
  }

  /* ---------- Outils (yt-dlp / ffmpeg) ---------- */

  var exe = function (n) { return IS_WIN ? n + ".exe" : n; };

  function which(name) {
    try {
      var r = cp.spawnSync(IS_WIN ? "where" : "which", [name], { encoding: "utf8" });
      if (r.status === 0) return r.stdout.split(/\r?\n/)[0].trim();
    } catch (e) {}
    return null;
  }

  function findTool(name, binDir) {
    var local = path.join(binDir, exe(name));
    if (fs.existsSync(local)) return local;
    return which(name) || (IS_MAC && ["/opt/homebrew/bin/", "/usr/local/bin/"].map(function (p) { return p + name; }).find(fs.existsSync)) || null;
  }

  function download(url, dest, onProgress, redirects) {
    redirects = redirects || 0;
    return new Promise(function (resolve, reject) {
      if (redirects > 8) return reject(new Error("Trop de redirections"));
      https.get(url, { headers: { "User-Agent": "YT2PR" } }, function (res) {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return resolve(download(new URL(res.headers.location, url).toString(), dest, onProgress, redirects + 1));
        }
        if (res.statusCode !== 200) { res.resume(); return reject(new Error("HTTP " + res.statusCode + " pour " + url)); }
        var total = parseInt(res.headers["content-length"] || "0", 10), got = 0;
        var out = fs.createWriteStream(dest);
        res.on("data", function (c) { got += c.length; if (total && onProgress) onProgress(got / total); });
        res.pipe(out);
        out.on("finish", function () { out.close(function () { resolve(dest); }); });
        out.on("error", reject);
      }).on("error", reject);
    });
  }

  function run(cmd, args) {
    return new Promise(function (resolve, reject) {
      cp.execFile(cmd, args, { maxBuffer: 1 << 26 }, function (err, so, se) { err ? reject(new Error(se || err.message)) : resolve(so); });
    });
  }

  function ensureYtdlp(binDir, log, onProgress) {
    var found = findTool("yt-dlp", binDir);
    if (found) return Promise.resolve(found);
    var asset = IS_WIN ? "yt-dlp.exe" : IS_MAC ? "yt-dlp_macos" : "yt-dlp_linux";
    var dest = path.join(binDir, exe("yt-dlp"));
    log("Téléchargement de yt-dlp (première utilisation)…");
    return download("https://github.com/yt-dlp/yt-dlp/releases/latest/download/" + asset, dest, onProgress).then(function () {
      if (!IS_WIN) fs.chmodSync(dest, 493);
      return dest;
    });
  }

  function ensureFfmpeg(binDir, log, onProgress) {
    var found = findTool("ffmpeg", binDir);
    if (found) return Promise.resolve(found);
    var dest = path.join(binDir, exe("ffmpeg"));
    var zip = path.join(binDir, "ffmpeg.zip");
    log("Téléchargement de ffmpeg (première utilisation, ~100 Mo)…");
    if (IS_WIN) {
      var tmp = path.join(binDir, "ffmpeg_tmp");
      return download("https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip", zip, onProgress)
        .then(function () { return run("powershell", ["-NoProfile", "-Command", "Expand-Archive -Force -LiteralPath '" + zip + "' -DestinationPath '" + tmp + "'"]); })
        .then(function () {
          var inner = fs.readdirSync(tmp)[0];
          fs.copyFileSync(path.join(tmp, inner, "bin", "ffmpeg.exe"), dest);
          fs.rmSync(tmp, { recursive: true, force: true }); fs.unlinkSync(zip);
          return dest;
        });
    }
    if (IS_MAC) {
      return download("https://evermeet.cx/ffmpeg/getrelease/zip", zip, onProgress)
        .then(function () { return run("unzip", ["-o", zip, "-d", binDir]); })
        .then(function () { fs.chmodSync(dest, 493); fs.unlinkSync(zip); return dest; });
    }
    return Promise.reject(new Error("Installez ffmpeg (PATH) sur ce système."));
  }

  /* ---------- Infos vidéo ---------- */

  function fetchInfo(ytdlp, url, cookies) {
    var args = ["-J", "--no-playlist", "--no-warnings"];
    if (cookies) args.push("--cookies-from-browser", cookies);
    args.push(url);
    return run(ytdlp, args).then(function (out) {
      var j = JSON.parse(out);
      if (j.entries && j.entries.length) j = j.entries[0];
      return { title: j.title || "", duration: j.duration || 0, thumbnail: j.thumbnail || "" };
    });
  }

  /* ---------- Téléchargement complet ---------- */

  function killTree(child) {
    if (!child || child.killed) return;
    try {
      if (IS_WIN) cp.spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
      else child.kill("SIGTERM");
    } catch (e) {}
  }

  function probe(ffmpeg, file) {
    return new Promise(function (resolve) {
      cp.execFile(ffmpeg, ["-hide_banner", "-i", file], { maxBuffer: 1 << 24 }, function (err, so, se) {
        var v = /Video: (\w+)/.exec(se || ""), a = /Audio: (\w+)/.exec(se || ""), d = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(se || "");
        resolve({ v: v && v[1], a: a && a[1], duration: d ? +d[1] * 3600 + +d[2] * 60 + parseFloat(d[3]) : 0 });
      });
    });
  }

  // opts: {url,start,end,duration,format,cookies,outDir,binDir}
  // cb: {log(msg), status(msg), progress(0..1)}
  function startDownload(opts, cb) {
    var current = null, cancelled = false;
    var handle = { cancel: function () { cancelled = true; killTree(current); } };

    handle.promise = (async function () {
      if (!isSupportedUrl(opts.url)) throw new Error("Lien invalide.");
      var range = resolveRange(opts.start, opts.end, opts.duration);
      fs.mkdirSync(opts.binDir, { recursive: true });
      fs.mkdirSync(opts.outDir, { recursive: true });

      cb.status("Préparation des outils…");
      var toolProgress = function (name) {
        return function (p) { cb.progress(p); cb.status("Installation de " + name + " (une seule fois) : " + Math.round(p * 100) + "%"); };
      };
      var ytdlp = await ensureYtdlp(opts.binDir, cb.log, toolProgress("yt-dlp"));
      var ffmpeg = await ensureFfmpeg(opts.binDir, cb.log, toolProgress("ffmpeg"));

      var suffix = range.start === null ? "" :
        " (" + formatSeconds(range.start).replace(/:/g, "-") + "_" + (range.end === null ? "fin" : formatSeconds(range.end).replace(/:/g, "-")) + ")";
      var pathFile = path.join(os.tmpdir(), "yt2pr_" + Date.now() + ".txt");
      var args = buildYtdlpArgs({ url: opts.url, outDir: opts.outDir, pathFile: pathFile, suffix: suffix,
        ffmpegDir: path.dirname(ffmpeg), cookies: opts.cookies, range: range });
      cb.log("yt-dlp " + args.join(" "));

      cb.status("Téléchargement en qualité maximale…");
      await new Promise(function (resolve, reject) {
        var errBuf = "";
        current = cp.spawn(ytdlp, args, { windowsHide: true });
        var onLine = function (line) {
          var m = /^YT2PR\s+([\d.]+)%\|([^|]*)\|(.*)$/.exec(line.trim());
          if (m) { cb.progress(parseFloat(m[1]) / 100 * 0.8); cb.status("Téléchargement " + m[1] + "% – " + m[2].trim() + " – reste " + m[3].trim()); }
          else if (line.trim()) cb.log(line);
        };
        var buf = "";
        current.stdout.on("data", function (d) { buf += d; var l = buf.split(/\r?\n|\r/); buf = l.pop(); l.forEach(onLine); });
        current.stderr.on("data", function (d) { errBuf += d; cb.log(String(d).trim()); });
        current.on("error", reject);
        current.on("close", function (code) {
          if (cancelled) return reject(new Error("Annulé."));
          code === 0 ? resolve() : reject(new Error("yt-dlp a échoué :\n" + errBuf.split("\n").filter(function (l) { return /ERROR/.test(l); }).join("\n")));
        });
      });

      var downloaded = fs.readFileSync(pathFile, "utf8").split(/\r?\n/).filter(Boolean).pop();
      try { fs.unlinkSync(pathFile); } catch (e) {}
      if (!downloaded || !fs.existsSync(downloaded)) throw new Error("Fichier téléchargé introuvable.");

      var info = await probe(ffmpeg, downloaded);
      var plan = buildFfmpegPlan(opts.format, info.v, info.a);
      if (!plan) { cb.progress(1); return downloaded; }

      var final = downloaded.replace(/\.[^.\\/]+$/, "") + plan.ext;
      if (final === downloaded) final = downloaded.replace(/\.[^.\\/]+$/, "") + " (import)" + plan.ext;
      cb.status("Conversion : " + plan.label + "…");
      var fargs = ["-hide_banner", "-y", "-i", downloaded, "-map", "0:v:0", "-map", "0:a?"].concat(plan.args, [final]);
      cb.log("ffmpeg " + fargs.join(" "));
      await new Promise(function (resolve, reject) {
        var tail = "";
        current = cp.spawn(ffmpeg, fargs, { windowsHide: true });
        current.stderr.on("data", function (d) {
          tail = (tail + d).slice(-2000);
          var t = /time=(\d+):(\d+):(\d+\.\d+)/.exec(String(d));
          if (t && info.duration) cb.progress(0.8 + 0.2 * Math.min(1, (+t[1] * 3600 + +t[2] * 60 + parseFloat(t[3])) / info.duration));
        });
        current.on("error", reject);
        current.on("close", function (code) {
          if (cancelled) return reject(new Error("Annulé."));
          code === 0 ? resolve() : reject(new Error("ffmpeg a échoué :\n" + tail));
        });
      });
      try { fs.unlinkSync(downloaded); } catch (e) {}
      cb.progress(1);
      return final;
    })();
    return handle;
  }

  var api = {
    parseTimecode: parseTimecode, formatSeconds: formatSeconds, resolveRange: resolveRange,
    isSupportedUrl: isSupportedUrl, buildYtdlpArgs: buildYtdlpArgs, buildFfmpegPlan: buildFfmpegPlan,
    ensureYtdlp: ensureYtdlp, fetchInfo: fetchInfo, startDownload: startDownload
  };
  root.YT2PRCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
