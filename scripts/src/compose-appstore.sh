#!/usr/bin/env bash
set -euo pipefail

# Pick the first bold font that actually exists, so this runs on Windows
# (Git Bash) as well as Linux. Override with FONT=/path/to.ttf if you prefer.
if [ -z "${FONT:-}" ]; then
  for candidate in \
    /usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf \
    /c/Windows/Fonts/arialbd.ttf \
    /c/Windows/Fonts/segoeuib.ttf \
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf"; do
    [ -f "$candidate" ] && FONT="$candidate" && break
  done
fi
if [ -z "${FONT:-}" ] || [ ! -f "$FONT" ]; then
  echo "ERROR: no bold font found. Set FONT=/path/to/font.ttf and re-run." >&2
  exit 1
fi

command -v magick >/dev/null || {
  echo "ERROR: ImageMagick 'magick' not found. Install ImageMagick v7 first." >&2
  exit 1
}

RAW="screenshots/raw"
WORK="screenshots/work"
OUT="screenshots/appstore"
mkdir -p "$WORK" "$OUT"

CW=1290
CH=2796
APPW=964
R=54
# Teal gradient matching the 2.0 palette (was violet #8b5cf6 -> #5b21b6).
# Kept dark enough that the white headline clears AA contrast for large text.
TOP_GRAD="#06687e"
BOT_GRAD="#032f3c"

# Home leads — it is the first screen in the app, so it is the first screen on
# the listing. Apple allows up to ten images, so adding it costs nothing.
names=("01-home" "02-receipts" "03-stores" "04-shopping" "05-analytics" "06-catalog")
heads=(
  "Turn receipts into\nreal savings"
  "Snap a receipt.\nWe handle the rest."
  "Compare the true\ncost of every store"
  "A list that finds\nthe lowest price"
  "See where your\nmoney really goes"
  "Every feature.\nCompletely free."
)

for i in "${!names[@]}"; do
  n="${names[$i]}"
  text="${heads[$i]}"
  echo "composing $n ..."

  # 1) resize app screenshot to target width
  magick "$RAW/$n.png" -resize ${APPW}x "$WORK/${n}_app.png"
  APPH=$(magick identify -format '%h' "$WORK/${n}_app.png")

  # 2) rounded-corner mask (white fill so CopyOpacity sees full intensity)
  magick -size ${APPW}x${APPH} xc:none -fill white \
    -draw "roundrectangle 0,0,$((APPW-1)),$((APPH-1)),$R,$R" "$WORK/${n}_mask.png"
  magick "$WORK/${n}_app.png" "$WORK/${n}_mask.png" \
    -compose CopyOpacity -composite "$WORK/${n}_round.png"

  # 4) soft drop shadow
  magick "$WORK/${n}_round.png" \
    \( +clone -background black -shadow 55x36+0+26 \) \
    +swap -background none -layers merge +repage "$WORK/${n}_shadow.png"

  # 5) gradient background
  magick -size ${CW}x${CH} gradient:"$TOP_GRAD"-"$BOT_GRAD" "$WORK/${n}_bg.png"

  # 6) headline caption (white, centered, wraps + honors \n)
  text_nl=$(printf '%b' "$text")
  magick -background none -fill white -font "$FONT" \
    -pointsize 82 -interline-spacing 14 -size 1150x -gravity center \
    caption:"$text_nl" "$WORK/${n}_head.png"

  # 7) composite: bg + app (south) + headline (north)
  magick "$WORK/${n}_bg.png" \
    "$WORK/${n}_shadow.png" -gravity south -geometry +0+96 -composite \
    "$WORK/${n}_head.png" -gravity north -geometry +0+196 -composite \
    -resize ${CW}x${CH}! -strip "$OUT/$n.png"

  magick identify -format '%f %wx%h\n' "$OUT/$n.png"
done

echo "DONE -> $OUT"
