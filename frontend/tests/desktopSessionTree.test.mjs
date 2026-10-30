import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { transformSync } from 'esbuild';

const source = readFileSync(new URL('../src/lib/utils/desktopSessionTree.ts', import.meta.url), 'utf8');
const { code } = transformSync(source, { loader: 'ts', format: 'esm' });
const { buildSessionTree, sessionRoot, sessionTreeRows } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const session = (key, parentKey, lastActivity = 1, extra = {}) => ({ key, parentKey, id: key, member: ['claude', 'account', key], provider: 'claude', title: key, cwd: `D:/${key}`, environment: 'local', host: 'local', lastActivity, ...extra });
const keys = rows => rows.map(row => row.node.session.key);
const rows = (tree, scoped = new Set(tree.byKey.keys()), query = '', expanded = new Set(), collapsed = new Set()) => sessionTreeRows(tree, scoped, query, expanded, collapsed);

test('nested families sort by their latest descendant and start collapsed', () => {
  const tree = buildSessionTree([session('parent'), session('child', 'parent', 2), session('grandchild', 'child', 10), session('other', undefined, 5)]);
  assert.deepEqual(keys(rows(tree)), ['parent', 'other']);
  assert.deepEqual(keys(rows(tree, undefined, '', new Set(['parent', 'child']))), ['parent', 'child', 'grandchild', 'other']);
  assert.equal(tree.byKey.get('parent').descendants.length, 2);
  assert.equal(sessionRoot(tree.byKey.get('grandchild')).key, 'parent');
});

test('search uses child names and includes ancestors while excluding unmatched siblings', () => {
  const tree = buildSessionTree([session('parent'), session('child', 'parent', 2, { childName: 't3-aw' }), session('sibling', 'parent'), session('grandchild', 'child')]);
  const result = rows(tree, undefined, 't3-aw');
  assert.deepEqual(keys(result), ['parent', 'child', 'grandchild']);
  assert.deepEqual(result.map(row => row.depth), [0, 1, 2]);
  assert.deepEqual(keys(rows(tree, undefined, 'grandchild')), ['parent', 'child', 'grandchild']);
  assert.deepEqual(keys(rows(tree, undefined, 'grandchild', new Set(), new Set(['parent']))), ['parent']);
});

test('a child-only group auto-expands ancestor context without adding siblings', () => {
  const tree = buildSessionTree([session('parent'), session('child', 'parent'), session('sibling', 'parent')]);
  assert.deepEqual(keys(rows(tree, new Set(['child']))), ['parent', 'child']);
  assert.deepEqual(keys(rows(tree, new Set(['child']), '', new Set(), new Set(['parent']))), ['parent']);
});

test('missing parents, cycles and self references remain accessible as independent roots', () => {
  const tree = buildSessionTree([session('orphan', 'missing'), session('a', 'b'), session('b', 'a'), session('self', 'self'), session('nested', 'orphan')]);
  assert.deepEqual(new Set(keys(rows(tree))), new Set(['orphan', 'a', 'b', 'self']));
  for (const key of ['orphan', 'a', 'b', 'self']) assert.equal(tree.byKey.get(key).parentUnavailable, true);
  assert.deepEqual(keys(rows(tree, new Set(['nested']))), ['orphan', 'nested']);
});

test('providers and account memberships cannot be linked by a mismatched parent key', () => {
  const tree = buildSessionTree([
    session('parent'),
    session('other-account', 'parent', 1, { member: ['claude', 'other-account', 'child'] }),
    session('other-provider', 'parent', 1, { provider: 'codex' }),
  ]);
  assert.equal(tree.roots.length, 3);
  assert.equal(tree.byKey.get('parent').descendants.length, 0);
  assert.equal(tree.byKey.get('other-account').parentUnavailable, true);
  assert.equal(tree.byKey.get('other-provider').parentUnavailable, true);
});
