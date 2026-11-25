// The shape of packages/<name>/how.ts. It follows the HbHow props of
// hackbuild-ui (packages, install, today, code, lang, links) plus the prose of
// the fold: what the package is and how it works. tools/build-pages.mjs
// renders it on the package page; the suite renders the same file.
interface HowDoc {
  /** Package names, this package first: "@hackbuild/chat". */
  packages: string[];
  /** One or two sentences, lowercase: what the package is. */
  what: string;
  /** A few short paragraphs, lowercase: how it works. `code spans` stay as written. */
  how: string[];
  /** The install line once the packages are on npm. */
  install: string;
  /** The lines that work today, from a checkout. */
  today?: string;
  /** The least code that does what the page does. */
  code: string;
  /** Printed in the code block head; ts by default. */
  lang?: string;
  links: { page?: string; source?: string };
}
