# -*- coding: utf-8 -*-
"""皮肤三视图样张生成器（仅视觉方案预览，不含游戏逻辑）。"""
import os, colorsys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "preview")
os.makedirs(OUT, exist_ok=True)
PANEL = 320

DARK_LABEL = "#8b95a1"
LIGHT_LABEL = "#5c6470"


# ---------- 基础工具 ----------
def hex2rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def rgba(h, a):
    return hex2rgb(h) + (a,)


def lerp(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def F(size, bold=False):
    names = ["msyhbd.ttc", "msyh.ttc", "simhei.ttf"] if bold else ["msyh.ttc", "simhei.ttf"]
    for n in names:
        p = os.path.join("C:\\Windows\\Fonts", n)
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()


# ---------- 皮肤定义 ----------
SKINS = [
    {
        "id": "neon", "name": "霓虹", "tag": "默认 · 深空底 · 青蓝渐变 · 外发光",
        "bg": "#0b0f14", "grid": rgba("#ffffff", 9), "gridMajor": rgba("#ffffff", 22),
        "wall": rgba("#00e5ff", 70), "label": DARK_LABEL,
        "apple": {"body": "#ff4d6d", "leaf": "#38b000", "glow": "#ff4d6d"},
        "snake": {"mode": "gradient", "colors": ["#00e5ff", "#0068ff"], "taper": True,
                  "glow": True, "glowcolor": hex2rgb("#00c8ff"), "head": "eyes"},
    },
    {
        "id": "classic", "name": "经典绿", "tag": "诺基亚 3310 · LCD 单色 · 硬边方块",
        "bg": "#9bbc0f", "grid": rgba("#0f380f", 26), "gridMajor": rgba("#0f380f", 55),
        "wall": rgba("#0f380f", 210), "label": "#3f5a0c",
        "apple": {"body": "#0f380f", "leaf": None, "glow": None, "pixel": True},
        "snake": {"mode": "classic", "colors": ["#0f380f"], "taper": False,
                  "glow": False, "head": "mouth"},
    },
    {
        "id": "rainbow", "name": "彩虹", "tag": "跑马灯 · 每段色相差 34° · 会流动",
        "bg": "#101218", "grid": rgba("#ffffff", 9), "gridMajor": rgba("#ffffff", 22),
        "wall": rgba("#ff6ec7", 60), "label": DARK_LABEL,
        "apple": {"body": "#ff3b30", "leaf": "#7bed3b", "glow": "#ff3b30"},
        "snake": {"mode": "rainbow", "colors": ["#ff0000"], "taper": True,
                  "glow": True, "glowcolor": hex2rgb("#ff6ec7"), "head": "eyes"},
    },
    {
        "id": "panda", "name": "熊猫 emoji", "tag": "米白底 · 黑白分段 · 表情头",
        "bg": "#f7f4ee", "grid": rgba("#000000", 16), "gridMajor": rgba("#000000", 34),
        "wall": rgba("#2b2b2b", 80), "label": LIGHT_LABEL,
        "apple": {"body": "#e8483f", "leaf": "#2f8f4e", "glow": None},
        "snake": {"mode": "panda", "colors": ["#2b2b2b", "#ffffff"], "taper": True,
                  "glow": False, "outline": "#2b2b2b", "head": "panda"},
    },
]


# ---------- 颜色策略 ----------
def seg_color(S, i, n):
    m = S["mode"]
    cs = S["colors"]
    if m == "gradient":
        return lerp(hex2rgb(cs[0]), hex2rgb(cs[1]), i / max(1, n - 1))
    if m == "rainbow":
        h = ((i * 34) % 360) / 360.0
        r, g, b = colorsys.hsv_to_rgb(h, 0.68, 1.0)
        return (int(r * 255), int(g * 255), int(b * 255))
    if m == "panda":
        return hex2rgb(cs[i % 2])
    return hex2rgb(cs[0])


# ---------- 头部 ----------
def draw_head(d, skin, cells, pts, cell):
    S = skin["snake"]
    style = S["head"]
    x, y = pts[0]
    if len(cells) > 1:
        dv = (cells[0][0] - cells[1][0], cells[0][1] - cells[1][1])
    else:
        dv = (1, 0)
    pv = (-dv[1], dv[0])
    bg = hex2rgb(skin["bg"])

    if style == "mouth":
        # 诺基亚：正前方咬一个口
        mx = x + dv[0] * cell * 0.20
        my = y + dv[1] * cell * 0.20
        s = cell * 0.34
        d.rectangle([mx - s / 2, my - s / 2, mx + s / 2, my + s / 2], fill=bg)
        return

    if style == "panda":
        r = cell * 0.44
        d.ellipse([x - r, y - r, x + r, y + r], fill=hex2rgb("#ffffff"),
                  outline=hex2rgb("#2b2b2b"), width=max(1, int(cell * 0.042)))
        for s in (-1, 1):
            ex = x + pv[0] * cell * 0.215 * s + dv[0] * cell * 0.075
            ey = y + pv[1] * cell * 0.215 * s + dv[1] * cell * 0.075
            pr = cell * 0.115
            d.ellipse([ex - pr, ey - pr, ex + pr, ey + pr], fill=hex2rgb("#2b2b2b"))
            pr2 = pr * 0.44
            d.ellipse([ex - pr2, ey - pr2, ex + pr2, ey + pr2], fill=hex2rgb("#ffffff"))
        tx = x + dv[0] * cell * 0.42
        ty = y + dv[1] * cell * 0.42
        d.ellipse([tx - cell * 0.08, ty - cell * 0.08, tx + cell * 0.08, ty + cell * 0.08],
                  fill=hex2rgb("#ff6b8a"))
        return

    white = hex2rgb("#ffffff")
    for s in (-1, 1):
        ex = x + pv[0] * cell * 0.205 * s + dv[0] * cell * 0.10
        ey = y + pv[1] * cell * 0.205 * s + dv[1] * cell * 0.10
        r = cell * 0.145
        d.ellipse([ex - r, ey - r, ex + r, ey + r], fill=white)
        if style == "slit":
            pw = cell * 0.04
            d.ellipse([ex - pw, ey - r * 0.74, ex + pw, ey + r * 0.74], fill=hex2rgb("#16150c"))
        else:
            pr = cell * 0.07
            ox_, oy_ = dv[0] * cell * 0.02, dv[1] * cell * 0.02
            d.ellipse([ex - pr + ox_, ey - pr + oy_, ex + pr + ox_, ey + pr + oy_],
                      fill=hex2rgb("#0a0d12"))


# ---------- 蛇身 ----------
def draw_snake(img, skin, cells, ox, oy, cell, min_r=0.0):
    S = skin["snake"]
    n = len(cells)
    pts = [(ox + cx * cell + cell / 2.0, oy + cy * cell + cell / 2.0) for cx, cy in cells]

    if S["mode"] == "classic":
        d = ImageDraw.Draw(img, "RGBA")
        col = hex2rgb(S["colors"][0])
        side = max(cell, min_r * 2)
        for (cx, cy) in cells:
            px = ox + cx * cell + cell / 2.0
            py = oy + cy * cell + cell / 2.0
            d.rectangle([px - side / 2, py - side / 2, px + side / 2, py + side / 2], fill=col)
        draw_head(d, skin, cells, pts, cell)
        return

    rs = []
    for i in range(n):
        if S.get("taper"):
            r = cell * 0.5 * (1.0 - 0.34 * (i / max(1, n - 1)))
        else:
            r = cell * 0.47
        rs.append(max(r, min_r))

    if S.get("glow"):
        glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow, "RGBA")
        gc = S["glowcolor"]
        for i, (px, py) in enumerate(pts):
            rr = rs[i] * 1.05
            gd.ellipse([px - rr, py - rr, px + rr, py + rr], fill=gc + (105,))
        for i in range(n - 1):
            gd.line([pts[i], pts[i + 1]], fill=gc + (105,),
                    width=int(round(rs[i] + rs[i + 1])))
        glow = glow.filter(ImageFilter.GaussianBlur(max(1.2, cell * 0.50)))
        img.alpha_composite(glow)

    d = ImageDraw.Draw(img, "RGBA")
    for i in range(n - 1, -1, -1):
        px, py = pts[i]
        col = seg_color(S, i, n)
        rr = rs[i]
        if S.get("outline"):
            oc = hex2rgb(S["outline"])
            e = rr + cell * 0.035
            if i > 0:
                d.line([pts[i], pts[i - 1]], fill=oc,
                       width=int(round(rs[i] + rs[i - 1] + cell * 0.07)))
            d.ellipse([px - e, py - e, px + e, py + e], fill=oc)
        if i > 0:
            d.line([pts[i], pts[i - 1]], fill=col, width=int(round(rs[i] + rs[i - 1])))
        d.ellipse([px - rr, py - rr, px + rr, py + rr], fill=col)

        if S["mode"] == "scales":
            lw = max(1, int(round(cell * 0.045)))
            sc = S["scale"]
            sr = cell * 0.155
            for (kx, ky) in ((0.0, -0.21), (-0.22, 0.13), (0.22, 0.13), (0.0, 0.30)):
                gx = px + kx * cell
                gy = py + ky * cell
                d.arc([gx - sr, gy - sr * 0.85, gx + sr, gy + sr * 0.85],
                      195, 345, fill=sc, width=lw)
            # 背脊高光
            d.arc([px - cell * 0.20, py - rs[i] * 1.02, px + cell * 0.20, py - rs[i] * 0.30],
                  205, 335, fill=S["belly"], width=max(1, int(round(cell * 0.05))))

    draw_head(d, skin, cells, pts, cell)


# ---------- 苹果 ----------
def draw_apple(img, skin, cx, cy, ox, oy, cell, min_r=0.0):
    A = skin["apple"]
    px = ox + cx * cell + cell / 2.0
    py = oy + cy * cell + cell / 2.0
    r = max(cell * 0.32, min_r)

    if A.get("pixel"):
        # 诺基亚像素苹果：2×2 实心块 + 梗
        u = max(cell * 0.24, min_r * 0.9)
        d = ImageDraw.Draw(img, "RGBA")
        col = hex2rgb(A["body"])
        x0 = px - u
        y0 = py - u * 0.85
        d.rectangle([x0, y0, x0 + 2 * u, y0 + 2 * u], fill=col)
        d.rectangle([px - u * 0.22, y0 - u * 0.95, px + u * 0.22, y0], fill=col)
        return

    if A.get("glow"):
        box = int(cell * 8)
        glow = Image.new("RGBA", (box, box), (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow, "RGBA")
        gc = hex2rgb(A["glow"])
        gr = max(cell * 0.40, min_r * 1.2)
        gd.ellipse([box / 2 - gr, box / 2 - gr, box / 2 + gr, box / 2 + gr], fill=gc + (115,))
        glow = glow.filter(ImageFilter.GaussianBlur(max(1.0, cell * 0.48)))
        img.alpha_composite(glow, (int(px - box / 2), int(py - box / 2)))

    d = ImageDraw.Draw(img, "RGBA")
    if A.get("leaf"):
        lx = px + cell * 0.17
        ly = py - r * 0.96 - cell * 0.10
        d.line([(px + cell * 0.01, py - r * 0.9), (px + cell * 0.07, py - r - cell * 0.17)],
               fill=hex2rgb("#5a3d1e"), width=max(1, int(cell * 0.055)))
        d.ellipse([lx - cell * 0.14, ly - cell * 0.075, lx + cell * 0.14, ly + cell * 0.075],
                  fill=hex2rgb(A["leaf"]))

    d.ellipse([px - r, py - r, px + r, py + r], fill=hex2rgb(A["body"]))
    hr = r * 0.30
    hx = px - r * 0.46
    hy = py - r * 0.46
    d.ellipse([hx - hr, hy - hr, hx + hr, hy + hr], fill=(255, 255, 255, 115))


# ---------- 网格与墙 ----------
def draw_grid(img, skin, ox, oy, cell, cols, rows):
    d = ImageDraw.Draw(img, "RGBA")
    if cell >= 5.5:
        g = skin["grid"]
        for i in range(cols + 1):
            x = ox + i * cell
            d.line([(x, oy), (x, oy + rows * cell)], fill=g, width=1)
        for j in range(rows + 1):
            y = oy + j * cell
            d.line([(ox, y), (ox + cols * cell, y)], fill=g, width=1)
    gm = skin.get("gridMajor")
    if gm and cols > 12:
        for i in range(0, cols + 1, 10):
            x = ox + i * cell
            d.line([(x, oy), (x, oy + rows * cell)], fill=gm, width=1)
        for j in range(0, rows + 1, 10):
            y = oy + j * cell
            d.line([(ox, y), (ox + cols * cell, y)], fill=gm, width=1)


def draw_wall(img, skin, ox, oy, size, w=2):
    d = ImageDraw.Draw(img, "RGBA")
    d.rectangle([ox - 1, oy - 1, ox + size, oy + size], outline=skin["wall"], width=w)


# ---------- 三视图 ----------
def view_overview(skin):
    img = Image.new("RGBA", (PANEL, PANEL), hex2rgb(skin["bg"]) + (255,))
    cell = 3.0
    size = 100 * cell
    ox = (PANEL - size) / 2.0
    oy = (PANEL - size) / 2.0
    draw_grid(img, skin, ox, oy, cell, 100, 100)
    draw_wall(img, skin, ox, oy, size, 2)

    apples = [(14, 18), (77, 12), (88, 44), (23, 71), (61, 83),
              (48, 33), (12, 92), (93, 87), (68, 55), (37, 8)]
    for (ax, ay) in apples:
        draw_apple(img, skin, ax, ay, ox, oy, cell, min_r=2.6)

    snake = [(50, 50), (49, 50), (48, 50)]
    draw_snake(img, skin, snake, ox, oy, cell, min_r=2.7)
    return img


def view_detail(skin):
    img = Image.new("RGBA", (PANEL, PANEL), hex2rgb(skin["bg"]) + (255,))
    cols = rows = 11
    cell = PANEL / cols
    draw_grid(img, skin, 0, 0, cell, cols, rows)
    snake = [(7, 2), (6, 2), (5, 2), (4, 2), (4, 3), (4, 4),
             (3, 4), (2, 4), (2, 5), (1, 5)]
    draw_snake(img, skin, snake, 0, 0, cell)
    draw_apple(img, skin, 8, 6, 0, 0, cell)
    draw_apple(img, skin, 3, 8, 0, 0, cell)
    draw_wall(img, skin, 0, 0, PANEL, 2)
    return img


def view_states(skin):
    img = Image.new("RGBA", (PANEL, PANEL), hex2rgb(skin["bg"]) + (255,))
    d = ImageDraw.Draw(img, "RGBA")
    lab = hex2rgb(skin["label"])
    f_lab = F(13)
    f_small = F(12)

    # 上半：4 个朝向（头 + 两节身体 + 方向箭头）
    cell = 19
    oy = 16
    dirs = [("上", (0, -1)), ("右", (1, 0)), ("下", (0, 1)), ("左", (-1, 0))]
    for idx, (name, dv) in enumerate(dirs):
        ox = 18 + idx * 76
        head = (1, 1)
        cells = [head] + [(head[0] - dv[0] * k, head[1] - dv[1] * k) for k in (1, 2)]
        draw_snake(img, skin, cells, ox, oy, cell)
        # 方向箭头
        hx = ox + head[0] * cell + cell / 2 + dv[0] * cell * 0.86
        hy = oy + head[1] * cell + cell / 2 + dv[1] * cell * 0.86
        a = cell * 0.22
        tip = (hx + dv[0] * a, hy + dv[1] * a)
        b1 = (hx - dv[0] * a * 0.15 + (-dv[1]) * a * 0.82,
              hy - dv[1] * a * 0.15 + dv[0] * a * 0.82)
        b2 = (hx - dv[0] * a * 0.15 - (-dv[1]) * a * 0.82,
              hy - dv[1] * a * 0.15 - dv[0] * a * 0.82)
        d.polygon([tip, b1, b2], fill=lab + (200,) if len(lab) == 3 else lab)
        d.text((ox + head[0] * cell + cell / 2, oy + cell * 4.9), name,
               font=f_lab, fill=lab, anchor="mm")

    # 下半：三种长度
    y = 138
    for length, label in ((3, "长度 3 · 开局"), (7, "长度 7 · 吃 4 个"), (12, "长度 12 · 吃 9 个")):
        d.text((12, y), label, font=f_small, fill=lab)
        cells = [(i, 0) for i in range(length - 1, -1, -1)]
        draw_snake(img, skin, cells, 118, y - 5, 14)
        y += 55

    draw_wall(img, skin, 0, 0, PANEL, 2)
    return img


def build_sheet(skin):
    W = 24 + PANEL + 22 + PANEL + 22 + PANEL + 24
    H = 78 + PANEL + 34 + 18
    sheet = Image.new("RGBA", (W, H), hex2rgb("#14171c") + (255,))
    d = ImageDraw.Draw(sheet, "RGBA")

    f_name = F(26, True)
    f_tag = F(14)
    f_cap = F(14)

    accent = hex2rgb(skin["apple"]["body"]) if skin["id"] != "classic" else hex2rgb("#0f380f")
    d.rectangle([0, 0, W, 4], fill=accent)
    d.text((24, 16), skin["name"], font=f_name, fill=hex2rgb("#f2f4f7"))
    tw = d.textlength(skin["name"], font=f_name)
    d.text((24 + tw + 14, 26), "· " + skin["tag"], font=f_tag, fill=hex2rgb("#8b95a1"))

    panels = [view_overview(skin), view_detail(skin), view_states(skin)]
    caps = ["① 实机全景   100×100 · 10 苹果",
            "② 细节放大   蛇身 / 头 / 苹果",
            "③ 朝向 × 长度   4 向 · 3/7/12"]
    x = 24
    for p, cap in zip(panels, caps):
        sheet.alpha_composite(p, (int(x), 78))
        d.rectangle([x - 1, 77, x + PANEL, 78 + PANEL], outline=(255, 255, 255, 22), width=1)
        d.text((x + PANEL / 2, 78 + PANEL + 15), cap, font=f_cap,
               fill=hex2rgb("#9aa4b0"), anchor="mm")
        x += PANEL + 22
    return sheet


def main():
    sheets = []
    for s in SKINS:
        sheet = build_sheet(s)
        sheets.append(sheet)
        path = os.path.join(OUT, "skin_%s.png" % s["id"])
        sheet.convert("RGB").save(path, "PNG")
        print("saved", path, sheet.size)

    gap = 10
    W = sheets[0].width
    H = sum(s.height for s in sheets) + gap * (len(sheets) - 1)
    allimg = Image.new("RGB", (W, H), hex2rgb("#0a0c10"))
    y = 0
    for s in sheets:
        allimg.paste(s.convert("RGB"), (0, y))
        y += s.height + gap
    p = os.path.join(OUT, "skins_all.png")
    allimg.save(p, "PNG")
    print("saved", p, allimg.size)


if __name__ == "__main__":
    main()
