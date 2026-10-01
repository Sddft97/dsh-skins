# Notices - lucy-nightsignal

## Artwork

Every raster asset under `assets/` is AI-generated and then processed locally.

- Model / pipeline: `volcengine/doubao-seedream-5.0-pro` through the OFOX image API, then local post-processing
  (scenes: a phosphor duotone pass with halation, then baked scanlines, a vignette and grain; portraits: chroma-key matting (key estimation, alpha ramp, unmix, despill, alpha floor, connected-component despeckle)).
- No photograph, cosplay image, or other third-party picture was used as model input;
  the character was described in text.

- Portraits: AI-generated full-body art drawn on a flat magenta plate and keyed
  locally; the same assets are reused by the `crt-phosphor` skin in this repository.
- Scenes: this project's own AI-generated night city (rooftop at blue hour, neon
  skyline in rain haze).

## Character and rights

- Depicted character: **Lucy / Lucyna Kushinada** from **Cyberpunk: Edgerunners**.
- Rights holders: **Studio TRIGGER** and **CD PROJEKT RED** (with their respective
  licensors and successors).
- **Personal, non-commercial use only.** Unofficial fan artwork: not affiliated with,
  endorsed by, sponsored by, or licensed from the rights holders above, the
  maintainers of this repository, or the DeepSeek Harness project.
- All rights to the character and the source work remain with their rights holders.
  If a rights holder objects, this skin should be removed.

## Licence

The skin's own files (`skin.json`, `skin.css`, `patches.css`, and `hooks.mjs` where
present) are released under **CC BY-NC-SA 4.0** (see the repository `LICENSE`); that
covers only the parts authored here and grants no rights to the character or the
source work.
