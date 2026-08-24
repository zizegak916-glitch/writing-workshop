import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const fail = message => { throw new Error(`Go 1.21 contract: ${message}`); };
const assert = (condition, message) => { if (!condition) fail(message); };

const goMod = read('go.mod');
assert(/^go 1\.21$/m.test(goMod), 'go.mod must keep the minimum language version at 1.21');
assert(!/^toolchain /m.test(goMod), 'go.mod must not force a newer downloaded toolchain');

for (const requirement of [
  'github.com/charmbracelet/bubbles v0.20.0',
  'github.com/charmbracelet/bubbletea v1.3.4',
  'github.com/charmbracelet/lipgloss v1.0.0',
  'github.com/charmbracelet/x/ansi v0.8.0',
  'golang.org/x/text v0.22.0'
]) assert(goMod.includes(requirement), `missing compatibility pin: ${requirement}`);

const dockerfile = read('Dockerfile');
assert(/^FROM .*golang:1\.21\.13 AS builder$/m.test(dockerfile), 'Docker builder must use Go 1.21.13');

for (const workflow of ['.github/workflows/ci.yml', '.github/workflows/release.yml']) {
  const source = read(workflow);
  assert(source.includes('GOTOOLCHAIN: local'), `${workflow} must disable automatic toolchain upgrades`);
  assert(source.includes('go-version: "1.21.13"'), `${workflow} must test with Go 1.21.13`);
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ['.git', 'node_modules', 'vendor'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.go')) out.push(full);
  }
  return out;
}

for (const file of walk(root)) {
  const relative = path.relative(root, file);
  const source = fs.readFileSync(file, 'utf8');
  assert(!/strings\.(?:SplitSeq|FieldsSeq)\b/.test(source), `${relative} uses a post-Go-1.21 iterator API`);
  assert(!/for\s+(?:(?:[A-Za-z_]\w*)\s*:=\s*)?range\s+\d+\b/.test(source), `${relative} uses Go 1.22 integer range syntax`);
  assert(!/for\s+(?:[A-Za-z_]\w*)\s*:=\s*range\s+[A-Za-z_]\w*\s*[+\-*/]\s*\d+\b/.test(source), `${relative} uses Go 1.22 integer range syntax`);
}

for (const doc of ['README.md', 'DEVELOPMENT.md', 'docs/USER_GUIDE.md', 'web/static/docs.html']) {
  assert(!/需要 Go 1\.2[2-9]|Go 1\.2[2-9] 或更高|Go 1\.25\.5\+/.test(read(doc)), `${doc} advertises a higher source requirement`);
}

console.log('Go compatibility contract OK: source floor 1.21, CI/Docker toolchain 1.21.13, no auto-upgrade.');
