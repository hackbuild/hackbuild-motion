// how this works: the fold on the package page and in the suite. Kept out of
// the runtime entry; tsconfig.how.json typechecks it. Text from the README.
export interface How {
  /** one line: what the package is */
  what: string;
  /** short paragraphs: how it works */
  how: string[];
  packages: string[];
  /** the install line once the packages are on npm */
  install: string;
  /** the line that works today */
  today?: string;
  code: string;
  lang?: string;
  links: { page?: string; source?: string };
}

const how: How = {
  what: "viseme driver: timed words, phonemes or visemes from a tts engine with coarticulation, or the audio level when no timings exist, out to oculus visemes, vrm vowels or arkit blendshapes.",
  how: [
    "timed speech events from a voice engine, words, phonemes or visemes on your clock, build a timeline of visemes. phonemes may be arpabet, ipa or oculus names; words without phonemes are spelled by english letter rules.",
    "each viseme rises and falls over 70 ms (default) and overlapping visemes share the mouth by dominance, after the cohen and massaro model, so p, b and m still close the lips between vowels.",
    "when no timings exist, the audio level moves the jaw, and a spectrum can pick vrm vowels. drive writes the frame to oculus visemes, the five vrm vowels or arkit blendshapes through the table in @hackbuild/rig.",
  ],
  packages: ["@hackbuild/lipsync"],
  install: "npm install @hackbuild/lipsync",
  today: "git clone https://github.com/hackbuild/hackbuild-motion && cd hackbuild-motion && npm ci && npm run build && npm pack -w @hackbuild/lipsync",
  code: `import { LipSync, drive, rms } from "@hackbuild/lipsync";

const lips = new LipSync();
tts.onEvent = (e) => lips.push(e); // { type: "word", time: ctx.currentTime, text }
const buf = new Uint8Array(analyser.fftSize);

function frame(dt: number) {
  analyser.getByteTimeDomainData(buf);
  lips.setLevel(rms(buf));
  drive(avatar.expressions, lips.update(ctx.currentTime, dt), "vrm");
}`,
  lang: "ts",
  links: { page: "https://hackbuild.github.io/hackbuild-motion/lipsync/", source: "https://github.com/hackbuild/hackbuild-motion/tree/main/packages/lipsync" },
};

export default how;
