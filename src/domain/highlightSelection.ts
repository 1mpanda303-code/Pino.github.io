import type { Highlight } from './learning';

export type SelectionDraft = {
  segmentIndex: number;
  startOffset: number;
  endOffset: number;
  quote: string;
};

export function createSelectionDraft(segmentIndex: number, segment: string, firstOffset: number, secondOffset: number): SelectionDraft | null {
  const rawStart = Math.max(0, Math.min(segment.length, Math.min(firstOffset, secondOffset)));
  const rawEnd = Math.max(rawStart, Math.min(segment.length, Math.max(firstOffset, secondOffset)));
  const rawQuote = segment.slice(rawStart, rawEnd);
  const leadingWhitespace = rawQuote.length - rawQuote.trimStart().length;
  const trailingWhitespace = rawQuote.length - rawQuote.trimEnd().length;
  const startOffset = rawStart + leadingWhitespace;
  const endOffset = rawEnd - trailingWhitespace;
  if (endOffset <= startOffset) return null;
  return { segmentIndex, startOffset, endOffset, quote: segment.slice(startOffset, endOffset) };
}

export function selectionOverlapsHighlights(selection: SelectionDraft, highlights: Highlight[]) {
  return highlights.some((item) => item.segmentIndex === selection.segmentIndex
    && item.startOffset < selection.endOffset
    && item.endOffset > selection.startOffset);
}
