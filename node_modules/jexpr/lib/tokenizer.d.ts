export interface Token {
    kind: Kind;
    value: string;
    precedence: number;
}
export declare enum Kind {
    STRING = 1,
    IDENTIFIER = 2,
    DOT = 3,
    COMMA = 4,
    COLON = 5,
    INTEGER = 6,
    DECIMAL = 7,
    OPERATOR = 8,
    GROUPER = 9,
    KEYWORD = 10,
    ARROW = 11
}
export declare const token: (kind: Kind, value: string, precedence?: number) => {
    kind: Kind;
    value: string;
    precedence: number;
};
export declare class Tokenizer {
    private _input;
    private _index;
    private _tokenStart;
    private _next?;
    constructor(input: string);
    nextToken(): {
        kind: Kind;
        value: string;
        precedence: number;
    } | undefined;
    private _advance;
    private _getValue;
    private _clearValue;
    private _tokenizeString;
    private _tokenizeIdentOrKeyword;
    private _tokenizeNumber;
    private _tokenizeDot;
    private _tokenizeComma;
    private _tokenizeColon;
    private _tokenizeFraction;
    private _tokenizeOperator;
    private _tokenizeGrouper;
}
