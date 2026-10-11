import React from "react";
import { Span } from "@chakra-ui/react";
import type { TextRun } from "../types";
import { BLANK_RUN } from "./documentModel";

/**
 * One run of source text. Runs of 4 or more underscores (printed blanks in
 * app documents) are drawn as a muted rule; the characters stay in the DOM
 * (transparent), so copy, find and screen readers see the real text.
 */
const RunText: React.FC<{ text: string }> = ({ text }) => {
  if (!BLANK_RUN.test(text)) return <>{text}</>;
  BLANK_RUN.lastIndex = 0;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = BLANK_RUN.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(
      <Span
        key={match.index}
        color="transparent"
        borderBottomWidth="1px"
        borderColor="fg.muted"
        data-blank=""
      >
        {match[0]}
      </Span>
    );
    last = match.index + match[0].length;
  }
  BLANK_RUN.lastIndex = 0;
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
};

/** Source text runs, bold/italic as the source was, joined exactly as the
 * converter wrote them: a run that starts a new word already begins with
 * its space, and one that continues a word ("15" + "th", "Reason 1" + ":")
 * does not, so nothing is added between runs. Small print is sized by the
 * containing block, never per run. */
const RunsImpl: React.FC<{ runs: TextRun[] }> = ({ runs }) => (
  <>
    {runs.map((run, index) => {
      if (run.printedBox) {
        // A printed checkbox square with no field over it: the source
        // character is a symbol-font letter ("q"), so draw the box. Keep
        // the run's own leading space.
        return (
          <React.Fragment key={index}>
            {/^\s/.test(run.text) ? " " : null}
            <Span aria-hidden="true" data-printed-box="">
              {"\u2610"}
            </Span>
          </React.Fragment>
        );
      }
      const content = <RunText text={run.text} />;
      if (!run.bold && !run.italic) {
        return <React.Fragment key={index}>{content}</React.Fragment>;
      }
      return (
        <Span
          key={index}
          as={run.bold ? "strong" : "em"}
          fontWeight={run.bold ? "semibold" : undefined}
          fontStyle={run.italic ? "italic" : undefined}
        >
          {content}
        </Span>
      );
    })}
  </>
);

/** The document never changes once converted, so runs never re-render
 * while the signer types. */
export const Runs = React.memo(RunsImpl);

export default Runs;
