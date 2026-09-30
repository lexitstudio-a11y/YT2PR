# YT2PR – Télécharger des vidéos directement dans Premiere Pro

Panneau Premiere Pro (CEP) : collez un lien **YouTube, X/Twitter, Instagram, TikTok** (et tout site géré par yt-dlp),
choisissez éventuellement un **timecode début/fin**, et la vidéo est téléchargée en **qualité maximale** puis importée dans votre projet.

## Installation
- **macOS** : `./install-mac.sh`
- **Windows** : double-clic sur `install-windows.bat`

Redémarrez Premiere Pro, puis **Fenêtre → Extensions → YT2PR – Téléchargeur**.
(Les scripts activent `PlayerDebugMode`, nécessaire pour les extensions non signées.)

Au premier lancement, le panneau télécharge automatiquement **yt-dlp** et **ffmpeg** (dossier utilisateur Adobe). Si déjà installés (PATH), ils sont réutilisés.

## Mise à jour
Bouton **⟳ Mettre à jour** en haut du panneau : il récupère la dernière version depuis GitHub, remplace les fichiers installés et recharge le panneau (plus besoin de réinstaller). Si le manifest change, redémarrez Premiere. Dépôt privé : renseignez un jeton GitHub dans « Réglages de mise à jour ».

## Utilisation
1. Collez le lien (bouton *Coller* ou Ctrl/Cmd+V), « Analyser le lien » pour voir titre et durée (facultatif).
2. Timecode : `SS`, `MM:SS` ou `HH:MM:SS`. Début seul = jusqu'à la fin ; vide = vidéo entière.
3. **Télécharger** : le fichier est importé dans la chute `YT2PR` (option : insertion sur la timeline à la tête de lecture).

## Qualité maximale
Toujours `meilleure vidéo + meilleur audio` disponibles (4K/8K, 60 fps…). Premiere n'important pas VP9/AV1/Opus :
- **Auto** : H.264/HEVC → remux **sans perte** en MP4 ; VP9/AV1 → **ProRes 422 HQ** (fichiers volumineux).
- Autres choix : ProRes, H.264 CRF 12, ou fichier original (mkv/webm).

## Notes
- Instagram / X privés : choisissez le navigateur connecté dans « Cookies ».
- Sur Apple Silicon, ffmpeg (build Intel) tourne via Rosetta, ou installez-le avec `brew install ffmpeg`.
- Téléchargez uniquement des contenus dont vous avez les droits.
- Débogage : `.debug` ouvre le port 8099 (`http://localhost:8099`).
