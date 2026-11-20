# Animations for Fermi Frog: from a still pose to a sprite sheet the game can play.
#
#   python3 design/anim/make.py key think catch
#       the pictures to give Higgsfield (design/anim/in/)
#   python3 design/anim/make.py clip think design/anim/raw/think-idle.mp4 --frames 16 --fps 4 --loop
#       a short video from Higgsfield, made ready for the game: its frames are picked and cut out here, for free
#   python3 design/anim/make.py clip catch design/anim/raw/catch-gulp.mp4 --frames 10 --fps 14 --span 0:2
#       a one-time action: only a part of the video (in seconds)
#   python3 design/anim/make.py clip think design/anim/raw/think-jump.mp4 --name jump --fps 11 --planted --body --pick 14,22,25,28,32,70,78,80,84,90
#       chosen frames, the frog kept on the ground in each of them (the game moves it up and down), and only its body
#   python3 design/anim/make.py sheet think design/anim/raw/think.png --frames 12 --fps 10 --loop
#       a finished sheet from AutoSprite instead of a video
#
#   python3 design/anim/make.py preview
#       design/anim/preview.gif: think, catch and jump on the pond, to judge them without playing
#
# clip and sheet end the same way: img/anim/<name>.webp, and a line in sheets.js that tells the game how to play it.
#
# A "key" picture is one frog pose on a flat magenta background, with empty room around it.
# The sprite tool animates that picture, so the frog needs room to move: a frog that touches
# the edge of its picture comes back cut off. Magenta because nothing on the frog is magenta.
import json, math, os, subprocess, sys, tempfile
import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(HERE, "..", "..", "img")
CANVAS = 1024          # the key picture is a square of this many pixels
FILL = 0.56            # the frog's longest side, as a share of the square
FEET = 0.80            # the frog's feet stand at this height in the square (0 = top)
MAGENTA = (255, 0, 255)
LIST = os.path.join(HERE, "sheets.json")  # every animation made so far; sheets.js is written from it
OUTLINE = (12, 10, 34)  # the navy of the frog's outline


def key(pose):
    """Place img/frog-plain/<pose>.webp on the magenta square. Returns where the frog was put."""
    frog = Image.open(os.path.join(IMG, "frog-plain", pose + ".webp")).convert("RGBA")
    scale = CANVAS * FILL / max(frog.size)
    size = (round(frog.width * scale), round(frog.height * scale))
    frog = frog.resize(size, Image.NEAREST)  # no smoothing: the pixels stay square
    # the picture's own transparency is soft at the edge; on magenta that would leave a pink rim
    hard = frog.getchannel("A").point(lambda a: 255 if a > 127 else 0)
    canvas = Image.new("RGB", (CANVAS, CANVAS), MAGENTA)
    left, top = (CANVAS - size[0]) // 2, round(CANVAS * FEET) - size[1]
    canvas.paste(frog.convert("RGB"), (left, top), hard)
    out = os.path.join(HERE, "in", pose + ".png")
    canvas.save(out)
    print(f"in/{pose}.png  frog {size[0]}x{size[1]} at ({left}, {top})")
    return out


# ---------- from Higgsfield's sheet to the game's sheet ----------

def cells_of(sheet, frames):
    """Cut a grid sheet into its cells. The cells are square; the grid is read row by row."""
    for cols in range(1, frames + 1):
        cell = sheet.width // cols
        if cell and sheet.width % cols == 0 and sheet.height % cell == 0 and cols * (sheet.height // cell) >= frames:
            return [sheet.crop((i % cols * cell, i // cols * cell, i % cols * cell + cell, i // cols * cell + cell)) for i in range(frames)]
    raise SystemExit(f"cannot read a grid of {frames} square cells in a {sheet.width}x{sheet.height} sheet")


def ink_box(image, threshold=40):
    """The box around everything that is not transparent."""
    return image.getchannel("A").point(lambda a: 255 if a > threshold else 0).getbbox()


def sheet(pose, raw, frames, fps, loop, name=None):
    """A finished sheet from AutoSprite: a grid of square cells, background already removed."""
    return build(pose, [c.convert("RGBA") for c in cells_of(Image.open(raw), frames)], fps, loop, name)


def cut_magenta(frame):
    """Make the magenta background of a video frame transparent.

    Video is compressed, so the background is "about magenta", and a thin purple rim blends it into the
    frog's outline. The model also likes to paint a shadow on the ground, which is magenta made darker.
    So the test is the colour's family, not its exact value: anything between violet and pink-magenta
    that is not grey goes. Nothing on the frog is in that family (its tongue and eraser are red-pink).
    The rim is eaten by growing the background one pixel, and the new edge fades from the outline's navy."""
    rgb = np.array(frame.convert("RGB")).astype(np.int16)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    high, low = rgb.max(axis=2), rgb.min(axis=2)
    spread = np.maximum(high - low, 1)
    # the hue, in degrees, for colours where blue or red leads (the only ones that can be magenta)
    hue = np.where(high == b, 240 + 60 * (r - g) / spread, np.where(high == r, (60 * (g - b) / spread) % 360, 120))
    back = (hue > 272) & (hue < 328) & (spread > 0.35 * high) & (high > 60)
    grown = back.copy()
    grown[1:, :] |= back[:-1, :]; grown[:-1, :] |= back[1:, :]; grown[:, 1:] |= back[:, :-1]; grown[:, :-1] |= back[:, 1:]
    colour = rgb.astype(np.uint8)
    colour[grown] = OUTLINE
    out = Image.fromarray(colour).convert("RGBA")
    out.putalpha(Image.fromarray(np.where(grown, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6)))
    return out


def grow(mask, steps):
    m = mask.copy()
    for _ in range(steps):
        g = m.copy()
        g[1:, :] |= m[:-1, :]; g[:-1, :] |= m[1:, :]; g[:, 1:] |= m[:, :-1]; g[:, :-1] |= m[:, 1:]
        m = g
    return m


def joined(seed, ink):
    """Everything in `ink` that is joined to `seed`."""
    keep = seed & ink
    while True:
        more = grow(keep, 1) & ink
        if (more == keep).all():
            return keep
        keep = more


def biggest(ink):
    """The largest single shape: the frog's body, without the loose marks around it."""
    left, best = ink.copy(), None
    while left.any():
        y, x = np.argwhere(left)[0]
        seed = np.zeros_like(ink); seed[y, x] = True
        shape = joined(seed, left)
        if best is None or shape.sum() > best.sum():
            best = shape
        left &= ~shape
    return best


def drop_strays(cells, reach=4, body_only=False):
    """Video models like to add little marks of their own (a tap mark, a spark) that last a few frames.
    Keep, in each frame, only the shapes that touch where something already was in the frame before:
    the frog and its question mark carry on from frame to frame, a mark that pops up from nowhere does not.
    With `body_only`, only the frog's body is followed: its question mark is left behind too."""
    out, before = [], None
    for cell in cells:
        alpha = np.array(cell.getchannel("A"))
        ink = alpha > 40
        if before is None:
            keep = biggest(ink) if body_only else ink
        else:
            keep = joined(grow(before, reach), ink)  # what touches the last frame's shapes, and all that is joined to it
        if (ink & ~keep).any():
            alpha = np.where(grow(keep, 2), alpha, 0).astype(np.uint8)
            cell = cell.copy()
            cell.putalpha(Image.fromarray(alpha))
        out.append(cell)
        before = keep
    return out


def plant(cells):
    """Slide each frame up or down so the lowest point of the frog stays on one line: the first frame's.
    For a jump: the frames keep the poses (crouch, stretch, land) and the game does the flying."""
    line = ink_box(cells[0])[3]
    out = []
    for cell in cells:
        moved = Image.new("RGBA", cell.size, (0, 0, 0, 0))
        moved.paste(cell, (0, line - ink_box(cell)[3]))
        out.append(moved)
    return out


def clip(pose, video, frames, fps, loop, name=None, span=None, planted=False, pick=None, body_only=False):
    """A short video on a magenta background: take every frame out, keep `frames` of them evenly spread
    over the video (or over `span`, a part of it in seconds; or exactly the frame numbers in `pick`),
    and cut the magenta away. All of it on this computer, at no cost."""
    with tempfile.TemporaryDirectory() as folder:
        subprocess.run(["ffmpeg", "-loglevel", "error", "-i", video, "-fps_mode", "passthrough", os.path.join(folder, "%04d.png")], check=True)
        files = sorted(os.listdir(folder))
        rate = len(files) / float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", video],
                                                 capture_output=True, text=True, check=True).stdout)
        first, last = (0, len(files) - 1) if not span else (round(span[0] * rate), min(len(files) - 1, round(span[1] * rate)))
        picked = pick or sorted(set(int(round(i)) for i in np.linspace(first, last, frames)))
        print(f"{len(files)} frames in the video, kept {picked}")
        # Every frame up to the last one kept is cut out, not only the kept ones: stray marks are found by
        # following the shapes from one frame to the next, and that needs neighbours, not frames far apart.
        every = [cut_magenta(Image.open(os.path.join(folder, files[i]))) for i in range(max(picked) + 1)]
    anchor = every[0]  # the first frame of the video is the still pose itself: it lines everything up, kept or not
    every = drop_strays(every, body_only=body_only)
    if planted:
        every = plant(every)
    return build(pose, [every[i] for i in picked], fps, loop, name, anchor=anchor)


def build(pose, cells, fps, loop, name=None, anchor=None):
    """From frames to img/anim/<name>.webp and its line in sheets.js.

    `anchor` is a frame that shows the still pose exactly (the first frame of what Higgsfield made, since
    that is the picture it was given). It tells where the still sits in a cell.
    Every frame is then cropped to one shared window, the smallest that holds all the frames:
    one shared window, not one per frame, or the frog would shake."""
    name = name or pose
    anchor = anchor or cells[0]
    if loop and len(cells) > 2:
        cells = cells[:-1]  # a loop ends on its first picture again: showing both would stall the loop for a beat

    still = Image.open(os.path.join(IMG, "frog-plain", pose + ".webp")).convert("RGBA")
    sx0, sy0, sx1, sy1 = ink_box(still)          # the drawing inside the still picture
    fx0, fy0, fx1, fy1 = ink_box(anchor)         # the same drawing inside the anchor frame
    scale = (fy1 - fy0) / (sy1 - sy0)            # frame pixels for one still pixel
    # the still picture as a rectangle in the frame, lined up on the feet: bottom edge, and the middle left to right
    left = (fx0 + fx1) / 2 - ((sx0 + sx1) / 2) * scale
    top = fy1 - sy1 * scale
    still_w, still_h = still.width * scale, still.height * scale

    boxes = [ink_box(c) for c in cells]
    pad = 4
    x0 = max(0, min(b[0] for b in boxes) - pad); y0 = max(0, min(b[1] for b in boxes) - pad)
    x1 = min(cells[0].width, max(b[2] for b in boxes) + pad); y1 = min(cells[0].height, max(b[3] for b in boxes) + pad)
    cells = [c.crop((x0, y0, x1, y1)) for c in cells]
    w, h = cells[0].size
    box = [(left - x0) / w, (top - y0) / h, still_w / w, still_h / h]

    if scale > 1.02:  # sharper than the still: bring it down to the still's size, lighter to download
        w, h = round(w / scale), round(h / scale)
        cells = [c.resize((w, h), Image.LANCZOS) for c in cells]

    cols = math.ceil(math.sqrt(len(cells)))
    rows = math.ceil(len(cells) / cols)
    out = Image.new("RGBA", (cols * w, rows * h), (0, 0, 0, 0))
    for i, c in enumerate(cells):
        out.paste(c, (i % cols * w, i // cols * h))
    os.makedirs(os.path.join(IMG, "anim"), exist_ok=True)
    path = os.path.join(IMG, "anim", name + ".webp")
    out.save(path, quality=74, method=6)  # the frames are flat colours: this weighs a third less and looks the same

    listed = json.load(open(LIST)) if os.path.exists(LIST) else {}
    listed[name] = {"src": f"img/anim/{name}.webp", "frames": len(cells), "cols": cols, "rows": rows,
                    "fps": fps, "loop": loop, "box": [round(v, 4) for v in box]}
    if name != pose:
        listed[name]["still"] = pose  # this animation stands on another pose's still picture
    json.dump(listed, open(LIST, "w"), indent=2)
    write_sheets_js(listed)
    print(f"img/anim/{name}.webp  {len(cells)} frames of {w}x{h}, {cols}x{rows}, {os.path.getsize(path) // 1024} KB, "
          f"still x{scale:.3f}, box {listed[name]['box']}")
    return cells


def write_sheets_js(listed):
    lines = [f"    {json.dumps(name)}: {json.dumps(entry)}," for name, entry in listed.items()]
    body = "\n".join(lines)
    open(os.path.join(HERE, "..", "..", "sheets.js"), "w", encoding="utf-8").write(f"""/* Fermi Frog: the frog's animations, one per pose that has one.
   Written by design/anim/make.py. Do not edit by hand: run the script again.
   A pose that is not listed here stays a still picture. What each field means is in sprites.js. */
(function (root) {{
  'use strict';
  root.FERMI_SHEETS = {{
{body}
  }};
}})(typeof globalThis !== 'undefined' ? globalThis : this);
""")


# ---------- a preview, to judge the animations without playing ----------

def preview():
    """design/anim/preview.gif: the frog on its lily pad, thinking, then catching, then jumping, as in the game.
    It copies what the game does (the same places and sizes as style.css, the same arithmetic as sprites.js)."""
    from PIL import ImageDraw
    listed = json.load(open(LIST))
    W, H, FEET_AT, STEP = 375, 470, 0.74, 70
    pond = Image.open(os.path.join(IMG, "world", "pond.webp")).convert("RGB")
    zoom = H / pond.height * 1.25
    pond = pond.resize((round(pond.width * zoom), round(pond.height * zoom)), Image.LANCZOS)
    back = pond.crop(((pond.width - W) // 2, pond.height - H, (pond.width - W) // 2 + W, pond.height))
    pad = Image.open(os.path.join(IMG, "perch", "pad.webp")).convert("RGBA")
    pad = pad.resize((round(W * 0.46), round(pad.height * W * 0.46 / pad.width)), Image.LANCZOS)

    def cut(name):
        sh = listed[name]
        im = Image.open(os.path.join(HERE, "..", "..", sh["src"])).convert("RGBA")
        w, h = im.width // sh["cols"], im.height // sh["rows"]
        return [im.crop((i % sh["cols"] * w, i // sh["cols"] * h, i % sh["cols"] * w + w, i // sh["cols"] * h + h)) for i in range(sh["frames"])]
    frames_of = {name: cut(name) for name in listed}

    def picture(name, ms, lift=0.0):
        sh = listed[name]
        index = int(ms / 1000 * sh["fps"] + 1e-9)
        index = index % sh["frames"] if sh["loop"] else min(index, sh["frames"] - 1)
        pose = sh.get("still", name)
        still = Image.open(os.path.join(IMG, "frog-plain", pose + ".webp"))
        bw = 187.5 if pose == "catch" else 150            # the frog's width on a phone, from style.css
        bh = bw * still.height / still.width
        bx, by = W / 2 - bw / 2, H * FEET_AT - 0.94 * bh
        img = back.copy()
        img.paste(pad, (round(W / 2 - pad.width / 2), round(H * FEET_AT - 0.38 * pad.height)), pad)
        squeeze = 1 - 0.45 * lift / 0.34
        sw, sh_h = bw * (0.62 if pose == "catch" else 0.80) * squeeze, bh * 0.09 * squeeze
        cx = bx + bw * (0.67 if pose == "catch" else 0.5)
        shadow = Image.new("RGBA", img.size, (0, 0, 0, 0))
        ImageDraw.Draw(shadow).ellipse([cx - sw / 2, by + bh * 0.995 - sh_h, cx + sw / 2, by + bh * 0.995], fill=(10, 16, 34, round(87 * (0.5 + 0.5 * squeeze))))
        img.paste(shadow, (0, 0), shadow)
        x, y, w, h = sh["box"]
        cell = frames_of[name][index].resize((round(bw / w), round(bh / h)), Image.LANCZOS)
        img.paste(cell, (round(bx - x / w * bw), round(by - y / h * bh - lift * bh)), cell)
        return img.crop((20, 110, 355, 470))

    def hop(k):  # the "hop" of style.css: on the ground until 28%, highest at 55%, down at 82%
        if k <= 0.28 or k >= 0.82:
            return 0.0
        u = (k - 0.28) / 0.27 if k < 0.55 else (0.82 - k) / 0.27
        return 0.34 * (1 - (1 - u) ** 2)

    film = [picture("think", t) for t in range(0, round(listed["think"]["frames"] / listed["think"]["fps"] * 1000), STEP)]
    if "catch" in listed:
        film += [picture("catch", t) for t in range(0, 720, STEP)]
    if "jump" in listed:
        film += [picture("jump", t, hop(t / 900)) for t in range(0, 910, STEP)]
    film += [picture("think", t) for t in range(0, 1400, STEP)]
    out = os.path.join(HERE, "preview.gif")
    film[0].save(out, save_all=True, append_images=film[1:], duration=STEP, loop=0, optimize=True)
    print(f"preview.gif  {len(film)} pictures, {os.path.getsize(out) // 1024} KB")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Animations for Fermi Frog. See the top of this file.")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("key").add_argument("poses", nargs="+")
    sub.add_parser("preview")
    for command in ("clip", "sheet"):
        one = sub.add_parser(command)
        one.add_argument("pose", help="the still pose the animation starts from")
        one.add_argument("file", help="what Higgsfield made")
        one.add_argument("--name", help="the pose this animation plays for, when it is not the still's own")
        one.add_argument("--frames", type=int, default=12)
        one.add_argument("--fps", type=int, required=True)
        one.add_argument("--loop", action="store_true", help="plays for ever; without it, plays once")
        if command == "clip":
            one.add_argument("--span", help="a part of the video, in seconds: 0.2:1.4")
            one.add_argument("--pick", help="exactly these frames of the video, counted from 0: 14,20,24,28")
            one.add_argument("--planted", action="store_true", help="keep the frog on the ground in every frame")
            one.add_argument("--body", action="store_true", help="keep only the frog's body: no question mark, no loose marks")
    args = parser.parse_args()
    if args.command == "key":
        for pose in args.poses:
            key(pose)
    elif args.command == "preview":
        preview()
    elif args.command == "sheet":
        sheet(args.pose, args.file, args.frames, args.fps, args.loop, args.name)
    else:
        span = tuple(float(v) for v in args.span.split(":")) if args.span else None
        pick = [int(v) for v in args.pick.split(",")] if args.pick else None
        clip(args.pose, args.file, args.frames, args.fps, args.loop, args.name, span, args.planted, pick, args.body)
