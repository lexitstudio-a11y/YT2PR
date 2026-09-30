const $ = (id) => document.getElementById(id);
const port = chrome.runtime.connect({ name: "popup" });
const FIELDS = ["start", "end", "format", "cookies", "outdir"];
let duration = 0, hostInfo = null;

const supported = (u) => /^https?:\/\/[^\s]+$/i.test(u || "");

chrome.storage.local.get(FIELDS, (saved) => {
  FIELDS.forEach((f) => { if (saved[f] !== undefined) $(f).value = saved[f]; });
  port.postMessage({ cmd: "ping" });
});
FIELDS.forEach((f) => $(f).addEventListener("change", () => chrome.storage.local.set({ [f]: $(f).value })));

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const u = tabs[0] && tabs[0].url;
  if (supported(u) && !$("url").value) { $("url").value = u; }
});
$("url").addEventListener("input", () => { duration = 0; $("meta").classList.add("hidden"); });

function opts() {
  return { url: $("url").value.trim(), start: $("start").value, end: $("end").value, duration,
    format: $("format").value, cookies: $("cookies").value, outDir: $("outdir").value.trim() || (hostInfo && hostInfo.defaultOutDir) };
}
$("info").onclick = () => { if (!supported($("url").value.trim())) return show("Lien invalide.", "err"); port.postMessage({ cmd: "info", url: $("url").value.trim(), cookies: $("cookies").value }); };
$("go").onclick = () => { if (!supported($("url").value.trim())) return show("Lien invalide.", "err"); port.postMessage({ cmd: "download", opts: opts() }); };
$("cancel").onclick = () => port.postMessage({ cmd: "cancel" });
$("reveal").onclick = () => port.postMessage({ cmd: "reveal", path: $("reveal").dataset.path });
$("update").onclick = () => port.postMessage({ cmd: "update" });

function show(text, cls) { $("status").textContent = text; $("status").className = cls || ""; }

port.onMessage.addListener((m) => {
  if (m.type !== "state") return;
  const s = m.state;
  hostInfo = s.hostInfo;
  if (hostInfo) {
    if (!$("outdir").value) $("outdir").value = hostInfo.defaultOutDir;
    $("ver").textContent = "Version : " + (hostInfo.version || "d'origine");
  }
  if (s.info) {
    duration = s.info.duration || 0;
    $("title").textContent = s.info.title;
    $("duration").textContent = duration ? "Durée : " + new Date(duration * 1000).toISOString().substr(11, 8) : "";
    $("thumb").src = s.info.thumbnail || "";
    $("meta").classList.remove("hidden");
  }
  $("go").disabled = $("info").disabled = $("update").disabled = s.running;
  $("cancel").classList.toggle("hidden", !s.running);
  $("progress").classList.toggle("hidden", !s.running && !s.result);
  $("bar").style.width = Math.round(s.progress * 100) + "%";
  $("reveal").classList.toggle("hidden", !s.result);
  if (s.result) $("reveal").dataset.path = s.result;
  if (s.error) show(s.error, "err");
  else if (s.result && !s.running) show("Terminé : " + s.result, "ok");
  else show(s.status || "");
});
