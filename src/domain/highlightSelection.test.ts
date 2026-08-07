import { describe, expect, it } from 'vitest';
import { createSelectionDraft, selectionOverlapsHighlights } from './highlightSelection';

describe('highlight selection draft', () => {
  it('freezes a trimmed quote while preserving its exact offsets', () => {
    expect(createSelectionDraft(2, 'A useful phrase here.', 1, 15)).toEqual({
      segmentIndex: 2,
      startOffset: 2,
      endOffset: 15,
      quote: 'useful phrase',
    });
  });

  it('rejects whitespace-only ranges and detects overlap from frozen offsets', () => {
    expect(createSelectionDraft(0, 'hello world', 5, 6)).toBeNull();
    const selection = createSelectionDraft(0, 'hello world', 0, 5);
    expect(selection).not.toBeNull();
    expect(selectionOverlapsHighlights(selection!, [{ id: 'h1', episodeId: 'e1', language: 'en', segmentIndex: 0, startOffset: 3, endOffset: 8, quote: 'lo wo', type: 'key', note: '', createdAt: '' }])).toBe(true);
    expect(selectionOverlapsHighlights(selection!, [])).toBe(false);
  });
});
