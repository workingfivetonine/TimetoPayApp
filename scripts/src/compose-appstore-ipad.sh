#!/usr/bin/env bash
set -euo pipefail

FONT="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
RAW="screenshots/raw-ipad"
WORK="screenshots/work-ipad"
OUT="screenshots/appstore-ipad"
mkdir -p "$WORK" "$OUT"

# iPad Pro 12.9" App Store screenshot canvas
CW=2048
CH=2732
APPW=1380
R=64
TOP_GRAD="#8b5cf6"
BOT_GRAD="#5b21b6"

names=("01-receipts" "02-stores" "03-shopping" "04-analytics" "05-catalog")
heads=(
  "Snap a receipt.\nWe handle the rest."
  "Compare the true\ncost of every store"
  "A list that finds\nthe lowest price"
  "See where your\nmoney really goes"
  "Real prices from\nevery store"
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

  # 3) soft drop shadow
  magick "$WORK/${n}_round.png" \
    \( +clone -background black -shadow 55x42+0+30 \) \
    +swap -background none -layers merge +repage "$WORK/${n}_shadow.png"

  # 4) gradient background
  magick -size ${CW}x${CH} gradient:"$TOP_GRAD"-"$BOT_GRAD" "$WORK/${n}_bg.png"

  # 5) headline caption (white, centered, wraps + honors \n)
  text_nl=$(printf '%b' "$text")
  magick -background none -fill white -font "$FONT" \
    -pointsize 100 -interline-spacing 18 -size 1760x -gravity center \
    caption:"$text_nl" "$WORK/${n}_head.png"

  # 6) composite: bg + app (south) + headline (north)
  magick "$WORK/${n}_bg.png" \
    "$WORK/${n}_shadow.png" -gravity south -geometry +0+110 -composite \
    "$WORK/${n}_head.png" -gravity north -geometry +0+200 -composite \
    -resize ${CW}x${CH}! -strip "$OUT/$n.png"

  magick identify -format '%f %wx%h\n' "$OUT/$n.png"
done

echo "DONE -> $OUT"
