# Cut the sticker sheets from Gemini into transparent stickers.
#
#   python3 design/frog/cut.py              cuts every sheet listed in SHEETS
#   python3 design/frog/cut.py --preview    also writes preview.png next to this script
#
# How it works: everything that is not white paper is "ink" (the frog, the confetti, a question mark).
# The ink is grown by the width of the white sticker border. That grown shape is the sticker.
# Small loose bits (confetti, sweat drops, sparkles) go with the nearest big piece.
#
# The frog is saved twice: as a sticker (img/frog, for the profile and the leaderboard) and without
# the white border (img/frog-plain, for the scenes, where a sticker would look pasted on).
import os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(HERE, "..", "..", "img")
LONGEST = 520  # stickers are saved no larger than this: plenty for a phone screen
LARGER = {"logo": 820}  # the title is shown wide, so it keeps more pixels
PLAIN = {"frog": "frog-plain"}  # folders whose stickers are also saved without the white border
OUTLINE = (12, 10, 34)  # the navy of the drawn outline

# (sheet, names in reading order, white border in sheet pixels, folder under img/)
# The border is chosen so that every sticker shows about the same border on screen.
# A name of None skips that piece (a pose the game already has from another sheet).
SHEETS = [
    ("sheet.webp", ["think", "cheer", "ponder", "panic", "write", "wink"], 9, "frog"),
    ("catch-sheet.webp", ["catch"], 22, "frog"),
    ("jump-sheet.png", ["jump"], 18, "frog"),
    ("moods-sheet.webp", ["sleep", "climb", "splash", "astronaut"], 10, "frog"),
    ("flies-sheet.png", ["fly-up", "fly-down", "gold-up", "gold-down"], 10, "bugs"),
    ("moods2-sheet.webp", [None, "shrug", "proud", None, "champion", None], 10, "frog"),
    ("badges-sheet.webp", ["pond", "reeds", "trunk", "canopy", "clouds", "moon"], 10, "badge"),
    ("logo-sheet.png", ["logo"], 14, "ui"),
]


def grow(mask, steps):
    """Grow a True/False picture by `steps` pixels (an octagon, close enough to a circle)."""
    m = mask.copy()
    for i in range(steps):
        g = m.copy()
        g[1:, :] |= m[:-1, :]; g[:-1, :] |= m[1:, :]; g[:, 1:] |= m[:, :-1]; g[:, :-1] |= m[:, 1:]
        if i % 2:  # every other step also grows along the diagonals
            g[1:, 1:] |= m[:-1, :-1]; g[:-1, :-1] |= m[1:, 1:]; g[1:, :-1] |= m[:-1, 1:]; g[:-1, 1:] |= m[1:, :-1]
        m = g
    return m


def fill_holes(mask):
    """Close everything the outside cannot reach (the notepad paper, the eye whites)."""
    im = Image.fromarray(np.where(mask, 255, 0).astype(np.uint8))
    padded = Image.new("L", (im.width + 2, im.height + 2), 0)
    padded.paste(im, (1, 1))
    ImageDraw.floodfill(padded, (0, 0), 128)
    return np.array(padded)[1:-1, 1:-1] != 128


def pieces(mask):
    """Give every separate blob its own number. Returns (numbers, how many)."""
    im = Image.fromarray(np.where(mask, 1, 0).astype(np.int32), mode="I")
    arr, count = np.array(im), 0
    while True:
        ys, xs = np.nonzero(arr == 1)
        if len(ys) == 0:
            return arr, count
        count += 1
        ImageDraw.floodfill(im, (int(xs[0]), int(ys[0])), count + 1)
        arr = np.array(im)


def box(mask):
    ys, xs = np.nonzero(mask)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def gap(a, b):
    """Distance between two boxes (0 when they touch or overlap)."""
    dx = max(a[0] - b[2], b[0] - a[2], 0)
    dy = max(a[1] - b[3], b[1] - a[3], 0)
    return (dx * dx + dy * dy) ** 0.5


def cut(sheet, names, border, folder):
    rgb = np.array(Image.open(os.path.join(HERE, sheet)).convert("RGB")).astype(np.int16)
    h = rgb.shape[0]
    light, grey = rgb.min(axis=2) > 205, (rgb.max(axis=2) - rgb.min(axis=2)) < 30
    ink = ~(light & grey)
    core = fill_holes(grow(ink, 2))          # the drawing itself, a hair wider
    sticker = fill_holes(grow(ink, border))  # the drawing plus its white border
    # Without the border: only what is drawn, up to the dark outline, and what the outline closes in
    # (eye whites, the notepad). The sheet's white border is left out, and so is its faint grey edge:
    # that edge is pale and has no colour, and it touches nothing dark or coloured.
    darkest, colourful = rgb.min(axis=2), (rgb.max(axis=2) - rgb.min(axis=2)) > 50
    bold = (darkest < 110) | colourful
    for _ in range(3):  # take in the softer pixels on the rim of the bold ones
        bold = grow(bold, 1) & (darkest < 190)
    drawn = fill_holes(bold)

    numbers, count = pieces(sticker)
    blobs = [numbers == n for n in range(2, count + 2)]
    blobs.sort(key=lambda mask: -int(mask.sum()))
    groups = [[mask, box(mask)] for mask in blobs[:len(names)]]
    for mask in blobs[len(names):]:
        nearest = min(groups, key=lambda g: gap(g[1], box(mask)))
        nearest[0] = nearest[0] | mask
    # reading order: two rows when the pieces sit clearly above each other, then left to right
    middles = [(g[1][1] + g[1][3]) / 2 for g in groups]
    two_rows = max(middles) - min(middles) > 0.3 * h
    groups.sort(key=lambda g: ((g[1][1] + g[1][3]) / 2 > h / 2 if two_rows else False, g[1][0]))

    out_dir = os.path.join(IMG, folder)
    os.makedirs(out_dir, exist_ok=True)
    tiles = []
    for name, (mask, _) in zip(names, groups):
        if name is None:
            continue
        x0, y0, x1, y1 = box(mask)
        pad = 3
        x0, y0, x1, y1 = max(x0 - pad, 0), max(y0 - pad, 0), min(x1 + pad, rgb.shape[1]), min(y1 + pad, h)
        m, c = mask[y0:y1, x0:x1], core[y0:y1, x0:x1]
        colour = rgb[y0:y1, x0:x1].astype(np.uint8).copy()
        colour[m & ~c] = 255  # the border ring becomes clean white (no grey shadow left)
        alpha = Image.fromarray(np.where(m, 255, 0).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7))
        tile = Image.fromarray(colour).convert("RGBA")
        tile.putalpha(alpha)
        scale = LARGER.get(name, LONGEST) / max(tile.size)
        if scale < 1:
            tile = tile.resize((round(tile.width * scale), round(tile.height * scale)), Image.LANCZOS)
        path = os.path.join(out_dir, name + ".webp")
        tile.save(path, quality=92, method=6)
        tiles.append((name, tile))
        print(f"{folder}/{name:10s} {tile.width}x{tile.height}  {os.path.getsize(path) // 1024} KB")
        if folder in PLAIN:
            # same box and same size as the sticker, so the two can stand in for each other
            d = m & drawn[y0:y1, x0:x1]
            bare = rgb[y0:y1, x0:x1].astype(np.uint8).copy()
            bare[~d] = OUTLINE  # the soft edge fades from the outline's colour, never from white
            plain = Image.fromarray(bare).convert("RGBA")
            plain.putalpha(Image.fromarray(np.where(d, 255, 0).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7)))
            if scale < 1:
                plain = plain.resize(tile.size, Image.LANCZOS)
            os.makedirs(os.path.join(IMG, PLAIN[folder]), exist_ok=True)
            plain.save(os.path.join(IMG, PLAIN[folder], name + ".webp"), quality=92, method=6)
    return tiles


def main():
    tiles = []
    for sheet, names, border, folder in SHEETS:
        tiles += cut(sheet, names, border, folder)
    if "--preview" in sys.argv:
        size, columns = 190, 7
        rows = -(-len(tiles) // columns)
        sheet = Image.new("RGB", (columns * size, rows * size), (44, 110, 73))
        for i, (_, tile) in enumerate(tiles):
            small = tile.copy()
            small.thumbnail((size - 20, size - 20))
            x, y = (i % columns) * size, (i // columns) * size
            if (i // columns) % 2:
                ImageDraw.Draw(sheet).rectangle([x, y, x + size, y + size], fill=(23, 37, 74))
            sheet.paste(small, (x + (size - small.width) // 2, y + (size - small.height) // 2), small)
        sheet.save(os.path.join(HERE, "preview.png"))
        print("preview:", os.path.join(HERE, "preview.png"))


main()
