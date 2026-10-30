export type DesktopSession = {
  key: string; member: string[]; provider: string; id: string; title: string; cwd: string;
  environment: string; host: string; lastActivity: number; projectless?: boolean;
  parentKey?: string | null; childName?: string;
};

export type SessionNode = {
  session: DesktopSession; parent?: SessionNode; children: SessionNode[];
  descendants: DesktopSession[]; parentUnavailable: boolean; lastActivity: number;
};

export function buildSessionTree(sessions: DesktopSession[]) {
  const byKey = new Map<string, SessionNode>(sessions.map(session => [session.key, {
    session, children: [], descendants: [], parentUnavailable: !!session.parentKey, lastActivity: session.lastActivity,
  }]));
  function parentOf(node: SessionNode) {
    const parent = byKey.get(node.session.parentKey ?? '');
    return parent?.session.provider === node.session.provider && parent.session.member[1] === node.session.member[1] ? parent : undefined;
  }
  for (const node of byKey.values()) {
    const parent = parentOf(node);
    const seen = new Set([node]);
    let ancestor = parent;
    while (ancestor && !seen.has(ancestor)) {
      seen.add(ancestor);
      ancestor = parentOf(ancestor);
    }
    if (parent && !ancestor) {
      node.parent = parent;
      parent.children.push(node);
      node.parentUnavailable = false;
    }
  }
  function collect(node: SessionNode) {
    for (const child of node.children) {
      collect(child);
      node.descendants.push(child.session, ...child.descendants);
      node.lastActivity = Math.max(node.lastActivity, child.lastActivity);
    }
    node.children.sort((a, b) => b.lastActivity - a.lastActivity);
  }
  const roots = [...byKey.values()].filter(node => !node.parent);
  for (const node of roots) collect(node);
  roots.sort((a, b) => b.lastActivity - a.lastActivity);
  return { roots, byKey };
}

export function sessionRoot(node: SessionNode) {
  while (node.parent) node = node.parent;
  return node.session;
}

export function sessionTreeRows(
  tree: ReturnType<typeof buildSessionTree>, scopedKeys: Set<string>, query: string,
  expanded: Set<string>, searchCollapsed: Set<string>,
) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const included = new Set<string>();
  function includeAncestors(node: SessionNode) {
    for (let current: SessionNode | undefined = node; current; current = current.parent) included.add(current.session.key);
  }
  for (const node of tree.byKey.values()) {
    if (!scopedKeys.has(node.session.key)) continue;
    const session = node.session;
    const text = [session.title, session.childName, session.cwd, session.host, session.id, session.provider, session.environment].join(' ').toLowerCase();
    if (!words.every(word => text.includes(word))) continue;
    includeAncestors(node);
    if (words.length) {
      for (const child of node.descendants) {
        if (scopedKeys.has(child.key)) includeAncestors(tree.byKey.get(child.key)!);
      }
    }
  }
  const rows: { node: SessionNode; depth: number; expanded: boolean; automatic: boolean; descendants: DesktopSession[] }[] = [];
  function append(node: SessionNode, depth: number) {
    if (!included.has(node.session.key)) return;
    const descendants = node.descendants.filter(child => included.has(child.key));
    const automatic = words.length > 0 || !scopedKeys.has(node.session.key);
    const open = descendants.length > 0 && (automatic ? !searchCollapsed.has(node.session.key) : expanded.has(node.session.key));
    rows.push({ node, depth, expanded: open, automatic, descendants });
    if (open) for (const child of node.children) append(child, depth + 1);
  }
  for (const root of tree.roots) append(root, 0);
  return rows;
}
