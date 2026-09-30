/* Application locale de l'extension Chrome (Native Messaging) : exécute yt-dlp/ffmpeg via core.js. */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");
const core = require("./core.js");
const updater = require("./updater.js");

const HOME = path.join(os.homedir(), ".yt2pr");
const BIN_DIR = path.join(HOME, "bin");
const VERSION_FILE = path.join(HOME, ".version");
const DEFAULT_OUT = path.join(os.homedir(), "Downloads", "YT2PR");

function send(obj) {
  const buf = Buffer.from(JSON.stringify(obj));
  const head = Buffer.alloc(4);
  head.writeUInt32LE(buf.length, 0);
  process.stdout.write(Buffer.concat([head, buf]));
}
const readVersion = () => { try { return fs.readFileSync(VERSION_FILE, "utf8"); } catch (e) { return ""; } };

let job = null;
let lastProgress = 0;

async function onMessage(m) {
  try {
    if (m.type === "ping") {
      send({ type: "pong", version: readVersion(), defaultOutDir: DEFAULT_OUT, node: process.version, platform: process.platform });
    } else if (m.type === "info") {
      const ytdlp = await core.ensureYtdlp(BIN_DIR, () => {}, () => {});
      send({ type: "info", info: await core.fetchInfo(ytdlp, m.url, m.cookies) });
    } else if (m.type === "download") {
      if (job) return send({ type: "error", message: "Un téléchargement est déjà en cours." });
      job = core.startDownload(Object.assign({}, m, { binDir: BIN_DIR, outDir: m.outDir || DEFAULT_OUT }), {
        log: () => {},
        status: (text) => send({ type: "status", text }),
        progress: (v) => { if (v === 1 || v - lastProgress >= 0.01) { lastProgress = v; send({ type: "progress", value: v }); } }
      });
      job.promise.then((file) => send({ type: "done", file }))
        .catch((e) => send({ type: "error", message: e.message.split("\n").slice(0, 3).join(" ") }))
        .then(() => { job = null; lastProgress = 0; });
    } else if (m.type === "cancel") {
      if (job) job.cancel();
    } else if (m.type === "reveal") {
      if (process.platform === "darwin") cp.spawn("open", ["-R", m.path], { detached: true, stdio: "ignore" }).unref();
      else if (process.platform === "win32") cp.spawn("explorer", ["/select," + m.path], { detached: true, stdio: "ignore" }).unref();
      else cp.spawn("xdg-open", [path.dirname(m.path)], { detached: true, stdio: "ignore" }).unref();
    } else if (m.type === "update") {
      const map = function (p) {
        if (p.indexOf("chrome-extension/") === 0) return path.join(HOME, p);
        if (p === "native-host/host.js") return path.join(HOME, "host", "host.js");
        return path.join(HOME, "host", path.basename(p)); // js/core.js, js/updater.js
      };
      const r = await updater.update({ branch: m.branch, include: /^(chrome-extension\/.+|native-host\/host\.js|js\/core\.js|js\/updater\.js)$/, destFor: map }, () => {});
      fs.writeFileSync(VERSION_FILE, r.version);
      send({ type: "updated", version: r.version, changed: r.changed });
    }
  } catch (e) {
    send({ type: "error", message: e.message.split("\n").slice(0, 3).join(" ") });
  }
}

// Protocole Native Messaging : 4 octets (longueur, little-endian) + JSON.
let pending = Buffer.alloc(0);
process.stdin.on("data", (chunk) => {
  pending = Buffer.concat([pending, chunk]);
  while (pending.length >= 4) {
    const len = pending.readUInt32LE(0);
    if (pending.length < 4 + len) break;
    const msg = JSON.parse(pending.slice(4, 4 + len).toString("utf8"));
    pending = pending.slice(4 + len);
    onMessage(msg);
  }
});
process.stdin.on("end", () => { if (job) job.cancel(); process.exit(0); });
