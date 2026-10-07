import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const cache = new Map();
async function moduleUrl(url) {
  if (cache.has(url.href)) return cache.get(url.href);
  const source = await readFile(url, 'utf8');
  let { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  const imports = [...outputText.matchAll(/from ['"]([^'"]+)['"]/g)];
  for (const match of imports) {
    if (!match[1].startsWith('.')) continue;
    const target = new URL(match[1] + (match[1].endsWith('.ts') ? '' : '.ts'), url);
    const replacement = await moduleUrl(target);
    outputText = outputText.replace(match[0], 'from ' + JSON.stringify(replacement));
  }
  const result = 'data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'); cache.set(url.href, result); return result;
}
export async function loadTs(relative) { return import(await moduleUrl(new URL(relative, import.meta.url))); }
