// Compile the actual TypeScript modules to a disposable directory, then use Node's test runner.
// No extra test framework, production bypass, or persistent test signing key is needed.
import ts from 'typescript';
import { readdirSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const out = resolve('.test-output');
rmSync(out, { recursive: true, force: true });
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (file.endsWith('.ts')) {
      const destination = join(out, file.replace(/\.ts$/, '.js'));
      const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, esModuleInterop: true }, fileName: file,
      });
      const code = outputText.replace(/(from\s+["'])([^"']+)(["'])/g, (_, before, specifier, after) => {
        if (specifier === 'next/server') return before + 'next/server.js' + after;
        if (specifier.startsWith('@/')) {
          const target = resolve(out, 'src', specifier.slice(2) + '.js');
          specifier = relative(dirname(destination), target).replaceAll('\\', '/');
          if (!specifier.startsWith('.')) specifier = './' + specifier;
        } else if (specifier.startsWith('.') && !specifier.endsWith('.js')) specifier += '.js';
        return before + specifier + after;
      });
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, code);
    }
  }
}
try {
  walk('src/lib');
  writeFileSync(join(out, 'package.json'), JSON.stringify({ type: 'module' }));
  const tests = readdirSync('tests').filter((f) => f.endsWith('.test.mjs')).map((f) => join('tests', f));
  const result = spawnSync(process.execPath, ['--test', ...tests], { stdio: 'inherit', env: process.env });
  process.exitCode = result.status ?? 1;
} finally { rmSync(out, { recursive: true, force: true }); }
