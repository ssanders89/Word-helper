# Pictures library

This folder is the `PICTURES_DIR` the app reads from (mounted as a Docker
volume in production). Create one subfolder per letter, and put pictures in
it whose names start with that letter:

```
pictures/
  A/
    apple.jpg
    ant.png
  B/
    ball.jpg
    banana.jpg
  ...
```

Rules the app follows:

- A folder is used only if its name is a single letter (`A`-`Z`, either
  case) and it contains at least one image file
  (`.jpg .jpeg .png .gif .webp .bmp .avif`).
- The **folder name is the answer letter** -- the app never inspects the
  picture itself, so it trusts that everything inside `A/` genuinely starts
  with A. Keeping that true is up to you.
- The **word for each picture is taken from its filename** (extension
  stripped, `_`/`-` turned into spaces), so `ice_cream.jpg` becomes the word
  "ice cream". Name your files accordingly.

This `pictures/` folder is gitignored except for this README -- add your own
images locally or mount a real library over it in Docker.
