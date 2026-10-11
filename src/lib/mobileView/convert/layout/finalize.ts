/** Block ids, origins and the field index (spec: `BlockBase`,
 * `MobileDocument.fieldBlockIds`). */

import type { Box, InlineNode, ListItem, MobileBlock } from "../../types";
import { unionBox } from "../geom";
import type { PageContext } from "./model";

function inlineBoxes(nodes: InlineNode[], ctx: PageContext, out: Box[]) {
  for (const n of nodes) {
    if (n.kind === "text") {
      for (const i of n.sources) {
        const it = ctx.itemByIndex.get(i);
        if (it) out.push(it.box);
      }
    } else {
      const w = ctx.widgetById.get(n.fieldId);
      if (w) out.push(w.box);
      if (n.hint) inlineBoxes(n.hint, ctx, out);
    }
  }
}

/** Source boxes of every item and widget in a block. */
export function blockBoxes(b: MobileBlock, ctx: PageContext): Box[] {
  const out: Box[] = [];
  const widget = (id: string) => {
    const w = ctx.widgetById.get(id);
    if (w) out.push(w.box);
  };
  const item = (it: ListItem) => {
    if (it.marker) inlineBoxes([it.marker], ctx, out);
    inlineBoxes(it.content, ctx, out);
    it.children.forEach(item);
  };
  switch (b.type) {
    case "heading":
      inlineBoxes(b.content, ctx, out);
      break;
    case "paragraph":
      inlineBoxes(b.content, ctx, out);
      break;
    case "list":
      b.items.forEach(item);
      break;
    case "field":
      if (b.label?.kind === "source") inlineBoxes(b.label.runs, ctx, out);
      widget(b.fieldId);
      if (b.hint) inlineBoxes(b.hint, ctx, out);
      break;
    case "choice":
      widget(b.fieldId);
      inlineBoxes(b.label, ctx, out);
      break;
    case "radioGroup":
      if (b.label?.kind === "source") inlineBoxes(b.label.runs, ctx, out);
      for (const o of b.options) {
        widget(o.fieldId);
        inlineBoxes(o.label, ctx, out);
      }
      break;
    case "keyValue":
      inlineBoxes(b.label, ctx, out);
      b.value.forEach((v) => out.push(...blockBoxes(v, ctx)));
      break;
    case "group":
      if (b.heading) inlineBoxes(b.heading, ctx, out);
      b.children.forEach((c) => out.push(...blockBoxes(c, ctx)));
      break;
    default:
      break;
  }
  return out;
}

/** Field ids held anywhere inside a block. */
export function blockFieldIds(b: MobileBlock): string[] {
  const ids: string[] = [];
  const inline = (nodes: InlineNode[]) => {
    for (const n of nodes) if (n.kind === "field") ids.push(n.fieldId);
  };
  const item = (it: ListItem) => {
    inline(it.content);
    it.children.forEach(item);
  };
  switch (b.type) {
    case "paragraph":
      inline(b.content);
      break;
    case "list":
      b.items.forEach(item);
      break;
    case "field":
      ids.push(b.fieldId);
      break;
    case "choice":
      ids.push(b.fieldId);
      inline(b.label);
      break;
    case "radioGroup":
      for (const o of b.options) {
        ids.push(o.fieldId);
        inline(o.label);
      }
      break;
    case "keyValue":
      b.value.forEach((v) => ids.push(...blockFieldIds(v)));
      break;
    case "group":
      b.children.forEach((c) => ids.push(...blockFieldIds(c)));
      break;
    default:
      break;
  }
  return ids;
}

/** Assigns ids (`p{page}-b{n}`, nested `-{n}`) and origins in place. */
export function finalizeBlocks(blocks: MobileBlock[], ctx: PageContext, prefix: string): void {
  blocks.forEach((b, n) => {
    b.id = `${prefix}${n}`;
    const boxes = blockBoxes(b, ctx);
    b.origin = boxes.length ? { pageIndex: ctx.page.pageIndex, box: unionBox(boxes) } : null;
    if (b.type === "group") finalizeBlocks(b.children, ctx, `${b.id}-`);
    if (b.type === "keyValue") finalizeBlocks(b.value, ctx, `${b.id}-`);
    if (b.type === "list") {
      const item = (it: ListItem, id: string) => {
        it.id = id;
        it.children.forEach((c, k) => item(c, `${id}-${k}`));
      };
      b.items.forEach((it, k) => item(it, `${b.id}-${k}`));
    }
  });
}
