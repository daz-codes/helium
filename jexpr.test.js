import { describe, it, expect } from 'vitest';
import { parse, EvalAstFactory } from './jexpr.js';
import { evaluate as heliumEvaluate } from './helium-csp.js';

const astFactory = new EvalAstFactory();
const evaluate = (expr, scope = {}) => {
  const ast = parse(expr, astFactory);
  return ast.evaluate(scope);
};

describe('jexpr - Expression Parser', () => {

  describe('Literals', () => {
    it('should parse integers', () => {
      expect(evaluate('42')).toBe(42);
      expect(evaluate('0')).toBe(0);
      expect(evaluate('-5')).toBe(-5);
    });

    it('should parse decimals', () => {
      expect(evaluate('3.14')).toBe(3.14);
      expect(evaluate('0.5')).toBe(0.5);
      expect(evaluate('-2.5')).toBe(-2.5);
    });

    it('should parse strings with single quotes', () => {
      expect(evaluate("'hello'")).toBe('hello');
      expect(evaluate("'hello world'")).toBe('hello world');
      expect(evaluate("''")).toBe('');
    });

    it('should parse strings with double quotes', () => {
      expect(evaluate('"hello"')).toBe('hello');
      expect(evaluate('"hello world"')).toBe('hello world');
    });

    it('should handle escape sequences in strings', () => {
      expect(evaluate("'hello\\nworld'")).toBe('hello\nworld');
      expect(evaluate("'tab\\there'")).toBe('tab\there');
      expect(evaluate("'quote\\'s'")).toBe("quote's");
    });

    it('should parse boolean literals', () => {
      expect(evaluate('true')).toBe(true);
      expect(evaluate('false')).toBe(false);
    });

    it('should parse null and undefined', () => {
      expect(evaluate('null')).toBe(null);
      expect(evaluate('undefined')).toBe(undefined);
    });
  });

  describe('Identifiers', () => {
    it('should resolve identifiers from scope', () => {
      expect(evaluate('x', { x: 10 })).toBe(10);
      expect(evaluate('name', { name: 'Alice' })).toBe('Alice');
    });

    it('should return undefined for missing identifiers', () => {
      expect(evaluate('missing', {})).toBe(undefined);
    });

    it('should handle identifiers starting with $', () => {
      expect(evaluate('$data', { $data: 'value' })).toBe('value');
      expect(evaluate('$el', { $el: 'element' })).toBe('element');
    });

    it('should handle identifiers with underscores', () => {
      expect(evaluate('_private', { _private: 'secret' })).toBe('secret');
      expect(evaluate('my_var', { my_var: 123 })).toBe(123);
    });
  });

  describe('Property Access', () => {
    it('should access object properties with dot notation', () => {
      expect(evaluate('obj.name', { obj: { name: 'test' } })).toBe('test');
      expect(evaluate('user.age', { user: { age: 25 } })).toBe(25);
    });

    it('should access nested properties', () => {
      const scope = { a: { b: { c: 'deep' } } };
      expect(evaluate('a.b.c', scope)).toBe('deep');
    });

    it('should access array elements with bracket notation', () => {
      expect(evaluate('arr[0]', { arr: ['first', 'second'] })).toBe('first');
      expect(evaluate('arr[1]', { arr: ['first', 'second'] })).toBe('second');
    });

    it('should access object properties with bracket notation', () => {
      expect(evaluate("obj['key']", { obj: { key: 'value' } })).toBe('value');
    });

    it('should handle dynamic property access', () => {
      expect(evaluate('obj[key]', { obj: { a: 1, b: 2 }, key: 'b' })).toBe(2);
    });

    it('should return undefined for missing properties', () => {
      expect(evaluate('obj.missing', { obj: {} })).toBe(undefined);
    });

    it('should handle optional chaining style access safely', () => {
      // jexpr uses ?. internally for safety
      expect(evaluate('obj.prop', { obj: null })).toBe(undefined);
    });
  });

  describe('Arithmetic Operators', () => {
    it('should add numbers', () => {
      expect(evaluate('1 + 2')).toBe(3);
      expect(evaluate('10 + 20 + 30')).toBe(60);
    });

    it('should subtract numbers', () => {
      expect(evaluate('5 - 3')).toBe(2);
      expect(evaluate('10 - 3 - 2')).toBe(5);
    });

    it('should multiply numbers', () => {
      expect(evaluate('3 * 4')).toBe(12);
      expect(evaluate('2 * 3 * 4')).toBe(24);
    });

    it('should divide numbers', () => {
      expect(evaluate('10 / 2')).toBe(5);
      expect(evaluate('20 / 4 / 2')).toBe(2.5);
    });

    it('should calculate modulo', () => {
      expect(evaluate('10 % 3')).toBe(1);
      expect(evaluate('7 % 2')).toBe(1);
    });

    it('should respect operator precedence', () => {
      expect(evaluate('2 + 3 * 4')).toBe(14);
      expect(evaluate('10 - 4 / 2')).toBe(8);
      expect(evaluate('2 * 3 + 4 * 5')).toBe(26);
    });

    it('should handle parentheses', () => {
      expect(evaluate('(2 + 3) * 4')).toBe(20);
      expect(evaluate('10 / (2 + 3)')).toBe(2);
    });

    // Note: jexpr doesn't support prefix unary operators (-5, +5)
    // Use 0 - x or scope variables for negative numbers
    it('should handle negative numbers via subtraction', () => {
      expect(evaluate('0 - 5')).toBe(-5);
      expect(evaluate('10 - 5')).toBe(5);
      expect(evaluate('n', { n: -5 })).toBe(-5);
    });
  });

  describe('Comparison Operators', () => {
    it('should compare equality with ==', () => {
      expect(evaluate('1 == 1')).toBe(true);
      expect(evaluate('1 == 2')).toBe(false);
      expect(evaluate("1 == '1'")).toBe(true);
    });

    it('should compare strict equality with ===', () => {
      expect(evaluate('1 === 1')).toBe(true);
      expect(evaluate("1 === '1'")).toBe(false);
    });

    it('should compare inequality with !=', () => {
      expect(evaluate('1 != 2')).toBe(true);
      expect(evaluate('1 != 1')).toBe(false);
    });

    it('should compare strict inequality with !==', () => {
      expect(evaluate("1 !== '1'")).toBe(true);
      expect(evaluate('1 !== 1')).toBe(false);
    });

    it('should compare greater than', () => {
      expect(evaluate('5 > 3')).toBe(true);
      expect(evaluate('3 > 5')).toBe(false);
      expect(evaluate('3 > 3')).toBe(false);
    });

    it('should compare greater than or equal', () => {
      expect(evaluate('5 >= 3')).toBe(true);
      expect(evaluate('3 >= 3')).toBe(true);
      expect(evaluate('2 >= 3')).toBe(false);
    });

    it('should compare less than', () => {
      expect(evaluate('3 < 5')).toBe(true);
      expect(evaluate('5 < 3')).toBe(false);
    });

    it('should compare less than or equal', () => {
      expect(evaluate('3 <= 5')).toBe(true);
      expect(evaluate('3 <= 3')).toBe(true);
      expect(evaluate('5 <= 3')).toBe(false);
    });
  });

  describe('Logical Operators', () => {
    it('should evaluate logical AND', () => {
      expect(evaluate('true && true')).toBe(true);
      expect(evaluate('true && false')).toBe(false);
      expect(evaluate('false && true')).toBe(false);
    });

    it('should evaluate logical OR', () => {
      expect(evaluate('true || false')).toBe(true);
      expect(evaluate('false || true')).toBe(true);
      expect(evaluate('false || false')).toBe(false);
    });

    // Note: jexpr doesn't support prefix ! operator
    // Use ternary or comparison for negation: x ? false : true, or x == false
    it('should handle negation via ternary', () => {
      expect(evaluate('x ? false : true', { x: true })).toBe(false);
      expect(evaluate('x ? false : true', { x: false })).toBe(true);
      expect(evaluate('x == false', { x: true })).toBe(false);
      expect(evaluate('x == false', { x: false })).toBe(true);
    });

    it('should evaluate nullish coalescing', () => {
      expect(evaluate('null ?? "default"')).toBe('default');
      expect(evaluate('undefined ?? "default"')).toBe('default');
      expect(evaluate('"value" ?? "default"')).toBe('value');
      expect(evaluate('0 ?? "default"')).toBe(0);
      expect(evaluate('false ?? "default"')).toBe(false);
    });

    it('should short-circuit AND', () => {
      expect(evaluate('false && x', { x: 'not evaluated' })).toBe(false);
    });

    it('should short-circuit OR', () => {
      expect(evaluate('true || x', { x: 'not evaluated' })).toBe(true);
    });
  });

  describe('Ternary Operator', () => {
    it('should evaluate ternary with true condition', () => {
      expect(evaluate("true ? 'yes' : 'no'")).toBe('yes');
    });

    it('should evaluate ternary with false condition', () => {
      expect(evaluate("false ? 'yes' : 'no'")).toBe('no');
    });

    it('should evaluate ternary with expression condition', () => {
      expect(evaluate("5 > 3 ? 'bigger' : 'smaller'")).toBe('bigger');
      expect(evaluate("2 > 3 ? 'bigger' : 'smaller'")).toBe('smaller');
    });

    it('should handle nested ternary', () => {
      expect(evaluate("true ? (false ? 'a' : 'b') : 'c'")).toBe('b');
    });

    it('should use scope values in ternary', () => {
      expect(evaluate("x > 0 ? 'positive' : 'non-positive'", { x: 5 })).toBe('positive');
      expect(evaluate("x > 0 ? 'positive' : 'non-positive'", { x: -5 })).toBe('non-positive');
    });
  });

  describe('Function Calls', () => {
    it('should call functions from scope', () => {
      const scope = { double: x => x * 2 };
      expect(evaluate('double(5)', scope)).toBe(10);
    });

    it('should call functions with multiple arguments', () => {
      const scope = { add: (a, b) => a + b };
      expect(evaluate('add(3, 4)', scope)).toBe(7);
    });

    it('should call functions with no arguments', () => {
      const scope = { getValue: () => 42 };
      expect(evaluate('getValue()', scope)).toBe(42);
    });

    it('should call methods on objects', () => {
      const scope = { str: 'hello' };
      expect(evaluate('str.toUpperCase()', scope)).toBe('HELLO');
    });

    it('should call methods with arguments', () => {
      const scope = { arr: [1, 2, 3] };
      expect(evaluate('arr.includes(2)', scope)).toBe(true);
      expect(evaluate('arr.includes(5)', scope)).toBe(false);
    });

    it('should chain method calls', () => {
      const scope = { str: '  hello  ' };
      expect(evaluate('str.trim().toUpperCase()', scope)).toBe('HELLO');
    });

    it('should handle Math functions', () => {
      const scope = { Math };
      expect(evaluate('Math.abs(-5)', scope)).toBe(5);
      expect(evaluate('Math.max(1, 5, 3)', scope)).toBe(5);
      expect(evaluate('Math.round(3.7)', scope)).toBe(4);
    });

    it('should handle console.log', () => {
      const logs = [];
      const scope = { console: { log: (...args) => logs.push(args) } };
      evaluate("console.log('test')", scope);
      expect(logs).toEqual([['test']]);
    });
  });

  describe('Arrow Functions', () => {
    it('should parse single-param arrow function without parens', () => {
      const fn = evaluate('x => x * 2');
      expect(fn(5)).toBe(10);
    });

    it('should parse single-param arrow function with parens', () => {
      const fn = evaluate('(x) => x * 2');
      expect(fn(5)).toBe(10);
    });

    it('should parse multi-param arrow function', () => {
      const fn = evaluate('(a, b) => a + b');
      expect(fn(3, 4)).toBe(7);
    });

    it('should parse no-param arrow function', () => {
      const fn = evaluate('() => 42');
      expect(fn()).toBe(42);
    });

    it('should capture scope in arrow function', () => {
      const scope = { multiplier: 10 };
      const fn = evaluate('x => x * multiplier', scope);
      expect(fn(5)).toBe(50);
    });

    it('should work as callback in map-like usage', () => {
      const scope = {
        items: [1, 2, 3],
        map: (arr, fn) => arr.map(fn)
      };
      const result = evaluate('map(items, x => x * 2)', scope);
      expect(result).toEqual([2, 4, 6]);
    });
  });

  describe('Array Literals', () => {
    it('should parse empty array', () => {
      expect(evaluate('[]')).toEqual([]);
    });

    it('should parse array with values', () => {
      expect(evaluate('[1, 2, 3]')).toEqual([1, 2, 3]);
    });

    it('should parse array with mixed types', () => {
      expect(evaluate("[1, 'two', true]")).toEqual([1, 'two', true]);
    });

    it('should parse nested arrays', () => {
      expect(evaluate('[[1, 2], [3, 4]]')).toEqual([[1, 2], [3, 4]]);
    });

    it('should parse array with expressions', () => {
      expect(evaluate('[1 + 1, 2 * 2, 3]')).toEqual([2, 4, 3]);
    });

    it('should parse array with scope values', () => {
      expect(evaluate('[x, y]', { x: 10, y: 20 })).toEqual([10, 20]);
    });
  });

  describe('Object Literals (Maps)', () => {
    it('should parse empty object', () => {
      expect(evaluate('{}')).toEqual({});
    });

    it('should parse object with properties', () => {
      expect(evaluate('{a: 1, b: 2}')).toEqual({ a: 1, b: 2 });
    });

    it('should parse object with string keys', () => {
      expect(evaluate("{'key': 'value'}")).toEqual({ key: 'value' });
    });

    it('should parse object with expression values', () => {
      expect(evaluate('{sum: 1 + 2, product: 3 * 4}')).toEqual({ sum: 3, product: 12 });
    });

    it('should parse object with scope values', () => {
      expect(evaluate('{x: x, y: y}', { x: 10, y: 20 })).toEqual({ x: 10, y: 20 });
    });

    it('should parse nested objects', () => {
      expect(evaluate('{outer: {inner: 42}}')).toEqual({ outer: { inner: 42 } });
    });
  });

  describe('Assignment', () => {
    it('should assign to scope variables', () => {
      const scope = { x: 0 };
      evaluate('x = 10', scope);
      expect(scope.x).toBe(10);
    });

    it('should assign to object properties', () => {
      const scope = { obj: { value: 0 } };
      evaluate('obj.value = 42', scope);
      expect(scope.obj.value).toBe(42);
    });

    it('should assign to array indices', () => {
      const scope = { arr: [1, 2, 3] };
      evaluate('arr[1] = 99', scope);
      expect(scope.arr[1]).toBe(99);
    });

    it('should return assigned value', () => {
      const scope = { x: 0 };
      expect(evaluate('x = 10', scope)).toBe(10);
    });
  });

  describe('String Concatenation', () => {
    it('should concatenate strings', () => {
      expect(evaluate("'hello' + ' ' + 'world'")).toBe('hello world');
    });

    it('should concatenate strings and numbers', () => {
      expect(evaluate("'count: ' + 42")).toBe('count: 42');
    });

    it('should concatenate with scope values', () => {
      expect(evaluate("'Hello, ' + name + '!'", { name: 'Alice' })).toBe('Hello, Alice!');
    });
  });

  describe('Complex Expressions', () => {
    it('should handle complex arithmetic', () => {
      expect(evaluate('((2 + 3) * 4 - 10) / 2')).toBe(5);
    });

    it('should handle complex boolean logic', () => {
      expect(evaluate('(true && false) || (true && true)')).toBe(true);
    });

    it('should handle complex property access and calls', () => {
      const scope = {
        users: [
          { name: 'Alice', age: 30 },
          { name: 'Bob', age: 25 }
        ]
      };
      expect(evaluate('users[0].name', scope)).toBe('Alice');
      expect(evaluate('users[1].age', scope)).toBe(25);
    });

    it('should handle chained operations', () => {
      const scope = {
        data: {
          items: [{ value: 10 }, { value: 20 }]
        }
      };
      expect(evaluate('data.items[1].value * 2', scope)).toBe(40);
    });
  });

  describe('getIds - Dependency Tracking', () => {
    it('should return identifiers from simple expression', () => {
      const ast = parse('x + y', astFactory);
      expect(ast.getIds([])).toContain('x');
      expect(ast.getIds([])).toContain('y');
    });

    it('should return identifier from property access', () => {
      const ast = parse('obj.prop', astFactory);
      expect(ast.getIds([])).toContain('obj');
    });

    it('should return identifiers from function call', () => {
      const ast = parse('fn(a, b)', astFactory);
      expect(ast.getIds([])).toContain('fn');
      expect(ast.getIds([])).toContain('a');
      expect(ast.getIds([])).toContain('b');
    });

    it('should not include arrow function params as external deps', () => {
      const ast = parse('x => x * multiplier', astFactory);
      const ids = ast.getIds([]);
      expect(ids).not.toContain('x');
      expect(ids).toContain('multiplier');
    });
  });

  describe('Error Handling', () => {
    it('should throw on unterminated string', () => {
      expect(() => parse("'unterminated", astFactory)).toThrow();
    });

    it('should throw on unexpected token', () => {
      expect(() => parse('1 + + +', astFactory)).toThrow();
    });

    it('should throw on invalid assignment target', () => {
      const ast = parse('1 = 2', astFactory);
      expect(() => ast.evaluate({})).toThrow();
    });
  });

  describe('Template Literal Preprocessing', () => {
    it('should transform simple template to string', () => {
      // Test via heliumEvaluate which uses preprocess internally
      expect(heliumEvaluate('`hello`', {})).toBe('hello');
    });

    it('should transform template with interpolation', () => {
      expect(heliumEvaluate('`Hello ${name}!`', { name: 'World' })).toBe('Hello World!');
    });

    it('should handle multiple interpolations', () => {
      expect(heliumEvaluate('`${a} + ${b} = ${a + b}`', { a: 2, b: 3 })).toBe('2 + 3 = 5');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty expression', () => {
      const ast = parse('', astFactory);
      expect(ast.evaluate({})).toEqual({});
    });

    it('should handle whitespace-only expression', () => {
      const ast = parse('   ', astFactory);
      expect(ast.evaluate({})).toEqual({});
    });

    it('should handle deeply nested parentheses', () => {
      expect(evaluate('(((1 + 2)))')).toBe(3);
    });

    it('should handle this keyword', () => {
      const scope = { value: 42 };
      expect(evaluate('this', scope)).toBe(scope);
    });

    it('should handle numbers with leading decimal', () => {
      expect(evaluate('.5')).toBe(0.5);
      expect(evaluate('-.5')).toBe(-0.5);
    });
  });
});
