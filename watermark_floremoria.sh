#!/bin/bash

WATERMARK="/Users/floremoria/Downloads/Floremoria_dot_com/floremoria/public/images/brand/Logo FloreMoria WaterMark 2026.png"

# Cartella output
mkdir -p watermarked

# Bash: ignora pattern vuoti
shopt -s nullglob

for img in *.jpg *.jpeg *.png; do
  [ -f "$img" ] || continue

  magick "$img" \
    \( "$WATERMARK" \
       -colorspace sRGB \
       -fuzz 18% \
       -transparent black \
       -alpha on \
       -channel A -evaluate multiply 0.22 +channel \
       -resize 18% \
    \) \
    -gravity southeast \
    -geometry +35+35 \
    -compose over \
    -composite \
    "watermarked/wm_$img"
done
