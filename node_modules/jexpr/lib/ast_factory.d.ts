import * as ast from './ast.js';
export interface AstFactory<E extends ast.Expression> {
    empty(): E;
    literal(value: ast.LiteralValue): E;
    id(name: string): E;
    unary(operator: string, expression: E): E;
    binary(left: E, op: string, right: E | undefined): E;
    getter(receiver: E, name: string): E;
    invoke(receiver: E, method: string | undefined, args: Array<E | undefined> | undefined): E;
    paren(child: E | undefined): E;
    index(receiver: E, argument: E | undefined): E;
    ternary(condition: E, trueExpr: E | undefined, falseExpr: E | undefined): E;
    map(entries: {
        [key: string]: E | undefined;
    } | undefined): E;
    list(items: Array<E | undefined> | undefined): E;
    arrowFunction(params: Array<string>, body: E | undefined): E;
}
export declare class DefaultAstFactory implements AstFactory<ast.Expression> {
    empty(): ast.Empty;
    literal(value: ast.LiteralValue): ast.Literal;
    id(value: string): ast.ID;
    unary(operator: string, child: ast.Expression): ast.Unary;
    binary(left: ast.Expression, operator: string, right: ast.Expression): ast.Binary;
    getter(receiver: ast.Expression, name: string): ast.Getter;
    invoke(receiver: ast.Expression, method: string | undefined, args: Array<ast.Expression> | undefined): ast.Invoke;
    paren(child: ast.Expression): ast.Paren;
    index(receiver: ast.Expression, argument: ast.Expression | undefined): ast.Index;
    ternary(condition: ast.Expression, trueExpr: ast.Expression, falseExpr: ast.Expression): ast.Ternary;
    map(entries: {
        [key: string]: ast.Expression;
    }): ast.Map;
    list(items: Array<ast.Expression>): ast.List;
    arrowFunction(params: Array<string>, body: ast.Expression): ast.ArrowFunction;
}
