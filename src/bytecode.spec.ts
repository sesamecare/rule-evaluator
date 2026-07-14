import { describe, expect, test } from 'vitest';

import { RuleFunction, runBytecode, toBytecode, Value } from './bytecode';

import { toFunction } from './index';

function compare(
  rule: string,
  values: Record<string, Value> = {},
  functions: Record<string, RuleFunction> = {},
) {
  expect(runBytecode(toBytecode(rule), values, functions)).toEqual(
    toFunction(rule, { functions })(values),
  );
}

describe('bytecode evaluator', () => {
  test('matches compiled evaluation semantics', () => {
    compare('1 + foo * 2', { foo: 3 });
    compare('((1 + 2) * 3 / 2 + 1 - 4 + (2 ^ 3)) * -2');
    compare('foo == "4"', { foo: 4 });
    compare('not foo or bar', { foo: 1, bar: true });
    compare('foo ? "yes" : "no"', { foo: 0 });
    compare('[1, foo, [3, 4]]', { foo: 2 });
    compare('needle in~ haystack', { needle: 1, haystack: ['1', 2] });
    compare('needle not in haystack', { needle: 3, haystack: [1, 2] });
    compare('name ~= "^[a-z]+$"', { name: 'sesame' });
    compare('max(1, score, 3)', { score: 5 });
  });

  test('supports custom functions and resolver this binding', () => {
    function add(this: (name: string) => Value, ...args: Value[]) {
      return args.reduce((sum, value) => sum + Number(value), Number(this('offset')));
    }

    expect(runBytecode(toBytecode('add(a, 2)'), { a: 3, offset: 4 }, { add })).toBe(9);
  });

  test('short-circuits boolean and conditional expressions', () => {
    let calls = 0;
    const called = () => {
      calls += 1;
      return 1;
    };

    expect(runBytecode(toBytecode('0 and called()'), {}, { called })).toBe(0);
    expect(runBytecode(toBytecode('1 or called()'), {}, { called })).toBe(1);
    expect(runBytecode(toBytecode('1 ? 5 : called()'), {}, { called })).toBe(5);
    expect(calls).toBe(0);
  });

  test('resolves only own properties and caches lazy values per run', () => {
    let calls = 0;
    const inherited = Object.create({ secret: 42 }) as Record<string, Value>;
    inherited.lazy = () => {
      calls += 1;
      return 3;
    };

    expect(runBytecode(toBytecode('secret'), inherited)).toBeUndefined();
    expect(runBytecode(toBytecode('lazy + lazy'), inherited)).toBe(6);
    expect(calls).toBe(1);
  });

  test('rejects malformed rules and bytecode', () => {
    expect(() => toBytecode('1 +')).toThrow();
    expect(() => runBytecode('{}', {})).toThrow('Invalid rule bytecode');
    expect(() =>
      runBytecode(
        JSON.stringify({ version: 1, constants: [], paths: [], functions: [], code: [999] }),
        {},
      ),
    ).toThrow('Unknown rule bytecode opcode');
  });
});
