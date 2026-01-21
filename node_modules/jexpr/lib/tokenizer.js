/*
 * @license
 * Portions Copyright (c) 2013, the Dart project authors.
 */
import { KEYWORDS, POSTFIX_PRECEDENCE, PRECEDENCE } from './constants.js';
const _TWO_CHAR_OPS = ['==', '!=', '<=', '>=', '||', '&&', '??', '|>'];
const _THREE_CHAR_OPS = ['===', '!=='];
export var Kind;
(function (Kind) {
    Kind[Kind["STRING"] = 1] = "STRING";
    Kind[Kind["IDENTIFIER"] = 2] = "IDENTIFIER";
    Kind[Kind["DOT"] = 3] = "DOT";
    Kind[Kind["COMMA"] = 4] = "COMMA";
    Kind[Kind["COLON"] = 5] = "COLON";
    Kind[Kind["INTEGER"] = 6] = "INTEGER";
    Kind[Kind["DECIMAL"] = 7] = "DECIMAL";
    Kind[Kind["OPERATOR"] = 8] = "OPERATOR";
    Kind[Kind["GROUPER"] = 9] = "GROUPER";
    Kind[Kind["KEYWORD"] = 10] = "KEYWORD";
    Kind[Kind["ARROW"] = 11] = "ARROW";
})(Kind || (Kind = {}));
export const token = (kind, value, precedence = 0) => ({
    kind,
    value,
    precedence,
});
const _isWhitespace = (ch) => ch === 9 /* \t */ ||
    ch === 10 /* \n */ ||
    ch === 13 /* \r */ ||
    ch === 32; /* space */
// TODO(justinfagnani): allow code points > 127
const _isIdentOrKeywordStart = (ch) => ch === 95 /* _ */ ||
    ch === 36 /* $ */ ||
    // ch &= ~32 puts ch into the range [65,90] [A-Z] only if ch was already in
    // the that range or in the range [97,122] [a-z]. We must mutate ch only after
    // checking other characters, thus the comma operator.
    ((ch &= ~32), 65 /* A */ <= ch && ch <= 90); /* Z */
// TODO(justinfagnani): allow code points > 127
const _isIdentifier = (ch) => _isIdentOrKeywordStart(ch) || _isNumber(ch);
const _isKeyword = (str) => KEYWORDS.indexOf(str) !== -1;
const _isQuote = (ch) => ch === 34 /* " */ || ch === 39; /* ' */
const _isNumber = (ch) => 48 /* 0 */ <= ch && ch <= 57; /* 9 */
const _isOperator = (ch) => ch === 43 /* + */ ||
    ch === 45 /* - */ ||
    ch === 42 /* * */ ||
    ch === 47 /* / */ ||
    ch === 33 /* ! */ ||
    ch === 38 /* & */ ||
    ch === 37 /* % */ ||
    ch === 60 /* < */ ||
    ch === 61 /* = */ ||
    ch === 62 /* > */ ||
    ch === 63 /* ? */ ||
    ch === 94 /* ^ */ ||
    ch === 124; /* | */
const _isGrouper = (ch) => ch === 40 /* ( */ ||
    ch === 41 /* ) */ ||
    ch === 91 /* [ */ ||
    ch === 93 /* ] */ ||
    ch === 123 /* { */ ||
    ch === 125; /* } */
const _escapeString = (str) => str.replace(/\\(.)/g, (_match, group) => {
    switch (group) {
        case 'n':
            return '\n';
        case 'r':
            return '\r';
        case 't':
            return '\t';
        case 'b':
            return '\b';
        case 'f':
            return '\f';
        default:
            return group;
    }
});
export class Tokenizer {
    _input;
    _index = -1;
    _tokenStart = 0;
    _next;
    constructor(input) {
        this._input = input;
        this._advance();
    }
    nextToken() {
        while (_isWhitespace(this._next)) {
            this._advance(true);
        }
        if (_isQuote(this._next))
            return this._tokenizeString();
        if (_isIdentOrKeywordStart(this._next)) {
            return this._tokenizeIdentOrKeyword();
        }
        if (_isNumber(this._next))
            return this._tokenizeNumber();
        if (this._next === 46 /* . */)
            return this._tokenizeDot();
        if (this._next === 44 /* , */)
            return this._tokenizeComma();
        if (this._next === 58 /* : */)
            return this._tokenizeColon();
        if (_isOperator(this._next))
            return this._tokenizeOperator();
        if (_isGrouper(this._next))
            return this._tokenizeGrouper();
        // no match, should be end of input
        this._advance();
        if (this._next !== undefined) {
            throw new Error(`Expected end of input, got ${this._next}`);
        }
        return undefined;
    }
    _advance(resetTokenStart) {
        this._index++;
        if (this._index < this._input.length) {
            this._next = this._input.charCodeAt(this._index);
            if (resetTokenStart === true) {
                this._tokenStart = this._index;
            }
        }
        else {
            this._next = undefined;
        }
    }
    _getValue(lookahead = 0) {
        const v = this._input.substring(this._tokenStart, this._index + lookahead);
        if (lookahead === 0) {
            this._clearValue();
        }
        return v;
    }
    _clearValue() {
        this._tokenStart = this._index;
    }
    _tokenizeString() {
        const _us = 'unterminated string';
        const quoteChar = this._next;
        this._advance(true);
        while (this._next !== quoteChar) {
            if (this._next === undefined)
                throw new Error(_us);
            if (this._next === 92 /* \ */) {
                this._advance();
                if (this._next === undefined)
                    throw new Error(_us);
            }
            this._advance();
        }
        const t = token(Kind.STRING, _escapeString(this._getValue()));
        this._advance();
        return t;
    }
    _tokenizeIdentOrKeyword() {
        // This do/while loops assumes _isIdentifier(this._next!), so it must only
        // be called if _isIdentOrKeywordStart(this._next!) has returned true.
        do {
            this._advance();
        } while (_isIdentifier(this._next));
        const value = this._getValue();
        const kind = _isKeyword(value) ? Kind.KEYWORD : Kind.IDENTIFIER;
        return token(kind, value);
    }
    _tokenizeNumber() {
        // This do/while loops assumes _isNumber(this._next!), so it must only
        // be called if _isNumber(this._next!) has returned true.
        do {
            this._advance();
        } while (_isNumber(this._next));
        if (this._next === 46 /* . */)
            return this._tokenizeDot();
        return token(Kind.INTEGER, this._getValue());
    }
    _tokenizeDot() {
        this._advance();
        if (_isNumber(this._next))
            return this._tokenizeFraction();
        this._clearValue();
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
        // This do/while loops assumes _isNumber(this._next!), so it must only
        // be called if _isNumber(this._next!) has returned true.
        do {
            this._advance();
        } while (_isNumber(this._next));
        return token(Kind.DECIMAL, this._getValue());
    }
    _tokenizeOperator() {
        this._advance();
        let op = this._getValue(2);
        if (_THREE_CHAR_OPS.indexOf(op) !== -1) {
            this._advance();
            this._advance();
        }
        else {
            op = this._getValue(1);
            if (op === '=>') {
                this._advance();
                return token(Kind.ARROW, op);
            }
            if (_TWO_CHAR_OPS.indexOf(op) !== -1) {
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
//# sourceMappingURL=tokenizer.js.map