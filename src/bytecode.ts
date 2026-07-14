import toPath from 'lodash.topath';
import unique from 'lodash.uniq';
import union from 'lodash.union';
import intersection from 'lodash.intersection';
import difference from 'lodash.difference';

import { FiltrexAstParser } from './generated/ast-parser';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Value = any;
export type RuleFunction = (this: (name: string) => Value, ...args: Value[]) => Value;

const std = {
  numify(v: Value) {
    if (v !== null && typeof v === 'object') {
      return 1;
    }
    return Number(v);
  },

  isfn(fns: Value, funcName: string) {
    return Object.hasOwnProperty.call(fns, funcName) && typeof fns[funcName] === 'function';
  },

  unknown(funcName: string) {
    throw ReferenceError(`Unknown function: ${funcName}()`);
  },

  coerceArray(value: Value) {
    if (Array.isArray(value)) return value;
    return [value];
  },

  coerceBoolean(value: Value) {
    if (typeof value === 'boolean') return +value;
    return value;
  },

  isSubset(a: Value, b: Value) {
    const A = std.coerceArray(a);
    const B = std.coerceArray(b);
    return +A.every((val) => B.includes(val));
  },

  isSubsetInexact(a: Value, b: Value) {
    const A = std.coerceArray(a);
    const B = std.coerceArray(b);
    return +A.every((val) => B.findIndex((v) => String(v) === String(val)) >= 0);
  },

  buildString(inQuote: Value, inLiteral: Value) {
    const quote = String(inQuote)[0];
    const literal = String(inLiteral);
    let built = '';

    if (literal[0] !== quote || literal[literal.length - 1] !== quote)
      throw new Error(
        "Unexpected internal error: String literal doesn't begin/end with the right quotation mark.",
      );

    for (let i = 1; i < literal.length - 1; i += 1) {
      if (literal[i] === '\\') {
        i += 1;
        if (i >= literal.length - 1)
          throw new Error(
            'Unexpected internal error: Unescaped backslash at the end of string literal.',
          );

        if (literal[i] === '\\') built += '\\';
        else if (literal[i] === quote) built += quote;
        else
          throw new Error(
            `Unexpected internal error: Invalid escaped character in string literal: ${literal[i]}`,
          );
      } else if (literal[i] === quote) {
        throw new Error(
          'Unexpected internal error: String literal contains unescaped quotation mark.',
        );
      } else {
        built += literal[i];
      }
    }

    return JSON.stringify(built);
  },
};

FiltrexAstParser.yy = std;

function getFunctions(functions?: Record<string, RuleFunction>) {
  return {
    abs: Math.abs,
    ceil: Math.ceil,
    floor: Math.floor,
    log: Math.log,
    max: Math.max,
    min: Math.min,
    random: Math.random,
    round: Math.round,
    sqrt: Math.sqrt,
    length(o: Value) {
      return o?.length || 0;
    },
    lower(a: Value) {
      if (a === null || a === undefined) {
        return a;
      }
      return a.toString().toLocaleLowerCase();
    },
    substr(a: Value, from: number, length: number) {
      if (a === null || a === undefined) {
        return a;
      }
      return a.toString().substr(from, length);
    },
    union(...sets: Value[]) {
      return union(...sets.map(std.coerceArray));
    },
    intersection(...sets: Value[]) {
      return intersection(...sets.map(std.coerceArray));
    },
    difference(...sets: Value[]) {
      const [first, ...rest] = sets.map(std.coerceArray);
      return difference(first, ...rest);
    },
    unique(set: Value) {
      return unique(std.coerceArray(set));
    },
    ...functions,
  } as Record<string, RuleFunction>;
}

type UnaryOperator = '-' | 'not';
type BinaryOperator =
  | '+'
  | '-'
  | '*'
  | '/'
  | '%'
  | '^'
  | 'and'
  | 'or'
  | '=='
  | '!='
  | '~='
  | '<'
  | '<='
  | '>'
  | '>='
  | 'in'
  | 'in~'
  | 'not in'
  | 'not in~';

type AstNode =
  | ['literal', Value]
  | ['property', string]
  | ['unary', UnaryOperator, AstNode]
  | ['binary', BinaryOperator, AstNode, AstNode]
  | ['conditional', AstNode, AstNode, AstNode]
  | ['array', AstNode[]]
  | ['call', string, AstNode[]];

enum Opcode {
  Constant,
  Property,
  Negate,
  Not,
  Add,
  Subtract,
  Multiply,
  Divide,
  Modulo,
  Power,
  Equal,
  NotEqual,
  Regex,
  Less,
  LessEqual,
  Greater,
  GreaterEqual,
  In,
  InexactIn,
  NotIn,
  NotInexactIn,
  Array,
  Call,
  Jump,
  JumpIfFalsyOrPop,
  JumpIfTruthyOrPop,
  JumpIfFalsyPop,
  Numify,
  Return,
}

interface BytecodeProgram {
  version: 1;
  constants: Value[];
  paths: string[][];
  functions: string[];
  code: number[];
}

const BYTECODE_CACHE_SIZE = 256;
const bytecodeCache = new Map<string, BytecodeProgram>();

const binaryOpcodes: Record<Exclude<BinaryOperator, 'and' | 'or'>, Opcode> = {
  '+': Opcode.Add,
  '-': Opcode.Subtract,
  '*': Opcode.Multiply,
  '/': Opcode.Divide,
  '%': Opcode.Modulo,
  '^': Opcode.Power,
  '==': Opcode.Equal,
  '!=': Opcode.NotEqual,
  '~=': Opcode.Regex,
  '<': Opcode.Less,
  '<=': Opcode.LessEqual,
  '>': Opcode.Greater,
  '>=': Opcode.GreaterEqual,
  in: Opcode.In,
  'in~': Opcode.InexactIn,
  'not in': Opcode.NotIn,
  'not in~': Opcode.NotInexactIn,
};

export function toBytecode(rule: string): string {
  const ast = FiltrexAstParser.parse(rule) as AstNode;
  const program: BytecodeProgram = {
    version: 1,
    constants: [],
    paths: [],
    functions: [],
    code: [],
  };

  function intern<T>(values: T[], value: T, key: (entry: T) => string) {
    const valueKey = key(value);
    const existing = values.findIndex((entry) => key(entry) === valueKey);
    if (existing >= 0) return existing;
    return values.push(value) - 1;
  }

  function emit(...values: number[]) {
    program.code.push(...values);
  }

  function emitJump(opcode: Opcode) {
    emit(opcode, 0);
    return program.code.length - 1;
  }

  function patchJump(targetIndex: number) {
    program.code[targetIndex] = program.code.length;
  }

  function compile(node: AstNode): void {
    switch (node[0]) {
      case 'literal': {
        const index = intern(program.constants, node[1], JSON.stringify);
        emit(Opcode.Constant, index);
        return;
      }
      case 'property': {
        const path = toPath(node[1]);
        const index = intern(program.paths, path, JSON.stringify);
        emit(Opcode.Property, index);
        return;
      }
      case 'unary':
        compile(node[2]);
        emit(node[1] === '-' ? Opcode.Negate : Opcode.Not);
        return;
      case 'binary': {
        if (node[1] === 'and' || node[1] === 'or') {
          compile(node[2]);
          const jump = emitJump(
            node[1] === 'and' ? Opcode.JumpIfFalsyOrPop : Opcode.JumpIfTruthyOrPop,
          );
          compile(node[3]);
          patchJump(jump);
          emit(Opcode.Numify);
          return;
        }
        compile(node[2]);
        compile(node[3]);
        emit(binaryOpcodes[node[1]]);
        return;
      }
      case 'conditional': {
        compile(node[1]);
        const otherwise = emitJump(Opcode.JumpIfFalsyPop);
        compile(node[2]);
        const end = emitJump(Opcode.Jump);
        patchJump(otherwise);
        compile(node[3]);
        patchJump(end);
        return;
      }
      case 'array':
        node[1].forEach(compile);
        emit(Opcode.Array, node[1].length);
        return;
      case 'call': {
        node[2].forEach(compile);
        const functionIndex = intern(program.functions, node[1], String);
        emit(Opcode.Call, functionIndex, node[2].length);
      }
    }
  }

  compile(ast);
  emit(Opcode.Return);
  return JSON.stringify(program);
}

function parseBytecode(bytecode: string): BytecodeProgram {
  const cached = bytecodeCache.get(bytecode);
  if (cached) return cached;

  const parsed: unknown = JSON.parse(bytecode);
  if (
    parsed === null ||
    typeof parsed !== 'object' ||
    (parsed as BytecodeProgram).version !== 1 ||
    !Array.isArray((parsed as BytecodeProgram).constants) ||
    !Array.isArray((parsed as BytecodeProgram).paths) ||
    !(parsed as BytecodeProgram).paths.every(
      (path) => Array.isArray(path) && path.every((part) => typeof part === 'string'),
    ) ||
    !Array.isArray((parsed as BytecodeProgram).functions) ||
    !(parsed as BytecodeProgram).functions.every((name) => typeof name === 'string') ||
    !Array.isArray((parsed as BytecodeProgram).code) ||
    !(parsed as BytecodeProgram).code.every(Number.isInteger)
  ) {
    throw new Error('Invalid rule bytecode');
  }
  const program = parsed as BytecodeProgram;
  if (bytecodeCache.size >= BYTECODE_CACHE_SIZE) {
    const oldest = bytecodeCache.keys().next().value;
    if (oldest !== undefined) bytecodeCache.delete(oldest);
  }
  bytecodeCache.set(bytecode, program);
  return program;
}

function getBytecodeResolver(values: Record<string, Value>) {
  const cachedValues = new WeakMap<object, Record<string, Value>>();

  function resolvePath(path: string[]) {
    let current: Value = values;
    for (const key of path) {
      if (current === null || current === undefined) return undefined;
      const container = Object(current) as Record<string, Value>;
      let value = Object.prototype.hasOwnProperty.call(container, key) ? container[key] : undefined;
      if (typeof value === 'function') {
        let cache = cachedValues.get(container);
        if (!cache) {
          cache = {};
          cachedValues.set(container, cache);
        }
        if (Object.prototype.hasOwnProperty.call(cache, key)) {
          value = cache[key];
        } else {
          value = value(resolve, values, container, path.join('.'));
          cache[key] = value;
        }
      }
      current = value;
    }
    return current;
  }

  function resolve(name: string) {
    return resolvePath(toPath(name));
  }

  return { resolve, resolvePath };
}

export function runBytecode(
  bytecode: string,
  values: Record<string, Value>,
  functions: Record<string, RuleFunction> = {},
): Value {
  const program = parseBytecode(bytecode);
  const availableFunctions = getFunctions(functions);
  const resolver = getBytecodeResolver(values);
  const stack: Value[] = [];
  let pc = 0;

  function operand() {
    const value = program.code[pc++];
    if (!Number.isInteger(value)) throw new Error('Invalid rule bytecode operand');
    return value;
  }

  function pop() {
    if (!stack.length) throw new Error('Invalid rule bytecode stack');
    return stack.pop();
  }

  function jump(target: number) {
    if (target <= pc || target > program.code.length) {
      throw new Error('Invalid rule bytecode jump');
    }
    pc = target;
  }

  while (pc < program.code.length) {
    const opcode = operand() as Opcode;
    switch (opcode) {
      case Opcode.Constant: {
        const index = operand();
        if (index < 0 || index >= program.constants.length)
          throw new Error('Invalid rule bytecode constant');
        stack.push(program.constants[index]);
        break;
      }
      case Opcode.Property: {
        const index = operand();
        if (index < 0 || index >= program.paths.length)
          throw new Error('Invalid rule bytecode property');
        stack.push(resolver.resolvePath(program.paths[index]));
        break;
      }
      case Opcode.Negate:
        stack.push(-pop());
        break;
      case Opcode.Not:
        stack.push(std.numify(!pop()));
        break;
      case Opcode.Add: {
        const right = pop();
        stack.push(pop() + right);
        break;
      }
      case Opcode.Subtract: {
        const right = pop();
        stack.push(pop() - right);
        break;
      }
      case Opcode.Multiply: {
        const right = pop();
        stack.push(pop() * right);
        break;
      }
      case Opcode.Divide: {
        const right = pop();
        stack.push(pop() / right);
        break;
      }
      case Opcode.Modulo: {
        const right = pop();
        stack.push(pop() % right);
        break;
      }
      case Opcode.Power: {
        const right = pop();
        stack.push(Math.pow(pop(), right));
        break;
      }
      case Opcode.Equal: {
        const right = pop();
        // Deliberately preserve the language's inexact equality semantics.
        // eslint-disable-next-line eqeqeq
        stack.push(std.numify(pop() == right));
        break;
      }
      case Opcode.NotEqual: {
        const right = pop();
        // Deliberately preserve the language's inexact equality semantics.
        // eslint-disable-next-line eqeqeq
        stack.push(std.numify(pop() != right));
        break;
      }
      case Opcode.Regex: {
        const pattern = pop();
        stack.push(std.numify(RegExp(pattern).test(pop())));
        break;
      }
      case Opcode.Less: {
        const right = pop();
        stack.push(std.numify(pop() < right));
        break;
      }
      case Opcode.LessEqual: {
        const right = pop();
        stack.push(std.numify(pop() <= right));
        break;
      }
      case Opcode.Greater: {
        const right = pop();
        stack.push(std.numify(pop() > right));
        break;
      }
      case Opcode.GreaterEqual: {
        const right = pop();
        stack.push(std.numify(pop() >= right));
        break;
      }
      case Opcode.In: {
        const right = pop();
        stack.push(std.isSubset(pop(), right));
        break;
      }
      case Opcode.InexactIn: {
        const right = pop();
        stack.push(std.isSubsetInexact(pop(), right));
        break;
      }
      case Opcode.NotIn: {
        const right = pop();
        stack.push(+!std.isSubset(pop(), right));
        break;
      }
      case Opcode.NotInexactIn: {
        const right = pop();
        stack.push(+!std.isSubsetInexact(pop(), right));
        break;
      }
      case Opcode.Array: {
        const count = operand();
        if (count < 0 || count > stack.length) throw new Error('Invalid rule bytecode array');
        stack.push(stack.splice(stack.length - count, count));
        break;
      }
      case Opcode.Call: {
        const functionIndex = operand();
        const argumentCount = operand();
        const name = program.functions[functionIndex];
        if (
          functionIndex < 0 ||
          functionIndex >= program.functions.length ||
          argumentCount < 0 ||
          argumentCount > stack.length
        ) {
          throw new Error('Invalid rule bytecode call');
        }
        if (!std.isfn(availableFunctions, name)) std.unknown(name);
        const args = stack.splice(stack.length - argumentCount, argumentCount);
        stack.push(availableFunctions[name].call(resolver.resolve, ...args));
        break;
      }
      case Opcode.Jump:
        jump(operand());
        break;
      case Opcode.JumpIfFalsyOrPop: {
        const target = operand();
        if (stack[stack.length - 1]) pop();
        else jump(target);
        break;
      }
      case Opcode.JumpIfTruthyOrPop: {
        const target = operand();
        if (stack[stack.length - 1]) jump(target);
        else pop();
        break;
      }
      case Opcode.JumpIfFalsyPop: {
        const target = operand();
        if (!pop()) jump(target);
        break;
      }
      case Opcode.Numify:
        stack.push(std.numify(pop()));
        break;
      case Opcode.Return:
        if (stack.length !== 1 || pc !== program.code.length)
          throw new Error('Invalid rule bytecode result');
        return pop();
      default:
        throw new Error(`Unknown rule bytecode opcode: ${opcode}`);
    }
  }
  throw new Error('Rule bytecode did not return a value');
}
