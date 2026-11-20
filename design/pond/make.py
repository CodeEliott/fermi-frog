# The pond's pictures: from what Higgsfield drew to what the game shows.
#
#   python3 design/pond/make.py
#
#   raw/raft-1.png    the frog on its back on its lily pad   ->  img/frog-plain/float.webp (the still)
#                                                                design/anim/in/float.png  (the same on magenta, to animate)
#   raw/leaves-1.png  six leaves and three lotus flowers     ->  img/pond/leaf-1..6.webp, img/pond/flower-1..3.webp
#   raw/water-1.png   the water                              ->  img/pond/water.webp
#
# The frog and the leaves were drawn on magenta, so they are cut out the same way as the animations
# (cut_magenta in design/anim/make.py). The frog's animations are then made by design/anim/make.py, as for any pose.
import importlib.util, os
import numpy as np
from PIL import Image, ImageEnhance

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(HERE, "..", "..", "img")
spec = importlib.util.spec_from_file_location("anim", os.path.join(HERE, "..", "anim", "make.py"))
anim = importlib.util.module_from_spec(spec)
spec.loader.exec_module(anim)


def square(image, box, room=0.03):
    """Crop a square around `box`, the box in its middle, with a little room around."""
    x0, y0, x1, y1 = box
    side = round(max(x1 - x0, y1 - y0) * (1 + 2 * room))
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    out = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    out.paste(image, (side // 2 - cx, side // 2 - cy))
    return out


def save(image, folder, name, size, quality=90):
    os.makedirs(os.path.join(IMG, folder), exist_ok=True)
    path = os.path.join(IMG, folder, name + ".webp")
    image.resize((size, round(size * image.height / image.width)), Image.LANCZOS).save(path, quality=quality, method=6)
    print(f"img/{folder}/{name}.webp  {size} px wide, {os.path.getsize(path) // 1024} KB")


def raft():
    cut = anim.cut_magenta(Image.open(os.path.join(HERE, "raw", "raft-1.png")))
    art = square(cut, anim.ink_box(cut))
    save(art, "frog-plain", "float", 512)
    # the picture to animate: the same, on magenta, with room around it
    canvas = Image.new("RGB", (1024, 1024), anim.MAGENTA)
    small = art.resize((600, 600), Image.LANCZOS)
    hard = small.getchannel("A").point(lambda a: 255 if a > 127 else 0)
    canvas.paste(small.convert("RGB"), (212, 212), hard)
    canvas.save(os.path.join(HERE, "..", "anim", "in", "float.png"))
    print("design/anim/in/float.png")


def bands(ink, axis):
    """The stretches of rows (axis 0) or columns (axis 1) that hold some ink, as (start, end) pairs."""
    full = ink.any(axis=1 - axis)
    edges = np.flatnonzero(np.diff(np.concatenate(([0], full.astype(np.int8), [0]))))
    return [(a, b) for a, b in zip(edges[::2], edges[1::2]) if b - a > 20]


def leaves():
    cut = anim.cut_magenta(Image.open(os.path.join(HERE, "raw", "leaves-1.png")))
    ink = np.array(cut.getchannel("A")) > 40
    found = []
    for y0, y1 in bands(ink, 0):                 # the sheet is a tidy grid: rows first, then each row's pieces
        for x0, x1 in bands(ink[y0:y1], 1):
            found.append(square(cut, (x0, y0, x1, y1)))
    print(len(found), "pieces on the sheet")
    for i, piece in enumerate(found[:6]):
        save(piece, "pond", f"leaf-{i + 1}", 256)
    for i, piece in enumerate(found[6:9]):
        save(piece, "pond", f"flower-{i + 1}", 192)


def water():
    art = Image.open(os.path.join(HERE, "raw", "water-1.png")).convert("RGB")
    art = ImageEnhance.Color(ImageEnhance.Brightness(art).enhance(1.2)).enhance(1.25)  # brighter and bluer: it came out dull
    save(art, "pond", "water", 768, quality=84)


if __name__ == "__main__":
    raft()
    leaves()
    water()
