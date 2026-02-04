/**
 * Helium CSP - CSP-safe reactive library
 * A variant of Helium that works without unsafe-eval
 */

import { createHelium, defaultTeardown } from './helium.js';
import { parse, EvalAstFactory } from './jexpr.js';

// Disable the default helium instance from helium.js to prevent double-processing
defaultTeardown();

const astFactory = new EvalAstFactory();

// Transform template literals: `Hello ${name}!` → 'Hello ' + (name) + '!'
const preprocessTemplateLiterals = (expr) => {
  let result = '';
  let i = 0;

  while (i < expr.length) {
    // Look for backtick
    if (expr[i] === '`') {
      i++; // skip opening backtick
      let parts = [];
      let currentStr = '';

      while (i < expr.length && expr[i] !== '`') {
        if (expr[i] === '$' && expr[i + 1] === '{') {
          // Save accumulated string part
          if (currentStr || parts.length === 0) {
            parts.push(`'${currentStr}'`);
          }
          currentStr = '';
          i += 2; // skip ${

          // Find matching closing brace (handle nested braces)
          let braceDepth = 1;
          let exprContent = '';
          while (i < expr.length && braceDepth > 0) {
            if (expr[i] === '{') braceDepth++;
            else if (expr[i] === '}') braceDepth--;
            if (braceDepth > 0) exprContent += expr[i];
            i++;
          }
          parts.push(`(${exprContent})`);
        } else if (expr[i] === '\\' && i + 1 < expr.length) {
          // Handle escape sequences
          const next = expr[i + 1];
          if (next === 'n') currentStr += '\\n';
          else if (next === 't') currentStr += '\\t';
          else if (next === '`') currentStr += '`';
          else if (next === '$') currentStr += '$';
          else if (next === '\\') currentStr += '\\\\';
          else currentStr += expr[i + 1];
          i += 2;
        } else {
          // Escape single quotes for the output string
          if (expr[i] === "'") currentStr += "\\'";
          else currentStr += expr[i];
          i++;
        }
      }

      // Add final string part
      if (currentStr || parts.length === 0) {
        parts.push(`'${currentStr}'`);
      }

      i++; // skip closing backtick
      result += parts.join(' + ');
    } else {
      result += expr[i];
      i++;
    }
  }

  return result;
};

// Transform comma operator: `a = 1, b = 2` → `[a = 1, b = 2].pop()`
// Only transforms top-level commas (not inside parens, brackets, braces, or strings)
const preprocessCommaOperator = (expr) => {
  const commaPositions = [];
  let depth = 0;
  let inString = null;

  for (let i = 0; i < expr.length; i++) {
    const char = expr[i];
    const prev = expr[i - 1];

    // Handle string boundaries
    if ((char === '"' || char === "'") && prev !== '\\') {
      if (inString === char) inString = null;
      else if (!inString) inString = char;
      continue;
    }
    if (inString) continue;

    // Track nesting depth
    if (char === '(' || char === '[' || char === '{') depth++;
    else if (char === ')' || char === ']' || char === '}') depth--;
    else if (char === ',' && depth === 0) commaPositions.push(i);
  }

  // No top-level commas, return as-is
  if (commaPositions.length === 0) return expr;

  // Split by top-level commas and wrap in array with .pop()
  const parts = [];
  let lastIndex = 0;
  for (const pos of commaPositions) {
    parts.push(expr.slice(lastIndex, pos).trim());
    lastIndex = pos + 1;
  }
  parts.push(expr.slice(lastIndex).trim());

  return `[${parts.join(', ')}].pop()`;
};

// Pre-process expressions to handle ++ and -- operators
// Transforms: count++ -> (count = count + 1) - 1  (returns old value)
// Transforms: ++count -> (count = count + 1)      (returns new value)
const preprocess = (expr) => {
  // If expression looks like raw HTML, wrap it in quotes to make it a string
  const trimmed = expr.trim();
  if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
    return "'" + trimmed.replace(/'/g, "\\'") + "'";
  }
  // First handle template literals
  expr = preprocessTemplateLiterals(expr);
  // Handle comma operator
  expr = preprocessCommaOperator(expr);
  // Handle 'new' keyword for common constructors (jexpr doesn't support 'new')
  expr = expr.replace(/\bnew\s+Date\b/g, '$Date');
  expr = expr.replace(/\bnew\s+FormData\b/g, '$FormData');
  // Then handle ++ and -- operators
  return expr
    .replace(/(\$?\w+(?:\.\w+|\[\w+\])*)(\+\+)/g, '($1 = $1 + 1) - 1')
    .replace(/(\$?\w+(?:\.\w+|\[\w+\])*)(\-\-)/g, '($1 = $1 - 1) + 1')
    .replace(/\+\+(\$?\w+(?:\.\w+|\[\w+\])*)/g, '($1 = $1 + 1)')
    .replace(/\-\-(\$?\w+(?:\.\w+|\[\w+\])*)/g, '($1 = $1 - 1)');
};

// Compile expression cache
const cache = new Map();

// Reserved words that should not be auto-initialized as state
const RESERVED_WORDS = new Set([
  'null', 'undefined', 'true', 'false', 'this',
  'NaN', 'Infinity', 'Math', 'console', 'Object', 'Array',
  'String', 'Number', 'Boolean', 'Date', 'JSON', 'Map', 'Set'
]);

// jexpr-based expression engine (CSP-safe)
const jexprEngine = {
  compile(expr, withReturn = true) {
    const processed = preprocess(expr.trim());
    const cacheKey = `${withReturn}:${processed}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    try {
      const ast = parse(processed, astFactory);
      const compiled = {
        execute: (scope) => ast ? ast.evaluate(scope) : undefined,
        getIds: () => ast ? ast.getIds([]).filter(id => !RESERVED_WORDS.has(id)) : []
      };
      cache.set(cacheKey, compiled);
      return compiled;
    } catch (e) {
      console.error(`Failed to parse: "${expr}"`, e.message);
      const compiled = {
        execute: () => undefined,
        getIds: () => []
      };
      cache.set(cacheKey, compiled);
      return compiled;
    }
  },

  createScope(ctx) {
    const locals = {
      // Browser globals
      console, Math, Date, JSON,
      navigator, window, document, location, history,
      localStorage, sessionStorage,
      setTimeout, setInterval, clearTimeout, clearInterval,
      fetch, Promise, URL, URLSearchParams,
      alert, confirm, prompt,
      parseInt, parseFloat, isNaN, isFinite,
      encodeURIComponent, decodeURIComponent, encodeURI, decodeURI,
      atob, btoa,
      // Observers (optional - may not exist in all environments)
      ...(typeof IntersectionObserver !== 'undefined' && { IntersectionObserver }),
      ...(typeof ResizeObserver !== 'undefined' && { ResizeObserver }),
      ...(typeof MutationObserver !== 'undefined' && { MutationObserver }),
      // Helium helpers
      $: ctx.$,
      $el: ctx.el,
      $event: ctx.event,
      $data: ctx.state,
      $html: ctx.html,
      $Date: (...args) => new Date(...args),
      $FormData: el => new FormData(el),
      $get: ctx.get,
      $post: ctx.post,
      $put: ctx.put,
      $patch: ctx.patch,
      $delete: ctx.del,
      ...ctx.refs
    };
    // Proxy to allow state access and assignment without $data prefix
    return new Proxy(locals, {
      get(t, p) {
        return p in t ? t[p] : ctx.state[p];
      },
      set(t, p, v) {
        if (p in t) t[p] = v;
        else ctx.state[p] = v;
        return true;
      }
    });
  }
};

// Create helium with jexpr engine (CSP-safe)
const { helium, heliumTeardown } = createHelium({ engine: jexprEngine });

// Evaluate helper for testing
const evaluate = (expr, scope) => {
  const compiled = jexprEngine.compile(expr);
  return compiled.execute(scope);
};

// Expose globally
if (typeof window !== 'undefined') {
  window.helium = helium;
  window.heliumTeardown = heliumTeardown;
}

// Auto-initialize
if (typeof document !== 'undefined') {
  document.addEventListener("DOMContentLoaded", () => helium());
  // Turbo integration
  document.addEventListener("turbo:before-render", () => heliumTeardown());
  document.addEventListener("turbo:render", () => helium());
}

export { helium, heliumTeardown, evaluate, preprocess };
export default helium;
