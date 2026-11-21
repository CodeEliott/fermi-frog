# Split a sticker sheet whose stickers sit too close for cut.py into one sheet per sticker.
#
#   python3 design/frog/split.py     supporters-sheet.png -> supporters/scientist.png, wizard.png, pirate.png, detective.png
#                                    supporters2-sheet.png -> supporters/astronomer.png, chef.png, knight.png, explorer.png
#
# Each sticker is closed by its faint grey edge. Filling the white background from a corner reaches everything
# outside the stickers, so what is left is the stickers themselves, each with its own white border.
# Each one is then pasted alone on white, and cut.py cuts it like any other sheet.
import os
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
SHEETS = [  # (sheet, names left to right)
    ("supporters-sheet.png", ["scientist", "wizard", "pirate", "detective"]),
    ("supporters2-sheet.png", ["astronomer", "chef", "knight", "explorer"]),
]


def split(SHEET, NAMES):
    im = Image.open(os.path.join(HERE, SHEET)).convert("RGB")
    rgb = np.array(im)
    # The fills run on a copy 2 times smaller (Pillow fills pixel by pixel, in Python): 4 times fewer pixels.
    # A pixel of the copy is "white" only if all 4 pixels under it are, so a grey edge never slips through.
    k = 2
    h, w = rgb.shape[0] // k * k, rgb.shape[1] // k * k
    white = (rgb[:h, :w].min(axis=2) >= 245).reshape(h // k, k, w // k, k).all(axis=(1, 3))
    small = Image.fromarray((white * 255).astype(np.uint8)).copy()  # a copy: Pillow will not fill a picture that is a view of an array
    ImageDraw.floodfill(small, (0, 0), 128)                # the background
    inside = np.array(small) != 128                         # the stickers, with their borders
    # each piece gets its own number (a 32-bit picture: specks of noise make many tiny pieces too)
    marks = Image.fromarray(inside.astype(np.int32) * -1, mode="I").copy()
    pieces = []
    for y, x in zip(*np.nonzero(inside)):
        if marks.getpixel((int(x), int(y))) == -1:
            pieces.append(len(pieces) + 1)
            ImageDraw.floodfill(marks, (int(x), int(y)), pieces[-1])
    numbers = np.array(marks)
    stickers = sorted((numbers == n for n in pieces), key=lambda m: -int(m.sum()))[:len(NAMES)]
    stickers.sort(key=lambda m: np.nonzero(m.any(axis=0))[0][0])  # left to right
    os.makedirs(os.path.join(HERE, "supporters"), exist_ok=True)
    for name, small_mask in zip(NAMES, stickers):
        mask = np.zeros(rgb.shape[:2], bool)
        mask[:h, :w] = small_mask.repeat(k, axis=0).repeat(k, axis=1)
        alone = np.full_like(rgb, 255)
        alone[mask] = rgb[mask]
        Image.fromarray(alone).save(os.path.join(HERE, "supporters", name + ".png"))
        xs = np.nonzero(mask.any(axis=0))[0]
        print(f"supporters/{name:9s} x {xs[0]}-{xs[-1]}  {int(mask.sum())} px")

for sheet, names in SHEETS:
    split(sheet, names)
