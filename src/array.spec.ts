import { describe, expect, test } from 'vitest';

import { runFilter } from './test.fixtures';

import { FiltrexType, toFunction } from './index';

describe('Array support', () => {
  test('in / not in', () => {
    // value in array
    expect(runFilter('5 in (1, 2, 3, 4)')).toBe(0);
    expect(runFilter('3 in (1, 2, 3, 4)')).toBe(1);
    expect(runFilter('5 not in (1, 2, 3, 4)')).toBe(1);
    expect(runFilter('3 not in (1, 2, 3, 4)')).toBe(0);

    // array in array
    expect(runFilter('(1, 2) in (1, 2, 3)')).toBe(1);
    expect(runFilter('(1, 2) in (2, 3, 1)')).toBe(1);
    expect(runFilter('(3, 4) in (1, 2, 3)')).toBe(0);
    expect(runFilter('(1, 2) not in (1, 2, 3)')).toBe(0);
    expect(runFilter('(1, 2) not in (2, 3, 1)')).toBe(0);
    expect(runFilter('(3, 4) not in (1, 2, 3)')).toBe(1);

    // other edge cases
    expect(runFilter('(1, 2) in 1')).toBe(0);
    expect(runFilter('1 in 1')).toBe(1);
    expect(runFilter('(1, 2) not in 1')).toBe(1);
    expect(runFilter('1 not in 1')).toBe(0);
  });

  test('string support', async () => {
    expect(runFilter('foo == "hello"', { foo: 'hello' })).toBe(1);
    expect(runFilter('foo == "hello"', { foo: 'bye' })).toBe(0);
    expect(runFilter('foo != "hello"', { foo: 'hello' })).toBe(0);
    expect(runFilter('foo != "hello"', { foo: 'bye' })).toBe(1);
    expect(runFilter('foo in ("aa", "bb")', { foo: 'aa' })).toBe(1);
    expect(runFilter('foo in ("aa", "bb")', { foo: 'cc' })).toBe(0);
    expect(runFilter('foo not in ("aa", "bb")', { foo: 'aa' })).toBe(0);
    expect(runFilter('foo not in ("aa", "bb")', { foo: 'cc' })).toBe(1);

    expect(runFilter('"\n"')).toBe('\n');
    expect(runFilter('"\u0000"')).toBe('\u0000');
    expect(runFilter('"\uD800"')).toBe('\uD800');
  });

  test('regexp support', async () => {
    expect(runFilter('foo ~= "^[hH]ello"', { foo: 'hello' })).toBe(1);
    expect(runFilter('foo ~= "^[hH]ello"', { foo: 'bye' })).toBe(0);
  });

  test('array support', async () => {
    const arr = runFilter('(42, "fifty", pi)', { pi: Math.PI });

    expect(Array.isArray(arr)).toBe(true);
    expect(arr).toEqual([42, 'fifty', Math.PI]);
  });

  test('ternary operator', async () => {
    expect(runFilter('1 > 2 ? 3 : 4')).toBe(4);
    expect(runFilter('1 < 2 ? 3 : 4')).toBe(3);
  });

  test('kitchensink', async () => {
    const kitchenSink = toFunction('4 > lowNumber * 2 and (max(a, b) < 20 or foo) ? 1.1 : 9.4');
    expect(kitchenSink({ lowNumber: 1.5, a: 10, b: 12, foo: false })).toEqual(1.1);
    expect(kitchenSink({ lowNumber: 3.5, a: 10, b: 12, foo: false })).toEqual(9.4);
  });

  test('include', async () => {
    const hasOne = toFunction('1 in foo');
    expect(hasOne({ foo: [] })).toBe(0);
    expect(hasOne({ foo: [0, 2, 3] })).toBe(0);
    expect(hasOne({ foo: [6, 1, 3] })).toBe(1);

    const hasOneIsh = toFunction('1 in~ foo');
    expect(hasOneIsh({ foo: [6, '1', 3] })).toBe(1);
    expect(hasOneIsh({ foo: [6, 1, 3] })).toBe(1);

    const notHasOneIsh = toFunction('1 not in~ foo');
    expect(notHasOneIsh({ foo: [6, '1', 3] })).toBe(0);
    expect(notHasOneIsh({ foo: [6, 1, 3] })).toBe(0);
    expect(notHasOneIsh({ foo: [6, 3] })).toBe(1);
  });

  test('nested array', async () => {
    const hasIt = toFunction('testNear(input, [[1,2],[2,4],[3,65],["foo", "bar", 1 + 2],[6+3]])', {
      functions: {
        testNear(input, arr) {
          return arr.findIndex((subArr: FiltrexType[]) => subArr[0] === input) >= 0 ? 1 : 0;
        },
      },
    });
    expect(hasIt({ input: 1 })).toBe(1);
    expect(hasIt({ input: 6 })).toBe(0);
    expect(hasIt({ input: 9 })).toBe(1);
  });

  test('set functions', () => {
    const pass = async (input: string) => expect(runFilter(input)).toBe(1);

    pass('[1, 2, 3, 4] in union([1, 2], [3, 4])');
    pass('[1, 2, 3, 4] in union([1, 2], [2, 3, 4])');
    pass('[1, 2] in intersection([1, 2, 3, 4], [1, 2], [1, 2])');

    pass('[1, 2, 3, 4] in union([1], 2, [3, 4])');
    pass('1 in intersection([1], [1, 2], 1, [3, 4, 1])');
    pass('length(intersection([1], [1, 2], 1, [3, 4, 1])) == 1');

    pass('[1, 2] in difference([1, 2, 3, 4], [4, 3])');
    pass('[3, 4] not in difference([1, 2, 3, 4], [4, 3])');

    pass('1 in unique([1, 1, 1])');
    pass('length(unique([1, 1, 1])) == 1');
  });
});
