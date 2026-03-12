#!/bin/bash

WATERMARK="/Users/floremoria/Downloads/Floremoria_dot_com/floremoria/public/images/brand/Logo FloreMoria WaterMark 2026.png"

for img in *.jpg *.jpeg *.png; do
  magick "$img" "$WATERMARK" \
  -gravity southeast \
  -geometry +60+60 \
  -dissolve 25 \
  -composite "wm_$img"
done
