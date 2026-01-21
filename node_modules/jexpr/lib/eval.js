/*
 * @license
 * Portions Copyright (c) 2013, the Dart project authors.
 */
const _BINARY_OPERATORS = {
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
    '|': (a, f) => f(a),
    '|>': (a, f) => f(a),
};
const _UNARY_OPERATORS = {
    '+': (a) => a,
    '-': (a) => -a,
    '!': (a) => !a,
};
export class EvalAstFactory {
    empty() {
        // TODO(justinfagnani): return null instead?
        return {
            type: 'Empty',
            evaluate(scope) {
                return scope;
            },
            getIds(idents) {
                return idents;
            },
        };
    }
    // TODO(justinfagnani): just use a JS literal?
    literal(v) {
        return {
            type: 'Literal',
            value: v,
            evaluate(_scope) {
                return this.value;
            },
            getIds(idents) {
                return idents;
            },
        };
    }
    id(v) {
        return {
            type: 'ID',
            value: v,
            evaluate(scope) {
                // TODO(justinfagnani): this prevents access to properties named 'this'
                if (this.value === 'this')
                    return scope;
                return scope?.[this.value];
            },
            getIds(idents) {
                idents.push(this.value);
                return idents;
            },
        };
    }
    unary(op, expr) {
        const f = _UNARY_OPERATORS[op];
        return {
            type: 'Unary',
            operator: op,
            child: expr,
            evaluate(scope) {
                return f(this.child.evaluate(scope));
            },
            getIds(idents) {
                return this.child.getIds(idents);
            },
        };
    }
    binary(l, op, r) {
        const f = _BINARY_OPERATORS[op];
        return {
            type: 'Binary',
            operator: op,
            left: l,
            right: r,
            evaluate(scope) {
                if (this.operator === '=') {
                    if (this.left.type !== 'ID' &&
                        this.left.type !== 'Getter' &&
                        this.left.type !== 'Index') {
                        throw new Error(`Invalid assignment target: ${this.left}`);
                    }
                    const value = this.right.evaluate(scope);
                    let receiver = undefined;
                    let property;
                    if (this.left.type === 'Getter') {
                        receiver = this.left.receiver.evaluate(scope);
                        property = this.left.name;
                    }
                    else if (this.left.type === 'Index') {
                        receiver = this.left.receiver.evaluate(scope);
                        property = this.left.argument.evaluate(scope);
                    }
                    else if (this.left.type === 'ID') {
                        // TODO: the id could be a parameter
                        receiver = scope;
                        property = this.left.value;
                    }
                    return receiver === undefined
                        ? undefined
                        : (receiver[property] = value);
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
            evaluate(scope) {
                return this.receiver.evaluate(scope)?.[this.name];
            },
            getIds(idents) {
                this.receiver.getIds(idents);
                return idents;
            },
        };
    }
    invoke(receiver, method, args) {
        if (method != null && typeof method !== 'string') {
            throw new Error('method not a string');
        }
        return {
            type: 'Invoke',
            receiver: receiver,
            method: method,
            arguments: args,
            evaluate(scope) {
                const receiver = this.receiver.evaluate(scope);
                // TODO(justinfagnani): this might be wrong in cases where we're
                // invoking a top-level function rather than a method. If method is
                // defined on a nested scope, then we should probably set _this to null.
                const _this = this.method ? receiver : scope?.['this'] ?? scope;
                const f = this.method ? receiver?.[method] : receiver;
                const args = this.arguments ?? [];
                const argValues = args.map((a) => a?.evaluate(scope));
                return f?.apply?.(_this, argValues);
            },
            getIds(idents) {
                this.receiver.getIds(idents);
                this.arguments?.forEach((a) => a?.getIds(idents));
                return idents;
            },
        };
    }
    paren(e) {
        return e;
    }
    index(e, a) {
        return {
            type: 'Index',
            receiver: e,
            argument: a,
            evaluate(scope) {
                return this.receiver.evaluate(scope)?.[this.argument.evaluate(scope)];
            },
            getIds(idents) {
                this.receiver.getIds(idents);
                return idents;
            },
        };
    }
    ternary(c, t, f) {
        return {
            type: 'Ternary',
            condition: c,
            trueExpr: t,
            falseExpr: f,
            evaluate(scope) {
                const c = this.condition.evaluate(scope);
                if (c) {
                    return this.trueExpr.evaluate(scope);
                }
                else {
                    return this.falseExpr.evaluate(scope);
                }
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
            type: 'Map',
            entries: entries,
            evaluate(scope) {
                const map = {};
                if (entries && this.entries) {
                    for (const key in entries) {
                        const val = this.entries[key];
                        if (val) {
                            map[key] = val.evaluate(scope);
                        }
                    }
                }
                return map;
            },
            getIds(idents) {
                if (entries && this.entries) {
                    for (const key in entries) {
                        const val = this.entries[key];
                        if (val) {
                            val.getIds(idents);
                        }
                    }
                }
                return idents;
            },
        };
    }
    // TODO(justinfagnani): if the list is deeply literal
    list(l) {
        return {
            type: 'List',
            items: l,
            evaluate(scope) {
                return this.items?.map((a) => a?.evaluate(scope));
            },
            getIds(idents) {
                this.items?.forEach((i) => i?.getIds(idents));
                return idents;
            },
        };
    }
    arrowFunction(params, body) {
        return {
            type: 'ArrowFunction',
            params,
            body,
            evaluate(scope) {
                const params = this.params;
                const body = this.body;
                return function (...args) {
                    // TODO: this isn't correct for assignments to variables in outer
                    // scopes
                    // const newScope = Object.create(scope ?? null);
                    const paramsObj = Object.fromEntries(params.map((p, i) => [p, args[i]]));
                    const newScope = new Proxy(scope ?? {}, {
                        set(target, prop, value) {
                            if (paramsObj.hasOwnProperty(prop)) {
                                paramsObj[prop] = value;
                            }
                            return (target[prop] = value);
                        },
                        get(target, prop) {
                            if (paramsObj.hasOwnProperty(prop)) {
                                return paramsObj[prop];
                            }
                            return target[prop];
                        },
                    });
                    return body.evaluate(newScope);
                };
            },
            getIds(idents) {
                // Only return the _free_ variables in the body. Since arrow function
                // parameters are the only way to introduce new variable names, we can
                // assume that any variable in the body that isn't a parameter is free.
                return this.body
                    .getIds(idents)
                    .filter((id) => !this.params.includes(id));
            },
        };
    }
}
//# sourceMappingURL=eval.js.map