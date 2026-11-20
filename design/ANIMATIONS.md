# Animations for Fermi Frog: what we need from Higgsfield

Today every picture in the game is still. The frog changes pose by swapping one sticker for another.
This file lists the moving pictures the game needs, in the order to make them.

Written on 19 Nov 2026. The model names come from the Higgsfield catalog on that day: check it again before starting.

## The idea in one picture

```text
 a still we already have        Higgsfield                 Claude                    the game
 (img/frog/think.webp)   --->   short video clip    --->   cuts it into       --->   plays the frames
 used as FIRST and LAST         4 to 5 seconds,            8 to 16 frames,           like a flip book
 frame of the clip              magenta background         pixel-snapped
```

The trick for a clean loop: give the same still as the **start frame and the end frame**. The clip then ends
exactly where it began, and the game can repeat it for ever without a jump.

## Rules for every clip

| Rule | Why |
|---|---|
| Start from a picture in `img/` or `design/`, never from text alone | the frog and the pixel style stay the same |
| Frog clips start from `img/frog-plain/`, the frog **without** its white border | that is the frog the scenes show; a border would have to be cut off every frame |
| Camera locked: no zoom, no pan, no shake | frames must line up when they replace each other |
| The frog keeps its size and its feet stay on the same line | or the frog "swims" on its perch |
| Frog and bug clips: flat **magenta** background (#FF00FF), no shadow, no ground | the frog is green, so a green screen would eat it; `design/world/make.py` already cuts magenta |
| No sound (`generate_audio` off) | cheaper; sounds are a separate, later list |
| Square (1:1) for the frog and bugs, 16:9 for the scenes | same shapes as the stills |
| Keep the chunky pixels: say "pixel art, hard edges, no blur, no smooth shading" | video models like to smooth things |
| Most models make 4 seconds at least | ask for the action 2 or 3 times in one clip; Claude keeps the best cycle |

After the clip arrives, Claude does the rest: pick the frames (8 to 12 a second, the pixel-art feel), remove the
background, shrink to the sprite size without blur, and wire them in. Players who ask their device for less motion
keep the stills.

## Models to try first

| Need | Model | Why |
|---|---|---|
| Loops and actions | Seedance 2.5 (`omni_reference`) or MiniMax H3 | both take a start frame **and** an end frame |
| Scene to scene | FLUX 3 Video | start frame, end frame, and frames in between |
| Very short actions | Grok Imagine Video 1.5 Lite | the only one that goes down to 1 second (start frame only) |
| Cutting the background | Video Background Remover | a backup if the magenta does not cut cleanly |

## The list

**Start with the three marked TEST.** They tell us if a video model can keep the pixel look at all.
If they fail, the fallback is Gemini drawing 4 to 6 frames per action as a sticker sheet, like the stills.

### 1. The frog in play (needed: these are on screen most of the time)

| # | Clip | Starts from | What moves | Loop | Plays |
|---|---|---|---|---|---|
| 1 | **Idle** TEST | `frog/think` | blinks, breathes, taps the pencil on the pad | yes | while a question waits |
| 2 | Ponder | `frog/ponder` | looks left and right, the question mark bobs | yes | while the player drags the scale |
| 3 | **Catch** TEST | `frog/think` to `frog/catch` | mouth opens, tongue shoots to the upper right, snaps back | no | when the fly is caught |
| 4 | Gulp (new) | `frog/catch` to `frog/think` | swallows, cheeks puff, a small happy blink | no | just after the catch |
| 5 | **Jump** TEST | `frog/jump` | crouch, spring up, legs stretch, land | no | the climb after a catch |
| 6 | Cheer | `frog/cheer` | arms pump, confetti falls | yes | after the climb |
| 7 | Panic | `frog/panic` | shakes, sweat drops fly | yes | when the fly gets away |
| 8 | Write | `frog/write` | pencil scribbles, a blink | yes | start screen |
| 9 | Sleep | `frog/sleep` | chest rises, the Zs float up | yes | start screen after today's round |

### 2. The climb between places (this fixes "the transitions are poor" for good)

Today two stills slide and cross-fade. A real clip that travels from one place to the next is better.
Each clip: start frame = the lower scene, end frame = the upper scene, the camera rises, about 1.5 seconds used.

| # | From | To | What we see on the way |
|---|---|---|---|
| 10 | pond | reeds | water falls away, reeds rush past |
| 11 | reeds | trunk | reed tops, then bark |
| 12 | trunk | canopy | bark, first branches, leaves |
| 13 | canopy | clouds | leaves thin out, sky, clouds |
| 14 | clouds | moon | clouds drop away, stars, the moon comes close |

### 3. The world breathes (nice: 16:9 loops, same start and end frame)

| # | Scene | What moves |
|---|---|---|
| 15 | pond | ripples, a lily pad drifts, reeds sway |
| 16 | reeds | reeds sway, a dragonfly passes |
| 17 | trunk | a leaf falls, an insect walks up the bark |
| 18 | canopy | light rays shift, leaves rustle |
| 19 | clouds | clouds drift sideways |
| 20 | moon | stars twinkle, slow dust |

### 4. The frog belongs to the scene (the "it looks stuck on" problem)

The frog was a sticker with a white border, pasted over a painted scene. That is why it looked apart.
Two of the three fixes are in the game since 20 Nov 2026, with no new art:

| Fix | State |
|---|---|
| The frog loses its white border in the scenes and keeps only its navy outline | done: `design/frog/cut.py` saves it to `img/frog-plain/` |
| A shadow where the frog touches its perch | done: drawn in `style.css`, it shrinks while the frog jumps |
| Each perch reacts | to make: 4 short clips. The lily pad dips and ripples, the leaf bends, the branch shakes, the cloud squashes |

### 5. Extras (last)

| # | Clip | Notes |
|---|---|---|
| 21 | Golden fly | a sparkle that loops on the golden fly |
| 22 | Fly escapes | a loop-the-loop as it leaves the screen |
| 23 | Logo | letters drop in, the frog blinks; plays once on the start screen |
| 24 to 30 | Result poses | splash, shrug, climb, proud, wink, astronaut, champion: one short loop each |

## How many, and in what order

| Step | Clips | Result |
|---|---|---|
| Test | 1, 3, 5 | we know if the pixel look survives |
| Play | 2, 4, 6 to 9 | the frog is alive in every moment of a round |
| Climb | 10 to 14 | real transitions between places |
| World | 15 to 20, and the 4 perch clips | the scene moves and reacts |
| Extras | 21 to 30 | polish |

That is 34 clips in all, 3 for the test. Expect two or three tries per clip.

## For Claude, on the game's side

- A small sprite player: frames in one strip, `steps()` in CSS, one strip per pose, preloaded like the stills.
- Scene loops as muted, looping video: the server's Content-Security-Policy needs `media-src 'self'`.
- The fly's flight to the tongue is timed in `app.js` (`press`): the catch clip must reach full tongue at a known frame.
- Size budget: about 150 KB per frog strip, 400 KB per scene loop. Check on a phone before adding more.
