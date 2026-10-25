const { readFileSync } = require('fs');
const { parse } = require('@babel/parser');
const html = readFileSync(process.argv[2], 'utf8');
const blocks = [...html.matchAll(/<script[^>]*type="text\/babel"[^>]*>([\s\S]*?)<\/script>/g)];
console.log(`  babel script blocks: ${blocks.length}`);
let bad = 0;
blocks.forEach((m, i) => {
  const code = m[1];
  const startLine = html.slice(0, m.index).split('\n').length;
  try {
    parse(code, { sourceType: 'script', plugins: ['jsx'] });
    console.log(`  PASS  block ${i + 1} — ${code.split('\n').length} lines`);
  } catch (e) {
    bad++;
    const at = e.loc ? startLine + e.loc.line - 1 : '?';
    console.log(`  FAIL  block ${i + 1}: ${e.message.split('\n')[0]}  → file line ~${at}`);
  }
});
console.log(bad ? `\n  ${bad} BLOCK(S) WOULD BLANK THE PAGE` : '\n  parses clean');
process.exit(bad ? 1 : 0);
