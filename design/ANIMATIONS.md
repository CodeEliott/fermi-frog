# Animations for Fermi Frog

The frog used to change pose by swapping one still picture for another. This file is the plan to make it move,
and the rules that keep the cost low. Prices are real quotes from Higgsfield, asked on 20 Nov 2026 (Plus plan).

## The idea in one picture

```text
 what the frog DOES (blink, tongue, cheer, panic)  ──▶ Higgsfield, a 4-second clip: 2 to 4 credits per animation
 how things MOVE (hop, squash, perch dips, dust)   ──▶ code: free, and it keeps the pixels crisp
 going from one place to the next                  ──▶ Higgsfield, a clip from one scene to the next: 4 credits
```

```text
 a still pose             design/anim/make.py key      Higgsfield              design/anim/make.py clip      the game
 img/frog-plain/think ──▶ frog on flat magenta,    ──▶ Seedance 2.0 Mini   ──▶ pick frames, cut the      ──▶ sprites.js flips
                          with room to move            animates the picture    magenta, line up with         through the frames
                          (design/anim/in/)            (design/anim/raw/)      the still, save small
                                                                               (img/anim/ + sheets.js)
```

## What each route costs

| Route | Credits | Use |
|---|---|---|
| `seedance_2_0_mini`, 4 seconds, square, `--resolution 720p` (comes back 960 px wide) | 4 | poses seen for long: idle, cheer |
| `seedance_2_0_mini`, the same at `480p` (comes back 640 px wide, a little softer) | 2 | quick actions: catch, jump |
| `autosprite`, `--video_tier turbo`: picture in, finished sheet out | 2 | failed twice on 20 Nov 2026 (no charge). Try one again before a big batch: `make.py sheet` is ready for it |
| `autosprite`, `pro` / `max` | 3 / 14 | not tried |
| `seedance_2_5`, 4 seconds at 720p | 28 | never |
| `flux_3_video`, 5 seconds | 30 | never |
| `image_background_remover` | 1 per frame, so 12 per animation | never: `make.py` cuts the magenta on this computer for free |

A failed job is not charged.

## Rules that protect the credits

1. Ask the price first: `higgsfield generate cost <model> ...` takes the same options as `create`, and creates nothing.
2. One animation first, look at it in the game, then the rest. Never a batch before one has been judged.
3. Two retries per animation at most, then keep the best.
4. No sound (`--with_sound false`, `--generate_audio false`). No big models. No per-frame background removal.
5. At 200 credits spent in all, stop and ask Eliott.

## What "great" means

- The same frog in every frame: no drifting colours or shape.
- Chunky pixels at phone size: 8 to 12 frames, 8 to 12 a second. More frames add shimmer, not smoothness.
- A loop closes without a visible jump, and the feet stay planted on the perch.
- The catch stays under 0.7 seconds: the game must not slow down.
- Each sheet under 150 KB. Players who ask their device for less motion keep the stills.

## How to make one

```bash
python3 design/anim/make.py key think
```

```bash
higgsfield generate create seedance_2_0_mini --start-image design/anim/in/think.png --end-image design/anim/in/think.png --prompt "$(cat design/anim/in/think.idle.txt)" --duration 4 --resolution 720p --aspect_ratio 1:1 --generate_audio false --wait --json
```

```bash
python3 design/anim/make.py clip think design/anim/raw/think-idle.mp4 --fps 3 --loop --pick 0,8,16,24,32,40,48,56,60,80,88,96
```

```bash
python3 design/anim/make.py preview
```

- The words sent with each picture are kept next to it (`design/anim/in/*.txt`). They describe **one** motion,
  then lock everything else: the camera, the size, the direction the frog faces, the magenta, the notepad.
- A loop (idle, cheer) gets the same picture as first and last frame. A one-time action (catch, jump) only the first.
- Start from the pose where the action is most itself: the catch starts with the tongue already out.
- The model fills 4 seconds whatever the action. Keep only the part that is the action (`--span`, or `--pick` frame by frame).
- It adds things nobody asked for: a tap mark, a shadow on the ground, a blurry frame at take-off. `make.py` removes
  the shadow and the loose marks; a blurry frame is simply not picked.
- `make.py preview` writes `design/anim/preview.gif`: the frog on its lily pad, to judge without playing.

## The list

| Step | What | How | Credits |
|---|---|---|---|
| 0 | The sprite player: `sprites.js`, `sheets.js`, and the frog layer in `app.js` | code | 0 |
| 1 | **Test:** idle, catch, jump. Done on 20 Nov 2026 | clips | 8 spent |
| 2 | The other frog actions: ponder, cheer, panic, write, sleep | clips | 10 to 20, more with retries |
| 3 | Squash on landing, the perch dips, ripples, floating dust, twinkling stars | code | 0 |
| 4 | One climb clip as a test (pond to reeds), then the other four if it fits the pixel look | Seedance Mini | 4, then 16 to 48 |
| 5 | Extras: result poses, golden fly sparkle, logo | clips or code | 14 to 50 |

About 60 credits if things go well, 200 at the very most.

## The frog belongs to the scene

Done on 20 Nov 2026, with no new art: in the scenes the frog has no white sticker border
(`design/frog/cut.py` saves it to `img/frog-plain/`) and it casts a shadow on its perch (`style.css`).
Animations start from `img/frog-plain/`, never from the sticker.

## Log

| Date | What | Credits | Result |
|---|---|---|---|
| 20 Nov 2026 | AutoSprite, idle, twice (512 px cells, then the default 256) | 0 | failed on Higgsfield's side both times, not charged |
| 20 Nov 2026 | Idle from `think`, clip at 720p | 4 | kept: a slow blink, then a sideways squint. A stray tap mark, avoided by the choice of frames |
| 20 Nov 2026 | Catch from `catch`, clip at 480p | 2 | kept: the tongue snaps back, the frog chews, its cheeks puff. A little softer than its still |
| 20 Nov 2026 | Jump from `think`, clip at 480p | 2 | kept after trimming: the model floats for two seconds and paints its own shadow |
