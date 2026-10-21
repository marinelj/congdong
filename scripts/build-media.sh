#!/usr/bin/env bash
# Builds web-ready media in media/ from the originals in assets-src/.
# Needs: ffmpeg, python3, sips (macOS). Re-run any time; outputs are overwritten.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PHOTOS="$ROOT/assets-src/photos"
FILM="$ROOT/assets-src/video/huairou-film.mp4"
OUT="$ROOT/media"
TMP="$ROOT/.cache/tmp"
mkdir -p "$OUT/img" "$OUT/brand" "$OUT/video" "$TMP"

to_jpeg() { # in out quality
  sips -s format jpeg -s formatOptions "$3" "$1" --out "$2" >/dev/null
}

# 1. Photos resized for cards and sections (800px wide) and wide layouts (1600px)
for id in 040 049 050 051 058 066 069 081 082 083 084 087 092 093 096 097 103 104 106 109 111 116 117 121 122 123 124 125 126 129 131; do
  sips --resampleWidth 800 -s format jpeg -s formatOptions 72 "$PHOTOS/$id.jpg" --out "$OUT/img/$id-800.jpg" >/dev/null
done
for id in 066 081 082 084 097 131; do
  sips --resampleWidth 1600 -s format jpeg -s formatOptions 70 "$PHOTOS/$id.jpg" --out "$OUT/img/$id-1600.jpg" >/dev/null
done

# 2. Portrait hero crops (crop is in source pixels)
crop() { # id name w h x y out_w out_h
  ffmpeg -loglevel error -i "$PHOTOS/$1.jpg" -vf "crop=$3:$4:$5:$6,scale=$7:$8:flags=lanczos" -y "$TMP/$2.png"
  to_jpeg "$TMP/$2.png" "$OUT/img/$2.jpg" 72
}
crop 084 hero-084-4x5  2419 3024 1613 0  840 1050   # morning pitch: corner arc + goal
crop 066 hero-066-9x16 1701 3024  722 0  810 1440   # floodlit pitch at night
crop 082 hero-082-9x16 2070 3680 1940 0  810 1440   # arena with CONGDONG court logo

# 3. Hero loop from the Huairou film: balls -> hoop -> pitch -> tennis, 9:16, muted
ffmpeg -loglevel error -i "$FILM" -filter_complex "\
[0:v]split=4[s1][s2][s3][s4];\
[s1]trim=start=8.1:end=10.9,setpts=PTS-STARTPTS,crop=608:1080:780:0[a];\
[s2]trim=start=11.3:end=14.1,setpts=PTS-STARTPTS,crop=608:1080:596:0[b];\
[s3]trim=start=25.0:end=27.6,setpts=PTS-STARTPTS,crop=608:1080:581:0[c];\
[s4]trim=start=33.0:end=35.4,setpts=PTS-STARTPTS,crop=608:1080:656:0[d];\
[a][b][c][d]concat=n=4:v=1:a=0,format=yuv420p[v]" \
  -map "[v]" -an -c:v libx264 -profile:v high -preset slow -crf 27 -movflags +faststart \
  -y "$OUT/video/hero-loop-9x16.mp4"
# same cut in 16:9 for wide screens
ffmpeg -loglevel error -i "$FILM" -filter_complex "\
[0:v]split=4[s1][s2][s3][s4];\
[s1]trim=start=8.1:end=10.9,setpts=PTS-STARTPTS[a];\
[s2]trim=start=11.3:end=14.1,setpts=PTS-STARTPTS[b];\
[s3]trim=start=25.0:end=27.6,setpts=PTS-STARTPTS[c];\
[s4]trim=start=33.0:end=35.4,setpts=PTS-STARTPTS[d];\
[a][b][c][d]concat=n=4:v=1:a=0,scale=1280:720:flags=lanczos,format=yuv420p[v]" \
  -map "[v]" -an -c:v libx264 -profile:v high -preset slow -crf 27 -movflags +faststart \
  -y "$OUT/video/hero-loop-16x9.mp4"
ffmpeg -loglevel error -ss 8.1 -i "$FILM" -frames:v 1 -vf "crop=608:1080:780:0" -y "$TMP/hero-loop-poster.png"
to_jpeg "$TMP/hero-loop-poster.png" "$OUT/video/hero-loop-9x16-poster.jpg" 72

# 4. Logo cut out of #088 (white background), then sized for retina headers
python3 "$ROOT/scripts/extract_logo.py" "$PHOTOS/088.jpg" "$TMP/logo-wordmark.png" 770 116 742 284
python3 "$ROOT/scripts/extract_logo.py" "$PHOTOS/088.jpg" "$TMP/logo-lockup.png"   770 116 742 410
ffmpeg -loglevel error -i "$TMP/logo-wordmark.png" -vf "scale=480:-1:flags=lanczos" -y "$OUT/brand/logo-wordmark.png"
ffmpeg -loglevel error -i "$TMP/logo-lockup.png"   -vf "scale=480:-1:flags=lanczos" -y "$OUT/brand/logo-lockup.png"

# 4b. Standalone "C" emblem from the price poster (#038) for the favicon and home-screen icon
python3 "$ROOT/scripts/extract_logo.py" "$PHOTOS/038.jpg" "$TMP/emblem.png" 1725 150 310 268
ffmpeg -loglevel error -i "$TMP/emblem.png" -vf "format=rgba,pad=310:310:0:21:color=black@0,scale=64:64:flags=lanczos" -y "$OUT/brand/favicon-64.png"
ffmpeg -loglevel error -f lavfi -i "color=c=0x0A0B0D:s=180x180" -i "$TMP/emblem.png" \
  -filter_complex "[1]scale=124:-1:flags=lanczos[e];[0][e]overlay=(W-w)/2:(H-h)/2:format=auto" -frames:v 1 -y "$OUT/brand/apple-touch-icon.png"

# 4c. Partner logos (white marks on transparent) from the official-partners poster (#043)
python3 "$ROOT/scripts/extract_mark.py" "$PHOTOS/043.jpg" "$TMP/partner-merry.png"   640 222 300 270
python3 "$ROOT/scripts/extract_mark.py" "$PHOTOS/043.jpg" "$TMP/partner-jinling.png" 632 588 356 288
for name in partner-merry partner-jinling; do
  ffmpeg -loglevel error -i "$TMP/$name.png" -vf "format=rgba,scale=-1:168:flags=lanczos" -y "$OUT/brand/$name.png"
done

# 5. Location map from #088 (map panel only, without the logo and banner)
ffmpeg -loglevel error -i "$PHOTOS/088.jpg" -vf "crop=1946:1206:150:762" -y "$TMP/map.png"
sips --resampleWidth 1200 -s format jpeg -s formatOptions 80 "$TMP/map.png" --out "$OUT/img/map-1200.jpg" >/dev/null

# 6. Official WeChat QR (contact: 贺老师) from the bottom of the Huairou poster (#028)
ffmpeg -loglevel error -i "$PHOTOS/028.jpg" -vf "crop=201:202:499:13851" -y "$OUT/brand/wechat-qr.png"

rm -rf "$TMP"
echo "media built:"; du -sh "$OUT"/img "$OUT"/video "$OUT"/brand
