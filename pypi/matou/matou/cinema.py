#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
BB CHANNEL - 24-bit TrueColor Terminal Cinema Engine (Optimized 2x2 QUAD Edition)
=================================================================================
Self-contained Python 3.9+ standard-library procedural terminal art renderer
reproducing the 16.5-second "BB Channel" animation in 24-bit ANSI TrueColor
(with automatic 256-color fallback on Apple Terminal) using 2x2 Unicode quadrant
sub-pixel blocks.

Performs terminal rendering and keyboard polling only (zero network, filesystem,
or external process calls).
"""

from __future__ import annotations

import argparse
import math
import os
import random
import shutil
import sys
import time
import unicodedata

IS_WINDOWS = os.name == "nt"
if IS_WINDOWS:
    import msvcrt
else:
    import select
    import termios
    import tty

# ---------------------------------------------------------------------------
# Sub-pixel Character Lookup Tables & Trigonometric LUTs
# ---------------------------------------------------------------------------
# 16 Unicode quadrant blocks indexed by 4-bit mask: (TL<<0) | (TR<<1) | (BL<<2) | (BR<<3)
QUAD_CHARS = " ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█"

TOTAL_DURATION = 16.50
MIN_TERM_COLS = 44
MIN_TERM_ROWS = 14

_WAVE_LUT_SIZE = 2048
_WAVE_LUT_MASK = _WAVE_LUT_SIZE - 1
_WAVE_LUT_SCALE = _WAVE_LUT_SIZE / math.pi
_WAVE_LUT = tuple(
    abs(math.sin((i + 0.5) * math.pi / _WAVE_LUT_SIZE)) ** 1.35
    for i in range(_WAVE_LUT_SIZE)
)

_SIN_LUT_SIZE = 2048
_SIN_LUT_MASK = _SIN_LUT_SIZE - 1
_SIN_LUT_SCALE = _SIN_LUT_SIZE / (2.0 * math.pi)
_SIN_LUT = tuple(
    math.sin(i * (2.0 * math.pi / _SIN_LUT_SIZE))
    for i in range(_SIN_LUT_SIZE)
)

# ---------------------------------------------------------------------------
# Frame-Verified Scene 4 Rising Black Blossoms & Petals Trajectory Table
# ---------------------------------------------------------------------------
# Format: (kind, tau_ref, x_ref, y_ref, vx_tau, vy_tau, radius, rot_ref, vrot_tau)
SCENE4_BLACK_FLORA = (
    # --- Early wave (10.00s - 10.75s, Lime Green phase) ---
    (0, 0.20, 0.728, 0.452, -0.96, -2.45, 0.105, 0.25, 1.85),
    (0, 0.33, 0.050, 0.690, -0.96, -2.45, 0.095, 1.10, -1.75),
    (1, 0.33, 0.309, 0.718, -0.96, -2.45, 0.068, 0.40, 2.10),
    (1, 0.33, 0.866, 0.387, -0.96, -2.45, 0.062, 2.20, -2.20),
    (0, 0.53, 0.581, 0.394, -1.44, -2.50, 0.098, 0.80, 1.90),
    (0, 0.53, 0.614, 0.746, -1.44, -2.50, 0.096, 1.75, -1.85),
    (0, 0.53, 0.062, 0.749, -1.10, -2.40, 0.148, 0.50, 1.40),
    (1, 0.53, 0.207, 0.112, -1.35, -2.45, 0.065, 1.50, 2.30),
    # --- Middle wave (10.70s - 11.35s, Electric Cyan Flash phase) ---
    (1, 0.80, 0.374, 0.185, +1.08, -2.30, 0.068, 2.60, -1.95),
    (1, 1.00, 0.199, 0.455, +2.10, -2.35, 0.095, 2.95, 1.65),
    (1, 1.00, 0.551, 0.737, +2.10, -2.35, 0.072, 2.40, -2.10),
    (1, 1.00, 0.852, 0.145, +1.08, -2.30, 0.066, 1.85, 2.00),
    (1, 1.00, 0.858, 0.384, +1.08, -2.30, 0.068, 3.05, -1.80),
    (1, 1.13, 0.486, 0.609, +2.10, -2.35, 0.092, 3.10, 1.75),
    (1, 1.13, 0.713, 0.698, +2.10, -2.35, 0.076, 2.75, -1.90),
    # --- Hot Pink & Slow-Motion Hero Wave (11.27s - 13.45s) ---
    (0, 1.27, 0.799, 0.768, +0.02, -3.00, 0.148, 0.45, -1.60),
    (1, 1.33, 0.088, 0.561, +0.00, -3.00, 0.072, 0.75, 1.90),
    (0, 1.47, 0.560, 0.765, +0.01, -2.85, 0.228, 0.30, 1.35),
    (0, 1.47, 0.275, 0.455, +0.01, -2.85, 0.142, 1.15, -1.55),
    (1, 1.53, 0.295, 0.766, +0.00, -3.00, 0.082, 0.90, 2.00),
    (0, 1.67, 0.665, 0.775, +0.01, -3.00, 0.132, 0.65, -1.65),
    (0, 1.73, 0.218, 0.763, +0.01, -2.95, 0.224, 0.85, 1.40),
    (0, 1.93, 0.273, 0.764, +0.01, -3.00, 0.205, 0.40, -1.45),
    (0, 1.93, 0.501, 0.384, +0.02, -3.00, 0.115, 1.25, 1.75),
    (1, 1.93, 0.055, 0.657, +0.00, -2.90, 0.092, 0.60, -1.80),
    (1, 1.93, 0.047, 0.462, +0.00, -2.90, 0.088, 1.10, 1.95),
    # --- Hero Cluster frozen in slow-motion across "Are you enjoying this" ---
    (0, 2.24, 0.300, 0.618, -0.18, -1.15, 0.252, 0.58, -0.95),
    (0, 2.24, 0.195, 0.915, -0.15, -1.15, 0.225, 1.22, 0.85),
    (0, 2.24, 0.035, 0.905, -0.10, -1.15, 0.145, 0.35, -1.10),
    (1, 2.24, 0.155, 0.075, +0.08, -1.35, 0.085, 2.35, -1.40),
    (1, 2.24, 0.108, 0.175, +0.06, -1.35, 0.078, 2.85, 1.50),
    (1, 2.24, 0.106, 0.495, +0.06, -1.35, 0.086, 1.95, -1.35),
    (1, 2.24, 0.728, 0.895, -0.04, -1.35, 0.052, 2.65, 1.60),
    (1, 2.40, 0.827, 0.670, +0.02, -1.85, 0.064, 1.45, -1.75),
)

# Scene 4 annular lace ring specs: (cx, cy, radius, angle0, angular_speed)
SCENE4_LACE_SPECS = (
    (0.068, 0.145, 0.535, 0.20, -0.52),  # Top-Left: CCW
    (0.544, 1.105, 0.530, 1.05, +0.58),  # Bottom-Center: CW
    (0.960, 0.750, 0.715, 0.55, -0.68),  # Right-Large: CCW
)


def scene4_warped_tau(t: float) -> float:
    """Computes the non-linear motion time tau for Scene 4 black blossoms & petals."""
    if t <= 10.00:
        return 0.0
    if t <= 12.20:
        return t - 10.00
    if t <= 13.00:
        return 2.20 + (t - 12.20) * 0.095
    return 2.276 + (t - 13.00) * 1.45


# ---------------------------------------------------------------------------
# Color, Display-Width & Math Helpers
# ---------------------------------------------------------------------------
def clamp_u8(v: float) -> int:
    if v <= 0.0:
        return 0
    if v >= 255.0:
        return 255
    return int(v + 0.5)


def lerp_rgb(c1: tuple[int, int, int], c2: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    if t <= 0.0:
        return c1
    if t >= 1.0:
        return c2
    inv = 1.0 - t
    return (
        int(c1[0] * inv + c2[0] * t + 0.5),
        int(c1[1] * inv + c2[1] * t + 0.5),
        int(c1[2] * inv + c2[2] * t + 0.5),
    )


def supports_truecolor(env: dict[str, str] | None = None) -> bool:
    """Returns False on Apple Terminal (256-color only), True elsewhere."""
    e = os.environ if env is None else env
    colorterm = (e.get("COLORTERM") or "").lower()
    if "truecolor" in colorterm or "24bit" in colorterm:
        return True
    if e.get("TERM_PROGRAM") == "Apple_Terminal":
        return False
    return True


def rgb_to_ansi256(r: int, g: int, b: int) -> int:
    """Maps an 8-bit RGB triple to the nearest xterm 256-color palette index."""
    if abs(r - g) <= 8 and abs(g - b) <= 8:
        avg = (r + g + b) // 3
        if avg < 8:
            return 16
        if avg > 248:
            return 231
        return 232 + int(((avg - 8) / 247.0) * 24.0)
    ri = int(round((r / 255.0) * 5.0))
    gi = int(round((g / 255.0) * 5.0))
    bi = int(round((b / 255.0) * 5.0))
    return 16 + 36 * ri + 6 * gi + bi


def display_width(text: str) -> int:
    """Computes approximate terminal column width (wide East Asian chars count as 2)."""
    total = 0
    for ch in text:
        total += 2 if unicodedata.east_asian_width(ch) in ("W", "F") else 1
    return total


def clip_to_columns(text: str, max_cols: int) -> str:
    """Clips text cleanly without exceeding max_cols terminal columns."""
    if max_cols <= 0:
        return ""
    out: list[str] = []
    used = 0
    for ch in text:
        w = 2 if unicodedata.east_asian_width(ch) in ("W", "F") else 1
        if used + w > max_cols:
            break
        out.append(ch)
        used += w
    return "".join(out)


def eval_quad_bezier(
    p0: tuple[float, float],
    p1: tuple[float, float],
    p2: tuple[float, float],
    steps: int = 12,
) -> list[tuple[float, float]]:
    pts: list[tuple[float, float]] = []
    for i in range(1, steps + 1):
        t = i / steps
        inv = 1.0 - t
        x = inv * inv * p0[0] + 2.0 * inv * t * p1[0] + t * t * p2[0]
        y = inv * inv * p0[1] + 2.0 * inv * t * p1[1] + t * t * p2[1]
        pts.append((x, y))
    return pts


def build_path(segments: list[tuple]) -> list[tuple[float, float]]:
    """Constructs a high-density polygon vertex list from ('M',x,y), ('L',x,y), ('Q',cx,cy,x,y)."""
    pts: list[tuple[float, float]] = []
    cur = (0.0, 0.0)
    for seg in segments:
        cmd = seg[0]
        if cmd == "M" or cmd == "L":
            cur = (float(seg[1]), float(seg[2]))
            pts.append(cur)
        elif cmd == "Q":
            ctrl = (float(seg[1]), float(seg[2]))
            end = (float(seg[3]), float(seg[4]))
            steps = seg[5] if len(seg) > 5 else 12
            pts.extend(eval_quad_bezier(cur, ctrl, end, steps))
            cur = end
    return pts


# ---------------------------------------------------------------------------
# Fast Polygon Scanline & Stroke Rasterizers into Sub-Pixel Mask
# ---------------------------------------------------------------------------
def fill_polygon_mask(
    mask: bytearray,
    gw: int,
    gh: int,
    norm_poly: list[tuple[float, float]],
    val: int = 1,
    offset_x: float = 0.0,
    offset_y: float = 0.0,
) -> None:
    """Scanline-fills a normalized polygon ([0,1]x[0,1]) into a gw x gh mask buffer."""
    n = len(norm_poly)
    if n < 3:
        return
    poly = [((x + offset_x) * gw, (y + offset_y) * gh) for x, y in norm_poly]
    min_y = max(0, int(min(p[1] for p in poly)))
    max_y = min(gh - 1, int(max(p[1] for p in poly)))
    fill_byte = bytes((val,))

    for y in range(min_y, max_y + 1):
        py = y + 0.5
        nodes: list[float] = []
        j = n - 1
        for i in range(n):
            xi, yi = poly[i]
            xj, yj = poly[j]
            if (yi < py <= yj) or (yj < py <= yi):
                nodes.append(xi + (py - yi) / (yj - yi) * (xj - xi))
            j = i
        nodes.sort()
        row_off = y * gw
        for k in range(0, len(nodes) - 1, 2):
            x_start = max(0, int(nodes[k] + 0.5))
            x_end = min(gw, int(nodes[k + 1] + 0.5))
            if x_end > x_start:
                mask[row_off + x_start : row_off + x_end] = fill_byte * (x_end - x_start)


def stroke_polyline_mask(
    mask: bytearray,
    gw: int,
    gh: int,
    norm_pts: list[tuple[float, float]],
    radius_norm_h: float,
    val: int = 1,
    closed: bool = False,
) -> None:
    """Rasterizes a thick round-cap vector stroke in physical 16:9 normalized space."""
    if len(norm_pts) < 2:
        return
    aspect = 16.0 / 9.0
    rx_px = max(0.75, (radius_norm_h / aspect) * gw)
    ry_px = max(0.75, radius_norm_h * gh)
    r_phys2 = radius_norm_h * radius_norm_h
    inv_gw_aspect = aspect / gw
    inv_gh = 1.0 / gh
    cnt = len(norm_pts) if closed else len(norm_pts) - 1

    for i in range(cnt):
        nx1, ny1 = norm_pts[i]
        nx2, ny2 = norm_pts[(i + 1) % len(norm_pts)]
        x1_px, y1_px = nx1 * gw, ny1 * gh
        x2_px, y2_px = nx2 * gw, ny2 * gh
        min_x = max(0, int(min(x1_px, x2_px) - rx_px - 1))
        max_x = min(gw - 1, int(max(x1_px, x2_px) + rx_px + 1))
        min_y = max(0, int(min(y1_px, y2_px) - ry_px - 1))
        max_y = min(gh - 1, int(max(y1_px, y2_px) + ry_px + 1))

        ax1, ay1 = nx1 * aspect, ny1
        dx = nx2 * aspect - ax1
        dy = ny2 - ay1
        l2 = dx * dx + dy * dy
        inv_l2 = (1.0 / l2) if l2 > 1e-12 else 0.0

        for y in range(min_y, max_y + 1):
            py = (y + 0.5) * inv_gh
            row_off = y * gw
            py_ay1 = py - ay1
            for x in range(min_x, max_x + 1):
                px = (x + 0.5) * inv_gw_aspect
                px_ax1 = px - ax1
                if inv_l2 == 0.0:
                    d2 = px_ax1 * px_ax1 + py_ay1 * py_ay1
                else:
                    t = (px_ax1 * dx + py_ay1 * dy) * inv_l2
                    if t < 0.0:
                        t = 0.0
                    elif t > 1.0:
                        t = 1.0
                    rx = px_ax1 - t * dx
                    ry = py_ay1 - t * dy
                    d2 = rx * rx + ry * ry
                if d2 <= r_phys2:
                    mask[row_off + x] = val


def downsample_2x2_mask(hi_mask: bytearray, gw: int, gh: int) -> bytearray:
    """Downsamples a (2*gw) x (2*gh) binary mask into a gw x gh coverage mask with values 0..4."""
    gw2 = gw * 2
    out = bytearray(gw * gh)
    for y in range(gh):
        r0 = (2 * y) * gw2
        r1 = r0 + gw2
        dst_off = y * gw
        for x in range(gw):
            x2 = 2 * x
            out[dst_off + x] = (
                hi_mask[r0 + x2]
                + hi_mask[r0 + x2 + 1]
                + hi_mask[r1 + x2]
                + hi_mask[r1 + x2 + 1]
            )
    return out


# ---------------------------------------------------------------------------
# Procedural SDF Geometry: Cherry Blossoms & Folded Petals
# ---------------------------------------------------------------------------
_SECTOR_5 = 2.0 * math.pi / 5.0
_HALF_SECTOR_5 = 0.5 * _SECTOR_5


def sakura_hit(
    dx: float,
    dy: float,
    radius: float,
    inv_radius: float,
    max_r2: float,
    hub_r2: float,
    angle_rad: float,
    min_seam_half_w: float,
) -> bool:
    """Fast binary hit test for a 5-petal cherry blossom with precomputed radial constants."""
    r2 = dx * dx + dy * dy
    if r2 > max_r2:
        return False
    if r2 <= hub_r2:
        return True

    r = math.sqrt(r2)
    theta = math.atan2(dy, dx) - angle_rad
    local_a = ((theta + _HALF_SECTOR_5) % _SECTOR_5) - _HALF_SECTOR_5
    a = -local_a if local_a < 0.0 else local_a

    if (_HALF_SECTOR_5 - a) * r < min_seam_half_w:
        return False

    rn = r * inv_radius
    ly = rn * math.cos(a)
    ax = rn * math.sin(a)

    if -0.80000 * ax + 0.60000 * (ly - 0.02) < 0.0:
        return False
    if -0.96152 * (ax - 0.45) - 0.27472 * (ly - 0.62) < 0.0:
        return False
    if -0.44721 * (ax - 0.37) - 0.89443 * (ly - 0.90) < 0.0:
        return False
    if 0.70711 * ax - 0.70711 * (ly - 0.83) < 0.0:
        return False
    return True


def single_petal_hit(
    dx: float,
    dy: float,
    inv_scale: float,
    cos_neg: float,
    sin_neg: float,
) -> bool:
    """Fast binary hit test for a single folded petal with hoisted cos/sin."""
    lx = (dx * cos_neg - dy * sin_neg) * inv_scale
    ax = -lx if lx < 0.0 else lx
    if ax > 0.52:
        return False
    ly = (dx * sin_neg + dy * cos_neg) * inv_scale + 0.52
    if ly < 0.0 or ly > 1.05:
        return False
    return (
        -0.80000 * ax + 0.60000 * (ly - 0.02) >= 0.0
        and -0.96152 * (ax - 0.45) - 0.27472 * (ly - 0.62) >= 0.0
        and -0.44721 * (ax - 0.37) - 0.89443 * (ly - 0.90) >= 0.0
        and 0.70711 * ax - 0.70711 * (ly - 0.83) >= 0.0
    )


# ---------------------------------------------------------------------------
# Finale (Scene 5) High-Precision Vector Silhouette, Frames & Neon Logo Cache
# ---------------------------------------------------------------------------
def build_bb_main_polygon(is_shadow: bool = False) -> list[tuple[float, float]]:
    top_y = 0.0 if is_shadow else 0.036
    return build_path([
        ("M", 0.308, top_y),
        ("L", 0.538, top_y),
        ("Q", 0.554, 0.072, 0.544, 0.118, 8),
        ("Q", 0.560, 0.195, 0.566, 0.355, 10),
        ("L", 0.584, 0.392),
        ("Q", 0.675, 0.448, 0.786, 0.565, 12),
        ("Q", 0.798, 0.618, 0.785, 0.688, 10),
        ("L", 0.752, 0.735),
        ("L", 0.858, 0.782),
        ("L", 0.715, 0.885),
        ("L", 0.515, 0.955),
        ("L", 0.180, 0.955),
        ("Q", 0.148, 0.910, 0.152, 0.855, 8),
        ("Q", 0.215, 0.745, 0.294, 0.642, 10),
        ("L", 0.286, 0.452),
        ("L", 0.205, 0.288),
        ("L", 0.304, 0.352),
        ("Q", 0.294, 0.195, 0.308, top_y, 12),
    ])


def build_bb_ribbon_bow_polygons() -> tuple[list[tuple[float, float]], list[tuple[float, float]]]:
    bow_outer = build_path([
        ("M", 0.530, 0.112),
        ("Q", 0.552, 0.106, 0.562, 0.136, 6),
        ("L", 0.576, 0.124),
        ("L", 0.588, 0.174),
        ("Q", 0.616, 0.138, 0.646, 0.114, 10),
        ("Q", 0.628, 0.184, 0.598, 0.238, 10),
        ("Q", 0.572, 0.246, 0.542, 0.242, 8),
        ("L", 0.530, 0.112),
    ])
    bow_inner_slit = build_path([
        ("M", 0.526, 0.142),
        ("Q", 0.548, 0.152, 0.546, 0.222, 8),
        ("Q", 0.538, 0.242, 0.525, 0.248, 8),
        ("Q", 0.520, 0.195, 0.526, 0.142, 8),
    ])
    return bow_outer, bow_inner_slit


def build_bb_cutout_polygons() -> list[list[tuple[float, float]]]:
    left_waist_triangle = [
        (0.344, 0.710),
        (0.376, 0.788),
        (0.348, 0.842),
        (0.280, 0.762),
    ]
    right_waist_triangle = [
        (0.594, 0.618),
        (0.668, 0.636),
        (0.615, 0.742),
        (0.592, 0.688),
    ]
    return [left_waist_triangle, right_waist_triangle]


def build_gothic_B_polygons() -> tuple[
    list[tuple[float, float]],
    list[tuple[float, float]],
    list[tuple[float, float]],
    list[tuple[float, float]],
]:
    x0, x1 = 0.014, 0.292
    y0, y1 = 0.228, 0.768

    def tx(u: float, v: float) -> tuple[float, float]:
        return (x0 + u * (x1 - x0), y0 + v * (y1 - y0))

    outer_local = build_path([
        ("M", 0.140, 0.000),
        ("Q", 0.275, 0.058, 0.435, 0.050, 8),
        ("Q", 0.560, 0.042, 0.665, 0.032, 8),
        ("Q", 0.948, 0.022, 0.948, 0.258, 14),
        ("Q", 0.948, 0.418, 0.795, 0.486, 12),
        ("Q", 0.996, 0.548, 0.996, 0.738, 14),
        ("Q", 0.996, 0.958, 0.680, 0.962, 14),
        ("Q", 0.520, 0.942, 0.422, 0.858, 10),
        ("Q", 0.358, 0.888, 0.278, 0.968, 10),
        ("Q", 0.160, 1.015, 0.062, 0.948, 10),
        ("Q", 0.002, 0.892, 0.000, 0.785, 10),
        ("Q", 0.072, 0.858, 0.172, 0.848, 8),
        ("Q", 0.272, 0.795, 0.285, 0.615, 10),
        ("L", 0.288, 0.185),
        ("Q", 0.275, 0.095, 0.140, 0.000, 10),
    ])

    upper_hole_local = build_path([
        ("M", 0.456, 0.118),
        ("Q", 0.468, 0.104, 0.595, 0.104, 8),
        ("Q", 0.818, 0.104, 0.818, 0.275, 12),
        ("Q", 0.818, 0.432, 0.685, 0.450, 10),
        ("Q", 0.605, 0.455, 0.548, 0.405, 8),
        ("L", 0.456, 0.466),
        ("L", 0.456, 0.118),
    ])

    lower_hole_local = build_path([
        ("M", 0.456, 0.534),
        ("L", 0.548, 0.595),
        ("Q", 0.605, 0.545, 0.690, 0.542, 8),
        ("Q", 0.852, 0.540, 0.852, 0.708, 12),
        ("Q", 0.852, 0.872, 0.635, 0.876, 12),
        ("Q", 0.515, 0.874, 0.456, 0.805, 8),
        ("L", 0.456, 0.534),
    ])

    stem_spine_local = build_path([
        ("M", 0.295, 0.165),
        ("Q", 0.322, 0.210, 0.324, 0.320, 6),
        ("L", 0.324, 0.635),
        ("Q", 0.305, 0.840, 0.145, 0.920, 10),
        ("Q", 0.055, 0.910, 0.020, 0.805, 8),
    ])

    return (
        [tx(u, v) for u, v in outer_local],
        [tx(u, v) for u, v in upper_hole_local],
        [tx(u, v) for u, v in lower_hole_local],
        [tx(u, v) for u, v in stem_spine_local],
    )


CHANNEL_GLYPHS_HD: dict[str, tuple[str, ...]] = {
    "C": (
        "......############......",
        "...##################...",
        "..######........######..",
        ".#####.............#####",
        "####................####",
        "####........###.....####",
        "####.......###......####",
        "####.......###....######",
        "####........##########..",
        "####....................",
        "####....................",
        ".#####..................",
        "..######..........###...",
        "...##################...",
        "......############......",
    ),
    "h": (
        "..........",
        "##........",
        "##........",
        "##........",
        "##........",
        "##........",
        "########..",
        "##.....###",
        "##......##",
        "##......##",
        "##......##",
        "##......##",
        "##......##",
        "##......##",
        "##......##",
    ),
    "a": (
        "..........",
        "..........",
        "..........",
        "..........",
        "..........",
        "..........",
        ".#######..",
        ".......###",
        "........##",
        "..########",
        "###.....##",
        "##......##",
        "##......##",
        "###.....##",
        "..########",
    ),
    "n": (
        "..........",
        "..........",
        "..........",
        "..........",
        "..........",
        "..........",
        "########..",
        "##.....###",
        "##......##",
        "##......##",
        "##......##",
        "##......##",
        "##......##",
        "##......##",
        "##......##",
    ),
    "e": (
        "..........",
        "..........",
        "..........",
        "..........",
        "..........",
        "..........",
        "..######..",
        "###....###",
        "##......##",
        "##......##",
        "##########",
        "##........",
        "##........",
        "###....###",
        "..######..",
    ),
    "l": (
        "..",
        "##",
        "##",
        "##",
        "##",
        "##",
        "##",
        "##",
        "##",
        "##",
        "##",
        "##",
        "##",
        "##",
        "##",
    ),
}

CHANNEL_GLYPHS_STD: dict[str, tuple[str, ...]] = {
    "C": (
        "....##########....",
        "..##############..",
        ".####........####.",
        "####..........####",
        "####....###...####",
        "####...###....####",
        "####...###..######",
        "####....########..",
        "####..............",
        ".####.............",
        "..##############..",
        "....##########....",
    ),
    "h": (
        "........",
        "##......",
        "##......",
        "##......",
        "######..",
        "##...###",
        "##....##",
        "##....##",
        "##....##",
        "##....##",
        "##....##",
        "##....##",
    ),
    "a": (
        "........",
        "........",
        "........",
        "........",
        ".#####..",
        ".....###",
        "..######",
        "###...##",
        "##....##",
        "##....##",
        "###...##",
        "..######",
    ),
    "n": (
        "........",
        "........",
        "........",
        "........",
        "######..",
        "##...###",
        "##....##",
        "##....##",
        "##....##",
        "##....##",
        "##....##",
        "##....##",
    ),
    "e": (
        "........",
        "........",
        "........",
        "........",
        "..####..",
        "###..###",
        "##....##",
        "########",
        "##......",
        "##......",
        "###..###",
        "..####..",
    ),
    "l": ("..", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##"),
}

CHANNEL_GLYPHS_CMP: dict[str, tuple[str, ...]] = {
    "C": (
        "...########...",
        ".############.",
        "####......####",
        "###...##...###",
        "###..##..#####",
        "###...######..",
        "###...........",
        "####..........",
        ".###########..",
        "...########...",
    ),
    "h": (
        "......",
        "##....",
        "##....",
        "#####.",
        "##..##",
        "##..##",
        "##..##",
        "##..##",
        "##..##",
        "##..##",
    ),
    "a": (
        "......",
        "......",
        "......",
        ".####.",
        "....##",
        ".#####",
        "##..##",
        "##..##",
        "##..##",
        ".#####",
    ),
    "n": (
        "......",
        "......",
        "......",
        "#####.",
        "##..##",
        "##..##",
        "##..##",
        "##..##",
        "##..##",
        "##..##",
    ),
    "e": (
        "......",
        "......",
        "......",
        ".####.",
        "##..##",
        "##..##",
        "######",
        "##....",
        "##..##",
        ".####.",
    ),
    "l": ("..", "##", "##", "##", "##", "##", "##", "##", "##", "##"),
}


def assemble_channel_bitmap(
    table: dict[str, tuple[str, ...]],
    gap_after_c: int,
    gap_lower: int,
) -> tuple[str, ...]:
    word = "Channel"
    h = len(table["C"])
    rows = [""] * h
    for i, ch in enumerate(word):
        g = table[ch]
        gap = 0 if i == 0 else (gap_after_c if i == 1 else gap_lower)
        gap_str = "." * gap if gap > 0 else ""
        for r in range(h):
            rows[r] += gap_str + g[r]
    return tuple(rows)


CHANNEL_BITMAP_HD = assemble_channel_bitmap(CHANNEL_GLYPHS_HD, 4, 4)
CHANNEL_BITMAP_HD_TIGHT = assemble_channel_bitmap(CHANNEL_GLYPHS_HD, 2, 2)
CHANNEL_BITMAP_STD = assemble_channel_bitmap(CHANNEL_GLYPHS_STD, 4, 4)
CHANNEL_BITMAP_STD_TIGHT = assemble_channel_bitmap(CHANNEL_GLYPHS_STD, 2, 2)
CHANNEL_BITMAP_CMP = assemble_channel_bitmap(CHANNEL_GLYPHS_CMP, 4, 2)

_CHANNEL_QUAD_CANDIDATES = (
    CHANNEL_BITMAP_CMP,
    CHANNEL_BITMAP_STD_TIGHT,
    CHANNEL_BITMAP_STD,
    CHANNEL_BITMAP_HD_TIGHT,
    CHANNEL_BITMAP_HD,
)


def _select_channel_bitmap(gw: int, gh: int) -> tuple[tuple[str, ...], int]:
    """Selects (bitmap, integer_scale) keeping Channel ~35%W x 19.5%H with crisp cell alignment."""
    if gh <= 88 and gw <= 316:
        if gh >= 74 and gw >= 264:
            return CHANNEL_BITMAP_HD, 1
        if gh >= 58 and gw >= 208:
            return CHANNEL_BITMAP_STD, 1
        return CHANNEL_BITMAP_CMP, 1

    target_w = gw * 0.352
    target_h = gh * 0.195
    max_w = gw * 0.382
    max_h = gh * 0.235
    best_bmp = CHANNEL_BITMAP_CMP
    best_scale = 1
    best_err = 1e9

    for bmp in _CHANNEL_QUAD_CANDIDATES:
        bw = len(bmp[0])
        bh = len(bmp)
        max_s = max(1, int(min(max_w // bw, max_h // bh)))
        for s in range(1, max_s + 2):
            w = bw * s
            h = bh * s
            if w > max_w or h > max_h:
                continue
            err = abs(w - target_w) / target_w + abs(h - target_h) / target_h - (bh / 180.0)
            if err < best_err:
                best_err = err
                best_bmp = bmp
                best_scale = s
    return best_bmp, best_scale


def rasterize_pixel_perfect_channel(ch_mask: bytearray, gw: int, gh: int) -> None:
    bitmap, scale = _select_channel_bitmap(gw, gh)
    base_h = len(bitmap)
    base_w = len(bitmap[0])
    art_h = base_h * scale
    art_w = base_w * scale
    start_x = ((gw - art_w) // 4) * 2
    start_y = ((gh - art_h) // 4) * 2

    for r in range(base_h):
        row_str = bitmap[r]
        y_base = start_y + r * scale
        for dy in range(scale):
            y = y_base + dy
            if y < 0 or y >= gh:
                continue
            row_off = y * gw
            for c in range(base_w):
                if row_str[c] == "#":
                    x_base = start_x + c * scale
                    for dx in range(scale):
                        x = x_base + dx
                        if 0 <= x < gw:
                            ch_mask[row_off + x] = 4


def snap_binary_mask(mask: bytearray, threshold: int = 2) -> bytearray:
    for i in range(len(mask)):
        mask[i] = 4 if mask[i] >= threshold else 0
    return mask


def clean_binary_mask(
    mask: bytearray,
    gw: int,
    gh: int,
    min_comp_size: int,
    max_hole_size: int,
) -> bytearray:
    """Erases detached foreground islands < min_comp_size and fills interior pinholes <= max_hole_size."""
    n = gw * gh
    if min_comp_size > 1:
        visited = bytearray(n)
        for i in range(n):
            if mask[i] == 0 or visited[i]:
                continue
            visited[i] = 1
            comp = [i]
            qh = 0
            while qh < len(comp):
                cur = comp[qh]
                qh += 1
                cx = cur % gw
                cy = cur // gw
                if cx > 0 and mask[cur - 1] and not visited[cur - 1]:
                    visited[cur - 1] = 1
                    comp.append(cur - 1)
                if cx + 1 < gw and mask[cur + 1] and not visited[cur + 1]:
                    visited[cur + 1] = 1
                    comp.append(cur + 1)
                if cy > 0 and mask[cur - gw] and not visited[cur - gw]:
                    visited[cur - gw] = 1
                    comp.append(cur - gw)
                if cy + 1 < gh and mask[cur + gw] and not visited[cur + gw]:
                    visited[cur + gw] = 1
                    comp.append(cur + gw)
            if len(comp) < min_comp_size:
                for idx in comp:
                    mask[idx] = 0

    if max_hole_size > 0:
        visited = bytearray(n)
        for i in range(n):
            if mask[i] != 0 or visited[i]:
                continue
            visited[i] = 1
            comp = [i]
            touches_border = False
            qh = 0
            while qh < len(comp):
                cur = comp[qh]
                qh += 1
                cx = cur % gw
                cy = cur // gw
                if cx == 0 or cx == gw - 1 or cy == 0 or cy == gh - 1:
                    touches_border = True
                if cx > 0 and mask[cur - 1] == 0 and not visited[cur - 1]:
                    visited[cur - 1] = 1
                    comp.append(cur - 1)
                if cx + 1 < gw and mask[cur + 1] == 0 and not visited[cur + 1]:
                    visited[cur + 1] = 1
                    comp.append(cur + 1)
                if cy > 0 and mask[cur - gw] == 0 and not visited[cur - gw]:
                    visited[cur - gw] = 1
                    comp.append(cur - gw)
                if cy + 1 < gh and mask[cur + gw] == 0 and not visited[cur + gw]:
                    visited[cur + gw] = 1
                    comp.append(cur + gw)
            if not touches_border and len(comp) <= max_hole_size:
                for idx in comp:
                    mask[idx] = 4

    return mask


class FinaleCache:
    """
    Pre-rasterizes Scene 5 Finale vector layers + pre-composes the static base
    silhouette buffer and final full-alpha RGB buffer for near-zero per-frame cost.
    """

    def __init__(self, gw: int, gh: int) -> None:
        self.gw = gw
        self.gh = gh
        n = gw * gh
        gw2 = gw * 2
        gh2 = gh * 2
        n2 = gw2 * gh2

        hi_bb = bytearray(n2)
        hi_shadow = bytearray(n2)

        main_poly = build_bb_main_polygon(False)
        shadow_main_poly = build_bb_main_polygon(True)
        bow_outer, bow_slit = build_bb_ribbon_bow_polygons()
        cutouts = build_bb_cutout_polygons()

        sx, sy = 0.052, -0.018
        fill_polygon_mask(hi_shadow, gw2, gh2, shadow_main_poly, 1, sx, sy)
        fill_polygon_mask(hi_shadow, gw2, gh2, bow_outer, 1, sx, sy)
        fill_polygon_mask(hi_shadow, gw2, gh2, bow_slit, 0, sx, sy)
        for cut in cutouts:
            fill_polygon_mask(hi_shadow, gw2, gh2, cut, 0, sx, sy)

        fill_polygon_mask(hi_bb, gw2, gh2, main_poly, 1, 0.0, 0.0)
        fill_polygon_mask(hi_bb, gw2, gh2, bow_outer, 1, 0.0, 0.0)
        fill_polygon_mask(hi_bb, gw2, gh2, bow_slit, 0, 0.0, 0.0)
        for cut in cutouts:
            fill_polygon_mask(hi_bb, gw2, gh2, cut, 0, 0.0, 0.0)

        self.bb_mask = clean_binary_mask(
            snap_binary_mask(downsample_2x2_mask(hi_bb, gw, gh), 2), gw, gh, 12, 3
        )
        self.bb_shadow = clean_binary_mask(
            snap_binary_mask(downsample_2x2_mask(hi_shadow, gw, gh), 2), gw, gh, 12, 3
        )

        self.gray_frame = bytearray(n)
        self.black_frame = bytearray(n)
        self._build_frames(gw2, gh2)

        hi_b_left = bytearray(n2)
        hi_chisel_dark_left = bytearray(n2)
        hi_chisel_light_left = bytearray(n2)

        outer, h1, h2, spine = build_gothic_B_polygons()
        fill_polygon_mask(hi_b_left, gw2, gh2, outer, 1)
        fill_polygon_mask(hi_b_left, gw2, gh2, h1, 0)
        fill_polygon_mask(hi_b_left, gw2, gh2, h2, 0)

        stroke_polyline_mask(hi_chisel_light_left, gw2, gh2, spine, 0.0038, 1)
        spine_dark = [(px - 0.0042, py) for px, py in spine]
        stroke_polyline_mask(hi_chisel_dark_left, gw2, gh2, spine_dark, 0.0032, 1)

        b_clip_w = min(gw2, int(gw2 * 0.36) + 2)
        for y in range(gh2):
            row_off = y * gw2
            for x in range(b_clip_w):
                idx = row_off + x
                if not hi_b_left[idx]:
                    hi_chisel_dark_left[idx] = 0
                    hi_chisel_light_left[idx] = 0

        left_core = clean_binary_mask(
            snap_binary_mask(downsample_2x2_mask(hi_b_left, gw, gh), 2), gw, gh, 20, 3
        )
        left_dark = downsample_2x2_mask(hi_chisel_dark_left, gw, gh)
        left_light = downsample_2x2_mask(hi_chisel_light_left, gw, gh)

        self.b_core = bytearray(n)
        self.b_inner_bevel = bytearray(n)
        self.b_chisel_dark = bytearray(n)
        self.b_chisel_light = bytearray(n)

        half_w = gw // 2
        for y in range(gh):
            row_off = y * gw
            for x in range(half_w):
                src_idx = row_off + x
                if not left_core[src_idx]:
                    continue
                mir_idx = row_off + (gw - 1 - x)
                self.b_core[src_idx] = 4
                self.b_core[mir_idx] = 4
                self.b_chisel_dark[src_idx] = left_dark[src_idx]
                self.b_chisel_dark[mir_idx] = left_dark[src_idx]
                self.b_chisel_light[src_idx] = left_light[src_idx]
                self.b_chisel_light[mir_idx] = left_light[src_idx]

                is_edge = (
                    x == 0
                    or y == 0
                    or y == gh - 1
                    or not left_core[src_idx - 1]
                    or not left_core[src_idx + 1]
                    or not left_core[src_idx - gw]
                    or not left_core[src_idx + gw]
                )
                if is_edge:
                    self.b_inner_bevel[src_idx] = 2
                    self.b_inner_bevel[mir_idx] = 2

        self.channel_core = bytearray(n)
        rasterize_pixel_perfect_channel(self.channel_core, gw, gh)

        self.logo_glow = bytearray(n)
        self._build_neon_effects()
        self._precompose_buffers()

    def _build_frames(self, gw2: int, gh2: int) -> None:
        aspect = 16.0 / 9.0
        ang_g = math.radians(15.5)
        cg, sg = math.cos(ang_g), math.sin(ang_g)
        inv_gw2 = 1.0 / gw2
        inv_gh2 = 1.0 / gh2

        hi_black = bytearray(gw2 * gh2)
        hi_gray = bytearray(gw2 * gh2)

        bx_out0 = max(0, int((0.5 - 0.478) * gw2))
        bx_out1 = min(gw2, int((0.5 + 0.478) * gw2) + 1)
        bx_in0 = max(0, int((0.5 - 0.460) * gw2))
        bx_in1 = min(gw2, int((0.5 + 0.460) * gw2) + 1)
        by_out0 = max(0, int((0.5 - 0.466) * gh2))
        by_out1 = min(gh2, int((0.5 + 0.466) * gh2) + 1)
        by_in0 = max(0, int((0.5 - 0.440) * gh2))
        by_in1 = min(gh2, int((0.5 + 0.440) * gh2) + 1)

        for y in range(by_out0, by_out1):
            ady = abs((y + 0.5) * inv_gh2 - 0.5)
            if ady > 0.466:
                continue
            row_off = y * gw2
            if ady >= 0.440:
                for x in range(bx_out0, bx_out1):
                    if abs((x + 0.5) * inv_gw2 - 0.5) <= 0.478:
                        hi_black[row_off + x] = 1
            else:
                for x in range(bx_out0, min(bx_in0 + 2, bx_out1)):
                    adx = abs((x + 0.5) * inv_gw2 - 0.5)
                    if 0.460 <= adx <= 0.478:
                        hi_black[row_off + x] = 1
                for x in range(max(bx_out0, bx_in1 - 2), bx_out1):
                    adx = abs((x + 0.5) * inv_gw2 - 0.5)
                    if 0.460 <= adx <= 0.478:
                        hi_black[row_off + x] = 1

        gx_step = aspect * cg * inv_gw2
        gy_step = aspect * sg * inv_gw2
        for y in range(gh2):
            dy = (y + 0.5) * inv_gh2 - 0.5
            row_off = y * gw2
            gx = (-0.5 + 0.5 * inv_gw2) * aspect * cg - dy * sg
            gy = (-0.5 + 0.5 * inv_gw2) * aspect * sg + dy * cg
            for x in range(gw2):
                agx = -gx if gx < 0.0 else gx
                agy = -gy if gy < 0.0 else gy
                if (0.715 <= agx <= 0.748 and agy <= 0.485) or (
                    0.450 <= agy <= 0.482 and agx <= 0.748
                ):
                    hi_gray[row_off + x] = 1
                gx += gx_step
                gy += gy_step

        self.black_frame[:] = snap_binary_mask(downsample_2x2_mask(hi_black, self.gw, self.gh), 2)
        self.gray_frame[:] = clean_binary_mask(
            snap_binary_mask(downsample_2x2_mask(hi_gray, self.gw, self.gh), 2),
            self.gw,
            self.gh,
            6,
            2,
        )

    def _build_neon_effects(self) -> None:
        gw, gh = self.gw, self.gh
        r_glow = max(2, int(gh * 0.022 + 0.5))
        r_glow2 = r_glow * r_glow
        inv_r_glow = 1.0 / (r_glow + 0.5)

        horiz = bytearray(gw * gh)
        horiz[:] = b"\xff" * (gw * gh)
        b_core = self.b_core
        active_rows: list[int] = []

        for y in range(gh):
            row_off = y * gw
            last = -9999
            has_any = False
            for x in range(gw):
                if b_core[row_off + x] >= 2:
                    last = x
                    has_any = True
                d = x - last
                if d <= r_glow:
                    horiz[row_off + x] = d
            if not has_any:
                continue
            active_rows.append(y)
            last = 9999
            for x in range(gw - 1, -1, -1):
                if b_core[row_off + x] >= 2:
                    last = x
                d = last - x
                if d < horiz[row_off + x]:
                    horiz[row_off + x] = d

        if not active_rows:
            return
        y_min = max(0, active_rows[0] - r_glow)
        y_max = min(gh - 1, active_rows[-1] + r_glow)

        for y in range(y_min, y_max + 1):
            y0 = max(0, y - r_glow)
            y1 = min(gh - 1, y + r_glow)
            row_off = y * gw
            for x in range(gw):
                min_d2 = 999999
                for yy in range(y0, y1 + 1):
                    hd = horiz[yy * gw + x]
                    if hd <= r_glow:
                        dy = y - yy
                        d2 = hd * hd + dy * dy
                        if d2 < min_d2:
                            min_d2 = d2
                if min_d2 <= r_glow2:
                    t = max(0.0, 1.0 - math.sqrt(min_d2) * inv_r_glow)
                    self.logo_glow[row_off + x] = int(t * 255)

    def _precompose_buffers(self) -> None:
        gw, gh = self.gw, self.gh
        n = gw * gh
        white = (255, 255, 255)
        shadow_gray = (214, 214, 214)
        frame_gray = (150, 150, 150)
        pure_black = (10, 10, 12)

        base_rgb: list[tuple[int, int, int]] = [white] * n
        final_rgb: list[tuple[int, int, int]] = [white] * n
        sil_nonwhite: list[tuple[int, tuple[int, int, int]]] = []
        logo_entries: list[
            tuple[int, bool, float, int, tuple[int, int, int], int, tuple[int, int, int]]
        ] = []

        bb_shadow = self.bb_shadow
        gray_frame = self.gray_frame
        bb_mask = self.bb_mask
        black_frame = self.black_frame
        logo_glow = self.logo_glow
        b_core = self.b_core
        b_inner_bevel = self.b_inner_bevel
        b_chisel_dark = self.b_chisel_dark
        b_chisel_light = self.b_chisel_light
        channel_core = self.channel_core

        for y in range(gh):
            ny = (y + 0.5) / gh
            row_off = y * gw

            sheen_b = math.exp(-(((ny - 0.588) / 0.031) ** 2))
            lower_tint_b = min(1.0, max(0.0, (ny - 0.602) / 0.16))
            b_base = lerp_rgb((248, 16, 162), (254, 108, 196), lower_tint_b * 0.58)
            b_fill = lerp_rgb(b_base, (255, 234, 249), min(1.0, sheen_b * 0.94))

            sheen_c = math.exp(-(((ny - 0.548) / 0.028) ** 2))
            lower_tint_c = min(1.0, max(0.0, (ny - 0.55) / 0.055))
            ch_base = lerp_rgb((250, 38, 174), (254, 122, 204), lower_tint_c * 0.55)
            ch_fill = lerp_rgb(ch_base, (255, 234, 249), min(1.0, sheen_c * 0.88))

            for x in range(gw):
                idx = row_off + x
                col = white

                sh_cov = bb_shadow[idx]
                if sh_cov:
                    col = lerp_rgb(col, shadow_gray, sh_cov * 0.25)
                gr_cov = gray_frame[idx]
                if gr_cov:
                    col = lerp_rgb(col, frame_gray, gr_cov * 0.25)
                bb_cov = bb_mask[idx]
                if bb_cov:
                    col = lerp_rgb(col, pure_black, bb_cov * 0.25)
                bk_cov = black_frame[idx]
                if bk_cov:
                    col = lerp_rgb(col, pure_black, bk_cov * 0.25)

                base_rgb[idx] = col
                if col != white:
                    sil_nonwhite.append((idx, col))

                glow_v = logo_glow[idx]
                b_cov = b_core[idx]
                ch_cov = channel_core[idx]

                if glow_v > 0 or b_cov > 0 or ch_cov > 0:
                    is_over_dark = bb_cov >= 2 or bk_cov >= 2
                    glow_base = (
                        ((glow_v / 255.0) ** (1.55 if is_over_dark else 2.2))
                        * (0.48 if is_over_dark else 0.14)
                        if glow_v > 0
                        else 0.0
                    )
                    b_px = b_fill
                    if b_cov > 0:
                        bevel_cov = b_inner_bevel[idx]
                        if bevel_cov > 0:
                            b_px = lerp_rgb(b_px, (255, 236, 250), bevel_cov * 0.18)
                        ch_dark = b_chisel_dark[idx]
                        if ch_dark > 0:
                            b_px = lerp_rgb(b_px, (204, 10, 132), ch_dark * 0.14)
                        ch_light = b_chisel_light[idx]
                        if ch_light > 0:
                            b_px = lerp_rgb(b_px, (255, 236, 250), min(1.0, ch_light * 0.25))

                    logo_col = col
                    if glow_base > 0.0:
                        glow_tint = (226, 24, 152) if is_over_dark else (246, 132, 204)
                        logo_col = lerp_rgb(logo_col, glow_tint, glow_base)
                    if b_cov > 0:
                        logo_col = lerp_rgb(logo_col, b_px, b_cov * 0.25)
                    if ch_cov > 0:
                        logo_col = lerp_rgb(logo_col, ch_fill, ch_cov * 0.25)

                    final_rgb[idx] = logo_col
                    logo_entries.append((idx, is_over_dark, glow_base, b_cov, b_px, ch_cov, ch_fill))
                else:
                    final_rgb[idx] = col

        self.base_rgb = base_rgb
        self.final_rgb = final_rgb
        self.sil_nonwhite = sil_nonwhite
        self.logo_entries = logo_entries


# ---------------------------------------------------------------------------
# Scene 2 & Scene 4 Precomputed Caches (Per Viewport Dimensions)
# ---------------------------------------------------------------------------
TECH_GLYPHS_2X: dict[str, tuple[str, ...]] = {
    "A": ("..##..", "##..##", "##..##", "######", "##..##", "##..##", "##..##", "......", "......"),
    "r": ("......", "......", "######", "##....", "##....", "##....", "##....", "......", "......"),
    "e": ("......", "......", "######", "##..##", "######", "##....", "######", "......", "......"),
    "y": ("......", "......", "##..##", "##..##", "##..##", "######", "....##", "....##", "######"),
    "u": ("......", "......", "##..##", "##..##", "##..##", "##..##", "######", "......", "......"),
    "j": ("..##", "....", "..##", "..##", "..##", "..##", "..##", "..##", "####"),
    "t": ("..##..", "..##..", "######", "..##..", "..##..", "..##..", "..####", "......", "......"),
    "s": ("......", "......", "######", "##....", "######", "....##", "######", "......", "......"),
    "n": ("......", "......", "######", "##..##", "##..##", "##..##", "##..##", "......", "......"),
    "o": ("......", "......", "######", "##..##", "##..##", "##..##", "######", "......", "......"),
    "w": ("..........", "..........", "##..##..##", "##..##..##", "##..##..##", "##..##..##", "##########", "..........", ".........."),
    " ": ("......", "......", "......", "......", "......", "......", "......", "......", "......"),
    "h": ("##....", "##....", "######", "##..##", "##..##", "##..##", "##..##", "......", "......"),
    "a": ("......", "......", "######", "....##", "######", "##..##", "######", "......", "......"),
    "c": ("......", "......", "######", "##....", "##....", "##....", "######", "......", "......"),
    "k": ("##....", "##....", "##..##", "####..", "####..", "##..##", "##..##", "......", "......"),
    "i": ("##", "..", "##", "##", "##", "##", "##", "..", ".."),
    "g": ("......", "......", "######", "##..##", "##..##", "######", "....##", "....##", "######"),
    ".": ("..", "..", "..", "..", "..", "..", "##", "..", ".."),
}

TECH_GLYPHS_1X: dict[str, tuple[str, ...]] = {
    "A": (".#.", "#.#", "#.#", "###", "#.#", "#.#", "#.#", "...", "..."),
    "r": ("...", "...", "###", "#..", "#..", "#..", "#..", "...", "..."),
    "e": ("...", "...", "###", "#.#", "###", "#..", "###", "...", "..."),
    "y": ("...", "...", "#.#", "#.#", "#.#", "###", "..#", "..#", "###"),
    "u": ("...", "...", "#.#", "#.#", "#.#", "#.#", "###", "...", "..."),
    "j": (".#", "..", ".#", ".#", ".#", ".#", ".#", ".#", "##"),
    "t": (".#.", ".#.", "###", ".#.", ".#.", ".#.", ".##", "...", "..."),
    "s": ("...", "...", "###", "#..", "###", "..#", "###", "...", "..."),
    "n": ("...", "...", "###", "#.#", "#.#", "#.#", "#.#", "...", "..."),
    "o": ("...", "...", "###", "#.#", "#.#", "#.#", "###", "...", "..."),
    "w": (".....", ".....", "#.#.#", "#.#.#", "#.#.#", "#.#.#", "#####", ".....", "....."),
    " ": ("...", "...", "...", "...", "...", "...", "...", "...", "..."),
    "h": ("#..", "#..", "###", "#.#", "#.#", "#.#", "#.#", "...", "..."),
    "a": ("...", "...", "###", "..#", "###", "#.#", "###", "...", "..."),
    "c": ("...", "...", "###", "#..", "#..", "#..", "###", "...", "..."),
    "k": ("#..", "#..", "#.#", "##.", "##.", "#.#", "#.#", "...", "..."),
    "i": ("#", ".", "#", "#", "#", "#", "#", ".", "."),
    "g": ("...", "...", "###", "#.#", "#.#", "###", "..#", "..#", "###"),
    ".": (".", ".", ".", ".", ".", ".", "#", ".", "."),
}


def _assemble_banner_rows(
    text: str,
    table: dict[str, tuple[str, ...]],
    gap_cols: int,
    mirror_x: bool = False,
) -> tuple[str, ...]:
    rows = ["" for _ in range(9)]
    gap_str = "." * gap_cols
    for idx, ch in enumerate(text):
        glyph = table.get(ch)
        if not glyph:
            continue
        prev_ch = text[idx - 1] if idx > 0 else ""
        need_gap = idx > 0 and ch != " " and prev_ch != " " and ch != "j"
        for r in range(9):
            if need_gap:
                rows[r] += gap_str
            rows[r] += glyph[r]
    if mirror_x:
        return tuple(row[::-1] for row in rows)
    return tuple(rows)


HACKING_ROWS_2X = _assemble_banner_rows("now hacking...", TECH_GLYPHS_2X, 2, False)
HACKING_ROWS_1X = _assemble_banner_rows("now hacking...", TECH_GLYPHS_1X, 1, False)
ENJOYING_MIRROR_ROWS_2X = _assemble_banner_rows("Are you enjoying this", TECH_GLYPHS_2X, 2, True)
ENJOYING_MIRROR_ROWS_1X = _assemble_banner_rows("Are you enjoying this", TECH_GLYPHS_1X, 1, True)


class Scene2Cache:
    """Precomputes Scene 2 CRT static row pools and 'now hacking...' hit/halo lists."""

    def __init__(self, gw: int, gh: int, seed: int = 20261122) -> None:
        self.gw = gw
        self.gh = gh
        rng = random.Random(seed)
        variants = 4
        self.variants = variants

        inv_gw = 1.0 / gw
        inv_gh = 1.0 / gh
        nx_arr = [(x + 0.5) * inv_gw for x in range(gw)]
        self.nx_arr = nx_arr
        self.side_vig = [
            max(0.0, min(1.0, (0.48 - abs(nx - 0.5)) / 0.14)) for nx in nx_arr
        ]

        tiers = ((30, 18, 32), (96, 72, 100), (176, 138, 180))
        jitters = (-12, 0, 12)
        shade_palette: list[tuple[tuple[int, int, int], ...]] = []
        for b_idx in range(16):
            v = 0.34 + (b_idx / 15.0) * 0.72
            bucket_cols: list[tuple[int, int, int]] = []
            for br, bg, bb in tiers:
                for jit in jitters:
                    r_c = (clamp_u8((br + jit) * v) + 4) & ~7
                    g_c = (clamp_u8((bg + jit) * v) + 4) & ~7
                    b_c = (clamp_u8((bb + jit) * v) + 4) & ~7
                    bucket_cols.append(
                        (
                            255 if r_c > 255 else r_c,
                            255 if g_c > 255 else g_c,
                            255 if b_c > 255 else b_c,
                        )
                    )
            weighted = (
                [bucket_cols[0], bucket_cols[1], bucket_cols[2]] * 4
                + [bucket_cols[3], bucket_cols[4], bucket_cols[5]] * 4 + [bucket_cols[4]]
                + [bucket_cols[6], bucket_cols[7], bucket_cols[8]] * 2 + [bucket_cols[7]]
            )
            shade_palette.append(tuple(weighted))

        getrandbits = rng.getrandbits
        row_pools: list[list[list[tuple[int, int, int]]]] = []
        for y in range(gh):
            ny = (y + 0.5) * inv_gh
            vy2 = (ny - 0.5) ** 2
            scan_dim = 0.90 if (y & 1) else 1.04
            row_buckets = [
                shade_palette[
                    max(
                        0,
                        min(
                            15,
                            int(
                                ((max(0.38, 1.0 - 0.60 * ((nx - 0.5) ** 2 + vy2)) * scan_dim - 0.34) / 0.72)
                                * 15.0
                                + 0.5
                            ),
                        ),
                    )
                ]
                for nx in nx_arr
            ]
            pool_y: list[list[tuple[int, int, int]]] = []
            for _ in range(variants):
                pool_y.append([rb[getrandbits(5)] for rb in row_buckets])
            row_pools.append(pool_y)
        self.row_pools = row_pools

        # Precompute 'now hacking...' hit and halo-only pixel index lists (uniform X/Y integer scale)
        use_2x = (gw / gh) >= 2.4 if gh > 0 else (gw >= 160)
        rows = HACKING_ROWS_2X if use_2x else HACKING_ROWS_1X
        base_w = len(rows[0])
        scale = max(1, (gh + 32) // 64)
        while scale > 1 and base_w * scale > int(gw * 0.90):
            scale -= 1
        banner_w = base_w * scale
        banner_h = 9 * scale
        start_x = ((gw - banner_w) // 4) * 2 if use_2x else (gw - banner_w) // 2
        start_y = (int(gh * 0.563) // 2) * 2

        def is_hit(px: int, py: int) -> bool:
            dx_p = px - start_x
            dy_p = py - start_y
            if dx_p < 0 or dx_p >= banner_w or dy_p < 0 or dy_p >= banner_h:
                return False
            return rows[dy_p // scale][dx_p // scale] == "#"

        hit_indices: list[int] = []
        halo_indices: list[int] = []
        pad = scale + 1
        x0 = max(0, start_x - pad)
        x1 = min(gw, start_x + banner_w + pad)
        y0 = max(0, start_y - pad)
        y1 = min(gh, start_y + banner_h + pad)
        halo_steps = (-scale, 0, scale)

        for y in range(y0, y1):
            row_off = y * gw
            cell_y0 = y & ~1
            for x in range(x0, x1):
                if is_hit(x, y):
                    hit_indices.append(row_off + x)
                    continue
                cell_x0 = (x & ~1) if use_2x else x
                if (
                    is_hit(cell_x0, cell_y0)
                    or is_hit(cell_x0 + 1, cell_y0)
                    or is_hit(cell_x0, cell_y0 + 1)
                    or is_hit(cell_x0 + 1, cell_y0 + 1)
                ):
                    halo_indices.append(row_off + x)
                    continue
                found = False
                for dy in halo_steps:
                    for dx in halo_steps:
                        if (dx != 0 or dy != 0) and is_hit(x + dx, y + dy):
                            found = True
                            break
                    if found:
                        break
                if found:
                    halo_indices.append(row_off + x)

        self.hit_indices = hit_indices
        self.halo_indices = halo_indices


class Scene4Cache:
    """Precomputes Scene 4 annular lace geometry and mirrored banner indices."""

    def __init__(self, gw: int, gh: int) -> None:
        self.gw = gw
        self.gh = gh
        aspect = 16.0 / 9.0
        sub_oy = 0.25 / gh
        sub_ox = 0.25 / gw

        ring_params = []
        for lcx, lcy, lrad, lang0, lspeed in SCENE4_LACE_SPECS:
            n_comp = 15 if lrad >= 0.62 else 12
            px_u = 1.0 / (gh * lrad)
            track_w = max(0.022, px_u * 0.96)
            in_outer = 0.684
            in_inner = in_outer - track_w
            out_inner = 0.896
            out_outer = out_inner + track_w
            in_amp = max(0.034, px_u * 1.35)
            out_amp = max(0.038, px_u * 1.45)
            sec = 2.0 * math.pi / n_comp
            half_sec = 0.5 * sec
            half_w = half_sec * 0.79
            pillar_half_w = max(0.010, px_u * 0.48)
            bead_r2 = max(0.021, px_u * 0.88) ** 2
            hub_r2 = max(0.017, px_u * 0.74) ** 2
            spoke_half_w = max(0.0095, px_u * 0.47)
            ring_params.append((
                lcx, lcy, lrad, lang0, lspeed,
                n_comp, in_inner, in_outer, out_inner, out_outer,
                in_amp, out_amp, sec, half_sec, half_w,
                pillar_half_w, bead_r2, hub_r2, spoke_half_w,
            ))
        self.ring_params = tuple(ring_params)

        permanent_hits: list[int] = []
        dynamic_pixels: list[tuple[int, int, tuple[tuple[tuple[int, int, float, float], ...], ...]]] = []
        sub_offsets = ((-sub_ox, -sub_oy), (sub_ox, -sub_oy), (-sub_ox, sub_oy), (sub_ox, sub_oy))

        for y in range(gh):
            ny = (y + 0.5) / gh
            row_off = y * gw
            for x in range(gw):
                nx = (x + 0.5) / gw
                near_any = False
                for rp in ring_params:
                    lim = rp[2] * 1.04
                    if abs((nx - rp[0]) * aspect) <= lim and abs(ny - rp[1]) <= lim:
                        near_any = True
                        break
                if not near_any:
                    continue

                always_hits = 0
                dyn_subs: list[tuple[tuple[int, int, float, float], ...]] = []
                for ox, oy in sub_offsets:
                    snx = nx + ox
                    sny = ny + oy
                    sub_always = False
                    ring_checks: list[tuple[int, int, float, float]] = []
                    for r_id, rp in enumerate(ring_params):
                        ldx = (snx - rp[0]) * aspect
                        ldy = sny - rp[1]
                        lrad = rp[2]
                        r2 = ldx * ldx + ldy * ldy
                        if r2 > (lrad * 1.03) ** 2 or r2 < (lrad * 0.580) ** 2:
                            continue
                        u = math.sqrt(r2) / lrad
                        in_inner = rp[6]
                        in_outer = rp[7]
                        out_inner = rp[8]
                        out_outer = rp[9]
                        if (in_inner <= u <= in_outer) or (out_inner <= u <= out_outer):
                            sub_always = True
                            break
                        base_theta = math.atan2(ldy, ldx)
                        if u < in_inner:
                            thresh = (in_inner - u) / rp[10]
                            if thresh <= 1.0:
                                ring_checks.append((r_id, 0, base_theta, thresh))
                        elif u < out_inner:
                            ring_checks.append((r_id, 1, base_theta, u - 0.79))
                        else:
                            thresh = (u - out_outer) / rp[11]
                            if thresh <= 1.0:
                                ring_checks.append((r_id, 2, base_theta, thresh))

                    if sub_always:
                        always_hits += 1
                    elif ring_checks:
                        dyn_subs.append(tuple(ring_checks))

                if always_hits >= 2:
                    permanent_hits.append(row_off + x)
                elif always_hits + len(dyn_subs) >= 2:
                    dynamic_pixels.append((row_off + x, 2 - always_hits, tuple(dyn_subs)))

        self.permanent_hits = tuple(permanent_hits)
        self.dynamic_pixels = tuple(dynamic_pixels)
        self.lace_mask = bytearray(gw * gh)

        # Precompute mirrored 'Are you enjoying this' pixel indices (uniform X/Y integer scale)
        use_2x = (gw / gh) >= 2.4 if gh > 0 else (gw >= 160)
        rows = ENJOYING_MIRROR_ROWS_2X if use_2x else ENJOYING_MIRROR_ROWS_1X
        base_w = len(rows[0])
        scale = max(1, (gh + 32) // 64)
        while scale > 1 and base_w * scale > int(gw * 0.90):
            scale -= 1
        banner_w = base_w * scale
        banner_h = 9 * scale
        start_x = ((gw - banner_w) // 4) * 2 if use_2x else (gw - banner_w) // 2
        start_y = (int(gh * 0.442) // 2) * 2

        enjoy_indices: list[int] = []
        for ry in range(banner_h):
            y = start_y + ry
            if 0 <= y < gh:
                row_str = rows[ry // scale]
                row_off = y * gw
                for cx in range(base_w):
                    if row_str[cx] == "#":
                        x_base = start_x + cx * scale
                        for dx in range(scale):
                            x = x_base + dx
                            if 0 <= x < gw:
                                enjoy_indices.append(row_off + x)
        self.enjoy_indices = tuple(enjoy_indices)


class CinemaCaches:
    """Holds per-viewport precomputed caches, warmed incrementally during hold frames."""

    def __init__(self, gw: int, gh: int) -> None:
        self.gw = gw
        self.gh = gh
        self._scene2: Scene2Cache | None = None
        self._scene4: Scene4Cache | None = None
        self._finale: FinaleCache | None = None

    @property
    def scene2(self) -> Scene2Cache:
        if self._scene2 is None:
            self._scene2 = Scene2Cache(self.gw, self.gh)
        return self._scene2

    @property
    def scene4(self) -> Scene4Cache:
        if self._scene4 is None:
            self._scene4 = Scene4Cache(self.gw, self.gh)
        return self._scene4

    @property
    def finale(self) -> FinaleCache:
        if self._finale is None:
            self._finale = FinaleCache(self.gw, self.gh)
        return self._finale


# ---------------------------------------------------------------------------
# Scene Renderers (Optimized Direct 2x2 Sub-Pixel Rasterization)
# ---------------------------------------------------------------------------
def render_scene1_black(buf: list[tuple[int, int, int]], gw: int, gh: int) -> None:
    buf[:] = [(0, 0, 0)] * (gw * gh)


def render_scene2_hacking(
    buf: list[tuple[int, int, int]],
    gw: int,
    gh: int,
    t: float,
    rng: random.Random,
    cache: Scene2Cache,
) -> None:
    """Scene 2 (0.73s - 7.05s): Pre-baked CRT static row pools + tight blossom/text stamping."""
    n = gw * gh
    if 4.30 <= t < 4.38:
        buf[:] = [(255, 255, 255)] * n
        return

    aspect = 16.0 / 9.0
    aa = 1.05 / gh
    angle_cw = (t - 0.80) * 2.25
    sakura_r = 0.095
    cx, cy = 0.50, 0.422
    is_glitch_mode = (3.12 <= t < 3.26) or (4.38 <= t < 6.00)

    if t < 2.67:
        fg_col = (254, 254, 255)
    elif t < 4.30:
        p = min(1.0, (t - 2.67) / 0.25)
        fg_col = lerp_rgb((254, 254, 255), (242, 114, 118), p)
    elif t < 6.00:
        cycle = math.sin((t - 4.38) * 18.5)
        if cycle > 0.45:
            fg_col = (255, 253, 255)
        elif cycle > -0.25:
            fg_col = (248, 182, 132)
        else:
            fg_col = (242, 134, 58)
    else:
        if t < 6.24:
            fg_col = (255, 252, 252)
        else:
            p = min(1.0, (t - 6.24) / 0.35)
            fg_col = lerp_rgb((255, 252, 252), (242, 158, 96), p)

    if not is_glitch_mode and t < 6.00:
        row_pools = cache.row_pools
        getrandbits = rng.getrandbits
        for y in range(gh):
            row_off = y * gw
            buf[row_off : row_off + gw] = row_pools[y][getrandbits(2)]

        if 0.78 <= t <= 1.06:
            flash_k = max(0.0, 1.0 - (t - 0.78) / 0.28) * 0.85
            if flash_k > 0.0:
                inv_k = 1.0 - flash_k
                fr = 235.0 * flash_k + 0.5
                fg_f = 232.0 * flash_k + 0.5
                fb = 238.0 * flash_k + 0.5
                for i in range(n):
                    r0, g0, b0 = buf[i]
                    buf[i] = (
                        int(r0 * inv_k + fr),
                        int(g0 * inv_k + fg_f),
                        int(b0 * inv_k + fb),
                    )
    elif is_glitch_mode:
        palette = (
            (12, 4, 16),
            (28, 10, 36),
            (68, 28, 78),
            (128, 62, 142),
            (188, 114, 202),
            (238, 196, 244),
        )
        cur_col = palette[0]
        cur_shift = 0.0
        band_mod = max(1, gh // 42)
        nx_arr = cache.nx_arr
        side_vig = cache.side_vig
        sin_lut = _SIN_LUT
        sin_mask = _SIN_LUT_MASK
        sin_scale = _SIN_LUT_SCALE

        for y in range(gh):
            if y % band_mod == 0 or rng.random() < 0.38:
                cur_col = palette[int((rng.random() ** 1.3) * 6)]
                cur_shift = (rng.random() - 0.5) * 0.05
            base_r, base_g, base_b = cur_col
            row_off = y * gw
            phase_y = y * 0.6
            for x in range(gw):
                sv = side_vig[x]
                if sv <= 0.0:
                    buf[row_off + x] = (0, 0, 0)
                    continue
                ang = (nx_arr[x] + cur_shift) * 26.0 + phase_y
                streak = sin_lut[int(ang * sin_scale) & sin_mask] * 22.0
                r_v = int((base_r + streak) * sv + 0.5)
                g_v = int((base_g + streak * 0.6) * sv + 0.5)
                b_v = int((base_b + streak) * sv + 0.5)
                buf[row_off + x] = (
                    0 if r_v < 0 else (255 if r_v > 255 else r_v),
                    0 if g_v < 0 else (255 if g_v > 255 else g_v),
                    0 if b_v < 0 else (255 if b_v > 255 else b_v),
                )

        for _ in range(3):
            rx0 = 0.22 + rng.random() * 0.52
            ry0 = 0.15 + rng.random() * 0.65
            rx1 = rx0 + 0.04 + rng.random() * 0.09
            ry1 = ry0 + 0.06 + rng.random() * 0.14
            r_alpha = 0.35 + rng.random() * 0.30
            ix0 = max(0, int(rx0 * gw))
            ix1 = min(gw, int(rx1 * gw) + 1)
            iy0 = max(0, int(ry0 * gh))
            iy1 = min(gh, int(ry1 * gh) + 1)
            for y in range(iy0, iy1):
                row_off = y * gw
                for x in range(ix0, ix1):
                    k = r_alpha * side_vig[x]
                    if k > 0.0:
                        buf[row_off + x] = lerp_rgb(buf[row_off + x], (228, 175, 238), k)
    else:
        p = min(1.0, max(0.0, (t - 6.00) / 0.95))
        bg_col = lerp_rgb((235, 117, 114), (255, 255, 255), p ** 0.85)
        buf[:] = [bg_col] * n

    if t < 0.80:
        return

    fade_out = 1.0 if t < 6.75 else max(0.0, 1.0 - (t - 6.75) / 0.30)

    if t < 6.00 and fade_out > 0.0:
        halo_dark = (22, 12, 26)
        halo_k = 0.88 * fade_out
        for idx in cache.halo_indices:
            buf[idx] = lerp_rgb(buf[idx], halo_dark, halo_k)

    inv_r = 1.0 / sakura_r
    max_r2 = (sakura_r * 1.05) ** 2
    hub_r2 = (sakura_r * 0.095) ** 2
    min_seam_half_w = max(sakura_r * 0.015, aa * 0.44)
    rx_norm = (sakura_r * 1.06) / aspect
    ry_norm = sakura_r * 1.06
    bx0 = max(0, int((cx - rx_norm) * gw))
    bx1 = min(gw, int((cx + rx_norm) * gw) + 1)
    by0 = max(0, int((cy - ry_norm) * gh))
    by1 = min(gh, int((cy + ry_norm) * gh) + 1)
    inv_gw = 1.0 / gw
    inv_gh = 1.0 / gh

    for y in range(by0, by1):
        dy = (y + 0.5) * inv_gh - cy
        row_off = y * gw
        for x in range(bx0, bx1):
            dx = ((x + 0.5) * inv_gw - cx) * aspect
            if sakura_hit(dx, dy, sakura_r, inv_r, max_r2, hub_r2, angle_cw, min_seam_half_w):
                idx = row_off + x
                buf[idx] = fg_col if fade_out >= 1.0 else lerp_rgb(buf[idx], fg_col, fade_out)

    if fade_out >= 1.0:
        for idx in cache.hit_indices:
            buf[idx] = fg_col
    elif fade_out > 0.0:
        for idx in cache.hit_indices:
            buf[idx] = lerp_rgb(buf[idx], fg_col, fade_out)


def render_scene3_ok(buf: list[tuple[int, int, int]], gw: int, gh: int, t: float) -> None:
    """Scene 3 (7.05s - 10.03s): Slice fill + tight bounding-box grid-snapped 'OK!'."""
    n = gw * gh
    if t < 7.55:
        buf[:] = [(255, 255, 255)] * n
        return
    if t >= 9.45:
        buf[:] = [(0, 0, 0)] * n
        return

    fade = 1.0 if t <= 8.65 else max(0.0, 1.0 - (t - 8.65) / 0.80)
    is_quad = (gw / gh) >= 2.4 if gh > 0 else (gw >= 160)
    base_x = 2 if is_quad else 1
    y_scale = max(1, (gh + 32) // 64)
    while True:
        gh_log = gh // y_scale
        h_ok = max(8, int((gh_log * 0.155) / 2.0 + 0.5) * 2)
        x_step = base_x * y_scale
        th_x = 2 * x_step
        arm_w = 3 * x_step
        half = h_ok >> 1
        w_k = th_x + (half - 1) * x_step + arm_w
        total_w = w_k * 2 + 4 * x_step + th_x
        if y_scale == 1 or total_w <= int(gw * 0.85):
            break
        y_scale -= 1

    shake_x = int(round(math.sin((t - 7.55) * 55.0))) * x_step if 7.55 <= t <= 7.72 else 0

    bg_col = (clamp_u8(255.0 * fade), clamp_u8(255.0 * fade), clamp_u8(255.0 * fade))
    ok_col = (clamp_u8(236.0 * fade), clamp_u8(78.0 * fade), clamp_u8(103.0 * fade))
    buf[:] = [bg_col] * n

    y_top = ((gh_log - h_ok) // 4) * 2
    y_bot = y_top + h_ok

    th_y = 2
    w_o = w_k
    gap_ok = 2 * x_step
    gap_k_ex = 2 * x_step
    w_ex = th_x
    x_start = ((gw - total_w) // (2 * x_step)) * x_step + shake_x
    x_k = w_o + gap_ok
    x_ex = x_k + w_k + gap_k_ex

    py_start = max(0, y_top * y_scale)
    py_end = min(gh, y_bot * y_scale)
    px_start = max(0, x_start)
    px_end = min(gw, x_start + total_w)

    for y in range(py_start, py_end):
        ly = (y // y_scale) - y_top
        d_mid = (half - 1 - ly) if ly < half else (ly - half)
        arm_left = th_x + d_mid * x_step
        arm_right = arm_left + arm_w
        o_horiz = ly < th_y or ly >= h_ok - th_y
        ex_on = ly < h_ok - 4 or ly >= h_ok - 2
        row_off = y * gw

        for x in range(px_start, px_end):
            lx = x - x_start
            if lx < w_o:
                if o_horiz or lx < th_x or lx >= w_o - th_x:
                    buf[row_off + x] = ok_col
            elif x_k <= lx < x_k + w_k:
                kx = lx - x_k
                if kx < th_x or (arm_left <= kx < arm_right):
                    buf[row_off + x] = ok_col
            elif x_ex <= lx < x_ex + w_ex:
                if ex_on:
                    buf[row_off + x] = ok_col


def render_scene4_pop(
    buf: list[tuple[int, int, int]],
    gw: int,
    gh: int,
    t: float,
    cache: Scene4Cache,
) -> None:
    """Scene 4 (10.03s - 13.80s): Annular starburst lace + rising black flora + mirrored banner."""
    dt = max(0.0, t - 10.03)
    tau = scene4_warped_tau(t)
    aspect = 16.0 / 9.0
    aa = 1.05 / gh
    n = gw * gh

    if t < 10.63:
        bg_base = (130, 249, 42)
    elif t < 11.23:
        bg_base = (32, 247, 247)
    else:
        bg_base = (236, 56, 174)

    white = (255, 255, 255)
    black = (0, 0, 0)
    buf[:] = [bg_base] * n

    ring_params = cache.ring_params
    ang0 = ring_params[0][3] + dt * ring_params[0][4]
    ang1 = ring_params[1][3] + dt * ring_params[1][4]
    ang2 = ring_params[2][3] + dt * ring_params[2][4]
    ring_angs = (ang0, ang1, ang2)

    lace_mask = cache.lace_mask
    hit_list: list[int] = list(cache.permanent_hits)
    for idx in hit_list:
        lace_mask[idx] = 1

    wave_lut = _WAVE_LUT
    wave_mask = _WAVE_LUT_MASK
    wave_scale = _WAVE_LUT_SCALE

    for idx, needed, dyn_subs in cache.dynamic_pixels:
        hits = 0
        rem = len(dyn_subs)
        for sub_checks in dyn_subs:
            sub_hit = False
            for r_id, zone, base_theta, aux in sub_checks:
                rp = ring_params[r_id]
                theta = base_theta - ring_angs[r_id]
                if zone != 1:
                    wave = wave_lut[int(theta * rp[5] * wave_scale) & wave_mask]
                    if wave >= aux:
                        sub_hit = True
                        break
                else:
                    sec = rp[12]
                    half_sec = rp[13]
                    local_a = ((theta + half_sec) % sec) - half_sec
                    lx = local_a * 0.79
                    alx = -lx if lx < 0.0 else lx
                    dist_pillar = rp[14] - alx
                    if dist_pillar <= rp[15]:
                        sub_hit = True
                        break
                    if dist_pillar * dist_pillar + aux * aux <= rp[16]:
                        sub_hit = True
                        break
                    ros_r2 = lx * lx + aux * aux
                    if ros_r2 <= rp[17]:
                        sub_hit = True
                        break
                    if ros_r2 <= 0.009604:
                        sw = rp[18]
                        if (
                            (-aux if aux < 0.0 else aux) <= sw
                            or abs(lx * 0.8660254 - aux * 0.5) <= sw
                            or abs(lx * 0.8660254 + aux * 0.5) <= sw
                        ):
                            sub_hit = True
                            break
            if sub_hit:
                hits += 1
                if hits >= needed:
                    lace_mask[idx] = 1
                    hit_list.append(idx)
                    break
            rem -= 1
            if hits + rem < needed:
                break

    max_interior = (gh - 1) * gw
    for idx in hit_list:
        if gw <= idx < max_interior:
            x = idx % gw
            if 0 < x < gw - 1:
                if (
                    lace_mask[idx - 1]
                    + lace_mask[idx + 1]
                    + lace_mask[idx - gw]
                    + lace_mask[idx + gw]
                    == 0
                ):
                    if (
                        lace_mask[idx - gw - 1]
                        + lace_mask[idx - gw + 1]
                        + lace_mask[idx + gw - 1]
                        + lace_mask[idx + gw + 1]
                        <= 1
                    ):
                        continue
        buf[idx] = white

    for idx in hit_list:
        lace_mask[idx] = 0

    inv_gw = 1.0 / gw
    inv_gh = 1.0 / gh
    for kind, tau_ref, x_ref, y_ref, vx, vy, frad, rot0, vrot in SCENE4_BLACK_FLORA:
        dtau = tau - tau_ref
        if abs(dtau) > 0.75:
            continue
        fx = x_ref + vx * dtau
        fy = y_ref + vy * dtau
        lim = frad * 1.25
        if fy < -lim or fy > 1.0 + lim or fx < -lim or fx > 1.0 + lim:
            continue

        fang = rot0 + vrot * dtau
        rx_norm = (frad * 1.12) / aspect
        ry_norm = frad * 1.12
        bx0 = max(0, int((fx - rx_norm) * gw))
        bx1 = min(gw, int((fx + rx_norm) * gw) + 1)
        by0 = max(0, int((fy - ry_norm) * gh))
        by1 = min(gh, int((fy + ry_norm) * gh) + 1)
        if bx0 >= bx1 or by0 >= by1:
            continue

        if kind == 0:
            inv_r = 1.0 / frad
            max_r2 = (frad * 1.05) ** 2
            hub_r2 = (frad * 0.045) ** 2
            min_seam_half_w = max(frad * 0.015, aa * 0.44)
            for y in range(by0, by1):
                fdy = (y + 0.5) * inv_gh - fy
                row_off = y * gw
                for x in range(bx0, bx1):
                    fdx = ((x + 0.5) * inv_gw - fx) * aspect
                    if sakura_hit(fdx, fdy, frad, inv_r, max_r2, hub_r2, fang, min_seam_half_w):
                        buf[row_off + x] = black
        else:
            inv_s = 1.0 / (frad * 1.15)
            c_ang = math.cos(-fang)
            s_ang = math.sin(-fang)
            for y in range(by0, by1):
                fdy = (y + 0.5) * inv_gh - fy
                row_off = y * gw
                for x in range(bx0, bx1):
                    fdx = ((x + 0.5) * inv_gw - fx) * aspect
                    if single_petal_hit(fdx, fdy, inv_s, c_ang, s_ang):
                        buf[row_off + x] = black

    if t >= 12.20:
        for idx in cache.enjoy_indices:
            buf[idx] = white

    if t >= 13.10:
        p = min(1.0, (t - 13.10) / 0.58)
        wipe_r = 0.04 + (p ** 1.35) * 1.28
        wipe_r2 = wipe_r * wipe_r
        wx_norm = wipe_r / aspect
        bx0 = max(0, int((0.495 - wx_norm) * gw))
        bx1 = min(gw, int((0.495 + wx_norm) * gw) + 1)
        by0 = max(0, int((0.700 - wipe_r) * gh))
        by1 = min(gh, int((0.700 + wipe_r) * gh) + 1)
        for y in range(by0, by1):
            wdy = (y + 0.5) * inv_gh - 0.700
            wdy2 = wdy * wdy
            row_off = y * gw
            for x in range(bx0, bx1):
                wdx = ((x + 0.5) * inv_gw - 0.495) * aspect
                if wdx * wdx + wdy2 <= wipe_r2:
                    buf[row_off + x] = white


def render_scene5_finale(
    buf: list[tuple[int, int, int]],
    gw: int,
    gh: int,
    t: float,
    cache: FinaleCache,
) -> None:
    """Scene 5 Finale (13.80s - 16.50s+): Pre-composited silhouette + neon BB Channel logo."""
    sil_alpha = min(1.0, max(0.0, (t - 13.80) / 0.45))
    b_alpha = min(1.0, max(0.0, (t - 14.28) / 0.25))
    ch_alpha = min(1.0, max(0.0, (t - 14.44) / 0.24))

    if sil_alpha >= 1.0 and b_alpha >= 1.0 and ch_alpha >= 1.0:
        buf[:] = cache.final_rgb
        return

    if sil_alpha >= 1.0:
        buf[:] = cache.base_rgb
    else:
        white = (255, 255, 255)
        buf[:] = [white] * (gw * gh)
        if sil_alpha > 0.0:
            for idx, base_col in cache.sil_nonwhite:
                buf[idx] = lerp_rgb(white, base_col, sil_alpha)

    if b_alpha > 0.0:
        for idx, is_over_dark, glow_base, b_cov, b_px, ch_cov, ch_fill in cache.logo_entries:
            logo_col = buf[idx]
            if glow_base > 0.0:
                glow_tint = (226, 24, 152) if is_over_dark else (246, 132, 204)
                logo_col = lerp_rgb(logo_col, glow_tint, glow_base * b_alpha)
            if b_cov > 0:
                logo_col = lerp_rgb(logo_col, b_px, (b_cov * 0.25) * b_alpha)
            if ch_alpha > 0.0 and ch_cov > 0:
                logo_col = lerp_rgb(logo_col, ch_fill, (ch_cov * 0.25) * ch_alpha)
            buf[idx] = logo_col


# ---------------------------------------------------------------------------
# Fast 24-bit TrueColor / 256-Color Cell Quantizer & Row-Diffing ANSI Encoder
# ---------------------------------------------------------------------------
class AnsiFrameEncoder:
    """High-speed 2x2 ANSI encoder supporting 24-bit TrueColor and 256-color fallback."""

    def __init__(self, truecolor: bool = True) -> None:
        self.truecolor = truecolor
        self._fg_cache: dict[tuple[int, int, int], str] = {}
        self._bg_cache: dict[tuple[int, int, int], str] = {}
        self._prev_rows: list[str] = []
        self._last_dims: tuple[int, int] = (0, 0)

    def reset(self) -> None:
        self._prev_rows = []
        self._last_dims = (0, 0)

    def _sgr_fg(self, c: tuple[int, int, int]) -> str:
        s = self._fg_cache.get(c)
        if s is None:
            if self.truecolor:
                s = f"\x1b[38;2;{c[0]};{c[1]};{c[2]}m"
            else:
                s = f"\x1b[38;5;{rgb_to_ansi256(c[0], c[1], c[2])}m"
            self._fg_cache[c] = s
        return s

    def _sgr_bg(self, c: tuple[int, int, int]) -> str:
        s = self._bg_cache.get(c)
        if s is None:
            if self.truecolor:
                s = f"\x1b[48;2;{c[0]};{c[1]};{c[2]}m"
            else:
                s = f"\x1b[48;5;{rgb_to_ansi256(c[0], c[1], c[2])}m"
            self._bg_cache[c] = s
        return s

    def _sgr_fg_bg(self, fg: tuple[int, int, int], bg: tuple[int, int, int]) -> str:
        if self.truecolor:
            return f"\x1b[38;2;{fg[0]};{fg[1]};{fg[2]};48;2;{bg[0]};{bg[1]};{bg[2]}m"
        return f"\x1b[38;5;{rgb_to_ansi256(fg[0], fg[1], fg[2])};48;5;{rgb_to_ansi256(bg[0], bg[1], bg[2])}m"

    def encode(
        self,
        buf: list[tuple[int, int, int]],
        vp_cols: int,
        vp_rows: int,
        pad_x: int,
        pad_y: int,
        full_redraw: bool = False,
    ) -> str:
        if (vp_cols, vp_rows) != self._last_dims or full_redraw:
            self._prev_rows = [""] * vp_rows
            self._last_dims = (vp_cols, vp_rows)

        if len(self._fg_cache) > 4096:
            self._fg_cache.clear()
        if len(self._bg_cache) > 4096:
            self._bg_cache.clear()

        gw = vp_cols * 2
        quad_chars = QUAD_CHARS
        prev_rows = self._prev_rows
        out: list[str] = []
        col_pos = pad_x + 1
        sgr_fg = self._sgr_fg
        sgr_bg = self._sgr_bg
        sgr_fg_bg = self._sgr_fg_bg

        for r in range(vp_rows):
            row_parts: list[str] = []
            append = row_parts.append
            cur_fg: tuple[int, int, int] | None = None
            cur_bg: tuple[int, int, int] | None = None
            row0 = (r * 2) * gw
            row1 = row0 + gw

            for c in range(vp_cols):
                x2 = c * 2
                p0 = buf[row0 + x2]
                p1 = buf[row0 + x2 + 1]
                p2 = buf[row1 + x2]
                p3 = buf[row1 + x2 + 1]

                if p0 == p1 == p2 == p3:
                    if p0 != cur_bg:
                        append(sgr_bg(p0))
                        cur_bg = p0
                    append(" ")
                    continue

                other = p1 if p1 != p0 else (p2 if p2 != p0 else p3)
                if (p1 == p0 or p1 == other) and (p2 == p0 or p2 == other) and (p3 == p0 or p3 == other):
                    mask = (
                        (2 if p1 == other else 0)
                        | (4 if p2 == other else 0)
                        | (8 if p3 == other else 0)
                    )
                    if p0 == cur_bg or other == cur_fg:
                        bg = p0
                        fg = other
                    elif other == cur_bg or p0 == cur_fg:
                        bg = other
                        fg = p0
                        mask ^= 15
                    else:
                        bg = p0
                        fg = other
                    ch = quad_chars[mask]
                else:
                    l0 = p0[0] * 77 + p0[1] * 150 + p0[2] * 29
                    l1 = p1[0] * 77 + p1[1] * 150 + p1[2] * 29
                    l2 = p2[0] * 77 + p2[1] * 150 + p2[2] * 29
                    l3 = p3[0] * 77 + p3[1] * 150 + p3[2] * 29

                    min_l = l0
                    c_min = p0
                    max_l = l0
                    c_max = p0
                    if l1 < min_l:
                        min_l, c_min = l1, p1
                    elif l1 > max_l:
                        max_l, c_max = l1, p1
                    if l2 < min_l:
                        min_l, c_min = l2, p2
                    elif l2 > max_l:
                        max_l, c_max = l2, p2
                    if l3 < min_l:
                        min_l, c_min = l3, p3
                    elif l3 > max_l:
                        max_l, c_max = l3, p3

                    if max_l - min_l < 600:
                        pts = (p0, p1, p2, p3)
                        max_d2 = -1
                        for i in range(4):
                            ra, ga, ba = pts[i]
                            for j in range(i + 1, 4):
                                rb, gb, bb = pts[j]
                                dr = ra - rb
                                dg = ga - gb
                                db = ba - bb
                                d2 = dr * dr + dg * dg + db * db
                                if d2 > max_d2:
                                    max_d2 = d2
                                    c_min = pts[i]
                                    c_max = pts[j]
                        if max_d2 <= 36:
                            if p0 != cur_bg:
                                append(sgr_bg(p0))
                                cur_bg = p0
                            append(" ")
                            continue

                    r0, g0, b0 = c_min
                    r1, g1, b1 = c_max
                    mask = 0
                    fg_r = fg_g = fg_b = fg_cnt = 0
                    bg_r = bg_g = bg_b = bg_cnt = 0

                    for bit, p in ((1, p0), (2, p1), (4, p2), (8, p3)):
                        pr, pg, pb = p
                        d0 = (pr - r0) * (pr - r0) + (pg - g0) * (pg - g0) + (pb - b0) * (pb - b0)
                        d1 = (pr - r1) * (pr - r1) + (pg - g1) * (pg - g1) + (pb - b1) * (pb - b1)
                        if d1 < d0:
                            mask |= bit
                            fg_r += pr
                            fg_g += pg
                            fg_b += pb
                            fg_cnt += 1
                        else:
                            bg_r += pr
                            bg_g += pg
                            bg_b += pb
                            bg_cnt += 1

                    if fg_cnt == 0 or bg_cnt == 0:
                        if p0 != cur_bg:
                            append(sgr_bg(p0))
                            cur_bg = p0
                        append(" ")
                        continue

                    fg = (fg_r // fg_cnt, fg_g // fg_cnt, fg_b // fg_cnt)
                    bg = (bg_r // bg_cnt, bg_g // bg_cnt, bg_b // bg_cnt)
                    if (fg == cur_bg and bg != cur_bg) or (bg == cur_fg and fg != cur_fg):
                        fg, bg = bg, fg
                        mask ^= 15
                    ch = quad_chars[mask]

                need_fg = fg != cur_fg
                need_bg = bg != cur_bg
                if need_fg and need_bg:
                    append(sgr_fg_bg(fg, bg))
                    cur_fg = fg
                    cur_bg = bg
                elif need_fg:
                    append(sgr_fg(fg))
                    cur_fg = fg
                elif need_bg:
                    append(sgr_bg(bg))
                    cur_bg = bg
                append(ch)

            append("\x1b[0m")
            row_str = "".join(row_parts)
            if row_str != prev_rows[r]:
                prev_rows[r] = row_str
                out.append(f"\x1b[{pad_y + r + 1};{col_pos}H")
                out.append(row_str)

        return "".join(out)


# ---------------------------------------------------------------------------
# Cross-Platform Non-Blocking Keyboard Input & Safe Viewport / HUD Sizing
# ---------------------------------------------------------------------------
_TTY_ERRORS: tuple[type[BaseException], ...] = (
    (OSError, ValueError) if IS_WINDOWS else (OSError, ValueError, termios.error)
)


class RawTerminalInput:
    """Restores terminal input mode cleanly on exit and polls single keypresses."""

    def __init__(self) -> None:
        self.fd: int | None = None
        self.old_settings = None

    def __enter__(self) -> "RawTerminalInput":
        if not IS_WINDOWS and sys.stdin.isatty():
            try:
                self.fd = sys.stdin.fileno()
                self.old_settings = termios.tcgetattr(self.fd)
                tty.setcbreak(self.fd)
            except _TTY_ERRORS:
                self.fd = None
        self.drain()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.drain()
        if not IS_WINDOWS and self.fd is not None and self.old_settings is not None:
            try:
                termios.tcsetattr(self.fd, termios.TCSADRAIN, self.old_settings)
            except _TTY_ERRORS:
                pass

    def drain(self) -> None:
        """Flushes buffered keystrokes so stray presses do not skip or leak into prompts."""
        if IS_WINDOWS:
            try:
                while msvcrt.kbhit():
                    msvcrt.getwch()
            except _TTY_ERRORS:
                pass
            return
        if self.fd is None:
            return
        try:
            termios.tcflush(self.fd, termios.TCIFLUSH)
        except _TTY_ERRORS:
            while True:
                rlist, _, _ = select.select([self.fd], [], [], 0.0)
                if not rlist:
                    break
                try:
                    if not os.read(self.fd, 64):
                        break
                except _TTY_ERRORS:
                    break

    def poll_key(self) -> str | None:
        if IS_WINDOWS:
            if msvcrt.kbhit():
                ch = msvcrt.getwch()
                if ch in ("\x00", "\xe0"):
                    if msvcrt.kbhit():
                        msvcrt.getwch()
                    return None
                return ch
            return None
        if self.fd is None:
            return None
        rlist, _, _ = select.select([self.fd], [], [], 0.0)
        if rlist:
            try:
                return os.read(self.fd, 1).decode("utf-8", errors="ignore")
            except _TTY_ERRORS:
                return None
        return None


def compute_viewport(term_cols: int, term_rows: int) -> tuple[int, int, int, int]:
    """
    Computes a 16:9 centered viewport guaranteed never to touch the rightmost column
    or bottom HUD row, preventing automatic line-wrap scrolling in Windows PowerShell.
    """
    avail_cols = max(16, term_cols - 4 if term_cols >= 24 else term_cols - 2)
    avail_rows = max(8, term_rows - 3 if term_rows >= 14 else term_rows - 2)
    target_ratio = 32.0 / 9.0

    if avail_cols / avail_rows > target_ratio:
        vp_rows = avail_rows
        vp_cols = min(avail_cols, int(vp_rows * target_ratio + 0.5))
    else:
        vp_cols = avail_cols
        vp_rows = min(avail_rows, max(8, int(vp_cols / target_ratio + 0.5)))

    vp_cols = max(8, min(vp_cols, max(8, term_cols - 2)))
    vp_rows = max(6, min(vp_rows, max(6, term_rows - 2)))
    pad_x = max(1, (term_cols - vp_cols) // 2)
    if pad_x + vp_cols >= term_cols:
        pad_x = max(0, term_cols - vp_cols - 1)
    pad_y = max(0, (term_rows - 1 - vp_rows) // 2)
    return vp_cols, vp_rows, pad_x, pad_y


def build_hud_line(
    term_cols: int,
    term_rows: int,
    t: float,
    total_duration: float,
    cutscene: bool = True,
    truecolor: bool = True,
) -> str:
    """
    Formats the clean single-line bottom HUD strictly clipped to (term_cols - 1) display
    columns so writing row `term_rows` NEVER wraps or scrolls the terminal buffer.
    """
    max_w = max(1, term_cols - 1)
    if cutscene:
        candidates = (
            " ★ BB CHANNEL · ON AIR  |  按 [Space / Enter / Esc / q] 跳过片头 ",
            " ★ BB CHANNEL · ON AIR | [Space / Enter / Esc] 跳过 ",
            " BB CHANNEL | [Space/Esc] 跳过 ",
            " BB CHANNEL [Esc]",
        )
    else:
        candidates = (
            f" ★ BB CHANNEL · ON AIR  {t:05.2f}s/{total_duration:.2f}s  |  [Enter] 重播  [5] 定格  [q] 退出 ",
            f" BB CHANNEL {t:05.2f}s | [Enter] 重播 [5] 定格 [q] 退出 ",
            f" BB {t:04.1f}s [Enter/5/q]",
        )

    text = clip_to_columns(candidates[-1], max_w)
    for cand in candidates:
        if display_width(cand) <= max_w:
            text = cand
            break

    if truecolor:
        style = "\x1b[38;2;216;180;226;48;2;16;10;22m"
    else:
        style = "\x1b[38;5;182;48;5;233m"
    return f"\x1b[{term_rows};1H\x1b[2K{style}{text}\x1b[0m"


def render_timeline_frame(
    t: float,
    buf: list[tuple[int, int, int]],
    gw: int,
    gh: int,
    rng: random.Random,
    caches: CinemaCaches,
) -> None:
    """Dispatches rendering to the active scene for timestamp t (in seconds)."""
    if t < 0.73:
        render_scene1_black(buf, gw, gh)
    elif t < 7.05:
        render_scene2_hacking(buf, gw, gh, t, rng, caches.scene2)
    elif t < 10.03:
        render_scene3_ok(buf, gw, gh, t)
    elif t < 13.80:
        render_scene4_pop(buf, gw, gh, t, caches.scene4)
    else:
        render_scene5_finale(buf, gw, gh, t, caches.finale)


def can_play_cinema(
    win_vt_enabled: bool = True,
    env: dict[str, str] | None = None,
    term_size: tuple[int, int] | None = None,
    is_tty: bool | None = None,
) -> tuple[bool, str | None]:
    """Checks whether the current terminal safely supports 2x2 alternate-screen playback."""
    e = os.environ if env is None else env
    if e.get("NO_COLOR") or e.get("TERM") == "dumb":
        return False, "no_color"
    if IS_WINDOWS and not win_vt_enabled:
        return False, "win_vt_disabled"
    tty_ok = (
        bool(is_tty)
        if is_tty is not None
        else (
            hasattr(sys.stdin, "isatty")
            and sys.stdin.isatty()
            and hasattr(sys.stdout, "isatty")
            and sys.stdout.isatty()
        )
    )
    if not tty_ok:
        return False, "non_tty"
    if term_size is None:
        ts = shutil.get_terminal_size(fallback=(120, 36))
        cols, rows = ts.columns, ts.lines
    else:
        cols, rows = term_size
    if cols < MIN_TERM_COLS or rows < MIN_TERM_ROWS:
        return False, "terminal_too_small"
    return True, None


def play_bb_channel_cinema(
    cutscene: bool = True,
    fps: float = 20.0,
    win_vt_enabled: bool = True,
    freeze_finale: bool = False,
) -> dict[str, object]:
    """
    Plays the 2x2 BB Channel terminal cinema inside the alternate screen buffer.

    Returns a structured playback report:
      {
        "played": bool,
        "skipped": bool,
        "skip_timestamp": float | None,
        "fallback_reason": str | None,
      }
    """
    ok, reason = can_play_cinema(win_vt_enabled=win_vt_enabled)
    if not ok:
        return {
            "played": False,
            "skipped": False,
            "skip_timestamp": None,
            "fallback_reason": reason,
        }

    safe_fps = fps if math.isfinite(fps) else 20.0
    frame_interval = 1.0 / max(5.0, min(60.0, safe_fps))
    total_duration = TOTAL_DURATION
    use_truecolor = supports_truecolor()

    rng = random.Random(20261122)
    last_dims = (0, 0)
    buf: list[tuple[int, int, int]] = []
    caches: CinemaCaches | None = None
    encoder = AnsiFrameEncoder(truecolor=use_truecolor)
    last_static_key: tuple | None = None
    last_hud = ""

    skipped = False
    skip_timestamp: float | None = None
    skip_keys = (" ", "\r", "\n", "\x1b", "q", "Q", "s", "S", "\x03")
    entered_alt_screen = False
    fallback_reason: str | None = None

    try:
        sys.stdout.write("\x1b[?1049h\x1b[?25l\x1b[?7l\x1b[2J")
        sys.stdout.flush()
        entered_alt_screen = True

        with RawTerminalInput() as kb:
            start_time = time.monotonic()
            paused_at: float | None = 15.60 if (not cutscene and freeze_finale) else None

            while True:
                frame_start = time.monotonic()

                if paused_at is not None:
                    t = paused_at
                else:
                    t = frame_start - start_time
                    if t >= total_duration:
                        if cutscene:
                            break
                        paused_at = total_duration
                        t = total_duration

                key = kb.poll_key()
                if key is not None:
                    if cutscene:
                        # Ignore accidental double-Enter in the first 120ms, while Space/Esc/q skip immediately
                        if not (key in ("\r", "\n") and t < 0.12) and key in skip_keys:
                            skipped = True
                            skip_timestamp = round(t, 2)
                            break
                    else:
                        if key in ("q", "Q", "\x03", "\x1b"):
                            if t < total_duration and paused_at is None:
                                skipped = True
                                skip_timestamp = round(t, 2)
                            break
                        if key in ("\r", "\n"):
                            start_time = time.monotonic()
                            paused_at = None
                            last_static_key = None
                        elif key == "5":
                            last_static_key = None
                            if paused_at is None:
                                paused_at = 15.60
                            else:
                                paused_at = None
                                start_time = time.monotonic() - 13.80

                ts = shutil.get_terminal_size(fallback=(120, 36))
                term_cols, term_rows = ts.columns, ts.lines
                vp_cols, vp_rows, pad_x, pad_y = compute_viewport(term_cols, term_rows)
                gw = vp_cols * 2
                gh = vp_rows * 2

                resized = (term_cols, term_rows) != last_dims or caches is None
                if resized:
                    last_dims = (term_cols, term_rows)
                    buf = [(0, 0, 0)] * (gw * gh)
                    caches = CinemaCaches(gw, gh)
                    encoder.reset()
                    last_static_key = None
                    last_hud = ""
                    sys.stdout.write("\x1b[2J")

                hud = build_hud_line(
                    term_cols,
                    term_rows,
                    t,
                    total_duration,
                    cutscene=cutscene,
                    truecolor=use_truecolor,
                )

                static_key: tuple | None = None
                if paused_at is not None:
                    static_key = ("paused", round(paused_at, 3), term_cols, term_rows)
                elif t < 0.73:
                    static_key = ("s1", term_cols, term_rows)
                elif 4.30 <= t < 4.38:
                    static_key = ("s2_flash", term_cols, term_rows)
                elif 7.05 <= t < 7.55:
                    static_key = ("s3_white", term_cols, term_rows)
                elif 9.45 <= t < 10.03:
                    static_key = ("s3_black", term_cols, term_rows)
                elif t >= 14.68:
                    static_key = ("s5_full", term_cols, term_rows)

                ansi_frame = ""
                if static_key is None or static_key != last_static_key:
                    render_timeline_frame(t, buf, gw, gh, rng, caches)
                    ansi_frame = encoder.encode(
                        buf, vp_cols, vp_rows, pad_x, pad_y, full_redraw=resized
                    )
                    last_static_key = static_key

                hud_delta = hud if hud != last_hud else ""
                if ansi_frame or hud_delta:
                    sys.stdout.write("\x1b[?2026h" + ansi_frame + hud_delta + "\x1b[?2026l")
                    sys.stdout.flush()
                    last_hud = hud

                # Incrementally pre-warm heavy caches during solid-color hold frames
                if caches is not None:
                    if t < 0.65 and caches._scene2 is None:
                        _ = caches.scene2
                    elif 7.08 <= t < 7.48 and caches._scene4 is None:
                        _ = caches.scene4
                    elif 9.48 <= t < 9.95 and caches._finale is None:
                        _ = caches.finale

                elapsed = time.monotonic() - frame_start
                sleep_dur = frame_interval - elapsed
                if sleep_dur > 0.0:
                    time.sleep(sleep_dur)

    except KeyboardInterrupt:
        skipped = True
        if skip_timestamp is None:
            skip_timestamp = 0.0
    except OSError:
        if not entered_alt_screen:
            fallback_reason = "io_error"
    finally:
        if entered_alt_screen:
            try:
                sys.stdout.write("\x1b[?2026l\x1b[0m\x1b[?7h\x1b[?25h\x1b[?1049l")
                sys.stdout.flush()
            except OSError:
                pass

    return {
        "played": entered_alt_screen,
        "skipped": entered_alt_screen and skipped,
        "skip_timestamp": skip_timestamp if entered_alt_screen else None,
        "fallback_reason": None if entered_alt_screen else (fallback_reason or "playback_error"),
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="BB Channel 24-bit TrueColor Terminal Cinema Engine (Optimized 2x2 QUAD Edition)"
    )
    parser.add_argument(
        "--fps",
        type=float,
        default=20.0,
        help="Target playback refresh rate in frames per second (5..60, default: 20)",
    )
    parser.add_argument(
        "--freeze-finale",
        action="store_true",
        help="Start directly on the Scene 5 Finale freeze frame",
    )
    args = parser.parse_args()
    play_bb_channel_cinema(cutscene=False, fps=args.fps, freeze_finale=args.freeze_finale)


if __name__ == "__main__":
    main()
