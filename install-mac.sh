#!/bin/bash
# Installe le panneau YT2PR pour Premiere Pro (macOS).
set -e
SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/Library/Application Support/Adobe/CEP/extensions/com.yt2pr.panel"
rm -rf "$DEST"; mkdir -p "$DEST"
cp -R "$SRC/CSXS" "$SRC/js" "$SRC/jsx" "$SRC/css" "$SRC/index.html" "$DEST/"
# Autorise les extensions non signées (CSXS 9 à 12)
for v in 9 10 11 12; do defaults write com.adobe.CSXS.$v PlayerDebugMode 1; done
echo "OK. Redémarrez Premiere Pro puis : Fenêtre > Extensions > YT2PR – Téléchargeur"
