import { afterEach, describe, expect, it } from '@jest/globals';
import { newRequestId } from './request-id';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newRequestId', () => {
  const original = crypto.randomUUID;
  afterEach(() => {
    Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true });
  });

  it('returns a UUIDv4', () => {
    expect(newRequestId()).toMatch(UUID_V4);
  });

  it('still works over plain HTTP, where crypto.randomUUID does not exist', () => {
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    const ids = new Set(Array.from({ length: 50 }, newRequestId));
    ids.forEach((id) => expect(id).toMatch(UUID_V4));
    expect(ids.size).toBe(50);
  });
});
