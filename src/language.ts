import fs from 'fs';
import path from 'path';

import { Parser } from 'jison';

function sourceCode(args: (string | number)[], skipParentheses?: boolean) {
  const argsJs = args
    .map((arg) => (typeof arg === 'number' ? `$${arg}` : JSON.stringify(arg)))
    .join(',');

  return skipParentheses ? `$$ = [${argsJs}];` : `$$ = ["(", ${argsJs}, ")"];`;
}

const language = {
  // Lexical tokens
  lex: {
    rules: [
      ['\\*', 'return "*";'],
      ['\\/', 'return "/";'],
      ['-', 'return "-";'],
      ['\\+', 'return "+";'],
      ['\\^', 'return "^";'],
      ['\\%', 'return "%";'],
      ['\\(', 'return "(";'],
      ['\\[', 'return "[";'],
      ['\\)', 'return ")";'],
      ['\\]', 'return "]";'],
      ['\\,', 'return ",";'],
      ['==', 'return "==";'],
      ['\\!=', 'return "!=";'],
      ['\\~=', 'return "~=";'],
      ['>=', 'return ">=";'],
      ['<=', 'return "<=";'],
      ['<', 'return "<";'],
      ['>', 'return ">";'],
      ['\\?', 'return "?";'],
      ['\\:', 'return ":";'],
      ['and[^\\w]', 'return "and";'],
      ['or[^\\w]', 'return "or";'],
      ['not[^\\w]', 'return "not";'],
      ['in~[^\\w]', 'return "inexactin";'],
      ['in[^\\w]', 'return "in";'],

      ['\\s+', ''], // skip whitespace
      ['[0-9]+(?:\\.[0-9]+)?\\b', 'return "NUMBER";'], // 212.321

      [
        '[a-zA-Z$_][\\.a-zA-Z0-9$_]*',
        `yytext = JSON.stringify(yytext);
              return "SYMBOL";`,
      ], // some.Symbol22

      // eslint-disable-next-line quotes
      [
        "'(?:\\\\'|\\\\\\\\|[^'\\\\])*'",
        `yytext = yy.buildString("'", yytext);
              return "SYMBOL";`,
      ], // 'any \'escaped\' symbol'

      // eslint-disable-next-line quotes
      [
        '"(?:\\\\"|\\\\\\\\|[^"\\\\])*"',
        `yytext = yy.buildString('"', yytext);
              return "STRING";`,
      ], // "any \"escaped\" string"

      // End
      ['$', 'return "EOF";'],
    ],
  },
  // Operator precedence - lowest precedence first.
  // See http://www.gnu.org/software/bison/manual/html_node/Precedence.html
  // for a good explanation of how it works in Bison (and hence, Jison).
  // Different languages have different rules, but this seems a good starting
  // point: http://en.wikipedia.org/wiki/Order_of_operations#Programming_languages
  operators: [
    ['left', '?', ':'],
    ['left', 'or'],
    ['left', 'and'],
    ['left', 'inexactin'],
    ['left', 'in'],
    ['left', '==', '!=', '~='],
    ['left', '<', '<=', '>', '>='],
    ['left', '+', '-'],
    ['left', '*', '/', '%'],
    ['left', '^'],
    ['left', 'not'],
    ['left', 'UMINUS'],
  ],
};

const sourceGrammar = {
  ...language,
  bnf: {
    expressions: [
      // Entry point
      ['e EOF', 'return $1;'],
    ],
    e: [
      ['e + e', sourceCode([1, '+', 3])],
      ['e - e', sourceCode([1, '-', 3])],
      ['e * e', sourceCode([1, '*', 3])],
      ['e / e', sourceCode([1, '/', 3])],
      ['e % e', sourceCode([1, '%', 3])],
      ['e ^ e', sourceCode(['Math.pow(', 1, ',', 3, ')'])],
      ['- e', sourceCode(['-', 2]), { prec: 'UMINUS' }],
      ['e and e', sourceCode(['std.numify(', 1, '&&', 3, ')'])],
      ['e or e', sourceCode(['std.numify(', 1, '||', 3, ')'])],
      ['not e', sourceCode(['std.numify(!', 2, ')'])],
      ['e == e', sourceCode(['std.numify(', 1, '==', 3, ')'])],
      ['e != e', sourceCode(['std.numify(', 1, '!=', 3, ')'])],
      ['e ~= e', sourceCode(['std.numify(RegExp(', 3, ').test(', 1, '))'])],
      ['e < e', sourceCode(['std.numify(', 1, '<', 3, ')'])],
      ['e <= e', sourceCode(['std.numify(', 1, '<=', 3, ')'])],
      ['e > e', sourceCode(['std.numify(', 1, '> ', 3, ')'])],
      ['e >= e', sourceCode(['std.numify(', 1, '>=', 3, ')'])],
      ['e ? e : e', sourceCode([1, '?', 3, ':', 5])],
      ['( e )', sourceCode([2])],
      ['[ e ]', sourceCode(['[', 2, ']'])],
      ['( array , e )', sourceCode(['[', 2, ',', 4, ']'])],
      ['[ array , e ]', sourceCode(['[', 2, ',', 4, ']'])],
      ['NUMBER', sourceCode([1])],
      ['STRING', sourceCode([1])],
      ['SYMBOL', sourceCode(['prop(', 1, ')'])],
      [
        'SYMBOL ( )',
        sourceCode(['(std.isfn(fns, ', 1, ') ? (fns[', 1, '].call(prop)) : std.unknown(', 1, '))']),
      ],
      [
        'SYMBOL ( argsList )',
        sourceCode([
          '(std.isfn(fns, ',
          1,
          ') ? (fns[',
          1,
          '].call(prop, ',
          3,
          ')) : std.unknown(',
          1,
          '))',
        ]),
      ],
      ['e in e', sourceCode(['std.isSubset(', 1, ', ', 3, ')'])],
      ['e inexactin e', sourceCode(['std.isSubsetInexact(', 1, ', ', 3, ')'])],
      ['e not in e', sourceCode(['+!std.isSubset(', 1, ', ', 4, ')'])],
      ['e not inexactin e', sourceCode(['+!std.isSubsetInexact(', 1, ', ', 4, ')'])],
    ],
    argsList: [
      ['e', sourceCode([1], true)],
      ['argsList , e', sourceCode([1, ',', 3], true)],
    ],
    inSet: [
      ['e', sourceCode(['o ==', 1], true)],
      ['inSet , e', sourceCode([1, '|| o ==', 3], true)],
    ],
    array: [
      ['e', sourceCode([1])],
      ['array , e', sourceCode([1, ',', 3], true)],
    ],
  },
};

const astGrammar = {
  ...language,
  bnf: {
    expressions: [['e EOF', 'return $1;']],
    e: [
      ['e + e', '$$ = ["binary", "+", $1, $3];'],
      ['e - e', '$$ = ["binary", "-", $1, $3];'],
      ['e * e', '$$ = ["binary", "*", $1, $3];'],
      ['e / e', '$$ = ["binary", "/", $1, $3];'],
      ['e % e', '$$ = ["binary", "%", $1, $3];'],
      ['e ^ e', '$$ = ["binary", "^", $1, $3];'],
      ['- e', '$$ = ["unary", "-", $2];', { prec: 'UMINUS' }],
      ['e and e', '$$ = ["binary", "and", $1, $3];'],
      ['e or e', '$$ = ["binary", "or", $1, $3];'],
      ['not e', '$$ = ["unary", "not", $2];'],
      ['e == e', '$$ = ["binary", "==", $1, $3];'],
      ['e != e', '$$ = ["binary", "!=", $1, $3];'],
      ['e ~= e', '$$ = ["binary", "~=", $1, $3];'],
      ['e < e', '$$ = ["binary", "<", $1, $3];'],
      ['e <= e', '$$ = ["binary", "<=", $1, $3];'],
      ['e > e', '$$ = ["binary", ">", $1, $3];'],
      ['e >= e', '$$ = ["binary", ">=", $1, $3];'],
      ['e ? e : e', '$$ = ["conditional", $1, $3, $5];'],
      ['( e )', '$$ = $2;'],
      ['[ e ]', '$$ = ["array", [$2]];'],
      ['( array , e )', '$$ = ["array", $2.concat([$4])];'],
      ['[ array , e ]', '$$ = ["array", $2.concat([$4])];'],
      ['NUMBER', '$$ = ["literal", Number($1)];'],
      ['STRING', '$$ = ["literal", JSON.parse($1)];'],
      ['SYMBOL', '$$ = ["property", JSON.parse($1)];'],
      ['SYMBOL ( )', '$$ = ["call", JSON.parse($1), []];'],
      ['SYMBOL ( argsList )', '$$ = ["call", JSON.parse($1), $3];'],
      ['e in e', '$$ = ["binary", "in", $1, $3];'],
      ['e inexactin e', '$$ = ["binary", "in~", $1, $3];'],
      ['e not in e', '$$ = ["binary", "not in", $1, $4];'],
      ['e not inexactin e', '$$ = ["binary", "not in~", $1, $4];'],
    ],
    argsList: [
      ['e', '$$ = [$1];'],
      ['argsList , e', '$$ = $1.concat([$3]);'],
    ],
    array: [
      ['e', '$$ = [$1];'],
      ['array , e', '$$ = $1.concat([$3]);'],
    ],
  },
};

export const parser = new Parser(sourceGrammar);
export const astParser = new Parser(astGrammar);

if (require.main === module) {
  const parserSource = parser.generate({ moduleType: 'js', debug: true });
  fs.mkdirSync(path.join(__dirname, 'generated'), { recursive: true });
  fs.writeFileSync(
    path.join(__dirname, 'generated', 'parser.ts'),
    `//@ts-nocheck\n${parserSource}\nexport const FiltrexParser = parser;\n`,
    'utf8',
  );
  const astParserSource = astParser.generate({ moduleType: 'js', debug: true });
  fs.writeFileSync(
    path.join(__dirname, 'generated', 'ast-parser.ts'),
    `//@ts-nocheck\n${astParserSource}\nexport const FiltrexAstParser = parser;\n`,
    'utf8',
  );
}
