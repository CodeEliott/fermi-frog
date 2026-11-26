# Gemini art for Fermi Frog

Every picture in the game comes from Gemini. The originals are kept here, in `design/`.
Two scripts turn them into the game's pictures in `img/`:

```text
python3 design/frog/split.py   splits the supporter sheet, whose stickers sit too close, one sheet per frog
python3 design/frog/cut.py     cuts the sticker sheets (white background)
python3 design/world/make.py   prepares the scenes, the perches, the icon and the share picture
```

## What is in the game

| Original | Becomes | Used for |
|---|---|---|
| `frog/sheet.webp` | think, cheer, ponder, panic, write, wink | the basic poses |
| `frog/catch-sheet.webp` | catch | the tongue catches the fly |
| `frog/jump-sheet.png` | jump | the climb after a catch |
| `frog/moods-sheet.webp` | sleep, climb, splash, astronaut | after today's round; the final score |
| `frog/moods2-sheet.webp` | shrug, proud, champion | the final score; the crown for first place |
| `frog/flies-sheet.png` | fly and golden fly, wings up and down | the fly; golden with the narrowest range |
| `frog/badges-sheet.webp` | six zone badges | the zone label, the result medal, the tree |
| `frog/logo-sheet.png` | logo | the start screen |
| `world/pond, reeds, trunk, canopy, clouds, moon` | six scenes | one scene per zone of height |
| `frog/supporters-sheet.png`, `frog/supporters2-sheet.png` | scientist, wizard, pirate, detective; astronomer, chef, knight, explorer | the supporter frogs (Higgsfield, Nano Banana 2; `split.py` puts each on its own sheet first) |
| `world/pond-autumn, -winter, -blossom` and `desktop/pond-*-wide` | the pond in three more seasons, tall and wide | a supporter choice in the profile (Higgsfield, Nano Banana 2) |
| `world/perches-sheet.png` | pad, leaf, branch, cloud | what the frog stands on |
| `ui/icon.png` | icon | the browser tab and the phone home screen |
| `ui/calc-sheet.png` | calc-board, calc-icon, four blank keys | the calculator: its board, the key that opens it, and its keys; the game writes the signs (Higgsfield, Nano Banana 2; prompt in `ui/calc.txt`) |
| `ui/share.webp` | share picture | the preview when someone posts the link |

Not used any more, kept as a record: `world/v1-pond.webp` and `world/v1-sky.webp` (the first two
backgrounds), and `archive/world-drawn.js` (the first world, drawn in code).

Every frog pose is saved twice by `cut.py`: in `img/frog/` as a sticker with its white border (the profile
and the leaderboard), and in `img/frog-plain/` without the border (the scenes, where the frog must look
like part of the world). No new art is needed for that: the border is cut off the same sheet.

The final pose depends on the zone: splash (pond), shrug (reeds), climb (trunk), proud (canopy),
wink (clouds), astronaut (moon).

## How to ask for more

1. **Attach `design/frog/sheet.webp` to every request.** It keeps the frog and the pixel style the same.
2. For a new scene, attach `design/world/pond.webp` too, so the scenes match.
3. Ask for the largest size Gemini offers. Do not crop or edit the result.
4. Drop the picture in the chat. Claude cuts it and wires it into the game.

Three kinds of picture, three looks:

| Kind | Look | Background |
|---|---|---|
| The frog, bugs, badges, logo | sticker with a white border | pure white |
| Scenes | full picture, edge to edge, portrait 9:16 | none |
| Things the frog stands on | plain pixel art, no white border | flat magenta (#FF00FF) |

## The opening lines that worked

For a sticker of the frog:

```text
Use the attached sticker sheet as the reference for the character and the art style.
Same frog: chubby, bright green with a pale green belly, small round glasses, red-pink mouth.
Same chunky pixel art, same pixel size, thick dark navy outline, flat saturated colours.
Every figure is a die-cut sticker with an even white border. Pure white background,
no shadow, no text, no watermark. Landscape picture, 16:9.
Leave a wide white gap between the poses: no sticker may touch another.
```

For a scene:

```text
Pixel art game background, portrait 9:16, edge to edge, no border.
Same art style, same pixel size and same colour family as the attached pond background.
Crisp pixels, no blur, no smooth gradients: use flat colour bands and dithering.
Soft, slightly muted colours. No characters, no animals, no text, no logo, no frame.
Keep the middle of the picture calm and uncluttered: a character will stand in the centre,
with its feet three quarters of the way down.
```

For an object without a border:

```text
Pixel art game objects. Same chunky pixel size and thick dark navy outline as the attached
frog sticker sheet, flat colours. NO white sticker border around the objects.
Flat solid magenta background (#FF00FF) everywhere, no shadow on the background, no gradient,
no text, no characters. Wide magenta gaps between the objects.
```

## One pose that could still help (optional)

The catch is two beats today: the tongue catches the fly, then the frog jumps. A "gulp" between
them would make three.

```text
Use the attached sticker sheet as the reference for the character and the art style.
Same frog: chubby, bright green with a pale green belly, small round glasses, red-pink mouth.
Same chunky pixel art, same pixel size, thick dark navy outline, flat saturated colours.
One die-cut sticker with an even white border. Pure white background, no shadow, no text.

The frog sits upright with its mouth closed and its cheeks puffed full, eyes closed in delight,
one tiny grey insect wing sticking out of the corner of its mouth, one hand patting its belly.
```

## What does not come from Gemini

- **Fonts.** The game uses one free pixel font from Google Fonts, Jersey 20. The title is your logo picture.
- **Animations.** Claude moves the still pictures in code: the hop, the fly's flight, the scene
  that slides, the "+50" that pops up.
- **Buttons, the scale, the panels.** They are drawn in code, so they stay sharp at every size.
