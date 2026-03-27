import { describe, it, expect } from 'vitest';
import { navItems } from '../lib/nav-items';

describe('navItems', () => {
  it('exports 5 items', () => {
    expect(navItems).toHaveLength(5);
  });

  it('has the correct urls', () => {
    const urls = navItems.map((i) => i.url);
    expect(urls).toEqual([
      '/dashboard',
      '/journal',
      '/calendar',
      '/strategies',
      '/settings',
    ]);
  });

  it('has title and icon on every item', () => {
    for (const item of navItems) {
      expect(typeof item.title).toBe('string');
      expect(typeof item.icon).toBe('function');
    }
  });
});
