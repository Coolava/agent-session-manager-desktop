import type { DesktopSession as Session, SessionNode } from './desktopSessionTree';

export function sourceGroup(session: Session) { return session.provider === 'claude' ? session.claudeGroup : undefined; }
export function sourceProject(session: Session) { return session.provider === 'codex' && session.environment === 'local' && !session.projectless ? session.codexProject : undefined; }
export function projectPath(session: Session) { return session.provider === 'codex' && session.environment === 'local' ? session.projectCwd || session.cwd : session.cwd; }
export function isComputerWorkspace(session: Session) {
  if (session.environment !== 'local') return false;
  if (session.provider === 'codex') return session.projectless === true;
  return session.provider === 'claude'
    && /(?:^|[\\/])scratch-workspaces[\\/][^\\/]+[\\/][^\\/]+[\\/]scratch-[^\\/]+[\\/]?$/i.test(session.cwd);
}

function explicitKey(session: Session) {
  const group = sourceGroup(session);
  if (group) return JSON.stringify(['claude-group', session.member[1], group.id]);
  if (session.provider !== 'codex' || session.projectless) return '';
  const assignment = session.codexAssignment;
  // Older snapshots without provenance keep their existing project identity.
  const identifier = assignment?.id || (assignment === undefined ? sourceProject(session)?.id : undefined);
  return identifier ? JSON.stringify(['codex-project', session.environment, session.host, session.member[1], assignment?.kind || 'local', identifier]) : '';
}

export function classificationSession(session: Session, tree: { byKey: Map<string, SessionNode> }) {
  let node = tree.byKey.get(session.key)!;
  while (node.parent && !explicitKey(node.session)) node = node.parent;
  return node.session;
}

function rootKey(session: Session) {
  let path = projectPath(session);
  if (!path) return '';
  if (session.environment === 'local' && /^(?:[a-z]:[\\/]|\\\\|\/\/)/i.test(path)) {
    path = path.replace(/^\\\\\?\\/, '').replace(/\\/g, '/').toLowerCase();
    const prefix = path.startsWith('//') ? '//' : '';
    const parts: string[] = [];
    for (const part of path.slice(prefix.length).split('/')) {
      if (!part || part === '.') continue;
      if (part === '..' && parts.length > (prefix ? 2 : 1)) parts.pop();
      else if (part !== '..') parts.push(part);
    }
    path = prefix + parts.join('/');
  }
  else path = path.replace(/\/+$/, '') || '/';
  return JSON.stringify(['root', session.environment, session.host, path]);
}

export function classifyProjects(tree: { byKey: Map<string, SessionNode> }) {
  const sessions = [...new Map([...tree.byKey.values()].map(node => {
    const session = classificationSession(node.session, tree);
    return [session.key, session] as const;
  })).values()].sort((a, b) => a.key.localeCompare(b.key));
  const roots = new Map<string, Map<string, Session>>();
  for (const session of sessions) {
    const key = explicitKey(session), root = rootKey(session);
    if (!key || !root) continue;
    if (!roots.has(root)) roots.set(root, new Map());
    roots.get(root)!.set(key, session);
  }
  const bySession = new Map<string, string>();
  const representatives = new Map<string, Session>();
  for (const session of sessions) {
    const explicit = explicitKey(session);
    const computer = !explicit && isComputerWorkspace(session);
    const root = rootKey(session);
    const anchors = roots.get(root);
    const candidate = !explicit && !computer && anchors?.size === 1 ? [...anchors.entries()][0] : undefined;
    const anchor = candidate && (sourceGroup(candidate[1]) || sourceProject(candidate[1])) ? candidate : undefined;
    const key = explicit || (computer ? JSON.stringify(['computer', session.environment, session.host]) : anchor?.[0] || root || JSON.stringify(['no-root', session.key]));
    const representative = explicit ? session : anchor?.[1] || { ...session, codexProject: undefined };
    bySession.set(session.key, key);
    if (!representatives.has(key)) representatives.set(key, representative);
  }
  for (const node of tree.byKey.values()) bySession.set(node.session.key, bySession.get(classificationSession(node.session, tree).key)!);
  return { bySession, representatives };
}
