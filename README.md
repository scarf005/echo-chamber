# Vite + Deno + Preact + TypeScript

## Running

You need to have Deno v2.0.0 or later installed to run this repo.

Start a dev server:

```
$ deno task dev
```

## Deploy

Build production assets locally:

```
$ deno task build
```

Every push to `main` also triggers GitHub Actions deployment to itch.io via
`KikimoraGames/itch-publish@v0.0.3`. The workflow uses the `deploy` environment
and expects `BUTLER_API_KEY` and `ITCH_USERNAME` to be defined there. The
itch.io game id defaults to the repository name, so this repository publishes to
`echo-chamber` on the configured account.

## Asset Credits

### Music

- `[SCP-x2x (Unseen Presence) by Kevin MacLeod (CC-BY-4.0)](https://incompetech.com/music/royalty-free/index.html?isrc=USUAN2000008)`

### SFX

- `src/assets/audio/underwater-deep-water-loop.mp3`
- [Underwater Deep Water Loop by Department64 (CC-BY-4.0)](https://freesound.org/people/Department64/sounds/651743/)
- `src/assets/audio/underwater-blub-03.mp3`
- [Underwater Blub 03 by Department64 (CC-BY-4.0)](https://freesound.org/people/Department64/sounds/651744/)
- `src/assets/audio/reload-gulfstreamav.mp3`
- [Reload by gulfstreamav (CC0-1.0)](https://freesound.org/people/gulfstreamav/sounds/841162/)
- `src/assets/audio/death-bang-explosion-metallic.mp3`
- [Bang/Explosion Metallic by Werra (CC0-1.0)](https://freesound.org/people/Werra/sounds/244394/)
- `src/assets/audio/underwater-explosion-1.mp3`
- [UnderWater_Explosion1 by Akkaittou (CC-BY-4.0)](https://freesound.org/people/Akkaittou/sounds/819743/)
- `src/assets/audio/underwater-explosion-2.mp3`
- [UnderWater_Explosion2 by Akkaittou (CC-BY-4.0)](https://freesound.org/people/Akkaittou/sounds/819744/)
- `src/assets/audio/underwater-explosion-3.mp3`
- [UnderWater_Explosion3 by Akkaittou (CC-BY-4.0)](https://freesound.org/people/Akkaittou/sounds/819745/)
- `src/assets/audio/underwater-explosion-far.mp3`
- [UnderWater_ExplosionFar by Akkaittou (CC-BY-4.0)](https://freesound.org/people/Akkaittou/sounds/819746/)
- `src/assets/audio/sonar-tuned-to-f.mp3`
- [Sonar (tuned to F).wav by kwahmah_02 (CC-BY-3.0)](https://freesound.org/people/kwahmah_02/sounds/268835/)
- `src/assets/audio/sonar-contact-kizilsungur.mp3`
- [Sonar.wav by KIZILSUNGUR (CC0-1.0)](https://freesound.org/people/KIZILSUNGUR/sounds/70299/)
- `src/assets/audio/sonar-contact-digital.mp3`
- [sonar.wav by digit-al (CC0-1.0)](https://freesound.org/people/digit-al/sounds/90340/)

### Font

- `[IBM 3270 by Ricardo Banffy and contributors (BSD-3-Clause)](https://github.com/rbanffy/3270font)`
- License file: `src/assets/fonts/LICENSE.txt`
