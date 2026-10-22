# Acoustic guitar sound bank attribution

`acoustic-guitar.json` contains a 16-note subset of the **FluidR3_GM Acoustic Guitar (steel)** MP3 renders distributed by Benjamin Gleitzman's [midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts).

## Source and changes

- Upstream revision: [044fab8e1456bfafc5776e86dfd6bb8697149aef](https://github.com/gleitz/midi-js-soundfonts/tree/044fab8e1456bfafc5776e86dfd6bb8697149aef).
- Source directory: [FluidR3_GM/acoustic_guitar_steel-mp3](https://github.com/gleitz/midi-js-soundfonts/tree/044fab8e1456bfafc5776e86dfd6bb8697149aef/FluidR3_GM/acoustic_guitar_steel-mp3).
- Notes: MIDI 40 to 85 at three-semitone intervals (E2, G2, Bb2, Db3, E3, G3, Bb3, Db4, E4, G4, Bb4, Db5, E5, G5, Bb5, Db6).
- Stringnote selected this subset and packaged the original, unchanged MP3 bytes as base64 data URIs in JSON. Playback resamples these notes for intermediate pitches, schedules guitar voicings and adds its own dynamics.
- MP3 files were retrieved from the jsDelivr mirror at the pinned revision and verified against the upstream Git blob SHA-1 listed below.

These files are SoundFont note renders. The original FluidR3 README describes a mixture of edited public-domain samples and recordings by Frank Wen and collaborators. It does not specify the recording provenance of this individual guitar preset, so no claim is made that these are newly recorded studio guitar notes.

## Rendered sample license and credit

The pinned upstream [README](https://github.com/gleitz/midi-js-soundfonts/blob/044fab8e1456bfafc5776e86dfd6bb8697149aef/README.md) identifies its Fluid Soundfont renders as **Creative Commons Attribution 3.0 United States**.

Credit: **FluidR3 SoundFont by Frank Wen and contributors; MIDI.js SoundFont MP3 renders by Benjamin Gleitzman / midi-js-soundfonts. Subset packaging and playback arrangement by Stringnote.**

- License summary: [CC BY 3.0 US](https://creativecommons.org/licenses/by/3.0/us/).
- Complete license: [CC BY 3.0 US legal code](https://creativecommons.org/licenses/by/3.0/us/legalcode).

The sample license applies to the included sound bank. It does not place the application source code under Creative Commons. No endorsement by the original creators is implied.

## Original FluidR3 README and MIT license

The original FluidR3 README and COPYING are preserved by the [PianoBooster fluid-soundfont project](https://github.com/pianobooster/fluid-soundfont). Their text is included below.

### Original README

Fluid (R3) SoundFont

Copyright (c) 2000-2002, 2008 Frank Wen <getfrank@gmail.com>

I hereby release Fluid under the MIT license, as described in COPYING.


Thanks to Toby Smithe for helping to get Fluid included in Ubuntu.

This package, of course, is the original Release 3 of Fluid.  


Fluid was constructed in part from samples found in the public domain that I
edited/cleaned/remixed/programmed and largely from recordings of my own and
in conjunction with the people below who helped along the way:

Suren M. Seron
Scott Hanan
Steve Aupperle
Chris Gillman
Alex Taubr
Chris Prola
Andrew Klenk
Winfried Hubbe 
Dylan
Tim
Gort
Uros Katic 
Ethan Winer (http://www.ethanwiner.com) 


It's obviously been a few years since the project, but its nice to see that
people are still enjoying my work and getting good use out of it.  As always,
I'd like to hear some work done with Fluid so email me, or just email me to
say hello and tell me what is going on in the computer musician world.
Who knows, maybe I'll kick start this project again? ;)

### Original COPYING

Copyright (c) 2000-2002, 2008 Frank Wen <getfrank@gmail.com>

Permission is hereby granted, free of charge, to any person
obtaining a copy of this software and associated documentation
files (the "Software"), to deal in the Software without
restriction, including without limitation the rights to use,
copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.

## midi-js-soundfonts repository license

The upstream repository also includes the following [LICENSE.txt](https://github.com/gleitz/midi-js-soundfonts/blob/044fab8e1456bfafc5776e86dfd6bb8697149aef/LICENSE.txt). Its README's explicit sample licensing is retained separately above.

Copyright (C) 2012 Benjamin Gleitzman (gleitz@mit.edu)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Verified upstream file identities

| Note | MIDI | MP3 bytes | Upstream Git blob SHA-1 |
| --- | ---: | ---: | --- |
| E2 | 40 | 17057 | `ff8f3f91e7fdaf3fdbb29316b4d75a37d662a43d` |
| G2 | 43 | 17135 | `9327260e39e3a9f36defbb4b83dc5ad04b4ff121` |
| Bb2 | 46 | 17837 | `8cff18cd1bda18153736648c26a670bc91e77ba7` |
| Db3 | 49 | 19501 | `92d116eb9b067a19e3c7a7b2485a305fc0f73da6` |
| E3 | 52 | 19241 | `e2388e601c9f3f67e0a8674ddc5fd3ce97f52435` |
| G3 | 55 | 19553 | `e13ccaba8b33068ae72008aac1f6f6699310fdec` |
| Bb3 | 58 | 19007 | `a17e4269ed1464b61aadcadf9948ad6dabc03816` |
| Db4 | 61 | 19371 | `4fdb4a92454ffdb0dc88dd2f864ea9c0d649f5d0` |
| E4 | 64 | 21321 | `58748eb9d79ea8d2620def77e55c855bbcdd1bf1` |
| G4 | 67 | 21763 | `5076ba9c977d70bee318ab69e821292d8f8e208a` |
| Bb4 | 70 | 17499 | `29ab79eb458d150f9fe8eaeb6d4b9e06e46ebf7f` |
| Db5 | 73 | 16745 | `0b346eb66c0b375759148d7a318d3a526825ca3e` |
| E5 | 76 | 16121 | `e32c9238a47d889701cb9b9346ab84cd63d0bfee` |
| G5 | 79 | 15991 | `ca3e0465ad7ea3390b203380cfeca3f3300af823` |
| Bb5 | 82 | 15731 | `5f28b8d3eb2a1654c64f93e3c2cd20167e0cd8da` |
| Db6 | 85 | 14821 | `f4a1d10022185320d975c6445691de595f6b5fea` |
