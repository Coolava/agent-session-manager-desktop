import type { DesktopSession as Session, SessionNode } from './desktopSessionTree';
import { classifyProjects, classificationSession, explicitKey, isComputerWorkspace, projectPath, rootKey, sourceGroup, sourceProject } from './desktopProjects';

export type Selector = { key: string; root?: string };
export type GroupSource = { kind: 'user'; id: string; name: string } | { kind: 'automatic'; name: string; selectors: Selector[] };
export type UserGroup = { id: string; name: string; members: string[][]; links?: GroupSource[] };
export type GroupView = { id: string; name: string; hint: string; source: GroupSource; keys: Set<string>; providers: string[]; automatic: boolean };

export function directlyContains(group: UserGroup, session: Session) {
  return group.members.some(member => JSON.stringify(member) === JSON.stringify(session.member));
}

export function groupSourceIdentity(source: GroupSource) {
  return source.kind === 'user' ? JSON.stringify(['user', source.id])
    : JSON.stringify(['automatic', source.selectors.map(selector => JSON.stringify([selector.key, selector.root || ''])).sort()]);
}

export function linkTargets(source: GroupSource, groups: UserGroup[]) {
  const identity = groupSourceIdentity(source);
  return groups.filter(group => group.links?.some(link => groupSourceIdentity(link) === identity)).map(group => group.id);
}

export function canAssignGroup(source: GroupSource, target: string, groups: UserGroup[]) {
  if (source.kind !== 'user') return true;
  const pending = [source.id], seen = new Set<string>();
  while (pending.length) {
    const id = pending.pop()!;
    if (id === target) return false;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const link of groups.find(group => group.id === id)?.links || []) if (link.kind === 'user') pending.push(link.id);
  }
  return true;
}

function sourceKey(session: Session) {
  if (!explicitKey(session)) return '';
  const group = sourceGroup(session);
  return JSON.stringify(['desktop-source', session.provider, session.environment, session.host, session.member[1],
    group ? 'group' : session.codexAssignment?.kind || 'local', group?.id || session.codexAssignment?.id || sourceProject(session)!.id]);
}

function uniqueSelectors(selectors: Selector[]) {
  return [...new Map(selectors.map(selector => [JSON.stringify([selector.key, selector.root || '']), selector])).values()]
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

export function resolveGroups(tree: { byKey: Map<string, SessionNode> }, groups: UserGroup[], available = true) {
  const sessions = [...tree.byKey.values()].map(node => node.session);
  const classification = classifyProjects(tree, available ? groups : null);
  const excluded = new Set(sessions.filter(session => groups.some(group => directlyContains(group, session))).map(session => session.key));
  const origins = new Map<string, Selector[]>();
  for (const session of sessions) {
    const key = classification.bySession.get(session.key);
    if (!key) continue;
    const origin = classificationSession(session, tree, excluded), source = sourceKey(origin);
    if (source) origins.set(key, [...(origins.get(key) || []), { key: source, root: rootKey(origin) }]);
  }
  const automatic: GroupView[] = [];
  for (const [key, session] of classification.representatives) {
    const path = projectPath(session);
    const folder = path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path || '작업 폴더 없음';
    const name = classification.combined.get(key) || sourceGroup(session)?.name || sourceProject(session)?.name
      || (isComputerWorkspace(session) ? '이 컴퓨터' : folder + (session.environment === 'ssh' ? ` · ${session.host}` : ''));
    const selectors = uniqueSelectors((origins.get(key) || []).map(origin => classification.combined.has(key) ? origin : { key: origin.key }));
    const provenance = sourceGroup(session) ? `Claude · ${session.member[1]} · ${sourceGroup(session)!.id} · `
      : sourceProject(session) ? `Codex · ${sourceProject(session)!.id} · ` : '';
    automatic.push({ id: `path:${key}`, name, hint: `${provenance}${session.host} · ${path || '작업 폴더 없음'}`,
      source: { kind: 'automatic', name, selectors: selectors.length ? selectors : [{ key }] },
      keys: new Set([...classification.bySession].filter(([, groupKey]) => groupKey === key).map(([sessionKey]) => sessionKey)),
      providers: [], automatic: true });
  }
  const tokens = new Map<string, Selector[]>();
  for (const session of sessions) {
    const key = classification.bySession.get(session.key);
    if (!key) continue;
    const origin = classificationSession(session, tree, excluded), root = rootKey(origin), source = sourceKey(origin);
    const candidates = source ? [{ key: source, root }] : (origins.get(key) || []).filter(candidate => candidate.root === root);
    tokens.set(session.key, [...candidates, { key }, ...(!isComputerWorkspace(origin) && root ? [{ key: root }] : [])]);
  }
  const userKeys = new Map<string, Set<string>>();
  function collect(group: UserGroup): Set<string> {
    const existing = userKeys.get(group.id);
    if (existing) return existing;
    const keys = new Set(sessions.filter(session => directlyContains(group, session)).map(session => session.key));
    userKeys.set(group.id, keys);
    for (const link of group.links || []) {
      if (link.kind === 'user') {
        const child = groups.find(candidate => candidate.id === link.id);
        if (child) for (const key of collect(child)) keys.add(key);
      } else if (available) {
        for (const [key, candidates] of tokens) {
          if (link.selectors.some(selector => candidates.some(candidate => candidate.key === selector.key && (!selector.root || selector.root === candidate.root)))) keys.add(key);
        }
      }
    }
    return keys;
  }
  const views: GroupView[] = groups.map(group => ({ id: `group:${group.id}`, name: group.name, hint: '사용자 그룹',
    source: { kind: 'user', id: group.id, name: group.name }, keys: collect(group), providers: [], automatic: false }));
  const assigned = new Set([...userKeys.values()].flatMap(keys => [...keys]));
  for (const group of automatic) {
    const remaining = new Set([...group.keys].filter(key => !assigned.has(key)));
    if (remaining.size) views.push({ ...group, keys: remaining });
  }
  for (const view of [...automatic, ...views]) {
    view.providers = [...new Set(sessions.filter(session => view.keys.has(session.key)).map(session => session.provider))].sort();
  }
  views.sort((a, b) => a.name.localeCompare(b.name, 'ko') || a.id.localeCompare(b.id));
  return { views, automatic, userKeys, classification };
}
