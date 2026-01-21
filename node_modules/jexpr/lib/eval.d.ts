import * as ast from './ast.js';
import { AstFactory } from './ast_factory.js';
export interface Scope {
    [key: string]: any;
}
export interface Evaluatable {
    evaluate(scope: Scope): any;
    getIds(idents: string[]): string[];
}
export type Expression = Literal | Empty | ID | Unary | Binary | Getter | Invoke | Index | Ternary | Map | List | ArrowFunction;
export interface Literal extends Evaluatable {
    type: 'Literal';
    value: ast.LiteralValue;
}
export interface Empty extends Evaluatable {
    type: 'Empty';
}
export interface ID extends Evaluatable {
    type: 'ID';
    value: string;
}
export interface Unary extends Evaluatable {
    type: 'Unary';
    operator: string;
    child: Expression;
}
export interface Binary extends Evaluatable {
    type: 'Binary';
    operator: string;
    left: Expression;
    right: Expression;
}
export interface Getter extends Evaluatable {
    type: 'Getter';
    receiver: Expression;
    name: string;
}
export interface Invoke extends Evaluatable {
    type: 'Invoke';
    receiver: Expression;
    method: string | undefined;
    arguments: Array<Expression> | undefined;
}
export interface Index extends Evaluatable {
    type: 'Index';
    receiver: Expression;
    argument: Expression;
}
export interface Ternary extends Evaluatable {
    type: 'Ternary';
    condition: Expression;
    trueExpr: Expression;
    falseExpr: Expression;
}
export interface Map extends Evaluatable {
    type: 'Map';
    entries: {
        [key: string]: Expression | undefined;
    } | undefined;
}
export interface List extends Evaluatable {
    type: 'List';
    items: Array<Expression> | undefined;
}
export interface ArrowFunction extends Evaluatable {
    type: 'ArrowFunction';
    params: Array<string>;
    body: Expression;
}
export declare class EvalAstFactory implements AstFactory<Expression> {
    empty(): Empty;
    literal(v: string): Literal;
    id(v: string): ID;
    unary(op: string, expr: Expression): Unary;
    binary(l: Expression, op: string, r: Expression): Binary;
    getter(g: Expression, n: string): Getter;
    invoke(receiver: Expression, method: string, args: Expression[]): Invoke;
    paren(e: Expression): Expression;
    index(e: Expression, a: Expression): Index;
    ternary(c: Expression, t: Expression, f: Expression): Ternary;
    map(entries: {
        [key: string]: Expression;
    } | undefined): Map;
    list(l: Array<Expression> | undefined): List;
    arrowFunction(params: string[], body: Expression): Expression;
}
