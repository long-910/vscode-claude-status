import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

// Keeps the documentation in step with package.json: every setting and command
// must be documented, and relative links / #anchors must resolve.

const ROOT = path.resolve(__dirname, '../../..');   // out/test/suite → repo root
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

const READMES = ['README.md', 'README.ja.md', 'README.zh.md'];

function markdownFiles(): string[] {
  const docs: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(rel); } else if (entry.name.endsWith('.md')) { docs.push(rel); }
    }
  };
  walk('docs');
  return [...READMES, 'CLAUDE.md', 'CONTRIBUTING.md', 'CHANGELOG.md', ...docs];
}

/** GitHub's heading → anchor slug. */
function slug(heading: string): string {
  return heading.trim().toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

function anchors(markdown: string): Set<string> {
  const result = new Set<string>();
  const seen = new Map<string, number>();
  let inFence = false;
  for (const line of markdown.split('\n')) {
    if (line.startsWith('```')) { inFence = !inFence; continue; }
    const m = !inFence && /^#{1,6}\s+(.*)$/.exec(line);
    if (!m) { continue; }
    const base = slug(m[1]);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    result.add(n === 0 ? base : `${base}-${n}`);
  }
  return result;
}

suite('Docs', () => {
  const pkg = JSON.parse(read('package.json')) as {
    contributes: { configuration: { properties: Record<string, unknown> }; commands: Array<{ command: string }> }
  };
  const settingKeys = Object.keys(pkg.contributes.configuration.properties);
  const commands = pkg.contributes.commands.map(c => c.command);

  test('every setting is in docs/SETTINGS.md', () => {
    const settings = read('docs/SETTINGS.md');
    const missing = settingKeys.filter(k => !settings.includes('`' + k.replace(/^claudeStatus\./, '') + '`'));
    assert.deepStrictEqual(missing, []);
  });

  for (const readme of READMES) {
    test(`every setting is in ${readme}`, () => {
      const text = read(readme);
      assert.deepStrictEqual(settingKeys.filter(k => !text.includes('`' + k + '`')), []);
    });
  }

  test('every command is in docs/SETTINGS.md', () => {
    const settings = read('docs/SETTINGS.md');
    assert.deepStrictEqual(commands.filter(c => !settings.includes('`' + c + '`')), []);
  });

  test('relative links and #anchors resolve', () => {
    const broken: string[] = [];
    for (const file of markdownFiles()) {
      const text = read(file);
      for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
        const target = m[1];
        if (/^[a-z]+:/i.test(target)) { continue; }          // http(s):, mailto:
        const [rel, anchor] = target.split('#');
        const targetFile = rel ? path.normalize(path.join(path.dirname(file), rel)) : file;
        if (!fs.existsSync(path.join(ROOT, targetFile))) { broken.push(`${file}: ${target}`); continue; }
        if (anchor && targetFile.endsWith('.md') && !anchors(read(targetFile)).has(anchor)) {
          broken.push(`${file}: ${target} (no such heading)`);
        }
      }
    }
    assert.deepStrictEqual(broken, []);
  });
});
