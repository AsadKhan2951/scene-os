import { describe, expect, it } from 'vitest';
import { creditsFor, tokenCostUsd, unitCostUsd } from './credits';

describe('tokenCostUsd', () => {
  it('prices Sonnet input and output per million tokens', () => {
    expect(tokenCostUsd('claude-sonnet-5-5', { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(12);
  });
  it('prices cache reads and 1-hour cache writes', () => {
    expect(tokenCostUsd('claude-opus-5-5', { inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000, cacheCreationTokens: 1_000_000, cacheTtl: '1h' })).toBeCloseTo(8.2);
  });
  it('charges Haiku 5x when the prompt is over 100K tokens', () => {
    const short = tokenCostUsd('claude-haiku-5-5', { inputTokens: 100_000, outputTokens: 1000 });
    const long = tokenCostUsd('claude-haiku-5-5', { inputTokens: 100_001, outputTokens: 1000 });
    expect(long / short).toBeGreaterThan(4.9);
  });
  it('never prices an unknown model at zero', () => {
    expect(tokenCostUsd('some-new-model', { inputTokens: 1000, outputTokens: 1000 })).toBeGreaterThan(0);
  });
});

describe('creditsFor', () => {
  it('turns USD into credits with the markup', () => {
    expect(creditsFor(1, 2, 0.01)).toBe(200);
  });
  it('rounds small costs up so they still count', () => {
    expect(creditsFor(0.000001)).toBe(0.01);
  });
  it('is zero for no cost', () => {
    expect(creditsFor(0)).toBe(0);
  });
  it('prices a 5 second clip from unit rates', () => {
    expect(unitCostUsd('higgsfield.video_second', 5)).toBeCloseTo(0.45);
  });
});
