// @vitest-environment node
// (Reads source files from disk; needs no DOM, and under jsdom
// import.meta.url is not a file: URL.)
/**
 * Colour guardrail (spec §2.4, §4; audit C6).
 *
 * Chrome is styled with Chakra semantic tokens and the canvas with the
 * `--pdfe-*` variables in theme.css, which map to Chakra tokens. No source
 * file under src/lib may carry a literal colour (hex, rgb()/rgba(),
 * hsl()/hsla()) or reach for the old brand green. The only literals allowed
 * are listed in ALLOWED below, each with the reason it can't be a token.
 *
 * Scope: src/lib/**\/*.{ts,tsx,css}. Excluded:
 * - `*.test.*` files: tests assert on colour strings and fixtures (and this
 *   file contains every pattern it looks for).
 * - `fixtures` / `__fixtures__` directories: test data, never shipped.
 *
 * Files are read from disk with fs rather than `?raw` imports: vitest turns a
 * `?raw` import of a CSS module into a class-map object, not its text.
 */
import { describe, expect, it } from "vitest";

/** The slice of node:fs this test uses (the repo has no @types/node). */
interface DirentLike {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}
interface FsLike {
  readdirSync(path: URL, options: { withFileTypes: true }): DirentLike[];
  readFileSync(path: URL, encoding: "utf8"): string;
}

// A non-literal specifier keeps tsc from resolving node:fs types; vitest
// runs in Node, so the import itself always works.
const FS_MODULE = "node:fs";
const loadFs = async (): Promise<FsLike> =>
  (await import(/* @vite-ignore */ FS_MODULE)) as FsLike;

const LIB_ROOT = new URL("../", import.meta.url);

const SCANNED_EXTENSIONS = /\.(ts|tsx|css)$/;
const EXCLUDED_FILE = /\.test\.[a-z]+$/;
const EXCLUDED_DIR = /^(__)?fixtures(__)?$/;

interface Rule {
  name: string;
  pattern: RegExp;
}

const RULES: Rule[] = [
  {
    name: "hex colour",
    // 3, 4, 6 or 8 hex digits after a `#` that isn't part of a word or an
    // HTML entity. `#page_div_container_1` and `#pdf-page-container` don't
    // match: "p" isn't a hex digit.
    pattern: /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g,
  },
  { name: "rgb()/rgba()", pattern: /\brgba?\(/g },
  { name: "hsl()/hsla()", pattern: /\bhsla?\(/g },
  {
    name: "green in a colour context",
    // A quoted "green" (colorPalette="green", { colorPalette: 'green' }), a
    // Chakra green token (green.solid, green.500, green-500, colors-green-*).
    // The bare word in prose ("no green") is fine.
    pattern:
      /(["'`])green\1|\bgreen(?:\.|-)(?:\d|solid|subtle|muted|fg|emphasized|contrast|focus)/g,
  },
];

interface Allowance {
  /** Path relative to src/lib. */
  file: string;
  /** The exact literal that is allowed in that file. */
  literal: string;
  reason: string;
}

const ALLOWED: Allowance[] = [
  {
    file: "theme.css",
    literal: "#fff",
    reason:
      "--pdfe-page-bg: PDF pages are always white in both colour modes (spec §4 exempts it).",
  },
  {
    file: "components/Signature/constants.ts",
    literal: "#1a1a1a",
    reason:
      "INK_COLOR: drawn and typed signatures are native canvas ink stamped onto the page as a PNG, dark on white in both modes (spec §3.7).",
  },
  {
    file: "PDFEditor.tsx",
    literal: "#000000",
    reason:
      "New build field defaults (fontColor, borderColor): data saved in the field schema and used for the PDF form appearance, not chrome.",
  },
  {
    file: "PDFEditor.tsx",
    literal: "#ffffff",
    reason:
      "New build field default backgroundColor: data saved in the field schema for the PDF form appearance, not chrome.",
  },
  {
    file: "components/Panels/avatarPalette.ts",
    literal: '"green"',
    reason:
      "Avatar hues must match the app's utils/avatarPalette.ts exactly (same list, same order), or a person's avatar changes colour between the app and the editor.",
  },
];

interface SourceFile {
  path: string;
  text: string;
}

async function collectSources(): Promise<SourceFile[]> {
  const fs = await loadFs();
  const files: SourceFile[] = [];
  const walk = (dir: URL, rel: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (EXCLUDED_DIR.test(entry.name) || entry.name === "node_modules") {
          continue;
        }
        walk(new URL(`${entry.name}/`, dir), `${rel}${entry.name}/`);
      } else if (
        entry.isFile() &&
        SCANNED_EXTENSIONS.test(entry.name) &&
        !EXCLUDED_FILE.test(entry.name)
      ) {
        files.push({
          path: `${rel}${entry.name}`,
          text: fs.readFileSync(new URL(entry.name, dir), "utf8"),
        });
      }
    }
  };
  walk(LIB_ROOT, "");
  return files;
}

const isAllowed = (file: string, literal: string) =>
  ALLOWED.some(
    (a) => a.file === file && a.literal.toLowerCase() === literal.toLowerCase()
  );

describe("no hard-coded colours in src/lib", () => {
  it("each rule catches what it is meant to catch", () => {
    const samples: Record<string, string> = {
      "hex colour": 'color: "#22c55e"',
      "rgb()/rgba()": "box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.4)",
      "hsl()/hsla()": "background: hsl(140 60% 40%)",
      "green in a colour context": '<Button colorPalette="green">',
    };
    for (const rule of RULES) {
      rule.pattern.lastIndex = 0;
      expect(rule.pattern.test(samples[rule.name]), rule.name).toBe(true);
      rule.pattern.lastIndex = 0;
    }
    // And leaves ids, entities and prose alone.
    const clean =
      '#pdf-page-container #page_div_container_3 &#123; "no green in chrome"';
    for (const rule of RULES) {
      rule.pattern.lastIndex = 0;
      expect(rule.pattern.test(clean), rule.name).toBe(false);
      rule.pattern.lastIndex = 0;
    }
  });

  it("scans the library sources", async () => {
    const files = await collectSources();
    const paths = files.map((f) => f.path);
    expect(paths).toContain("PDFEditor.tsx");
    expect(paths).toContain("theme.css");
    expect(paths).toContain("components/Toolbar/HeaderBar.tsx");
    expect(paths.some((p) => EXCLUDED_FILE.test(p))).toBe(false);
  });

  it("uses no literal colours or green outside the allowlist", async () => {
    const files = await collectSources();
    const violations: string[] = [];
    for (const { path, text } of files) {
      const lines = text.split("\n");
      lines.forEach((line, index) => {
        for (const rule of RULES) {
          for (const match of line.matchAll(rule.pattern)) {
            if (isAllowed(path, match[0])) continue;
            violations.push(
              `${path}:${index + 1} ${rule.name} "${match[0]}": ${line.trim()}`
            );
          }
        }
      });
    }
    expect(violations).toEqual([]);
  });

  it("keeps the allowlist honest: every allowed literal is still present", async () => {
    const files = await collectSources();
    const stale = ALLOWED.filter((a) => {
      const file = files.find((f) => f.path === a.file);
      return !file || !file.text.toLowerCase().includes(a.literal.toLowerCase());
    }).map((a) => `${a.file}: ${a.literal}`);
    expect(stale).toEqual([]);
  });
});
