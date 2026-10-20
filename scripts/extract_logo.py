#!/usr/bin/env python3
"""Cut the CONGDONG logo out of the white-background brand image (#088).

Pure white becomes transparent, anti-aliased edges are un-matted against
white, and transparent pixels inherit nearby colors so later resizing does
not create dark fringes. Uses only ffmpeg (for decoding) and the standard
library.

usage: extract_logo.py SRC.jpg OUT.png X Y W H
"""
import struct
import subprocess
import sys
import zlib
from collections import deque

WHITE_D = 10      # 255 - min(r,g,b) at or below this counts as background
EDGE_D = 200      # ink depth of the darkest logo colors (navy / orange-red)
EDGE_RADIUS = 2   # pixels next to the background that get un-matted
COUNTER_MIN = 12  # smallest enclosed white area treated as a letter counter
FILL_COLOR = (232, 87, 42)  # outline orange-red, used for far-away transparent pixels


def decode_crop(src, x, y, w, h):
    raw = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-i", src,
         "-vf", f"format=rgb24,crop={w}:{h}:{x}:{y}",
         "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        check=True, capture_output=True).stdout
    assert len(raw) == w * h * 3, "unexpected crop size"
    return raw


def is_cream(rgb, i):
    r, g, b = rgb[3 * i], rgb[3 * i + 1], rgb[3 * i + 2]
    return r >= 240 and 222 <= g <= 248 and 200 <= b <= 238 and r - b >= 12


def find_background(rgb, depth, w, h):
    """Near-white regions that are page background.

    A white region counts as background when it touches the image border or
    is a real letter counter (inside 丛动体育): at least COUNTER_MIN pixels
    and not bordered by the cream letter fill. Tiny light specks inside the
    cream fill stay opaque.
    """
    n = w * h
    white = [d <= WHITE_D for d in depth]
    background = [False] * n
    seen = [False] * n
    for start in range(n):
        if not white[start] or seen[start]:
            continue
        comp, queue, touches_border = [], deque([start]), False
        seen[start] = True
        while queue:
            i = queue.popleft()
            comp.append(i)
            cx, cy = i % w, i // w
            if cx in (0, w - 1) or cy in (0, h - 1):
                touches_border = True
            for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                if 0 <= nx < w and 0 <= ny < h:
                    j = ny * w + nx
                    if white[j] and not seen[j]:
                        seen[j] = True
                        queue.append(j)
        if not touches_border:
            if len(comp) < COUNTER_MIN:
                continue  # speck inside the cream fill
            members = set(comp)
            ring = set()
            for i in comp:
                cx, cy = i % w, i // w
                for dx in (-2, -1, 0, 1, 2):
                    for dy in (-2, -1, 0, 1, 2):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < w and 0 <= ny < h and ny * w + nx not in members:
                            ring.add(ny * w + nx)
            if sum(is_cream(rgb, j) for j in ring) / len(ring) >= 0.1:
                continue  # light patch inside the cream fill
        for i in comp:
            background[i] = True
    return background


def write_png(path, w, h, rgba):
    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))
    rows = b"".join(b"\x00" + bytes(rgba[r * w * 4:(r + 1) * w * 4]) for r in range(h))
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)))
        f.write(chunk(b"IDAT", zlib.compress(rows, 9)))
        f.write(chunk(b"IEND", b""))


def main():
    src, out = sys.argv[1], sys.argv[2]
    x, y, w, h = map(int, sys.argv[3:7])
    rgb = decode_crop(src, x, y, w, h)
    n = w * h
    depth = [255 - min(rgb[3 * i], rgb[3 * i + 1], rgb[3 * i + 2]) for i in range(n)]
    background = find_background(rgb, depth, w, h)

    # distance (in steps) from the background, capped at EDGE_RADIUS + 1
    dist = [0 if b else EDGE_RADIUS + 1 for b in background]
    queue = deque(i for i in range(n) if background[i])
    while queue:
        i = queue.popleft()
        if dist[i] >= EDGE_RADIUS:
            continue
        cx, cy = i % w, i // w
        for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
            if 0 <= nx < w and 0 <= ny < h:
                j = ny * w + nx
                if dist[j] > dist[i] + 1:
                    dist[j] = dist[i] + 1
                    queue.append(j)

    rgba = bytearray(n * 4)
    known = [False] * n
    for i in range(n):
        r, g, b = rgb[3 * i], rgb[3 * i + 1], rgb[3 * i + 2]
        if background[i]:
            a = 0.0
        elif dist[i] <= EDGE_RADIUS:
            a = min(1.0, depth[i] / EDGE_D)
            if a < 0.08:
                a = 0.0
        else:
            a = 1.0
        if 0 < a < 1:  # un-matte against white
            r, g, b = (max(0, min(255, round((c - (1 - a) * 255) / a))) for c in (r, g, b))
        rgba[4 * i:4 * i + 4] = bytes((r, g, b, round(a * 255)))
        known[i] = a > 0

    # let transparent pixels borrow the nearest visible color (avoids resize fringes)
    queue = deque(i for i in range(n) if known[i])
    while queue:
        i = queue.popleft()
        cx, cy = i % w, i // w
        for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
            if 0 <= nx < w and 0 <= ny < h:
                j = ny * w + nx
                if not known[j]:
                    known[j] = True
                    rgba[4 * j:4 * j + 3] = rgba[4 * i:4 * i + 3]
                    queue.append(j)
    for i in range(n):
        if not known[i]:
            rgba[4 * i:4 * i + 3] = bytes(FILL_COLOR)

    write_png(out, w, h, rgba)


if __name__ == "__main__":
    main()
