import { test, expect } from '@playwright/test';

async function setup(page, options = {}) {
  await page.addInitScript(options => {
    window.claudePending = options.claudePending;
    const sessions = [
      { key: 'claude-key', member: ['claude', 'account', 'claude-id'], provider: 'claude', id: 'claude-id', title: 'Workflow validation', cwd: 'D:/Projects/Inspector', environment: 'ssh', host: 'build-host', lastActivity: 1793300000000 },
      { key: 'codex-key', member: ['codex', 'local', 'codex-id'], provider: 'codex', id: 'codex-id', title: 'Session manager UI', cwd: 'D:/Projects/SessionManager', environment: 'local', host: 'local', lastActivity: 1793290000000 },
      ...(options.extraSessions ?? []),
    ];
    const groups = [];
    window.extraActivities = Object.fromEntries(Object.entries(options.childStates ?? {}).map(([key, state]) => [key, { state, detail: 'Child response', observed_at: Date.now() / 1000 }]));
    window.desktopCalls = [];
    window.go = { main: { App: { Call: async request => {
      window.desktopCalls.push(request);
      if (request.action === 'snapshot') return { sessions, groups, warnings: [], groupError: window.groupFailure ? 'Broken groups' : '' };
      if (request.action === 'activities') {
        if (window.claudePending) return new Promise(() => {});
        return { 'claude-key': { state: 'completed', detail: 'Main response completed', observed_at: Date.now() / 1000 }, ...window.extraActivities };
      }
      if (request.action === 'codex-activities') return { 'codex-key': { state: window.codexState ?? 'working', detail: 'Codex turn state', observed_at: Date.now() / 1000 } };
      if (request.action === 'open') { await new Promise(resolve => setTimeout(resolve, 300)); if (window.openFailure) throw new Error('Desktop link failed'); return { requested: true }; }
      if (request.action === 'create-group') { const group = { id: 'group-1', name: request.name, members: [] }; groups.push(group); return group; }
      if (request.action === 'add-member') groups[0].members.push(sessions.find(s => s.key === request.key).member);
      if (request.action === 'rename-group') groups[0].name = request.name;
      if (request.action === 'delete-group') groups.splice(0, groups.length);
      return groups;
    } } } };
  }, options);
  await page.goto('/desktop.html');
  await expect(page.locator('.session-row')).toHaveCount(options.initialRows ?? 2 + (options.extraSessions?.length ?? 0));
}

const childSessions = [
  { key: 'child-aw', member: ['claude', 'account', 'child-aw'], provider: 'claude', id: 'child-aw', title: 'Benchmark AW task', childName: 't3-aw', parentKey: 'claude-key', cwd: 'D:/bench/t3-aw', environment: 'local', host: 'local', lastActivity: 1793300002000 },
  { key: 'child-wf', member: ['claude', 'account', 'child-wf'], provider: 'claude', id: 'child-wf', title: 'Benchmark WF task', childName: 't3-wf', parentKey: 'claude-key', cwd: 'D:/bench/t3-wf', environment: 'local', host: 'local', lastActivity: 1793300001000 },
];

test('provider and search filters are preserved across refresh', async ({ page }) => {
  await setup(page);
  await page.locator('aside .nav-row').filter({ hasText: 'Codex Desktop' }).click();
  await page.getByRole('textbox', { name: '세션 검색' }).fill('manager SessionManager');
  await page.getByRole('button', { name: '↻ 새로고침' }).click();
  await expect(page.locator('.session-row')).toHaveCount(1);
  await expect(page.locator('.session-row')).toContainText('Session manager UI');
});

test('opens the selected provider session once and reports a failed link request', async ({ page }) => {
  await setup(page);
  await page.locator('.session-row').filter({ hasText: 'Session manager UI' }).click();
  await page.getByRole('button', { name: /Codex Desktop에서 열기/ }).click();
  await expect(page.getByRole('button', { name: '세션을 여는 중…' })).toBeDisabled();
  await expect(page.getByRole('status')).toContainText('세션 열기를 요청했습니다');
  expect(await page.evaluate(() => window.desktopCalls.filter(c => c.action === 'open'))).toEqual([{ action: 'open', key: 'codex-key' }]);
  await page.evaluate(() => { window.openFailure = true; });
  await page.getByRole('button', { name: /Codex Desktop에서 열기/ }).click();
  await expect(page.getByRole('alert')).toContainText('Desktop link failed');
  await expect(page.locator('.success')).toHaveCount(0);
});

test('groups retain memberships across snapshot refresh', async ({ page }) => {
  await setup(page);
  await page.getByRole('textbox', { name: '새 그룹 이름' }).fill('Release work');
  await page.getByRole('button', { name: '그룹 만들기' }).click();
  await expect(page.getByRole('button', { name: '◇ Release work 0' })).toBeVisible();
  await page.locator('.session-row').filter({ hasText: 'Workflow validation' }).click();
  await page.getByRole('button', { name: '그룹에 추가', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Release work ×', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '← 세션 목록' }).click();
  await page.getByRole('button', { name: '◇ Release work 1' }).click();
  await expect(page.locator('.session-row')).toHaveCount(1);
  await expect(page.locator('.session-row')).toContainText('Workflow validation');
  await page.getByRole('textbox', { name: '그룹 이름 변경' }).fill('Release ready');
  await page.getByRole('button', { name: '이름 변경', exact: true }).click();
  await expect(page.locator('aside .nav-row.active')).toContainText('Release ready');
  await page.getByRole('button', { name: '그룹 삭제', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('대화는 보존됩니다');
  await page.getByRole('button', { name: '삭제 확인' }).click();
  await expect(page.locator('.session-row')).toHaveCount(2);
});

test('Desktop dashboard fits the minimum window size', async ({ page }) => {
  await setup(page);
  await expect(page.locator('.badge.working')).toHaveCount(1);
  await page.setViewportSize({ width: 960, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(960);
  await page.screenshot({ path: '../verification/desktop-ui-minimum.png' });
});

test('old activity becomes unknown when automatic refresh is off', async ({ page }) => {
  await setup(page);
  await expect(page.locator('.badge.completed')).toHaveCount(1);
  await page.getByRole('checkbox', { name: '자동 갱신 · 5초' }).uncheck();
  await page.clock.install();
  await page.clock.fastForward(16000);
  await expect(page.locator('.badge.completed')).toHaveCount(0);
  await page.locator('.session-row').filter({ hasText: 'Workflow validation' }).click();
  await expect(page.locator('dd').last()).toContainText('15초 이상 지연');
});

test('Codex shows working, completion, and interruption independently of Claude', async ({ page }) => {
  await setup(page, { claudePending: true });
  const codex = page.locator('.session-row').filter({ hasText: 'Session manager UI' });
  await expect(codex.locator('.badge')).toHaveText('작업 중');
  await page.evaluate(() => { window.codexState = 'completed'; });
  await page.getByRole('button', { name: '↻ 새로고침' }).click();
  await expect(codex.locator('.badge')).toHaveText('완료');
  await page.evaluate(() => { window.codexState = 'interrupted'; });
  await page.getByRole('button', { name: '↻ 새로고침' }).click();
  await expect(codex.locator('.badge')).toHaveText('중단');
  await page.evaluate(() => { window.codexState = 'working'; });
  await page.getByRole('button', { name: '↻ 새로고침' }).click();
  await expect(codex.locator('.badge')).toHaveText('작업 중');
});

test('Codex observation expires without automatic refresh', async ({ page }) => {
  await setup(page);
  const codex = page.locator('.session-row').filter({ hasText: 'Session manager UI' });
  await expect(codex.locator('.badge')).toHaveText('작업 중');
  await page.getByRole('checkbox', { name: '자동 갱신 · 5초' }).uncheck();
  await page.clock.install();
  await page.clock.fastForward(16000);
  await expect(codex.locator('.badge')).toHaveText('확인 불가');
});

test('a damaged group store disables editing while sessions remain visible', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { window.groupFailure = true; });
  await page.getByRole('button', { name: '↻ 새로고침' }).click();
  await expect(page.getByRole('alert')).toContainText('Broken groups');
  await expect(page.getByRole('textbox', { name: '새 그룹 이름' })).toBeDisabled();
  await expect(page.locator('.session-row')).toHaveCount(2);
});

test('dashboard preview', async ({ page }) => {
  await setup(page);
  await expect(page.locator('.badge.working')).toHaveCount(1);
  await page.screenshot({ path: '../verification/desktop-ui-preview.png' });
});

test('Claude scratch workspaces share this computer and retain search, refresh and opening', async ({ page }) => {
  const scratchSessions = [
    { key: 'scratch-one', member: ['claude', 'account', 'scratch-one'], provider: 'claude', id: 'scratch-one', title: 'Local planning', cwd: 'C:/Users/test/AppData/Roaming/Claude/scratch-workspaces/account/org/scratch-2026-10-29-one', environment: 'local', host: 'local', lastActivity: 1793300000000 },
    { key: 'scratch-two', member: ['claude', 'account', 'scratch-two'], provider: 'claude', id: 'scratch-two', title: 'Local research', cwd: 'F:\\Claude\\AppDataRoaming-Claude\\SCRATCH-WORKSPACES\\account\\org\\scratch-2026-10-30-two\\', environment: 'local', host: 'local', lastActivity: 1793290000000 },
  ];
  await setup(page, { extraSessions: scratchSessions });
  const computer = page.locator('.path-row').filter({ hasText: '이 컴퓨터' });
  await expect(computer).toHaveCount(1);
  await expect(page.locator('.path-row')).toHaveCount(3);
  await expect(page.locator('.projects')).not.toContainText('scratch-2026');
  await computer.click();
  await expect(page.locator('.session-row')).toHaveCount(2);
  await expect(page.locator('.session-row')).toContainText(['Local planning', 'Local research']);
  await page.screenshot({ path: '../verification/desktop-computer-workspaces.png' });
  await page.getByRole('textbox', { name: '세션 검색' }).fill('research');
  await page.getByRole('button', { name: '↻ 새로고침' }).click();
  await expect(computer).toHaveClass(/active/);
  await expect(page.locator('.session-row')).toHaveCount(1);
  await expect(page.locator('.session-row')).toContainText('Local research');
  await page.locator('.session-row').click();
  await expect(page.locator('dd').first()).toHaveText(scratchSessions[1].cwd);
  await page.getByRole('button', { name: /Claude Desktop에서 열기/ }).click();
  await expect(page.getByRole('status')).toContainText('세션 열기를 요청했습니다');
  expect(await page.evaluate(() => window.desktopCalls.filter(c => c.action === 'open'))).toEqual([{ action: 'open', key: 'scratch-two' }]);
});

test('ordinary scratch projects, Codex and SSH remain separate folders', async ({ page }) => {
  const scratchPath = 'C:/Users/test/AppData/Roaming/Claude/scratch-workspaces/account/org/scratch-internal';
  const extraSessions = [
    { key: 'ordinary', member: ['claude', 'account', 'ordinary'], provider: 'claude', id: 'ordinary', title: 'Ordinary project', cwd: 'D:/Projects/scratch-project', environment: 'local', host: 'local', lastActivity: 1793300000000 },
    { key: 'codex-scratch', member: ['codex', 'local', 'codex-scratch'], provider: 'codex', id: 'codex-scratch', title: 'Codex scratch', cwd: scratchPath, environment: 'local', host: 'local', lastActivity: 1793300000000 },
    { key: 'ssh-scratch', member: ['claude', 'account', 'ssh-scratch'], provider: 'claude', id: 'ssh-scratch', title: 'SSH scratch', cwd: scratchPath, environment: 'ssh', host: 'build-host', lastActivity: 1793300000000 },
  ];
  await setup(page, { extraSessions });
  await expect(page.locator('.path-row')).toHaveCount(5);
  await expect(page.locator('.path-row').filter({ hasText: '이 컴퓨터' })).toHaveCount(0);
  for (const session of extraSessions) {
    await page.locator('.path-row').filter({ hasText: session.environment === 'ssh' ? 'scratch-internal · build-host' : session.provider === 'codex' ? /scratch-internal$/ : 'scratch-project' }).click();
    await expect(page.locator('.session-row')).toHaveCount(1);
    await expect(page.locator('.session-row')).toContainText(session.title);
  }
});

test('explicit Codex projectless chats join Claude this computer without grouping ordinary paths', async ({ page }) => {
  await setup(page, { extraSessions: [
    { key: 'claude-scratch', member: ['claude', 'account', 'claude-scratch'], provider: 'claude', id: 'claude-scratch', title: 'Claude local chat', cwd: 'C:/Users/test/AppData/Roaming/Claude/scratch-workspaces/account/org/scratch-one', environment: 'local', host: 'local', lastActivity: 1793300000000 },
    { key: 'codex-projectless', member: ['codex', 'local', 'codex-projectless'], provider: 'codex', id: 'codex-projectless', title: 'Codex local chat', cwd: 'D:/Projects/SessionManager', environment: 'local', host: 'local', projectless: true, lastActivity: 1793300000000 },
    { key: 'codex-empty', member: ['codex', 'local', 'codex-empty'], provider: 'codex', id: 'codex-empty', title: 'Codex empty path', cwd: '', environment: 'local', host: 'local', projectless: true, lastActivity: 1793300000000 },
    { key: 'codex-ordinary', member: ['codex', 'local', 'codex-ordinary'], provider: 'codex', id: 'codex-ordinary', title: 'Codex ordinary folder', cwd: 'C:/Users/test/Documents/Codex/2026-10-30/new-chat', environment: 'local', host: 'local', projectless: false, lastActivity: 1793300000000 },
  ] });
  const computer = page.locator('.path-row').filter({ hasText: '이 컴퓨터' });
  await expect(computer).toHaveCount(1);
  await expect(page.locator('.path-row')).toHaveCount(4);
  await computer.click();
  await expect(page.locator('.session-row')).toHaveCount(3);
  await expect(page.locator('.session-row')).toContainText(['Claude local chat', 'Codex local chat', 'Codex empty path']);
  await page.screenshot({ path: '../verification/desktop-codex-projectless.png' });
  await page.getByRole('textbox', { name: '세션 검색' }).fill('SessionManager Codex');
  await page.getByRole('button', { name: '↻ 새로고침' }).click();
  await expect(computer).toHaveClass(/active/);
  await expect(page.locator('.session-row')).toHaveCount(1);
  await page.locator('.session-row').click();
  await expect(page.locator('dd').first()).toHaveText('D:/Projects/SessionManager');
  await page.getByRole('button', { name: /Codex Desktop에서 열기/ }).click();
  await expect(page.getByRole('status')).toContainText('세션 열기를 요청했습니다');
  expect(await page.evaluate(() => window.desktopCalls.filter(c => c.action === 'open'))).toEqual([{ action: 'open', key: 'codex-projectless' }]);
  await page.getByRole('textbox', { name: '세션 검색' }).fill('');
  await page.locator('.path-row').filter({ hasText: 'SessionManager' }).click();
  await expect(page.locator('.session-row')).toHaveCount(1);
  await expect(page.locator('.session-row')).toContainText('Session manager UI');
  await page.locator('.path-row').filter({ hasText: 'new-chat' }).click();
  await expect(page.locator('.session-row')).toHaveCount(1);
  await expect(page.locator('.session-row')).toContainText('Codex ordinary folder');
});

test('families start collapsed, retain expansion and open the original child with parent navigation', async ({ page }) => {
  await setup(page, { extraSessions: childSessions, initialRows: 2, childStates: { 'child-aw': 'working' } });
  const parent = page.locator('[data-session-key="claude-key"]');
  await expect(parent.locator('.badge')).toHaveText('완료');
  await expect(parent.locator('.hierarchy-summary')).toHaveText('하위 2개 · 1개 작업 중');
  await expect(page.locator('.path-row').filter({ hasText: /t3-aw|t3-wf/ })).toHaveCount(0);
  await parent.locator('.tree-toggle').click();
  await expect(page.locator('.detail-card')).toHaveCount(0);
  await expect(page.locator('.session-row')).toHaveCount(4);
  await page.getByRole('button', { name: '↻ 새로고침' }).click();
  await expect(parent.locator('.tree-toggle')).toHaveAttribute('aria-expanded', 'true');
  await page.locator('[data-session-key="child-aw"] .session-row').click();
  await expect(page.locator('.detail-card h2')).toHaveText('Benchmark AW task');
  await expect(page.locator('dd').first()).toHaveText('D:/bench/t3-aw');
  await page.getByRole('button', { name: /Claude Desktop에서 열기/ }).click();
  await expect(page.getByRole('status')).toContainText('세션 열기를 요청했습니다');
  expect(await page.evaluate(() => window.desktopCalls.filter(c => c.action === 'open'))).toEqual([{ action: 'open', key: 'child-aw' }]);
  await page.locator('.parent-link button').click();
  await expect(page.locator('.detail-card h2')).toHaveText('Workflow validation');
  await page.getByRole('button', { name: '← 세션 목록' }).click();
  await page.getByRole('button', { name: '▱ Inspector · build-host', exact: true }).click();
  await expect(page.locator('.session-row')).toHaveCount(3);
  await page.evaluate(() => { window.extraActivities['child-aw'].state = 'completed'; });
  await page.getByRole('button', { name: '↻ 새로고침' }).click();
  await expect(parent.locator('.descendant-working')).toHaveCount(0);
  await expect(parent.locator('.badge')).toHaveText('완료');
});

test('nested child searches auto-expand ancestors and remain manually collapsible', async ({ page }) => {
  const nested = { ...childSessions[0], key: 'nested', id: 'nested', member: ['claude', 'account', 'nested'], parentKey: 'child-wf', title: 'Nested verification', childName: 'nested-task', cwd: 'D:/bench/nested' };
  await setup(page, { extraSessions: [...childSessions, nested], initialRows: 2 });
  const search = page.getByRole('textbox', { name: '세션 검색' });
  await search.fill('nested-task');
  await expect(page.locator('.session-row')).toHaveCount(3);
  await expect(page.locator('[data-session-key="child-aw"]')).toHaveCount(0);
  await expect(page.locator('[data-session-key="nested"]')).toBeVisible();
  await page.locator('[data-session-key="claude-key"] .tree-toggle').click();
  await expect(page.locator('.session-row')).toHaveCount(1);
  await page.getByRole('button', { name: '↻ 새로고침' }).click();
  await expect(page.locator('.session-row')).toHaveCount(1);
  await search.fill('t3-aw');
  await expect(page.locator('.session-row')).toHaveCount(2);
  await search.fill('');
  await expect(page.locator('.session-row')).toHaveCount(2);
  await page.locator('[data-session-key="claude-key"] .tree-toggle').click();
  await page.locator('[data-session-key="child-wf"] .tree-toggle').click();
  await expect(page.locator('.session-row')).toHaveCount(5);
  await page.screenshot({ path: '../verification/desktop-session-hierarchy.png' });
  await page.setViewportSize({ width: 960, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(960);
  await page.screenshot({ path: '../verification/desktop-session-hierarchy-minimum.png' });
});

test('a group containing only a child shows its ancestors without unrelated siblings', async ({ page }) => {
  await setup(page, { extraSessions: childSessions, initialRows: 2 });
  await page.getByRole('textbox', { name: '새 그룹 이름' }).fill('Child work');
  await page.getByRole('button', { name: '그룹 만들기' }).click();
  await page.locator('[data-session-key="claude-key"] .tree-toggle').click();
  await page.locator('[data-session-key="child-aw"] .session-row').click();
  await page.getByRole('button', { name: '그룹에 추가', exact: true }).click();
  await page.getByRole('button', { name: '◇ Child work 1', exact: true }).click();
  await expect(page.locator('.session-row')).toHaveCount(2);
  await expect(page.locator('[data-session-key="claude-key"]')).toBeVisible();
  await expect(page.locator('[data-session-key="child-aw"]')).toBeVisible();
  await expect(page.locator('[data-session-key="child-wf"]')).toHaveCount(0);
});

test('a collapsed familys working summary expires with its child observation', async ({ page }) => {
  await setup(page, { extraSessions: childSessions, initialRows: 2, childStates: { 'child-aw': 'working' } });
  const parent = page.locator('[data-session-key="claude-key"]');
  await expect(parent.locator('.descendant-working')).toContainText('1개 작업 중');
  await page.getByRole('checkbox', { name: '자동 갱신 · 5초' }).uncheck();
  await page.clock.install();
  await page.clock.fastForward(16000);
  await expect(parent.locator('.descendant-working')).toHaveCount(0);
  await expect(parent.locator('.badge')).toHaveText('확인 불가');
});

test('missing parents remain accessible and independent sessions retain a shared child folder', async ({ page }) => {
  const orphan = { ...childSessions[0], key: 'orphan', id: 'orphan', parentKey: 'missing', title: 'Orphan conversation', childName: 'orphan-task', cwd: 'D:/orphan' };
  const ordinary = { ...childSessions[0], key: 'ordinary', id: 'ordinary', member: ['codex', 'local', 'ordinary'], provider: 'codex', parentKey: null, childName: '', title: 'Independent project chat' };
  await setup(page, { extraSessions: [...childSessions, orphan, ordinary], initialRows: 4 });
  await expect(page.locator('[data-session-key="orphan"]')).toContainText('부모 대화 확인 불가');
  await page.locator('[data-session-key="orphan"] .session-row').click();
  await expect(page.locator('.parent-link')).toHaveText('부모 대화 확인 불가');
  await page.getByRole('button', { name: '← 세션 목록' }).click();
  await page.getByRole('button', { name: '▱ t3-aw', exact: true }).click();
  await expect(page.locator('.session-row')).toHaveCount(1);
  await expect(page.locator('.session-row')).toContainText('Independent project chat');
});
