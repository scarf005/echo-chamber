# Agent Mandatory Rule

- NEVER remove existing `/// <reference lib="deno.ns" />`
- **MUST** Commit after given task is finished
- NEVER use `use*` hooks when preact signals can do the job/
- use ROT.js (https://ondras.github.io/rot.js/manual/,
  https://ondras.github.io/rot.js/doc/) and jsr (e.g
  [@std/random](https://jsr.io/@std/random))
- follow
  https://gist.githubusercontent.com/scarf005/2056c322e428f23d3623144bb3f684c6/raw/bb18db6da4510efc94f6b8a9f90a0187d35a8b39/AGENTS.md
- credit audio and SFX (with license) in both README and CREDIT modal in options
  MODAL
  - under format `{TITLE} by {ARTIST} ({LICENSE SPDX})` in clickable link
- For Lingui in this repo, follow the reference project and use generated IDs
  only; do not add explicit message IDs.
