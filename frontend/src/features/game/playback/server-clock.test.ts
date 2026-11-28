import { describe, expect, it } from '@jest/globals';
import { estimateClockOffset } from './server-clock';

describe('estimateClockOffset', () => {
  it('uses the fastest round trip and assumes the reply took half of it', () => {
    // Server clock is 5 000 ms ahead. The slow sample is skewed by its asymmetric delay.
    const offset = estimateClockOffset([
      { sentAt: 1_000, receivedAt: 1_400, serverTime: 6_350 },
      { sentAt: 2_000, receivedAt: 2_040, serverTime: 7_020 },
    ]);
    expect(offset).toBe(5_000);
  });

  it('knows nothing without samples', () => {
    expect(estimateClockOffset([])).toBeNull();
  });
});
