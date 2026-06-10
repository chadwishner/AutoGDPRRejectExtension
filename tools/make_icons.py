#!/usr/bin/env python3
"""Generate the extension icons: a cookie behind a red prohibition sign.

Pure stdlib; writes RGBA PNGs with distance-field anti-aliasing.
"""
import math
import os
import struct
import zlib

SIZES = [48, 96, 128, 256, 512]
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "extension", "images")

COOKIE = (201, 138, 75)
COOKIE_EDGE = (166, 110, 55)
CHIP = (101, 62, 32)
RED = (217, 48, 37)


def smoothstep(edge0, edge1, x):
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3 - 2 * t)


def blend(dst, src, alpha):
    return tuple(dst[i] * (1 - alpha) + src[i] * alpha for i in range(3))


def render(size):
    cx = cy = size / 2.0
    aa = max(1.0, size / 64.0)
    cookie_r = size * 0.36
    ring_outer = size * 0.46
    ring_inner = size * 0.38
    slash_w = size * 0.045
    chips = [(-0.15, -0.12, 0.085), (0.14, -0.05, 0.07), (-0.04, 0.14, 0.075),
             (0.10, 0.16, 0.055), (-0.20, 0.05, 0.05)]

    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            d = math.hypot(dx, dy)

            color = (0, 0, 0)
            alpha = 0.0

            # Cookie body with a slightly darker rim.
            cov = 1.0 - smoothstep(cookie_r - aa, cookie_r + aa, d)
            if cov > 0:
                body = blend(COOKIE_EDGE, COOKIE,
                             1.0 - smoothstep(cookie_r * 0.82, cookie_r, d))
                color = blend(color, body, cov) if alpha else body
                alpha = max(alpha, cov)
                # Chocolate chips.
                for ox, oy, r in chips:
                    cd = math.hypot(dx - ox * size, dy - oy * size)
                    ccov = (1.0 - smoothstep(r * size - aa, r * size + aa, cd)) * cov
                    if ccov > 0:
                        color = blend(color, CHIP, ccov)

            # Prohibition ring.
            ring = (1.0 - smoothstep(ring_outer - aa, ring_outer + aa, d)) * \
                smoothstep(ring_inner - aa, ring_inner + aa, d)
            # Diagonal slash (45°), clipped to the ring's disc.
            sd = abs(dx + dy) / math.sqrt(2)
            slash = (1.0 - smoothstep(slash_w - aa, slash_w + aa, sd)) * \
                (1.0 - smoothstep(ring_outer - aa, ring_outer + aa, d))
            red_cov = max(ring, slash)
            if red_cov > 0:
                color = blend(color, RED, red_cov)
                alpha = max(alpha, red_cov)

            row += bytes((int(round(c)) for c in color)) + bytes((int(round(alpha * 255)),))
        rows.append(row)
    return rows


def write_png(path, size, rows):
    raw = b"".join(b"\x00" + bytes(row) for row in rows)

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data +
                struct.pack(">I", zlib.crc32(tag + data)))

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", zlib.compress(raw, 9)))
        f.write(chunk(b"IEND", b""))


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for size in SIZES:
        path = os.path.join(OUT_DIR, f"icon-{size}.png")
        write_png(path, size, render(size))
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
