# Prepare the pictures that are not stickers: the six scenes, the things the frog stands on,
# the app icon and the share picture.
#
#   python3 design/world/make.py              writes into img/world, img/perch and img/ui
#   python3 design/world/make.py --preview    also writes preview.png next to this script
import os, sys
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(HERE, "..", "..", "img")
UI = os.path.join(HERE, "..", "ui")
SCENES = ["pond", "reeds", "trunk", "canopy", "clouds", "moon"]  # bottom of the world to top
PERCHES = ["pad", "leaf", "branch", "cloud"]                      # reading order on the magenta sheet


def out(folder, name):
    os.makedirs(os.path.join(IMG, folder), exist_ok=True)
    return os.path.join(IMG, folder, name)


def scenes():
    for name in SCENES:
        source = next(p for p in (os.path.join(HERE, name + ext) for ext in (".webp", ".png")) if os.path.exists(p))
        im = Image.open(source).convert("RGB")
        path = out("world", name + ".webp")
        im.save(path, quality=88, method=6)
        print(f"world/{name:7s} {im.width}x{im.height}  {os.path.getsize(path) // 1024} KB")


def perches():
    """Cut the four objects off their magenta sheet. Magenta is the only colour with far less green than red and blue."""
    rgb = np.array(Image.open(os.path.join(HERE, "perches-sheet.png")).convert("RGB")).astype(np.int16)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    solid = ~((r - g > 60) & (b - g > 60))
    # number the separate objects
    im = Image.fromarray(np.where(solid, 1, 0).astype(np.int32), mode="I")
    arr, count = np.array(im), 0
    while True:
        ys, xs = np.nonzero(arr == 1)
        if len(ys) == 0:
            break
        count += 1
        ImageDraw.floodfill(im, (int(xs[0]), int(ys[0])), count + 1)
        arr = np.array(im)
    blobs = sorted((arr == n for n in range(2, count + 2)), key=lambda m: -int(m.sum()))[:len(PERCHES)]

    def box(m):
        ys, xs = np.nonzero(m)
        return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    h = rgb.shape[0]
    blobs.sort(key=lambda m: ((box(m)[1] + box(m)[3]) / 2 > h / 2, box(m)[0]))  # top row first, then left to right
    tiles = []
    for name, mask in zip(PERCHES, blobs):
        x0, y0, x1, y1 = box(mask)
        tile = Image.fromarray(rgb[y0:y1, x0:x1].astype(np.uint8)).convert("RGBA")
        tile.putalpha(Image.fromarray(np.where(mask[y0:y1, x0:x1], 255, 0).astype(np.uint8)))
        path = out("perch", name + ".webp")
        tile.save(path, quality=92, method=6)
        tiles.append((name, tile))
        print(f"perch/{name:7s} {tile.width}x{tile.height}  {os.path.getsize(path) // 1024} KB")
    return tiles


def icon():
    """The icon has rounded corners on white. Phones round the corners themselves, so the white becomes the icon's blue."""
    im = Image.open(os.path.join(UI, "icon.png")).convert("RGB")
    blue = im.getpixel((im.width // 2, 12))
    for corner in [(0, 0), (im.width - 1, 0), (0, im.height - 1), (im.width - 1, im.height - 1)]:
        ImageDraw.floodfill(im, corner, blue, thresh=90)
    path = out("ui", "icon-180.png")
    im.resize((180, 180), Image.LANCZOS).save(path, optimize=True)
    print(f"ui/icon-180.png  {os.path.getsize(path) // 1024} KB")


def share():
    im = Image.open(os.path.join(UI, "share.webp")).convert("RGB")
    im = im.resize((1200, round(1200 * im.height / im.width)), Image.LANCZOS)
    path = out("ui", "share.jpg")
    im.save(path, quality=86, optimize=True)
    print(f"ui/share.jpg {im.width}x{im.height}  {os.path.getsize(path) // 1024} KB")


scenes()
tiles = perches()
icon()
share()
if "--preview" in sys.argv:
    sheet = Image.new("RGB", (1500, 330), (60, 110, 160))
    x = 20
    for _, tile in tiles:
        small = tile.copy()
        small.thumbnail((340, 290))
        sheet.paste(small, (x, 20), small)
        x += small.width + 30
    sheet.save(os.path.join(HERE, "preview.png"))
    print("preview:", os.path.join(HERE, "preview.png"))
