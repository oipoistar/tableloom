import jsep from 'jsep';
import type { Rule, Row, DocumentState, Value } from './model';
import { getPath, textValue } from './model';

export function matchesRule(rule: Rule | undefined, row: Row): boolean {
  if (!rule || !rule.conditions.length) return true;
  const matches = rule.conditions.map((c) => {
    const value = getPath(row, c.field);
    switch (c.op) {
      case 'eq':
        return textValue(value) === textValue(c.value);
      case 'neq':
        return textValue(value) !== textValue(c.value);
      case 'gt':
        return Number(value) > Number(c.value);
      case 'gte':
        return Number(value) >= Number(c.value);
      case 'lt':
        return Number(value) < Number(c.value);
      case 'lte':
        return Number(value) <= Number(c.value);
      case 'contains':
        return textValue(value).toLowerCase().includes(textValue(c.value).toLowerCase());
      case 'empty':
        return value == null || value === '' || (Array.isArray(value) && !value.length);
      case 'notEmpty':
        return value != null && value !== '' && (!Array.isArray(value) || value.length > 0);
    }
  });
  return rule.mode === 'all' ? matches.every(Boolean) : matches.some(Boolean);
}
type Ast = {
  type: string;
  name?: string;
  value?: unknown;
  operator?: string;
  left?: Ast;
  right?: Ast;
  argument?: Ast;
  arguments?: Ast[];
  callee?: Ast;
  object?: Ast;
  property?: Ast;
  computed?: boolean;
  test?: Ast;
  consequent?: Ast;
  alternate?: Ast;
};
const math: Record<string, (...args: number[]) => number> = {
  min: Math.min,
  max: Math.max,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  abs: Math.abs,
  sqrt: Math.sqrt,
  pow: Math.pow,
};
export function evaluateFormula(
  source: string,
  row: Row,
  doc: DocumentState,
): { value?: Value; error?: string; dependencies: string[] } {
  const dependencies = new Set<string>();
  let steps = 0;
  try {
    if (source.length > 2000) throw new Error('Formula exceeds 2,000 characters');
    const visit = (node: Ast): unknown => {
      if (++steps > 500) throw new Error('Formula is too complex');
      switch (node.type) {
        case 'Literal':
          return node.value;
        case 'Identifier': {
          const name = node.name!;
          dependencies.add(name);
          if (['__proto__', 'constructor', 'prototype'].includes(name)) throw new Error('Reserved name');
          if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];
          if (Object.prototype.hasOwnProperty.call(doc.variables, name)) return doc.variables[name];
          throw new Error(`Unknown field or variable: ${name}`);
        }
        case 'MemberExpression': {
          const obj = visit(node.object!) as Record<string, Value>;
          const key = node.computed ? String(visit(node.property!)) : node.property!.name!;
          if (
            ['__proto__', 'constructor', 'prototype'].includes(key) ||
            !obj ||
            !Object.prototype.hasOwnProperty.call(obj, key)
          )
            throw new Error(`Unknown property: ${key}`);
          return obj[key];
        }
        case 'UnaryExpression': {
          const a = visit(node.argument!);
          if (node.operator === '-') return -Number(a);
          if (node.operator === '+') return +Number(a);
          if (node.operator === '!') return !a;
          throw new Error('Unsupported operator');
        }
        case 'BinaryExpression': {
          const a = visit(node.left!);
          if (node.operator === '&&') return a && visit(node.right!);
          if (node.operator === '||') return a || visit(node.right!);
          const b = visit(node.right!);
          switch (node.operator) {
            case '+':
              return typeof a === 'string' || typeof b === 'string'
                ? String(a) + String(b)
                : Number(a) + Number(b);
            case '-':
              return Number(a) - Number(b);
            case '*':
              return Number(a) * Number(b);
            case '/':
              if (Number(b) === 0) throw new Error('Division by zero');
              return Number(a) / Number(b);
            case '%':
              return Number(a) % Number(b);
            case '**':
              return Number(a) ** Number(b);
            case '==':
            case '===':
              return a === b;
            case '!=':
            case '!==':
              return a !== b;
            case '>':
              return Number(a) > Number(b);
            case '<':
              return Number(a) < Number(b);
            case '>=':
              return Number(a) >= Number(b);
            case '<=':
              return Number(a) <= Number(b);
            default:
              throw new Error('Unsupported operator');
          }
        }
        case 'CallExpression': {
          if (node.callee?.type !== 'Identifier') throw new Error('Only named formula functions are allowed');
          const args = (node.arguments ?? []).map(visit);
          const name = node.callee.name!;
          if (Object.prototype.hasOwnProperty.call(math, name)) return math[name]!(...args.map(Number));
          if (name === 'if') return args[0] ? args[1] : args[2];
          if (name === 'count') return Array.isArray(args[0]) ? args[0].length : 0;
          if (name === 'sum')
            return Array.isArray(args[0])
              ? args[0].reduce(
                  (s: number, n: unknown) =>
                    s + Number(typeof n === 'object' && n ? getPath(n, String(args[1] ?? 'value')) : n),
                  0,
                )
              : 0;
          if (name === 'lookup') {
            const set = doc.sets.find((s) => s.id === args[0] || s.name === args[0]);
            return (
              set?.rows.find((r) => textValue(r[String(args[1])]) === textValue(args[2]))?.[
                String(args[3])
              ] ?? null
            );
          }
          throw new Error(`Unknown function: ${name}`);
        }
        default:
          throw new Error(`Unsupported formula syntax: ${node.type}`);
      }
    };
    const value = visit(jsep(source) as Ast);
    if (typeof value === 'number' && !Number.isFinite(value))
      throw new Error('Result is not a finite number');
    return { value: value as Value, dependencies: [...dependencies] };
  } catch (e) {
    return { error: (e as Error).message, dependencies: [...dependencies] };
  }
}
export function expandText(source: string, row: Row, doc: DocumentState, locale = doc.baseLocale): string {
  return source
    .replace(/\{\{([^}]+)\}\}/g, (_, field: string) => textValue(getPath(row, field.trim())))
    .replace(/\[term:([^\]]+)\]/g, (_, name: string) => {
      const term = doc.terms.find((t) => t.id === name || t.name.toLowerCase() === name.toLowerCase());
      return term ? term.translations[locale] || term.name : `[term:${name}]`;
    });
}
