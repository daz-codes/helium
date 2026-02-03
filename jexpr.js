/**
 * jexpr - A simple expression parser and evaluator
 * Vendored and adapted for Hydrogen
 *
 * @license BSD-3-Clause
 * Copyright 2013, the Dart project authors. All rights reserved.
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 *   * Redistributions of source code must retain the above copyright notice,
 *     this list of conditions and the following disclaimer.
 *   * Redistributions in binary form must reproduce the above copyright notice,
 *     this list of conditions and the following disclaimer in the documentation
 *     and/or other materials provided with the distribution.
 *   * Neither the name of Google Inc. nor the names of its contributors may be
 *     used to endorse or promote products derived from this software without
 *     specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED.
 *
 * Based on https://github.com/nicehub/nicr-jexpr by Justin Fagnani
 */

// ============================================================================
// Constants
// ============================================================================

const UNARY_OPERATORS = ['+', '-', '!'];
const BINARY_OPERATORS = [
  '=', '+', '-', '*', '/', '%',
  '==', '!=', '===', '!==',
  '>', '<', '>=', '<=',
  '||', '&&', '??',
];

const PRECEDENCE = {
  '!': 0, ':': 0, ',': 0, ')': 0, ']': 0, '}': 0,
  '?': 2, '??': 3, '||': 4, '&&': 5,
  '!=': 9, '==': 9, '!==': 9, '===': 9,
  '>=': 10, '>': 10, '<=': 10, '<': 10,
  '+': 11, '-': 11,
  '%': 12, '/': 12, '*': 12,
  '(': 13, '[': 13, '.': 13, '{': 13,
};

const POSTFIX_PRECEDENCE = 13;

// ============================================================================
// Tokenizer
// ============================================================================

const Kind = {
  STRING: 1,
  IDENTIFIER: 2,
  DOT: 3,
  COMMA: 4,
  COLON: 5,
  INTEGER: 6,
  DECIMAL: 7,
  OPERATOR: 8,
  GROUPER: 9,
  KEYWORD: 10,
  ARROW: 11,
};

const token = (kind, value, precedence = 0) => ({ kind, value, precedence });

const _isWhitespace = (ch) => ch === 9 || ch === 10 || ch === 13 || ch === 32;
const _isIdentOrKeywordStart = (ch) => ch === 95 || ch === 36 || ((ch &= ~32), 65 <= ch && ch <= 90);
const _isIdentifier = (ch) => _isIdentOrKeywordStart(ch) || _isNumber(ch);
const _isQuote = (ch) => ch === 34 || ch === 39;
const _isNumber = (ch) => 48 <= ch && ch <= 57;
const _isOperator = (ch) => ch === 43 || ch === 45 || ch === 42 || ch === 47 || ch === 33 ||
                           ch === 38 || ch === 37 || ch === 60 || ch === 61 || ch === 62 ||
                           ch === 63 || ch === 94 || ch === 124;
const _isGrouper = (ch) => ch === 40 || ch === 41 || ch === 91 || ch === 93 || ch === 123 || ch === 125;

const _escapeString = (str) => str.replace(/\\(.)/g, (_, g) => {
  switch (g) {
    case 'n': return '\n';
    case 'r': return '\r';
    case 't': return '\t';
    case 'b': return '\b';
    case 'f': return '\f';
    default: return g;
  }
});

class Tokenizer {
  constructor(input) {
    this._input = input;
    this._index = -1;
    this._tokenStart = 0;
    this._advance();
  }

  nextToken() {
    while (_isWhitespace(this._next)) this._advance(true);
    if (_isQuote(this._next)) return this._tokenizeString();
    if (_isIdentOrKeywordStart(this._next)) return this._tokenizeIdentOrKeyword();
    if (_isNumber(this._next)) return this._tokenizeNumber();
    if (this._next === 46) return this._tokenizeDot();
    if (this._next === 44) return this._tokenizeComma();
    if (this._next === 58) return this._tokenizeColon();
    if (_isOperator(this._next)) return this._tokenizeOperator();
    if (_isGrouper(this._next)) return this._tokenizeGrouper();
    this._advance();
    if (this._next !== undefined) throw new Error(`Expected end of input, got ${this._next}`);
    return undefined;
  }

  _advance(resetTokenStart) {
    this._index++;
    if (this._index < this._input.length) {
      this._next = this._input.charCodeAt(this._index);
      if (resetTokenStart) this._tokenStart = this._index;
    } else {
      this._next = undefined;
    }
  }

  _getValue(lookahead = 0) {
    const v = this._input.substring(this._tokenStart, this._index + lookahead);
    if (lookahead === 0) this._tokenStart = this._index;
    return v;
  }

  _tokenizeString() {
    const quoteChar = this._next;
    this._advance(true);
    while (this._next !== quoteChar) {
      if (this._next === undefined) throw new Error('unterminated string');
      if (this._next === 92) {
        this._advance();
        if (this._next === undefined) throw new Error('unterminated string');
      }
      this._advance();
    }
    const t = token(Kind.STRING, _escapeString(this._getValue()));
    this._advance();
    return t;
  }

  _tokenizeIdentOrKeyword() {
    do { this._advance(); } while (_isIdentifier(this._next));
    const value = this._getValue();
    return token(value === 'this' ? Kind.KEYWORD : Kind.IDENTIFIER, value);
  }

  _tokenizeNumber() {
    do { this._advance(); } while (_isNumber(this._next));
    if (this._next === 46) return this._tokenizeDot();
    return token(Kind.INTEGER, this._getValue());
  }

  _tokenizeDot() {
    this._advance();
    if (_isNumber(this._next)) return this._tokenizeFraction();
    this._tokenStart = this._index;
    return token(Kind.DOT, '.', POSTFIX_PRECEDENCE);
  }

  _tokenizeComma() {
    this._advance(true);
    return token(Kind.COMMA, ',');
  }

  _tokenizeColon() {
    this._advance(true);
    return token(Kind.COLON, ':');
  }

  _tokenizeFraction() {
    do { this._advance(); } while (_isNumber(this._next));
    return token(Kind.DECIMAL, this._getValue());
  }

  _tokenizeOperator() {
    this._advance();
    let op = this._getValue(2);
    if (['===', '!=='].includes(op)) {
      this._advance();
      this._advance();
    } else {
      op = this._getValue(1);
      if (op === '=>') {
        this._advance();
        return token(Kind.ARROW, op);
      }
      if (['==', '!=', '<=', '>=', '||', '&&', '??'].includes(op)) {
        this._advance();
      }
    }
    op = this._getValue();
    return token(Kind.OPERATOR, op, PRECEDENCE[op]);
  }

  _tokenizeGrouper() {
    const value = String.fromCharCode(this._next);
    const t = token(Kind.GROUPER, value, PRECEDENCE[value]);
    this._advance(true);
    return t;
  }
}

// ============================================================================
// Parser
// ============================================================================

const parse = (expr, astFactory) => new Parser(expr, astFactory).parse();

class Parser {
  constructor(input, astFactory) {
    this._tokenizer = new Tokenizer(input);
    this._ast = astFactory;
  }

  parse() {
    this._advance();
    return this._parseExpression();
  }

  _advance(kind, value) {
    if (!this._matches(kind, value)) {
      throw new Error(`Expected kind ${kind} (${value}), was ${this._token?.kind} (${this._token?.value})`);
    }
    const t = this._tokenizer.nextToken();
    this._token = t;
    this._kind = t?.kind;
    this._value = t?.value;
  }

  _matches(kind, value) {
    return !((kind && this._kind !== kind) || (value && this._value !== value));
  }

  _parseExpression() {
    if (!this._token) return this._ast.empty();
    const expr = this._parseUnary();
    return expr === undefined ? undefined : this._parsePrecedence(expr, 0);
  }

  _parsePrecedence(left, precedence) {
    if (left === undefined) throw new Error('Expected left to be defined.');
    while (this._token) {
      if (this._matches(Kind.GROUPER, '(')) {
        left = this._ast.invoke(left, undefined, this._parseArguments());
      } else if (this._matches(Kind.GROUPER, '[')) {
        left = this._ast.index(left, this._parseIndex());
      } else if (this._matches(Kind.DOT)) {
        this._advance();
        left = this._makeInvokeOrGetter(left, this._parseUnary());
      } else if (this._matches(Kind.KEYWORD)) {
        break;
      } else if (this._matches(Kind.OPERATOR) && this._token.precedence >= precedence) {
        left = this._value === '?' ? this._parseTernary(left) : this._parseBinary(left, this._token);
      } else {
        break;
      }
    }
    return left;
  }

  _makeInvokeOrGetter(left, right) {
    if (right === undefined) throw new Error('expected identifier');
    if (right.type === 'ID') return this._ast.getter(left, right.value);
    if (right.type === 'Invoke' && right.receiver.type === 'ID') {
      return this._ast.invoke(left, right.receiver.value, right.arguments);
    }
    throw new Error(`expected identifier: ${right}`);
  }

  _parseBinary(left, op) {
    if (BINARY_OPERATORS.indexOf(op.value) === -1) throw new Error(`unknown operator: ${op.value}`);
    this._advance();
    let right = this._parseUnary();
    while ((this._kind === Kind.OPERATOR || this._kind === Kind.DOT || this._kind === Kind.GROUPER) &&
           this._token.precedence > op.precedence) {
      right = this._parsePrecedence(right, this._token.precedence);
    }
    return this._ast.binary(left, op.value, right);
  }

  _parseUnary() {
    if (this._matches(Kind.OPERATOR)) {
      const value = this._value;
      this._advance();
      if (value === '+' || value === '-') {
        if (this._matches(Kind.INTEGER)) return this._parseInteger(value);
        if (this._matches(Kind.DECIMAL)) return this._parseDecimal(value);
      }
      if (UNARY_OPERATORS.indexOf(value) === -1) throw new Error(`unexpected token: ${value}`);
      return this._ast.unary(value, this._parsePrecedence(this._parsePrimary(), POSTFIX_PRECEDENCE));
    }
    return this._parsePrimary();
  }

  _parseTernary(condition) {
    this._advance(Kind.OPERATOR, '?');
    const trueExpr = this._parseExpression();
    this._advance(Kind.COLON);
    const falseExpr = this._parseExpression();
    return this._ast.ternary(condition, trueExpr, falseExpr);
  }

  _parsePrimary() {
    switch (this._kind) {
      case Kind.KEYWORD:
        if (this._value === 'this') {
          this._advance();
          return this._ast.id('this');
        }
        throw new Error(`unexpected keyword: ${this._value}`);
      case Kind.IDENTIFIER:
        return this._parseInvokeOrIdentifier();
      case Kind.STRING:
        return this._parseString();
      case Kind.INTEGER:
        return this._parseInteger();
      case Kind.DECIMAL:
        return this._parseDecimal();
      case Kind.GROUPER:
        if (this._value === '(') return this._parseParenOrFunction();
        if (this._value === '{') return this._parseMap();
        if (this._value === '[') return this._parseList();
        return undefined;
      case Kind.COLON:
        throw new Error('unexpected token ":"');
      default:
        return undefined;
    }
  }

  _parseList() {
    const items = [];
    do {
      this._advance();
      if (this._matches(Kind.GROUPER, ']')) break;
      items.push(this._parseExpression());
    } while (this._matches(Kind.COMMA));
    this._advance(Kind.GROUPER, ']');
    return this._ast.list(items);
  }

  _parseMap() {
    const entries = {};
    do {
      this._advance();
      if (this._matches(Kind.GROUPER, '}')) break;
      const key = this._value;
      if (this._matches(Kind.STRING) || this._matches(Kind.IDENTIFIER)) this._advance();
      this._advance(Kind.COLON);
      entries[key] = this._parseExpression();
    } while (this._matches(Kind.COMMA));
    this._advance(Kind.GROUPER, '}');
    return this._ast.map(entries);
  }

  _parseInvokeOrIdentifier() {
    const value = this._value;
    if (value === 'true') { this._advance(); return this._ast.literal(true); }
    if (value === 'false') { this._advance(); return this._ast.literal(false); }
    if (value === 'null') { this._advance(); return this._ast.literal(null); }
    if (value === 'undefined') { this._advance(); return this._ast.literal(undefined); }
    const identifier = this._parseIdentifier();
    // Support single-param arrow function without parens: data => ...
    if (this._matches(Kind.ARROW)) {
      this._advance();
      const body = this._parseExpression();
      return this._ast.arrowFunction([identifier.value], body);
    }
    const args = this._parseArguments();
    return args ? this._ast.invoke(identifier, undefined, args) : identifier;
  }

  _parseIdentifier() {
    if (!this._matches(Kind.IDENTIFIER)) throw new Error(`expected identifier: ${this._value}`);
    const value = this._value;
    this._advance();
    return this._ast.id(value);
  }

  _parseArguments() {
    if (!this._matches(Kind.GROUPER, '(')) return undefined;
    const args = [];
    do {
      this._advance();
      if (this._matches(Kind.GROUPER, ')')) break;
      args.push(this._parseExpression());
    } while (this._matches(Kind.COMMA));
    this._advance(Kind.GROUPER, ')');
    return args;
  }

  _parseIndex() {
    this._advance();
    const expr = this._parseExpression();
    this._advance(Kind.GROUPER, ']');
    return expr;
  }

  _parseParenOrFunction() {
    const expressions = this._parseArguments();
    if (this._matches(Kind.ARROW)) {
      this._advance();
      const body = this._parseExpression();
      const params = expressions?.map((e) => e.value) ?? [];
      return this._ast.arrowFunction(params, body);
    }
    return this._ast.paren(expressions[0]);
  }

  _parseString() {
    const value = this._ast.literal(this._value);
    this._advance();
    return value;
  }

  _parseInteger(prefix = '') {
    const value = this._ast.literal(parseInt(`${prefix}${this._value}`, 10));
    this._advance();
    return value;
  }

  _parseDecimal(prefix = '') {
    const value = this._ast.literal(parseFloat(`${prefix}${this._value}`));
    this._advance();
    return value;
  }
}

// ============================================================================
// Evaluator (AST Factory)
// ============================================================================

const _BINARY_OPS = {
  '+': (a, b) => a + b,
  '-': (a, b) => a - b,
  '*': (a, b) => a * b,
  '/': (a, b) => a / b,
  '%': (a, b) => a % b,
  '==': (a, b) => a == b,
  '!=': (a, b) => a != b,
  '===': (a, b) => a === b,
  '!==': (a, b) => a !== b,
  '>': (a, b) => a > b,
  '>=': (a, b) => a >= b,
  '<': (a, b) => a < b,
  '<=': (a, b) => a <= b,
  '||': (a, b) => a || b,
  '&&': (a, b) => a && b,
  '??': (a, b) => a ?? b,
};

const _UNARY_OPS = {
  '+': (a) => a,
  '-': (a) => -a,
  '!': (a) => !a,
};

class EvalAstFactory {
  empty() {
    return {
      evaluate: (scope) => scope,
      getIds: (idents) => idents,
    };
  }

  literal(v) {
    return {
      value: v,
      evaluate() { return this.value; },
      getIds: (idents) => idents,
    };
  }

  id(v) {
    return {
      type: 'ID',
      value: v,
      evaluate(scope) {
        if (this.value === 'this') return scope;
        return scope?.[this.value];
      },
      getIds(idents) {
        idents.push(this.value);
        return idents;
      },
    };
  }

  unary(op, expr) {
    const f = _UNARY_OPS[op];
    return {
      child: expr,
      evaluate(scope) { return f(this.child.evaluate(scope)); },
      getIds(idents) { return this.child.getIds(idents); },
    };
  }

  binary(l, op, r) {
    const f = _BINARY_OPS[op];
    return {
      operator: op,
      left: l,
      right: r,
      evaluate(scope) {
        if (this.operator === '=') {
          if (this.left.type !== 'ID' && this.left.type !== 'Getter' && this.left.type !== 'Index') {
            throw new Error(`Invalid assignment target: ${this.left}`);
          }
          const value = this.right.evaluate(scope);
          let receiver, property;
          if (this.left.type === 'Getter') {
            receiver = this.left.receiver.evaluate(scope);
            property = this.left.name;
          } else if (this.left.type === 'Index') {
            receiver = this.left.receiver.evaluate(scope);
            property = this.left.argument.evaluate(scope);
          } else {
            receiver = scope;
            property = this.left.value;
          }
          return receiver === undefined ? undefined : (receiver[property] = value);
        }
        return f(this.left.evaluate(scope), this.right.evaluate(scope));
      },
      getIds(idents) {
        this.left.getIds(idents);
        this.right.getIds(idents);
        return idents;
      },
    };
  }

  getter(g, n) {
    return {
      type: 'Getter',
      receiver: g,
      name: n,
      evaluate(scope) { return this.receiver.evaluate(scope)?.[this.name]; },
      getIds(idents) { return this.receiver.getIds(idents); },
    };
  }

  invoke(receiver, method, args) {
    return {
      type: 'Invoke',
      receiver,
      method,
      arguments: args,
      evaluate(scope) {
        const recv = this.receiver.evaluate(scope);
        const _this = this.method ? recv : scope?.['this'] ?? scope;
        const f = this.method ? recv?.[this.method] : recv;
        const argValues = (this.arguments ?? []).map((a) => a?.evaluate(scope));
        return f?.apply?.(_this, argValues);
      },
      getIds(idents) {
        this.receiver.getIds(idents);
        this.arguments?.forEach((a) => a?.getIds(idents));
        return idents;
      },
    };
  }

  paren(e) { return e; }

  index(e, a) {
    return {
      type: 'Index',
      receiver: e,
      argument: a,
      evaluate(scope) { return this.receiver.evaluate(scope)?.[this.argument.evaluate(scope)]; },
      getIds(idents) { return this.receiver.getIds(idents); },
    };
  }

  ternary(c, t, f) {
    return {
      condition: c,
      trueExpr: t,
      falseExpr: f,
      evaluate(scope) {
        return this.condition.evaluate(scope) ? this.trueExpr.evaluate(scope) : this.falseExpr.evaluate(scope);
      },
      getIds(idents) {
        this.condition.getIds(idents);
        this.trueExpr.getIds(idents);
        this.falseExpr.getIds(idents);
        return idents;
      },
    };
  }

  map(entries) {
    return {
      entries,
      evaluate(scope) {
        const map = {};
        if (this.entries) {
          for (const key in this.entries) {
            if (this.entries[key]) map[key] = this.entries[key].evaluate(scope);
          }
        }
        return map;
      },
      getIds(idents) {
        if (this.entries) {
          for (const key in this.entries) {
            if (this.entries[key]) this.entries[key].getIds(idents);
          }
        }
        return idents;
      },
    };
  }

  list(l) {
    return {
      items: l,
      evaluate(scope) { return this.items?.map((a) => a?.evaluate(scope)); },
      getIds(idents) {
        this.items?.forEach((i) => i?.getIds(idents));
        return idents;
      },
    };
  }

  arrowFunction(params, body) {
    return {
      params,
      body,
      evaluate(scope) {
        const params = this.params;
        const body = this.body;
        return function (...args) {
          const paramsObj = Object.fromEntries(params.map((p, i) => [p, args[i]]));
          const newScope = new Proxy(scope ?? {}, {
            set(target, prop, value) {
              if (Object.hasOwn(paramsObj, prop)) paramsObj[prop] = value;
              return (target[prop] = value);
            },
            get(target, prop) {
              if (Object.hasOwn(paramsObj, prop)) return paramsObj[prop];
              return target[prop];
            },
          });
          return body.evaluate(newScope);
        };
      },
      getIds(idents) {
        return this.body.getIds(idents).filter((id) => !this.params.includes(id));
      },
    };
  }
}

// ============================================================================
// Exports
// ============================================================================

export { parse, EvalAstFactory };
