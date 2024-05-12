import { describe, expect, test } from 'vitest';

import { FiltrexType, toFunction } from './index';

let counter = 0;
const doc1 = {
  category: 'meal',
  obj: { num: 6, str: 'gasbuddy', more: { cowbell: true } },
  foo: ['green'],
};
const doc2 = {
  category: 'dessert',
  obj: { num: 1, str: 'gasbuddy' },
  foo: ['blue', 'red', 'green'],
};
const doc3 = {
  cached() {
    counter += 1;
    return counter;
  },
  thrown() {
    throw new Error('Foobar');
  },
};

describe('test_function', () => {
  test('simple property match', () => {
    const filter = toFunction('category == "meal"');
    expect(filter(doc1), 'Should match intended target').toBeTruthy();
    expect(filter(doc2), 'Should not match unintended target').not.toBeTruthy();
  });

  test('deep property match', () => {
    const filter = toFunction('obj.num == 6');
    expect(filter(doc1), 'Should match intended target').toBeTruthy();
    expect(filter(doc2), 'Should not match unintended target').not.toBeTruthy();
  });

  test('deep property match', () => {
    let filter = toFunction('obj.more.cowbell');
    expect(filter(doc1), 'Should match intended target').toBeTruthy();
    expect(filter(doc2), 'Should not match unintended target').not.toBeTruthy();

    filter = toFunction('obj.more.cowbell and category == "meal"');
    expect(filter(doc1), 'Should match intended target').toBeTruthy();
    expect(filter(doc2), 'Should not match unintended target').not.toBeTruthy();
  });

  test('inverted array match', () => {
    const filter = toFunction('"red" in foo');
    expect(filter(doc2), 'Should match intended target').toBeTruthy();
    expect(filter(doc1), 'Should not match unintended target').not.toBeTruthy();
    expect(filter(doc3), 'Should not match unintended target').not.toBeTruthy();
  });

  test('array length match', () => {
    let filter = toFunction('foo.length > 1');
    expect(filter(doc2), 'Should match intended target').toBeTruthy();
    expect(filter(doc1), 'Should not match unintended target').not.toBeTruthy();
    expect(filter(doc3), 'Should not match unintended target').not.toBeTruthy();

    filter = toFunction('length(foo) == 0');
    expect(filter(doc3), 'Should match intended target').toBeTruthy();
  });

  test('string lower', () => {
    let filter = toFunction('lower(foo) == "brookline"');
    expect(filter({ foo: 'BROOKLINE' }), 'Should match intended target').toBeTruthy();
    expect(filter({ foo: 'brookline' }), 'Should match intended target').toBeTruthy();
    expect(
      filter({ foo: 'brooklinen' }),
      'Should not match unintended target',
    ).not.toBeTruthy();

    filter = toFunction('lower(foo) ~= "^brookline"');
    expect(filter({ foo: 'BROOKLINE' }), 'Should match intended target').toBeTruthy();
  });

  test('substring', () => {
    const filter = toFunction('substr(foo, 0, 5) == "01234"');
    expect(filter({ foo: '0123456789' }), 'Should match intended target').toBeTruthy();
    expect(filter({ foo: '01234' }), 'Should match intended target').toBeTruthy();
    expect(
      filter({ foo: '12345678' }),
      'Should not match unintended target',
    ).not.toBeTruthy();
  });

  test('multiparam custom function', () => {
    let filter = toFunction('add(1, "3") == 4', {
      functions: {
        add(a, b) {
          return Number(a) + Number(b);
        },
      },
    });
    expect(filter({}), 'Should match intended target').toBeTruthy();

    filter = toFunction('add(\'1\', "3", 5) == nine', {
      functions: {
        add(...args: number[]) {
          return args.reduce((prev, cur) => Number(cur) + prev, 0);
        },
      },
    });
    expect(filter({ nine: 9, 1: 1 }), 'Should match intended target').toBeTruthy();
    expect(filter({}), 'Should not match unintended target').not.toBeTruthy();
  });

  test('event interception', () => {
    let code: string | undefined;
    toFunction('transactions <= 5 and abs(profit) > 20.5', {
      onParse({ functionObject }) {
        code = functionObject.toString();
      },
    });
    expect(
      code?.startsWith('function anonymous(fns,std,prop'),
      'Code should start with expected value',
    ).toBeTruthy();
    expect(code, 'Code should match').toMatchInlineSnapshot(`
      "function anonymous(fns,std,prop
      ) {
      return (std.numify((std.numify((prop(\\"transactions\\"))<=(5)))&&(std.numify(((std.isfn(fns, \\"abs\\") ? (fns[\\"abs\\"].call(prop, (prop(\\"profit\\")))) : std.unknown(\\"abs\\")))> (20.5)))));
      }"
    `);
  });

  test('"this" is prop resolver', () => {
    function selfProp(this: (prop: string) => FiltrexType, x: string) {
      return this(x);
    }
    const fn = toFunction('selfProp("foo")', {
      functions: { selfProp },
    });
    expect(fn({ foo: 'bar' }), 'Should be able to access prop value').toBe('bar');
  })
});
