// A small arithmetic evaluator for run_calculation. The expression comes from
// the model, and the model reads uploaded documents, so this input is
// untrusted: it replaces expr-eval, which has an unpatched code-execution
// flaw (GHSA-q9v2-7m5w-4693, no fixed version). Nothing here can reach a
// property, a variable or a host function: the only names are the constants
// and functions in the two tables below, and the only values are numbers.
//
// Grammar (usual precedence; ^ binds tightest and is right-associative):
//   expr    := term (('+' | '-') term)*
//   term    := unary (('*' | '/' | '%') unary)*
//   unary   := ('+' | '-') unary | power
//   power   := primary ('^' unary)?
//   primary := number | constant | func '(' expr (',' expr)* ')' | '(' expr ')'

const CONSTANTS: Record<string, number> = { PI: Math.PI, E: Math.E };

const FUNCTIONS: Record<string, { min: number; max: number; fn: (...a: number[]) => number }> = {
  sqrt: { min: 1, max: 1, fn: Math.sqrt },
  abs: { min: 1, max: 1, fn: Math.abs },
  round: {
    min: 1,
    max: 2,
    fn: (x, digits = 0) => {
      const f = 10 ** Math.trunc(digits);
      return Math.round(x * f) / f;
    },
  },
  floor: { min: 1, max: 1, fn: Math.floor },
  ceil: { min: 1, max: 1, fn: Math.ceil },
  min: { min: 1, max: 100, fn: Math.min },
  max: { min: 1, max: 100, fn: Math.max },
  sum: { min: 1, max: 100, fn: (...a) => a.reduce((s, x) => s + x, 0) },
  avg: { min: 1, max: 100, fn: (...a) => a.reduce((s, x) => s + x, 0) / a.length },
  log: { min: 1, max: 1, fn: Math.log }, // natural log, as expr-eval had it
  ln: { min: 1, max: 1, fn: Math.log },
  log10: { min: 1, max: 1, fn: Math.log10 },
  exp: { min: 1, max: 1, fn: Math.exp },
  pow: { min: 2, max: 2, fn: Math.pow },
};

type Token = { kind: "num"; value: number } | { kind: "name"; value: string } | { kind: "op"; value: string };

const MAX_DEPTH = 100;

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
    } else if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
      if (!m) throw new Error(`bad number at position ${i + 1}`);
      tokens.push({ kind: "num", value: Number(m[0]) });
      i += m[0].length;
    } else if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      tokens.push({ kind: "name", value: m[0] });
      i += m[0].length;
    } else if ("+-*/%^(),".includes(c)) {
      tokens.push({ kind: "op", value: c });
      i++;
    } else {
      throw new Error(`unexpected character "${c}" at position ${i + 1}`);
    }
  }
  return tokens;
}

export function evaluateMath(src: string): number {
  const tokens = tokenize(src);
  let pos = 0;
  let depth = 0;

  const peek = () => tokens[pos];
  const isOp = (v: string) => peek()?.kind === "op" && peek()!.value === v;
  const expectOp = (v: string) => {
    if (!isOp(v)) throw new Error(`expected "${v}"`);
    pos++;
  };
  const enter = () => {
    if (++depth > MAX_DEPTH) throw new Error("expression nested too deeply");
  };

  function expr(): number {
    enter();
    let v = term();
    while (isOp("+") || isOp("-")) {
      const op = tokens[pos++].value;
      const r = term();
      v = op === "+" ? v + r : v - r;
    }
    depth--;
    return v;
  }

  function term(): number {
    let v = unary();
    while (isOp("*") || isOp("/") || isOp("%")) {
      const op = tokens[pos++].value;
      const r = unary();
      v = op === "*" ? v * r : op === "/" ? v / r : v % r;
    }
    return v;
  }

  function unary(): number {
    enter();
    let v: number;
    if (isOp("-")) {
      pos++;
      v = -unary();
    } else if (isOp("+")) {
      pos++;
      v = unary();
    } else {
      v = power();
    }
    depth--;
    return v;
  }

  function power(): number {
    const base = primary();
    if (isOp("^")) {
      pos++;
      return base ** unary();
    }
    return base;
  }

  function primary(): number {
    const t = peek();
    if (!t) throw new Error("unexpected end of expression");
    if (t.kind === "num") {
      pos++;
      return t.value;
    }
    if (t.kind === "op" && t.value === "(") {
      pos++;
      const v = expr();
      expectOp(")");
      return v;
    }
    if (t.kind === "name") {
      pos++;
      if (Object.hasOwn(CONSTANTS, t.value)) return CONSTANTS[t.value];
      if (!Object.hasOwn(FUNCTIONS, t.value)) throw new Error(`unknown name "${t.value}"`);
      const f = FUNCTIONS[t.value];
      expectOp("(");
      const args = [expr()];
      while (isOp(",")) {
        pos++;
        args.push(expr());
      }
      expectOp(")");
      if (args.length < f.min || args.length > f.max) {
        throw new Error(`${t.value} takes ${f.min === f.max ? f.min : `${f.min} to ${f.max}`} argument(s)`);
      }
      return f.fn(...args);
    }
    throw new Error(`unexpected "${t.value}"`);
  }

  const result = expr();
  if (pos < tokens.length) throw new Error(`unexpected "${tokens[pos].value}"`);
  return result;
}
