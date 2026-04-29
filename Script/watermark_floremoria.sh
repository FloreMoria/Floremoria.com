#!/bin/bash

WATERMARK="/Users/floremoria/Downloads/Floremoria_dot_com/floremoria/public/images/brand/Logo FloreMoria WaterMark 2026.png"

mkdir -p watermarked

for img in *.jpg *.jpeg *.png; do
  [ -f "$img" ] || continue

  magick "$img" \
    \( "$WATERMARK" \
       -alpha on \
       -fuzz 15% \
       -transparent black \
       -fill "#B8B8B8" \
       -colorize 100 \
       -channel A -evaluate multiply 0.28 +channel \
       -resize 18% \
    \) \
    -gravity southeast \
    -geometry +35+35 \
    -compose over \
    -composite \
    "watermarked/wm_$img"
done
