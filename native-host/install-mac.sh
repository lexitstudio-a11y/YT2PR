#!/bin/bash
# Installe l'application locale + l'extension Chrome YT2PR (macOS). Nécessite Node.js.
set -e
SRC="$(cd "$(dirname "$0")/.." && pwd)"
HOME_DIR="$HOME/.yt2pr"
EXT_ID="mnmnoaepdpcgjmjaiokncppgafgapeih"

NODE="$(command -v node || true)"
[ -z "$NODE" ] && for p in /opt/homebrew/bin/node /usr/local/bin/node; do [ -x "$p" ] && NODE="$p" && break; done
if [ -z "$NODE" ]; then
  echo "Node.js est requis. Installez-le depuis https://nodejs.org (bouton LTS), puis relancez ce script."; exit 1
fi

mkdir -p "$HOME_DIR/host"
rm -rf "$HOME_DIR/chrome-extension"
cp -R "$SRC/chrome-extension" "$HOME_DIR/chrome-extension"
cp "$SRC/native-host/host.js" "$SRC/js/core.js" "$SRC/js/updater.js" "$HOME_DIR/host/"

cat > "$HOME_DIR/host/host.sh" <<EOS
#!/bin/bash
exec "$NODE" "$HOME_DIR/host/host.js"
EOS
chmod +x "$HOME_DIR/host/host.sh"

MANIFEST="{\"name\":\"com.yt2pr.host\",\"description\":\"YT2PR\",\"path\":\"$HOME_DIR/host/host.sh\",\"type\":\"stdio\",\"allowed_origins\":[\"chrome-extension://$EXT_ID/\"]}"
for d in "Google/Chrome" "Google/Chrome Beta" "Chromium" "BraveSoftware/Brave-Browser" "Microsoft Edge"; do
  DIR="$HOME/Library/Application Support/$d/NativeMessagingHosts"
  mkdir -p "$DIR" && echo "$MANIFEST" > "$DIR/com.yt2pr.host.json"
done

echo "OK. Dernière étape (30 s) :"
echo "  1. Dans Chrome, ouvrez chrome://extensions et activez « Mode développeur » (en haut à droite)."
echo "  2. Cliquez « Charger l'extension non empaquetée » et choisissez le dossier :"
echo "     $HOME_DIR/chrome-extension"
