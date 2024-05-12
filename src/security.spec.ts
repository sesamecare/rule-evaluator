import { expect, test } from 'vitest';

import { runFilter } from './test.fixtures';

import { toFunction } from './index';

test('Security', () => {
  expect(runFilter('toString')).toBeUndefined();
  const polluted = global as unknown as { p0wned: boolean };

  polluted.p0wned = false;
  const attack = toFunction(
    'constructor.constructor.name.replace("",constructor.constructor("global.p0wned=true"))',
  );
  expect(attack, 'Should compile').toBeTruthy();
  try {
    attack();
    expect.fail('should have thrown');
  } catch (e) {
    expect(e instanceof Error, 'Should be an error return').toBeTruthy();
  }
  expect(polluted.p0wned, 'Should not modify global').toBe(false);

  expect(
    toFunction('a')(Object.create({ a: 42 })),
    'Should not access prototype props',
  ).toBeUndefined();
});
