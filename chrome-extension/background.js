// Service worker : garde la connexion avec l'application locale (yt-dlp) pendant les téléchargements.
const HOST = "com.yt2pr.host";
let port = null;
const popups = new Set();
let state = { running: false, progress: 0, status: "", result: null, error: "", info: null, hostInfo: null };

function push() {
  popups.forEach((p) => { try { p.postMessage({ type: "state", state }); } catch (e) {} });
}
function set(patch) { state = Object.assign({}, state, patch); push(); }

function connect() {
  if (port) return port;
  port = chrome.runtime.connectNative(HOST);
  port.onMessage.addListener(onHost);
  port.onDisconnect.addListener(() => {
    const err = chrome.runtime.lastError;
    port = null;
    set({ running: false, hostInfo: null, error: err && /not found|forbidden/i.test(err.message) ? "Application locale non installée : lancez l'installateur (voir README)."
      : err ? "Application locale arrêtée : " + err.message : (state.running ? "Application locale arrêtée." : state.error) });
  });
  return port;
}

function onHost(m) {
  switch (m.type) {
    case "pong": set({ hostInfo: m, error: "" }); break;
    case "info": set({ info: m.info, status: "" }); break;
    case "status": set({ status: m.text }); break;
    case "progress": set({ progress: m.value }); break;
    case "done": set({ running: false, progress: 1, status: "Terminé !", result: m.file, error: "" }); break;
    case "error": set({ running: false, status: "", error: m.message }); break;
    case "updated": set({ status: m.changed.length ? "Mise à jour (" + m.version + "), rechargement…" : "Déjà à jour (" + m.version + ").", running: false });
      if (m.changed.length) setTimeout(() => chrome.runtime.reload(), 800); break;
  }
}

function send(msg) {
  try { connect().postMessage(msg); return true; }
  catch (e) { set({ running: false, error: "Application locale introuvable : lancez l'installateur (voir README)." }); return false; }
}

chrome.runtime.onConnect.addListener((p) => {
  if (p.name !== "popup") return;
  popups.add(p);
  p.onDisconnect.addListener(() => popups.delete(p));
  p.onMessage.addListener((m) => {
    if (m.cmd === "ping") { send({ type: "ping" }); }
    else if (m.cmd === "info") { set({ error: "", status: "Analyse du lien…", info: null }); send({ type: "info", url: m.url, cookies: m.cookies }); }
    else if (m.cmd === "download") {
      set({ running: true, progress: 0, status: "Démarrage…", result: null, error: "" });
      send(Object.assign({ type: "download" }, m.opts));
    }
    else if (m.cmd === "cancel") send({ type: "cancel" });
    else if (m.cmd === "reveal") send({ type: "reveal", path: m.path });
    else if (m.cmd === "update") { set({ running: true, status: "Mise à jour…", error: "" }); send({ type: "update", branch: m.branch }); }
  });
  p.postMessage({ type: "state", state });
});
