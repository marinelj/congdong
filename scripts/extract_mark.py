#!/usr/bin/env python3
"""Cut a white mark out of a colored background (the partner logos on the
official-partners poster #043, white on a blue gradient).

Whiteness is min(r, g, b). The background's whiteness is fitted as a plane
over the plain-background pixels, so the gradient does not bleed into the
mark, and each pixel's alpha is how far it sits between that background and
white. Only pixels within EDGE_RADIUS of the solid strokes keep their
alpha, which drops the poster's soft clouds. The result is pure white with
alpha, trimmed to the mark. Uses only ffmpeg (for decoding) and the standard
library.

usage: extract_mark.py SRC.jpg OUT.png X Y W H
"""
import struct
import subprocess
import sys
import zlib

BG_MAX = 90       # whiteness at or below this is plain background (the clouds sit above it)
WHITE = 245       # whiteness of the mark's solid strokes
CORE = 0.85       # alpha at or above this is a solid stroke
EDGE_RADIUS = 2   # anti-aliased pixels kept around the solid strokes
PAD = 2           # transparent margin left around the trimmed mark


def decode_crop(src, x, y, w, h):
    raw = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-i", src,
         "-vf", f"format=rgb24,crop={w}:{h}:{x}:{y}",
         "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        check=True, capture_output=True).stdout
    assert len(raw) == w * h * 3, "unexpected crop size"
    return raw


def fit_plane(points):
    """Least-squares v = a + b*x + c*y over (x, y, v) points."""
    n = sx = sy = sv = sxx = syy = sxy = sxv = syv = 0.0
    for x, y, v in points:
        n += 1; sx += x; sy += y; sv += v
        sxx += x * x; syy += y * y; sxy += x * y; sxv += x * v; syv += y * v
    m = [[n, sx, sy, sv], [sx, sxx, sxy, sxv], [sy, sxy, syy, syv]]
    for col in range(3):  # Gauss-Jordan on the 3x3 normal equations
        pivot = max(range(col, 3), key=lambda r: abs(m[r][col]))
        m[col], m[pivot] = m[pivot], m[col]
        for r in range(3):
            if r != col:
                f = m[r][col] / m[col][col]
                m[r] = [a - f * b for a, b in zip(m[r], m[col])]
    return tuple(m[i][3] / m[i][i] for i in range(3))


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
    x0, y0, w, h = map(int, sys.argv[3:7])
    rgb = decode_crop(src, x0, y0, w, h)
    white = [min(rgb[3 * i], rgb[3 * i + 1], rgb[3 * i + 2]) for i in range(w * h)]

    a, b, c = fit_plane((i % w, i // w, v) for i, v in enumerate(white) if v <= BG_MAX)
    alpha = []
    for i, v in enumerate(white):
        bg = a + b * (i % w) + c * (i // w)
        alpha.append(min(1.0, max(0.0, (v - bg) / (WHITE - bg))))

    # keep only solid strokes and the anti-aliased pixels right next to them
    core = [v >= CORE for v in alpha]
    near = [False] * (w * h)
    for i in range(w * h):
        if core[i]:
            cx, cy = i % w, i // w
            for ny in range(max(0, cy - EDGE_RADIUS), min(h, cy + EDGE_RADIUS + 1)):
                for nx in range(max(0, cx - EDGE_RADIUS), min(w, cx + EDGE_RADIUS + 1)):
                    near[ny * w + nx] = True
    alpha = [v if near[i] else 0.0 for i, v in enumerate(alpha)]

    # trim to the mark
    xs = [i % w for i, v in enumerate(alpha) if v > 0]
    ys = [i // w for i, v in enumerate(alpha) if v > 0]
    left, right = max(0, min(xs) - PAD), min(w - 1, max(xs) + PAD)
    top, bottom = max(0, min(ys) - PAD), min(h - 1, max(ys) + PAD)
    tw, th = right - left + 1, bottom - top + 1
    rgba = bytearray(tw * th * 4)
    for ty in range(th):
        for tx in range(tw):
            o = 4 * (ty * tw + tx)
            rgba[o:o + 4] = bytes((255, 255, 255, round(alpha[(top + ty) * w + left + tx] * 255)))
    write_png(out, tw, th, rgba)
    print(f"{out}: {tw}x{th} (crop origin {x0 + left},{y0 + top})")


if __name__ == "__main__":
    main()
