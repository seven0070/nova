export function calculate(expression: string): number {
  if (expression.length > 500) throw new Error('Expression too long.');
  const tokens = expression.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[()+\-*/^]/gi) || [];
  if (tokens.join('') !== expression.replace(/\s+/g, '') || !tokens.length) throw new Error('Use numbers and arithmetic operators only.');
  let pos = 0;
  function atom(): number {
    const token = tokens[pos++];
    if (token === '(') { const value = sum(); if (tokens[pos++] !== ')') throw new Error('Missing closing parenthesis.'); return value; }
    if (!token || !/^(?:\d|\.)/.test(token)) throw new Error('Expected a number.');
    return Number(token);
  }
  function power(): number { const value = atom(); return tokens[pos] === '^' ? (pos++, value ** unary()) : value; }
  function unary(): number { if (tokens[pos] === '+') { pos++; return unary(); } if (tokens[pos] === '-') { pos++; return -unary(); } return power(); }
  function product(): number { let value = unary(); while (tokens[pos] === '*' || tokens[pos] === '/') { const op = tokens[pos++]; const rhs = unary(); if (op === '/' && rhs === 0) throw new Error('Division by zero.'); value = op === '*' ? value * rhs : value / rhs; } return value; }
  function sum(): number { let value = product(); while (tokens[pos] === '+' || tokens[pos] === '-') { const op = tokens[pos++]; const rhs = product(); value = op === '+' ? value + rhs : value - rhs; } return value; }
  const result = sum(); if (pos !== tokens.length || !Number.isFinite(result)) throw new Error('Invalid or non-finite result.'); return result;
}
