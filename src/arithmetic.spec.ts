import { describe, expect, test } from 'vitest';

import { runFilter } from './test.fixtures';

describe('Arithmetics', () => {
  test('can do simple numeric expressions', () => {
    expect(runFilter('1 + 2 * 3')).toBe(7);
    expect(runFilter('2 * 3 + 1')).toBe(7);
    expect(runFilter('1 + (2 * 3)')).toBe(7);
    expect(runFilter('(1 + 2) * 3')).toBe(9);
    expect(runFilter('((1 + 2) * 3 / 2 + 1 - 4 + (2 ^ 3)) * -2')).toBe(-19);
    expect(runFilter('1.4 * 1.1')).toBe(1.54);
    expect(runFilter('97 % 10')).toBe(7);
  });

  test('does math functions', () => {
    expect(runFilter('abs(-5)')).toBe(5);
    expect(runFilter('abs(5)')).toBe(5);
    expect(runFilter('ceil(4.1)')).toBe(5);
    expect(runFilter('ceil(4.6)')).toBe(5);
    expect(runFilter('floor(4.1)')).toBe(4);
    expect(runFilter('floor(4.6)')).toBe(4);
    expect(runFilter('round(4.1)')).toBe(4);
    expect(runFilter('round(4.6)')).toBe(5);
    expect(runFilter('sqrt(9)')).toBe(3);
  });

  test('supports functions with multiple args', () => {
    expect(runFilter('random() >= 0')).toBe(1);
    expect(runFilter('min(2)')).toBe(2);
    expect(runFilter('max(2)')).toBe(2);
    expect(runFilter('min(2, 5)')).toBe(2);
    expect(runFilter('max(2, 5)')).toBe(5);
    expect(runFilter('min(2, 5, 6)')).toBe(2);
    expect(runFilter('max(2, 5, 6)')).toBe(6);
    expect(runFilter('min(2, 5, 6, 1)')).toBe(1);
    expect(runFilter('max(2, 5, 6, 1)')).toBe(6);
    expect(runFilter('min(2, 5, 6, 1, 9)')).toBe(1);
    expect(runFilter('max(2, 5, 6, 1, 9)')).toBe(9);
    expect(runFilter('min(2, 5, 6, 1, 9, 12)')).toBe(1);
    expect(runFilter('max(2, 5, 6, 1, 9, 12)')).toBe(12);
  });

  test('can do comparisons', () => {
    expect(runFilter('foo == 4', { foo: 4 })).toBe(1);
    expect(runFilter('foo == 4', { foo: 3 })).toBe(0);
    expect(runFilter('foo == 4', { foo: -4 })).toBe(0);
    expect(runFilter('foo != 4', { foo: 4 })).toBe(0);
    expect(runFilter('foo != 4', { foo: 3 })).toBe(1);
    expect(runFilter('foo != 4', { foo: -4 })).toBe(1);
    expect(runFilter('foo > 4', { foo: 3 })).toBe(0);
    expect(runFilter('foo > 4', { foo: 4 })).toBe(0);
    expect(runFilter('foo > 4', { foo: 5 })).toBe(1);
    expect(runFilter('foo >= 4', { foo: 3 })).toBe(0);
    expect(runFilter('foo >= 4', { foo: 4 })).toBe(1);
    expect(runFilter('foo >= 4', { foo: 5 })).toBe(1);
    expect(runFilter('foo < 4', { foo: 3 })).toBe(1);
    expect(runFilter('foo < 4', { foo: 4 })).toBe(0);
    expect(runFilter('foo < 4', { foo: 5 })).toBe(0);
    expect(runFilter('foo <= 4', { foo: 3 })).toBe(1);
    expect(runFilter('foo <= 4', { foo: 4 })).toBe(1);
    expect(runFilter('foo <= 4', { foo: 5 })).toBe(0);
  });

  test('can do boolean logic', () => {
    expect(runFilter('0 and 0')).toBe(0);
    expect(runFilter('0 and 1')).toBe(0);
    expect(runFilter('1 and 0')).toBe(0);
    expect(runFilter('1 and 1')).toBe(1);
    expect(runFilter('0 or 0')).toBe(0);
    expect(runFilter('0 or 1')).toBe(1);
    expect(runFilter('1 or 0')).toBe(1);
    expect(runFilter('1 or 1')).toBe(1);
    expect(runFilter('this_is_undefined.really or 1')).toBe(1);
    expect(runFilter('thisis.really or 0', { thisis: {} })).toBe(0);
    expect(runFilter('thisis.really or 1', { thisis: {} })).toBe(1);
    expect(runFilter('thisis.really or 0', { thisis: { really: {} } })).toBe(1);
    expect(runFilter('not 0')).toBe(1);
    expect(runFilter('not 1')).toBe(0);
    expect(runFilter('(0 and 1) or 1')).toBe(1);
    expect(runFilter('0 and (1 or 1)')).toBe(0);
    expect(runFilter('0 and 1 or 1')).toBe(1);
    expect(runFilter('1 or 1 and 0')).toBe(1);
    expect(runFilter('not 1 and 0')).toBe(0);
  });
});
