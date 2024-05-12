import toPath from 'lodash.topath';
import unique from 'lodash.uniq';
import union from 'lodash.union';
import intersection from 'lodash.intersection';
import difference from 'lodash.difference';

import { FiltrexParser } from './generated/parser';

const OBJECT_RESOLVER = Symbol('Property resolver assigned to filtered objects');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FiltrexType = any;

const std = {
  numify(v: FiltrexType) {
    if (v !== null && typeof v === 'object') {
      return 1;
    }
    return Number(v);
  },

  isfn(fns: FiltrexType, funcName: string) {
    return Object.hasOwnProperty.call(fns, funcName) && typeof fns[funcName] === 'function';
  },

  unknown(funcName: string) {
    throw ReferenceError(`Unknown function: ${funcName}()`);
  },

  coerceArray(value: FiltrexType) {
    if (Array.isArray(value)) return value;
    return [value];
  },

  coerceBoolean(value: FiltrexType) {
    if (typeof value === 'boolean') return +value;
    return value;
  },

  isSubset(a: FiltrexType, b: FiltrexType) {
    const A = std.coerceArray(a);
    const B = std.coerceArray(b);
    return +A.every((val) => B.includes(val));
  },

  isSubsetInexact(a: FiltrexType, b: FiltrexType) {
    const A = std.coerceArray(a);
    const B = std.coerceArray(b);
    return +A.every((val) => B.findIndex((v) => (String(v) === String(val))) >= 0);
  },

  buildString(inQuote: FiltrexType, inLiteral: FiltrexType) {
    const quote = String(inQuote)[0];
    const literal = String(inLiteral);
    let built = '';

    if (literal[0] !== quote || literal[literal.length - 1] !== quote) throw new Error('Unexpected internal error: String literal doesn\'t begin/end with the right quotation mark.');

    for (let i = 1; i < literal.length - 1; i += 1) {
      if (literal[i] === '\\') {
        i += 1;
        if (i >= literal.length - 1) throw new Error('Unexpected internal error: Unescaped backslash at the end of string literal.');

        if (literal[i] === '\\') built += '\\';
        else if (literal[i] === quote) built += quote;
        else throw new Error(`Unexpected internal error: Invalid escaped character in string literal: ${literal[i]}`);
      } else if (literal[i] === quote) {
        throw new Error('Unexpected internal error: String literal contains unescaped quotation mark.');
      } else {
        built += literal[i];
      }
    }

    return JSON.stringify(built);
  },
};

FiltrexParser.yy = std;

export function parse(input: string) {
  return FiltrexParser.parse(input);
}

export function resetObjectResolver(obj: FiltrexType) {
  delete obj[OBJECT_RESOLVER];
}

export function getObjectResolver(obj: FiltrexType) {
  if (!obj) {
    return () => undefined;
  }

  if (obj[OBJECT_RESOLVER]) {
    return obj[OBJECT_RESOLVER];
  }
  const cachedPromises = new WeakMap();
  function objectResolver(name: string) {
    let current = obj;
    const path = toPath(name);
    let index = 0;
    const { length } = path;

    // Walk the specified path, looking for functions and promises along the way.
    // If we find a function, invoke it and cache the result (which is often a promise)
    while (current != null && index < length) {
      const key = String(path[index]);
      let currentVal = Object.prototype.hasOwnProperty.call(current, key) ? current[key] : undefined;
      if (typeof currentVal === 'function') {
        let cacheEntry = cachedPromises.get(current);
        if (cacheEntry && Object.hasOwnProperty.call(cacheEntry, key)) {
          currentVal = cacheEntry[key];
        } else {
          // By passing objectResolver to the fn, it can "depend" on other promises
          // and still get the cache benefits
          currentVal = currentVal(objectResolver, obj, current, name);
          // Need to get this again because someone else may have made it
          cacheEntry = cachedPromises.get(current);
          if (!cacheEntry) {
            cacheEntry = {};
            cachedPromises.set(current, cacheEntry);
          }
          cacheEntry[key] = currentVal;
        }
      }
      current = currentVal;
      index += 1;
    }
    return (index && index === length) ? current : undefined;
  }
  Object.defineProperty(obj, OBJECT_RESOLVER, { value: objectResolver, enumerable: false, configurable: true });
  return objectResolver;
}

interface FunctionCompilerOptions {
  functions?: { [key: string]: (...args: FiltrexType) => FiltrexType };
  onParse?: (options: {
    input: string;
    tree: ReturnType<typeof parse>;
    functionObject: (...args: FiltrexType) => FiltrexType;
    pathReferences: ReturnType<typeof JSON.parse>;
  }) => void;
  customResolver?: (name: string) => Promise<FiltrexType>;
}

export function toFunction(input: string, { functions, onParse, customResolver }: FunctionCompilerOptions = {}) {
  const allFunctions = {
    abs: Math.abs,
    ceil: Math.ceil,
    floor: Math.floor,
    log: Math.log,
    max: Math.max,
    min: Math.min,
    random: Math.random,
    round: Math.round,
    sqrt: Math.sqrt,
    length(o: FiltrexType) { return o?.length || 0; },
    lower(a: FiltrexType) {
      if (a === null || a === undefined) {
        return a;
      }
      return a.toString().toLocaleLowerCase();
    },
    substr(a: FiltrexType, from: number, length: number) {
      if (a === null || a === undefined) {
        return a;
      }
      return a.toString().substr(from, length);
    },
    union(...sets: FiltrexType[]) {
      return union(...sets.map(std.coerceArray));
    },
    intersection(...sets: FiltrexType[]) {
      return intersection(...sets.map(std.coerceArray));
    },
    difference(...sets: FiltrexType[]) {
      const [first, ...rest] = sets.map(std.coerceArray);
      return difference(first, ...rest);
    },
    unique(set: FiltrexType) {
      return unique(std.coerceArray(set));
    },
    ...functions,
  };

  const tree = FiltrexParser.parse(input);
  const js = [];
  const pathReferences: ReturnType<typeof JSON.parse> = [];

  js.push('return ');
  function toJs(node: string | string[]) {
    if (Array.isArray(node)) {
      if (node[1] === 'prop(') {
        pathReferences.push(JSON.parse(node[2]));
      }
      node.forEach(toJs);
    } else {
      js.push(node);
    }
  }

  tree.forEach(toJs);
  js.push(';');
  const func = new Function('fns', 'std', 'prop', js.join(''));

  if (onParse) {
    onParse({
      input,
      tree,
      functionObject: func as (...args: FiltrexType[]) => FiltrexType,
      pathReferences,
    });
  }

  return function ruleEvaluator<T>(data?: T) {
    return func(allFunctions, std, customResolver || getObjectResolver(data));
  };
}
