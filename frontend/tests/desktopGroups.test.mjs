import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSync } from 'esbuild';

const { outputFiles } = buildSync({ entryPoints: [new URL('../src/lib/utils/desktopGroups.ts', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')], bundle: true, write: false, platform: 'node', format: 'esm' });
const { resolveGroups, groupSourceIdentity, canAssignGroup } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const { outputFiles: treeFiles } = buildSync({ entryPoints: [new URL('../src/lib/utils/desktopSessionTree.ts', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')], bundle: true, write: false, platform: 'node', format: 'esm' });
const { buildSessionTree } = await import(`data:text/javascript;base64,${Buffer.from(treeFiles[0].text).toString('base64')}`);
const session = (key, extra = {}) => ({ key, id: key, member: ['claude', 'account', key], provider: 'claude', title: key,
  cwd: 'D:/repo', environment: 'local', host: 'local', lastActivity: 1, ...extra });
const codex = (key, extra = {}) => session(key, { provider: 'codex', member: ['codex', 'local', key], ...extra });
const user = (id, extra = {}) => ({ id, name: id, members: [], links: [], ...extra });
const resolve = (sessions, groups = [], available = true) => resolveGroups(buildSessionTree(sessions), groups, available);
const keys = view => [...view.keys].sort();
const get = (result, id) => result.views.find(view => view.id === `group:${id}`);

test('automatic and user groups share one sorted list and compute actual providers', () => {
  const result = resolve([session('a'), codex('b')], [user('Empty')]);
  assert.equal(result.views.length, 2);
  assert.deepEqual(result.views.map(view => view.name), ['Empty', 'repo']);
  assert.deepEqual(result.views[1].providers, ['claude', 'codex']);
  assert.deepEqual(result.views[0].providers, []);
});

test('automatic links include future sessions, hide assigned automatic members and honor direct overrides', () => {
  const a = session('a'), b = codex('b');
  const source = resolve([a, b]).automatic[0].source;
  const groups = [user('Linked', { links: [source] }), user('Direct', { members: [a.member] })];
  let result = resolve([a, b], groups);
  assert.deepEqual(keys(get(result, 'Linked')), ['b']);
  assert.deepEqual(keys(get(result, 'Direct')), ['a']);
  assert.equal(result.views.filter(view => view.automatic).length, 0);
  result = resolve([a, b, session('new'), session('elsewhere', { cwd: 'E:/repo' })], groups);
  assert.deepEqual(keys(get(result, 'Linked')), ['b', 'new']);
  assert.equal(result.views.filter(view => view.automatic).length, 1);
  assert.deepEqual(keys(resolve([a, b], [user('Linked')]).views.find(view => view.automatic)), ['a', 'b']);
});

test('user group links union nested members once and prevent cycles', () => {
  const a = session('a'), b = codex('b');
  const groups = [user('Child', { members: [a.member] }),
    user('Parent', { members: [a.member, b.member], links: [{ kind: 'user', id: 'Child', name: 'Child' }] }),
    user('Grandparent', { links: [{ kind: 'user', id: 'Parent', name: 'Parent' }] })];
  const result = resolve([a, b], groups);
  assert.deepEqual(keys(get(result, 'Grandparent')), ['a', 'b']);
  assert.deepEqual(get(result, 'Grandparent').providers, ['claude', 'codex']);
  assert.equal(canAssignGroup({ kind: 'user', id: 'Grandparent', name: 'G' }, 'Child', groups), false);
  assert.equal(canAssignGroup({ kind: 'user', id: 'Child', name: 'C' }, 'Child', groups), false);
  assert.equal(canAssignGroup({ kind: 'user', id: 'Child', name: 'C' }, 'Grandparent', groups), true);
});

test('combined group links retain source identities across renames and stay within the selected root', () => {
  const a = session('a', { claudeGroup: { id: 'cg', name: 'Project' } });
  const b = codex('b', { codexProject: { id: 'cx', name: 'Project' } });
  const other = session('other', { cwd: 'F:/elsewhere', claudeGroup: { id: 'cg', name: 'Project' } });
  const source = resolve([a, b, other]).automatic.find(view => view.keys.has('b')).source;
  const groups = [user('Linked', { links: [source] })];
  assert.ok(source.selectors.every(selector => selector.root));
  a.claudeGroup.name = 'Renamed Claude';
  b.codexProject.name = 'Renamed Codex';
  const items = [a, b, other, session('new', { claudeGroup: { id: 'cg', name: 'Renamed Claude' } })];
  for (const ordered of [items, [...items].reverse()]) {
    const result = resolve(ordered, groups);
    assert.deepEqual(keys(get(result, 'Linked')), ['a', 'b', 'new']);
    assert.deepEqual(keys(result.views.find(view => view.automatic)), ['other']);
  }
  assert.equal(groupSourceIdentity(source), groupSourceIdentity({ ...source, name: 'Other label', selectors: [...source.selectors].reverse() }));
});

test('source links separate providers, accounts and hosts and recover after temporary disappearance', () => {
  const a = session('a', { claudeGroup: { id: 'cg', name: 'Project' } });
  const source = resolve([a]).automatic[0].source;
  const groups = [user('Linked', { links: [source] })];
  assert.deepEqual(keys(get(resolve([], groups), 'Linked')), []);
  const others = [session('account', { member: ['claude', 'other', 'account'], claudeGroup: a.claudeGroup }),
    session('host', { environment: 'ssh', host: 'other', claudeGroup: a.claudeGroup }),
    codex('codex', { codexProject: { id: 'cg', name: 'Project' }, codexAssignment: null })];
  assert.deepEqual(keys(get(resolve([a, others[2]], groups), 'Linked')), ['a', 'codex']);
  // A second explicit account at the same root keeps unassigned sessions separate.
  assert.deepEqual(keys(get(resolve([a, ...others], groups), 'Linked')), ['a']);
  // An explicit Codex source does not acquire a Claude source link.
  others[2].codexAssignment = { kind: 'local', id: 'cg' };
  assert.deepEqual(keys(get(resolve([a, ...others], groups), 'Linked')), ['a']);
});

test('context ancestors never contribute providers or counts and group read failure suppresses automatic lists', () => {
  const a = session('parent'), b = codex('other');
  const child = session('child', { parentKey: a.key, cwd: 'F:/child' });
  const groups = [user('Child only', { members: [child.member] })];
  const result = resolve([a, b, child], groups);
  assert.deepEqual(keys(get(result, 'Child only')), ['child']);
  assert.deepEqual(get(result, 'Child only').providers, ['claude']);
  assert.equal(resolve([a, b, child], groups, false).views.filter(view => view.automatic).length, 0);
});

test('a linked inherited child retains the parent source root and manual parents do not leak their source', () => {
  const parent = session('parent', { claudeGroup: { id: 'cg', name: 'Project' } });
  const child = session('child', { parentKey: parent.key, cwd: 'F:/worktree' });
  const source = resolve([parent, child]).automatic[0].source;
  assert.deepEqual(keys(get(resolve([parent, child], [user('Linked', { links: [source] })]), 'Linked')), ['child', 'parent']);
  const groups = [user('Linked', { links: [source] }), user('Direct', { members: [parent.member] })];
  const result = resolve([parent, child], groups);
  assert.deepEqual(keys(get(result, 'Linked')), []);
  assert.deepEqual(keys(result.views.find(view => view.automatic)), ['child']);
});
