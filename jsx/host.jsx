// ExtendScript (Premiere Pro) – import et insertion des médias téléchargés.

function yt2prProjectDir() {
  try {
    if (app.project && app.project.path) {
      var f = new File(app.project.path);
      return f.parent.fsName;
    }
  } catch (e) {}
  return "";
}

function yt2prGetBin(name) {
  var root = app.project.rootItem;
  for (var i = 0; i < root.children.numItems; i++) {
    var c = root.children[i];
    if (c.type === ProjectItemType.BIN && c.name === name) return c;
  }
  return root.createBin(name);
}

function yt2prFindItem(bin, filePath) {
  var target = new File(filePath).fsName;
  for (var i = bin.children.numItems - 1; i >= 0; i--) {
    var c = bin.children[i];
    try {
      if (c.getMediaPath && new File(c.getMediaPath()).fsName === target) return c;
    } catch (e) {}
  }
  return null;
}

function yt2prEsc(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ");
}

// Retourne {"ok":true|false,"msg":"…"} sous forme de chaîne JSON.
function yt2prImport(filePath, insertOnTimeline) {
  try {
    if (!app.project) return '{"ok":false,"msg":"Aucun projet ouvert."}';
    var bin = yt2prGetBin("YT2PR");
    var ok = app.project.importFiles([filePath], true, bin, false);
    if (!ok) return '{"ok":false,"msg":"Premiere Pro a refusé l\'import du fichier."}';

    var msg = "Importé dans la chute YT2PR.";
    if (insertOnTimeline === "true" || insertOnTimeline === true) {
      var seq = app.project.activeSequence;
      var item = yt2prFindItem(bin, filePath);
      if (!seq) {
        msg += " Aucune séquence active : clip non inséré.";
      } else if (!item) {
        msg += " Clip introuvable dans le projet : non inséré.";
      } else {
        seq.videoTracks[0].overwriteClip(item, seq.getPlayerPosition().ticks);
        msg += " Inséré à la tête de lecture.";
      }
    }
    return '{"ok":true,"msg":"' + yt2prEsc(msg) + '"}';
  } catch (e) {
    return '{"ok":false,"msg":"' + yt2prEsc(e.toString()) + '"}';
  }
}
