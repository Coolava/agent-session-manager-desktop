import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { transformSync } from 'esbuild';

async function load(file) {
  const source = readFileSync(new URL(`../src/lib/utils/${file}.ts`, import.meta.url), 'utf8');
  const { code } = transformSync(source, { loader: 'ts', format: 'esm' });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}
const { classifyProjects } = await load('desktopProjects');
const { buildSessionTree } = await load('desktopSessionTree');
const session = (key, extra = {}) => ({ key, id: key, member: ['claude', 'account:org', key], provider: 'claude',
  title: key, cwd: 'D:/Projects/ALT Test', environment: 'local', host: 'local', lastActivity: 1, ...extra });
const codex = (key, extra = {}) => session(key, { provider: 'codex', member: ['codex', 'local', key], ...extra });
const classify = sessions => classifyProjects(buildSessionTree(sessions));
const members = (result, key) => [...result.bySession].filter(([, target]) => target === result.bySession.get(key)).map(([id]) => id).sort();

test('unassigned providers and path-inferred projects share one exact root', () => {
  const result = classify([session('claude'), codex('codex', { cwd: 'F:/worktrees/ALT Test', projectCwd: 'd:\\Projects\\ALT Test\\',
    codexProject: { id: 'inferred', name: 'ALT' }, codexAssignment: null })]);
  assert.deepEqual(members(result, 'claude'), ['claude', 'codex']);
  assert.equal(result.representatives.size, 1);
});

test('a unique explicit project absorbs same-root unassigned sessions and keeps worktrees', () => {
  const result = classify([session('claude'), codex('assigned', { cwd: 'F:/worktrees/one', projectCwd: 'D:/Projects/ALT Test',
    codexProject: { id: 'a', name: 'ALT workspace' }, codexAssignment: { id: 'a', kind: 'local' } })]);
  assert.deepEqual(members(result, 'assigned'), ['assigned', 'claude']);
  assert.equal(result.representatives.values().next().value.codexProject.name, 'ALT workspace');
});

test('different explicit IDs remain separate and unassigned sessions cannot bridge them', () => {
  const items = [session('group-a', { claudeGroup: { id: 'a', name: 'Shared' } }),
    session('group-b', { claudeGroup: { id: 'b', name: 'Shared' } }), session('loose'),
    codex('inferred', { codexProject: { id: 'inferred', name: 'Shared' }, projectCwd: 'D:/Projects/ALT Test', codexAssignment: null })];
  for (const sessions of [items, [...items].reverse()]) {
    const result = classify(sessions);
    assert.equal(result.representatives.size, 3);
    assert.deepEqual(members(result, 'group-a'), ['group-a']);
    assert.deepEqual(members(result, 'group-b'), ['group-b']);
    assert.deepEqual(members(result, 'loose'), ['inferred', 'loose']);
  }
});

test('cross-provider and cross-account explicit assignments remain distinct despite equal names', () => {
  const result = classify([session('a', { claudeGroup: { id: 'same', name: 'Same' } }),
    session('b', { member: ['claude', 'other:org', 'b'], claudeGroup: { id: 'same', name: 'Same' } }),
    codex('c', { codexProject: { id: 'same', name: 'Same' }, codexAssignment: { id: 'same', kind: 'local' } })]);
  assert.equal(result.representatives.size, 3);
});

test('root normalization handles Windows dot segments and UNC while preserving host and POSIX case', () => {
  const result = classify([session('a', { cwd: 'D:\\Projects\\ALT Test\\src\\..\\' }), session('b'),
    session('unc-a', { cwd: '\\\\server\\share\\Project\\' }), codex('unc-b', { cwd: '//SERVER/share/PROJECT' }),
    session('ssh-a', { cwd: '/repo/Project', environment: 'ssh', host: 'one' }),
    session('ssh-b', { cwd: '/repo/Project', environment: 'ssh', host: 'two' }),
    session('posix-a', { cwd: '/repo/Project' }), session('posix-b', { cwd: '/repo/project' }),
    session('nested', { cwd: 'D:/Projects/ALT Test/nested' }), session('other', { cwd: 'E:/Projects/ALT Test' })]);
  assert.deepEqual(members(result, 'a'), ['a', 'b']);
  assert.deepEqual(members(result, 'unc-a'), ['unc-a', 'unc-b']);
  assert.equal(result.representatives.size, 8);
});

test('children inherit their parent classification unless explicitly assigned elsewhere', () => {
  const result = classify([session('parent', { claudeGroup: { id: 'a', name: 'A' } }),
    session('child', { parentKey: 'parent', cwd: 'F:/worktrees/child' }),
    session('other-child', { parentKey: 'parent', claudeGroup: { id: 'b', name: 'B' } }),
    session('loose')]);
  assert.deepEqual(members(result, 'parent'), ['child', 'parent']);
  assert.deepEqual(members(result, 'other-child'), ['other-child']);
  assert.deepEqual(members(result, 'loose'), ['loose']);
});

test('scratch and projectless stay in this computer while explicit scratch groups are preserved', () => {
  const cwd = 'C:/Claude/scratch-workspaces/account/org/scratch-one';
  const result = classify([session('scratch', { cwd }), codex('projectless', { projectless: true }),
    session('scratch-group', { cwd, claudeGroup: { id: 'a', name: 'A' } }), session('ordinary')]);
  assert.deepEqual(members(result, 'scratch'), ['projectless', 'scratch']);
  assert.deepEqual(members(result, 'scratch-group'), ['scratch-group']);
  assert.deepEqual(members(result, 'ordinary'), ['ordinary']);
});

test('unresolved explicit assignments neither merge by path nor absorb unassigned sessions', () => {
  const result = classify([codex('deleted', { codexAssignment: { id: 'deleted', kind: 'local' } }),
    codex('remote', { codexAssignment: { id: 'deleted', kind: 'remote' } }), session('loose')]);
  assert.equal(result.representatives.size, 3);
  const withKnown = classify([session('known', { claudeGroup: { id: 'a', name: 'A' } }),
    codex('deleted', { codexAssignment: { id: 'deleted', kind: 'local' } }), session('loose')]);
  assert.equal(withKnown.representatives.size, 3);
  assert.deepEqual(members(withKnown, 'loose'), ['loose']);
});

test('renames and removing a conflicting assignment reclassify deterministically without changing inputs', () => {
  const a = session('a', { claudeGroup: { id: 'a', name: 'A' } });
  const b = session('b', { claudeGroup: { id: 'b', name: 'B' } });
  const items = [a, b, session('loose')];
  const before = JSON.stringify(items);
  assert.equal(classify(items).representatives.size, 3);
  assert.equal(JSON.stringify(items), before);
  a.claudeGroup.name = 'Renamed';
  assert.equal(classify(items).representatives.size, 3);
  delete b.claudeGroup;
  assert.deepEqual(members(classify(items), 'a'), ['a', 'b', 'loose']);
});
