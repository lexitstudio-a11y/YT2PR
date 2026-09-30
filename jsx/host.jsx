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

// Vrai si la piste n'a aucun clip qui chevauche [from, to[ (en secondes).
function yt2prTrackFree(track, from, to) {
  try { if (track.isLocked && track.isLocked()) return false; } catch (e) {}
  for (var i = 0; i < track.clips.numItems; i++) {
    var c = track.clips[i];
    if (c.start.seconds < to && c.end.seconds > from) return false;
  }
  return true;
}

// Signature de tous les clips existants (pour détecter un écrasement après coup).
function yt2prSnapshot(seq) {
  var out = [];
  function scan(tracks, tag) {
    for (var t = 0; t < tracks.numTracks; t++) {
      for (var i = 0; i < tracks[t].clips.numItems; i++) {
        var c = tracks[t].clips[i];
        out.push(tag + t + ":" + c.start.ticks + "-" + c.end.ticks);
      }
    }
  }
  scan(seq.videoTracks, "V");
  scan(seq.audioTracks, "A");
  return out;
}

function yt2prLost(before, after) {
  var set = {}, lost = 0;
  for (var i = 0; i < after.length; i++) set[after[i]] = true;
  for (var j = 0; j < before.length; j++) if (!set[before[j]]) lost++;
  return lost;
}

// Place le clip sur la paire de pistes (vidéo + audio) vide la plus basse, à la tête de lecture.
// On cible explicitement UNE seule piste vidéo et UNE seule piste audio (sinon Premiere écrit sur les
// pistes ciblées, donc sur vos rushs), puis on vérifie qu'aucun clip existant n'a été touché.
function yt2prPlace(seq, item) {
  var pos = seq.getPlayerPosition();
  var from = pos.seconds, len = 0;
  try { len = item.getOutPoint().seconds - item.getInPoint().seconds; } catch (e) {}
  var to = len > 0 ? from + len : from + 86400;

  function findFree() {
    var n = Math.min(seq.videoTracks.numTracks, seq.audioTracks.numTracks);
    for (var i = 0; i < n; i++) {
      if (yt2prTrackFree(seq.videoTracks[i], from, to) && yt2prTrackFree(seq.audioTracks[i], from, to)) return i;
    }
    return -1;
  }

  var idx = findFree();
  if (idx < 0) {
    // Aucune piste libre : on ajoute une piste vidéo + une piste audio.
    try {
      app.enableQE();
      qe.project.getActiveSequence().addTracks(1, seq.videoTracks.numTracks, 1, seq.audioTracks.numTracks);
    } catch (e) { return "Aucune piste libre et impossible d'en créer : clip non inséré."; }
    idx = findFree();
    if (idx < 0) return "Aucune piste libre : clip non inséré.";
  }

  // Mémorise puis remplace le ciblage des pistes.
  var vT = [], aT = [], i;
  try {
    for (i = 0; i < seq.videoTracks.numTracks; i++) { vT.push(seq.videoTracks[i].isTargeted()); seq.videoTracks[i].setTargeted(i === idx, true); }
    for (i = 0; i < seq.audioTracks.numTracks; i++) { aT.push(seq.audioTracks[i].isTargeted()); seq.audioTracks[i].setTargeted(i === idx, true); }
  } catch (e) {
    return "Impossible de cibler les pistes (" + e + ") : clip non inséré pour ne pas écraser vos rushs.";
  }

  var before = yt2prSnapshot(seq);
  var err = "";
  try {
    seq.videoTracks[idx].overwriteClip(item, pos.ticks);
  } catch (e) { err = e.toString(); }

  // Si l'audio n'est pas venu avec la vidéo, on le pose explicitement sur la piste audio libre.
  try {
    var hasAudio = false, ac = seq.audioTracks[idx].clips;
    for (i = 0; i < ac.numItems; i++) if (ac[i].start.seconds <= from + 0.05 && ac[i].end.seconds > from) hasAudio = true;
    if (!hasAudio) seq.audioTracks[idx].overwriteClip(item, pos.ticks);
  } catch (e) {}

  var lost = yt2prLost(before, yt2prSnapshot(seq));

  // Restaure le ciblage d'origine.
  try {
    for (i = 0; i < vT.length; i++) seq.videoTracks[i].setTargeted(vT[i], true);
    for (i = 0; i < aT.length; i++) seq.audioTracks[i].setTargeted(aT[i], true);
  } catch (e) {}

  if (err) return "Erreur d'insertion : " + err;
  if (lost > 0) return "⚠ ATTENTION : " + lost + " clip(s) existant(s) ont été modifiés. Faites Cmd/Ctrl+Z immédiatement.";
  return "Inséré sur V" + (idx + 1) + "/A" + (idx + 1) + " à la tête de lecture.";
}

// Retourne {"ok":true|false,"msg":"…"} sous forme de chaîne JSON.
function yt2prImport(filePath, insertOnTimeline) {
  try {
    if (!app.project) return '{"ok":false,"msg":"Aucun projet ouvert dans Premiere Pro."}';
    if (!new File(filePath).exists) return '{"ok":false,"msg":"Fichier introuvable : ' + yt2prEsc(filePath) + '"}';
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
        msg += " " + yt2prPlace(seq, item);
      }
    }
    return '{"ok":true,"msg":"' + yt2prEsc(msg) + '"}';
  } catch (e) {
    return '{"ok":false,"msg":"' + yt2prEsc(e.toString()) + '"}';
  }
}
