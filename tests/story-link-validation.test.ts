import { isValidStoryLink } from '../src/lib/helpers';

describe('isValidStoryLink', () => {
  test('accepts valid t.me links', () => {
    expect(isValidStoryLink('https://t.me/user/s/123')).toBe(true);
    expect(isValidStoryLink('t.me/user/s/456')).toBe(true);
    expect(isValidStoryLink('https://telegram.me/user/s/789')).toBe(true);
  });

  test('rejects non-telegram links', () => {
    expect(isValidStoryLink('https://example.com/user/s/123')).toBe(false);
    expect(isValidStoryLink('http://telegram.me.user/s/789')).toBe(false);
  });
});
