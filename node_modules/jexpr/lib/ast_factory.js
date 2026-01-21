/*
 * @license
 * Portions Copyright (c) 2013, the Dart project authors.
 */
export class DefaultAstFactory {
    empty() {
        return { type: 'Empty' };
    }
    // TODO(justinfagnani): just use a JS literal?
    literal(value) {
        return {
            type: 'Literal',
            value,
        };
    }
    id(value) {
        return {
            type: 'ID',
            value,
        };
    }
    unary(operator, child) {
        return {
            type: 'Unary',
            operator,
            child,
        };
    }
    binary(left, operator, right) {
        return {
            type: 'Binary',
            operator,
            left,
            right,
        };
    }
    getter(receiver, name) {
        return {
            type: 'Getter',
            receiver,
            name,
        };
    }
    invoke(receiver, method, args) {
        // TODO(justinfagnani): do this assertion in the parser
        if (args === undefined) {
            throw new Error('args');
        }
        return {
            type: 'Invoke',
            receiver,
            method,
            arguments: args,
        };
    }
    paren(child) {
        return {
            type: 'Paren',
            child,
        };
    }
    index(receiver, argument) {
        return {
            type: 'Index',
            receiver,
            argument,
        };
    }
    ternary(condition, trueExpr, falseExpr) {
        return {
            type: 'Ternary',
            condition,
            trueExpr,
            falseExpr,
        };
    }
    map(entries) {
        return {
            type: 'Map',
            entries,
        };
    }
    list(items) {
        return {
            type: 'List',
            items,
        };
    }
    arrowFunction(params, body) {
        return {
            type: 'ArrowFunction',
            params,
            body,
        };
    }
}
//# sourceMappingURL=ast_factory.js.map