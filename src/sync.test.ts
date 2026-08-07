import { describe, expect, it } from 'vitest';
import { decideSync } from './sync';

describe('automatic sync decisions', () => {
  const metadata = { revision: 3, hash: 'previous' };

  it('pushes only local changes', () => expect(decideSync('local', 'previous', metadata, 3)).toBe('push'));
  it('pulls only remote changes', () => expect(decideSync('previous', 'remote', metadata, 4)).toBe('pull'));
  it('stops when both devices changed', () => expect(decideSync('local', 'remote', metadata, 4)).toBe('conflict'));
  it('adopts metadata when both copies match', () => expect(decideSync('same', 'same', null, 8)).toBe('same'));
});
