import { describe, expect, test } from 'vitest';

import { toFunction } from './index';

describe('Object support', () => {
  test('can bind to data', () => {
    const something = toFunction('1 + foo * bar');
    expect(something({ foo: 5, bar: 2 })).toBe(11);
    expect(something({ foo: 2, bar: 1 })).toBe(3);
  });

  test('includes symbols with dots', () => {
    expect(toFunction('hello.world.foo')({ hello: { world: { foo: 123 } } })).toBe(123);
    expect(toFunction('order.gooandstuff')({ order: { gooandstuff: 123 } })).toBe(123);
  });

  test('includes quoted symbols', () => {
    expect(toFunction("'hello-world-foo'")({ 'hello-world-foo': 123 })).toBe(123);
    expect(toFunction("'order+goo*and#stuff'")({ 'order+goo*and#stuff': 123 })).toBe(123);
  });

  test('includes symbols with $ and _', () => {
    expect(toFunction('$_.0$$')({ $_: { '0$$': 123 } })).toBe(123);
  });

  test('disallows symbols starting with numerals', () => {
    expect(() => toFunction('0hey')).toThrow();
    expect(() => toFunction('123.456hey')).toThrow();
  });

  test('null should be falsy', () => {
    const checkfornull = toFunction('myobj.myprop');
    expect(checkfornull({ myobj: { myprop: null } })).not.toBeTruthy();
  });
});
