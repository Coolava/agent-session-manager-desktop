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
    window.desktopSessions = sessions;
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
      if (request.action === 'open') { await new Promise(resolve => setTimeout(resolve, window.openDelay ?? 300)); if (window.openFailure) throw new Error('Desktop link failed'); return { requested: true }; }
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

async function showDetails(page, row) {
  await row.click({ button: 'right' });
  await page.getByRole('menuitem', { name: '세션 상세' }).click();
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

for (const [key, title] of [['claude-key', 'Workflow validation'], ['codex-key', 'Session manager UI']]) {
  test(`one click opens ${key} while keeping the session list`, async ({ page }) => {
    await setup(page);
    await page.locator('.session-row').filter({ hasText: title }).click();
    await expect(page.locator('.session-row').first()).toBeDisabled();
    await expect(page.getByRole('status')).toContainText('세션 열기를 요청했습니다');
    await expect(page.locator('.detail-card')).toHaveCount(0);
    await expect(page.locator('.session-row')).toHaveCount(2);
    expect(await page.evaluate(() => window.desktopCalls.filter(c => c.action === 'open'))).toEqual([{ action: 'open', key }]);
  });
}

test('double clicking does not issue a second open request after a fast response', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { window.openDelay = 0; });
  await page.locator('[data-session-key="codex-key"] .session-row').dblclick();
  await expect(page.getByRole('status')).toContainText('세션 열기를 요청했습니다');
  expect(await page.evaluate(() => window.desktopCalls.filter(c => c.action === 'open'))).toEqual([{ action: 'open', key: 'codex-key' }]);
});

test('right click targets the latest row and opens details without opening an app', async ({ page }) => {
  await setup(page);
  await page.locator('[data-session-key="claude-key"] .session-row').click({ button: 'right' });
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(page.locator('.detail-card')).toHaveCount(0);
  await page.locator('[data-session-key="codex-key"] .session-row').click({ button: 'right' });
  await page.getByRole('button', { name: '↻ 새로고침' }).focus();
  await page.getByRole('menuitem', { name: '세션 상세' }).click();
  await expect(page.locator('.detail-card h2')).toHaveText('Session manager UI');
  await expect(page.locator('.session-menu')).toHaveCount(0);
  expect(await page.evaluate(() => window.desktopCalls.filter(c => c.action === 'open'))).toEqual([]);
});

test('context menu supports keyboard entry and dismissal', async ({ page }) => {
  await setup(page);
  const row = page.locator('[data-session-key="claude-key"] .session-row');
  await row.focus();
  await page.keyboard.press('Shift+F10');
  await expect(page.getByRole('menuitem')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(row).toBeFocused();
  await page.keyboard.press('ContextMenu');
  await page.keyboard.press('Enter');
  await expect(page.locator('.detail-card h2')).toHaveText('Workflow validation');
  expect(await page.evaluate(() => window.desktopCalls.filter(c => c.action === 'open'))).toEqual([]);
});

test('context menu stays within the minimum window and closes on outside click or scroll', async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 960, height: 640 });
  const row = page.locator('[data-session-key="codex-key"] .session-row');
  await row.evaluate(element => element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 958, clientY: 638 })));
  await expect(page.getByRole('menuitem')).toBeFocused();
  await expect.poll(async () => (await page.getByRole('menu').boundingBox()).x).toBeGreaterThan(700);
  const bounds = await page.getByRole('menu').boundingBox();
  expect(bounds.y).toBeGreaterThan(500);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(952);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(632);
  await page.screenshot({ path: 'test-results/desktop-session-menu.png' });
  await page.getByRole('heading', { name: 'Sessions', exact: true }).click();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await row.click({ button: 'right' });
  await page.locator('main').dispatchEvent('scroll');
  await expect(page.getByRole('menu')).toHaveCount(0);
  expect(await page.evaluate(() => window.desktopCalls.filter(c => c.action === 'open'))).toEqual([]);
});

test('expanding a family does not open an app and clicking a child opens its own session', async ({ page }) => {
  await setup(page, { extraSessions: childSessions, initialRows: 2 });
  await page.locator('[data-session-key="claude-key"] .tree-toggle').click();
  expect(await page.evaluate(() => window.desktopCalls.filter(c => c.action === 'open'))).toEqual([]);
  await page.locator('[data-session-key="child-aw"] .session-row').click();
  await expect(page.getByRole('status')).toContainText('세션 열기를 요청했습니다');
  await expect(page.locator('.detail-card')).toHaveCount(0);
  expect(await page.evaluate(() => window.desktopCalls.filter(c => c.action === 'open'))).toEqual([{ action: 'open', key: 'child-aw' }]);
});

test('opens the selected provider session once and reports a failed link request', async ({ page }) => {
  await setup(page);
  await showDetails(page, page.locator('.session-row').filter({ hasText: 'Session manager UI' }));
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
  await showDetails(page, page.locator('.session-row').filter({ hasText: 'Workflow validation' }));
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
  await showDetails(page, page.locator('.session-row').filter({ hasText: 'Workflow validation' }));
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
  await showDetails(page, page.locator('.session-row'));
  await expect(page.locator('dd').first()).toHaveText(scratchSessions[1].cwd);
  await page.getByRole('button', { name: /Claude Desktop에서 열기/ }).click();
  await expect(page.getByRole('status')).toContainText('세션 열기를 요청했습니다');
  expect(await page.evaluate(() => window.desktopCalls.filter(c => c.action === 'open'))).toEqual([{ action: 'open', key: 'scratch-two' }]);
});

test('Codex projects combine assigned worktrees and same-root folders and retain original paths and opening', async ({ page }) => {
  const common = { environment: 'local', host: 'local', lastActivity: 1793300000000 };
  const codexProject = { id: 'project-1', name: 'Calibration workspace' };
  await setup(page, { extraSessions: [
    { ...common, key: 'root', member: ['claude', 'account', 'root'], provider: 'claude', id: 'root', title: 'Original project', cwd: 'D:/Projects/Calibration' },
    { ...common, key: 'worktree-one', member: ['codex', 'local', 'worktree-one'], provider: 'codex', id: 'worktree-one', title: 'Worktree one', cwd: 'F:/worktrees/abcd/Calibration', projectCwd: 'd:\\Projects\\Calibration\\', codexProject },
    { ...common, key: 'worktree-two', member: ['codex', 'local', 'worktree-two'], provider: 'codex', id: 'worktree-two', title: 'Worktree two', cwd: 'F:/worktrees/efgh/Calibration', projectCwd: 'D:/Projects/Calibration', codexProject },
    { ...common, key: 'other', member: ['codex', 'local', 'other'], provider: 'codex', id: 'other', title: 'Other project', cwd: 'E:/Other/Calibration' },
    { ...common, key: 'projectless', member: ['codex', 'local', 'projectless'], provider: 'codex', id: 'projectless', title: 'Computer conversation', cwd: 'F:/worktrees/temp/Calibration', projectCwd: 'D:/Projects/Calibration', projectless: true, codexProject },
    { ...common, key: 'empty', member: ['codex', 'local', 'empty'], provider: 'codex', id: 'empty', title: 'Empty working path', cwd: '', projectCwd: 'D:/Projects/Calibration', codexProject },
  ] });
  await expect(page.locator('.path-row')).toHaveCount(4);
  const rootProject = page.locator('.codex-project-row').filter({ hasText: 'Calibration workspace' });
  await expect(rootProject).toHaveCount(1);
  await rootProject.click();
  await expect(page.locator('.session-row')).toHaveCount(4);
  await expect(page.locator('.session-row')).toContainText(['Original project', 'Worktree one', 'Worktree two', 'Empty working path']);
  await page.screenshot({ path: '../verification/desktop-codex-projects.png' });
  await page.getByRole('textbox', { name: '세션 검색' }).fill('workspace Worktree');
  await page.getByRole('button', { name: '↻ 새로고침' }).click();
  await expect(rootProject).toHaveClass(/active/);
  await expect(page.locator('.session-row')).toHaveCount(2);
  await page.getByRole('textbox', { name: '세션 검색' }).fill('abcd');
  await expect(page.locator('.session-row')).toHaveCount(1);
  await showDetails(page, page.locator('.session-row'));
  await expect(page.locator('dd').first()).toHaveText('F:/worktrees/abcd/Calibration');
  await expect(page.locator('.detail-card')).toContainText('Calibration workspace');
  await page.getByRole('button', { name: /Codex Desktop에서 열기/ }).click();
  await expect(page.getByRole('status')).toContainText('세션 열기를 요청했습니다');
  expect(await page.evaluate(() => window.desktopCalls.filter(c => c.action === 'open'))).toEqual([{ action: 'open', key: 'worktree-one' }]);
});

test('Codex projects with identical names and roots stay distinct by ID across rename and removal', async ({ page }) => {
  const common = { provider: 'codex', environment: 'local', host: 'local', lastActivity: 1793300000000, projectCwd: 'D:/Shared' };
  await setup(page, { extraSessions: [
    { ...common, key: 'project-a', member: ['codex', 'local', 'project-a'], id: 'project-a', title: 'Task A', cwd: 'F:/worktrees/one', codexProject: { id: 'a', name: 'Shared' } },
    { ...common, key: 'project-b', member: ['codex', 'local', 'project-b'], id: 'project-b', title: 'Task B', cwd: 'F:/worktrees/two', codexProject: { id: 'b', name: 'Shared' } },
  ] });
  await expect(page.locator('.codex-project-row')).toHaveCount(2);
  await expect(page.locator('.path-row')).toHaveCount(2);
  await page.locator('.codex-project-row').first().click();
  await expect(page.locator('.session-row')).toHaveCount(1);
  await expect(page.locator('.session-row')).toContainText('Task A');
  await page.evaluate(() => { window.desktopSessions.find(s => s.key === 'project-a').codexProject.name = 'Renamed'; });
  await page.getByRole('button', { name: '↻ 새로고침' }).click();
  await expect(page.locator('.codex-project-row.active')).toHaveText('Renamed');
  await expect(page.locator('.session-row')).toContainText('Task A');
  await page.evaluate(() => { const session = window.desktopSessions.find(s => s.key === 'project-a'); delete session.codexProject; session.projectCwd = ''; });
  await page.getByRole('button', { name: '↻ 새로고침' }).click();
  await expect(page.locator('.codex-project-row')).toHaveCount(1);
  await expect(page.locator('.path-row').filter({ hasText: 'one' })).toHaveCount(1);
  await expect(page.locator('.session-row')).toHaveCount(4);
  await page.locator('.codex-project-row').click();
  await expect(page.locator('.session-row')).toHaveCount(1);
  await expect(page.locator('.session-row')).toContainText('Task B');
});

test('explicit Claude groups stay distinct while unassigned folders join their unique same-root project', async ({ page }) => {
  const common = { provider: 'claude', environment: 'local', host: 'local', lastActivity: 1793300000000, cwd: 'C:/Users/test' };
  await setup(page, { extraSessions: [
    { ...common, key: 'migration', member: ['claude', 'account:org', 'migration'], id: 'migration', title: 'sp-workflow migration', claudeGroup: { id: 'cg-1', name: 'Improve_Workflow' } },
    { ...common, key: 'compression', member: ['claude', 'account:org', 'compression'], id: 'compression', title: 'Workflow compression', claudeGroup: { id: 'cg-1', name: 'Improve_Workflow' } },
    { ...common, key: 'other-account', member: ['claude', 'other:org', 'other-account'], id: 'other-account', title: 'Other account work', claudeGroup: { id: 'cg-1', name: 'Improve_Workflow' } },
    { ...common, key: 'other-group', member: ['claude', 'account:org', 'other-group'], id: 'other-group', title: 'Other group work', claudeGroup: { id: 'cg-2', name: 'Improve_Workflow' } },
    { ...common, key: 'scratch-group', member: ['claude', 'account:org', 'scratch-group'], id: 'scratch-group', title: 'Grouped scratch work', cwd: 'C:/Claude/scratch-workspaces/account/org/scratch-test', claudeGroup: { id: 'cg-1', name: 'Improve_Workflow' } },
    { ...common, key: 'codex-same-name', member: ['codex', 'local', 'codex-same-name'], id: 'codex-same-name', provider: 'codex', title: 'Codex project work', cwd: 'F:/worktrees/one', projectCwd: 'D:/Improve_Workflow', codexProject: { id: 'codex-project', name: 'Improve_Workflow' } },
    { ...common, key: 'folder-same-name', member: ['claude', 'account:org', 'folder-same-name'], id: 'folder-same-name', title: 'Ordinary folder work', cwd: 'D:/Improve_Workflow' },
  ] });
  const sourceGroups = page.locator('.claude-group-row');
  await expect(sourceGroups).toHaveCount(3);
  await expect(page.locator('.path-row').filter({ hasText: 'test' })).toHaveCount(0);
  await sourceGroups.first().click();
  await expect(page.locator('.session-row')).toHaveCount(3);
  await expect(page.locator('.session-row')).toContainText(['sp-workflow migration', 'Workflow compression', 'Grouped scratch work']);
  await expect(page.locator('.group-tools')).toHaveCount(0);
  await page.getByRole('textbox', { name: '세션 검색' }).fill('Improve_Workflow migration');
  await page.getByRole('button', { name: '↻ 새로고침' }).click();
  await expect(sourceGroups.first()).toHaveClass(/active/);
  await expect(page.locator('.session-row')).toHaveCount(1);
  await showDetails(page, page.locator('.session-row'));
  await expect(page.locator('dd').first()).toHaveText('C:/Users/test');
  await expect(page.locator('.detail-card')).toContainText('Improve_Workflow');
  await page.getByRole('button', { name: /Claude Desktop에서 열기/ }).click();
  await expect(page.getByRole('status')).toContainText('세션 열기를 요청했습니다');
  expect(await page.evaluate(() => window.desktopCalls.filter(c => c.action === 'open'))).toEqual([{ action: 'open', key: 'migration' }]);
  await page.getByRole('button', { name: '← 세션 목록' }).click();
  await page.getByRole('textbox', { name: '세션 검색' }).fill('');
  await sourceGroups.nth(1).click();
  await expect(page.locator('.session-row')).toHaveCount(1);
  await expect(page.locator('.session-row')).toContainText('Other account work');
  await expect(page.locator('.path-row').filter({ hasText: 'Improve_Workflow' })).toHaveCount(0);
  await page.locator('.codex-project-row').filter({ hasText: 'Improve_Workflow' }).click();
  await expect(page.locator('.session-row')).toHaveCount(2);
  await expect(page.locator('.session-row')).toContainText(['Codex project work', 'Ordinary folder work']);
  await sourceGroups.first().click();
  await page.screenshot({ path: '../verification/desktop-source-classification.png' });
  await page.evaluate(() => { window.desktopSessions.forEach(session => { if (session.provider === 'claude') delete session.claudeGroup; }); });
  await page.getByRole('button', { name: '↻ 새로고침' }).click();
  await expect(sourceGroups).toHaveCount(0);
  await expect(page.locator('.path-row').filter({ hasText: 'test' })).toHaveCount(1);
  await expect(page.locator('.session-row')).toHaveCount(9);
});

test('explicit child Claude groups override the parent classification while keeping tree context', async ({ page }) => {
  await setup(page, { extraSessions: childSessions.map((session, index) => index === 0 ? { ...session, claudeGroup: { id: 'cg-child', name: 'Child review' } } : session), initialRows: 2 });
  await page.locator('.claude-group-row').filter({ hasText: 'Child review' }).click();
  await expect(page.locator('.session-row')).toHaveCount(2);
  await expect(page.locator('[data-session-key="child-aw"]')).toBeVisible();
  await expect(page.locator('[data-session-key="child-wf"]')).toHaveCount(0);
  await page.locator('.path-row').filter({ hasText: 'Inspector' }).click();
  await page.locator('[data-session-key="claude-key"] .tree-toggle').click();
  await expect(page.locator('[data-session-key="child-wf"]')).toBeVisible();
  await expect(page.locator('[data-session-key="child-aw"]')).toHaveCount(0);
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
  await showDetails(page, page.locator('.session-row'));
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
  await showDetails(page, page.locator('[data-session-key="child-aw"] .session-row'));
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

test('tree connectors join parent buttons, continue through nested rows and stop at the last sibling', async ({ page }) => {
  const nested = { ...childSessions[0], key: 'nested', id: 'nested', member: ['claude', 'account', 'nested'], parentKey: 'child-aw', childName: 'nested-task' };
  await setup(page, { extraSessions: [...childSessions, nested], initialRows: 2 });
  const parent = page.locator('[data-session-key="claude-key"]');
  const first = page.locator('[data-session-key="child-aw"]');
  const last = page.locator('[data-session-key="child-wf"]');
  const grandchild = page.locator('[data-session-key="nested"]');
  await parent.locator('.tree-toggle').click();
  await first.locator('.tree-toggle').click();
  await expect(page.locator('.session-row')).toHaveCount(5);
  for (const viewport of [{ width: 1380, height: 880 }, { width: 960, height: 640 }]) {
    await page.setViewportSize(viewport);
    const [button, stem, firstGuide, nestedGuide, lastGuide, lastBranch, lastRow] = await Promise.all([
      parent.locator('.tree-toggle').boundingBox(), parent.locator('.tree-stem').boundingBox(),
      first.locator('.tree-guide').boundingBox(), grandchild.locator('.tree-guide').first().boundingBox(),
      last.locator('.tree-guide').boundingBox(), last.locator('.tree-branch').boundingBox(), last.boundingBox(),
    ]);
    expect(Math.abs(stem.x - (button.x + button.width / 2))).toBeLessThan(1);
    expect(Math.abs(stem.y - (button.y + button.height))).toBeLessThan(1);
    expect(Math.abs(stem.y + stem.height - firstGuide.y)).toBeLessThan(1);
    expect(Math.abs(firstGuide.y + firstGuide.height - nestedGuide.y)).toBeLessThan(1);
    expect(Math.abs(nestedGuide.y + nestedGuide.height - lastGuide.y)).toBeLessThan(1);
    expect(Math.abs(lastGuide.y + lastGuide.height - lastBranch.y)).toBeLessThan(1);
    expect(Math.abs(lastBranch.y - (lastRow.y + lastRow.height / 2))).toBeLessThan(1);
  }
  await page.getByRole('textbox', { name: '세션 검색' }).fill('nested-task');
  await expect(page.locator('.session-row')).toHaveCount(3);
  await expect(first.locator('.tree-guide.guide-end')).toHaveCount(1);
  await expect(grandchild.locator('.tree-guide')).toHaveCount(1);
  expect(await page.evaluate(() => window.desktopCalls.filter(c => c.action === 'open'))).toEqual([]);
});

test('a group containing only a child shows its ancestors without unrelated siblings', async ({ page }) => {
  await setup(page, { extraSessions: childSessions, initialRows: 2 });
  await page.getByRole('textbox', { name: '새 그룹 이름' }).fill('Child work');
  await page.getByRole('button', { name: '그룹 만들기' }).click();
  await page.locator('[data-session-key="claude-key"] .tree-toggle').click();
  await showDetails(page, page.locator('[data-session-key="child-aw"] .session-row'));
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
  await showDetails(page, page.locator('[data-session-key="orphan"] .session-row'));
  await expect(page.locator('.parent-link')).toHaveText('부모 대화 확인 불가');
  await page.getByRole('button', { name: '← 세션 목록' }).click();
  await page.getByRole('button', { name: '▱ t3-aw', exact: true }).click();
  await expect(page.locator('.session-row')).toHaveCount(1);
  await expect(page.locator('.session-row')).toContainText('Independent project chat');
});


test('same-root Claude and inferred Codex sessions automatically share one folder and original links', async ({ page }) => {
  const common = { environment: 'local', host: 'local', lastActivity: 1793300000000 };
  await setup(page, { extraSessions: [
    { ...common, key: 'alt-claude', member: ['claude', 'account', 'alt-claude'], provider: 'claude', id: 'alt-claude', title: 'Claude ALT task', cwd: 'D:/Projects/ALT Test' },
    { ...common, key: 'alt-codex', member: ['codex', 'local', 'alt-codex'], provider: 'codex', id: 'alt-codex', title: 'Codex ALT task', cwd: 'F:/worktrees/ALT', projectCwd: 'd:/Projects/ALT Test/', codexProject: { id: 'alt', name: 'ALT Test' }, codexAssignment: null },
    { ...common, key: 'alt-other', member: ['claude', 'account', 'alt-other'], provider: 'claude', id: 'alt-other', title: 'Different root task', cwd: 'E:/Projects/ALT Test' },
  ] });
  const project = page.locator('.path-row').filter({ hasText: 'ALT Test' });
  await expect(project).toHaveCount(2);
  await project.filter({ has: page.locator('span', { hasText: 'ALT Test' }) }).first().click();
  await expect(page.locator('.session-row')).toHaveCount(2);
  await expect(page.locator('.session-row')).toContainText(['Claude ALT task', 'Codex ALT task']);
  await page.getByRole('button', { name: '↻ 새로고침' }).click();
  await expect(page.locator('.path-row.active')).toContainText('ALT Test');
  await showDetails(page, page.locator('[data-session-key="alt-codex"] .session-row'));
  await expect(page.locator('dd').first()).toHaveText('F:/worktrees/ALT');
  await page.getByRole('button', { name: /Codex Desktop에서 열기/ }).click();
  await expect(page.getByRole('status')).toContainText('세션 열기를 요청했습니다');
  await page.getByRole('button', { name: '← 세션 목록' }).click();
  await page.locator('[data-session-key="alt-claude"] .session-row').click();
  await expect.poll(() => page.evaluate(() => window.desktopCalls.filter(c => c.action === 'open'))).toEqual([
    { action: 'open', key: 'alt-codex' }, { action: 'open', key: 'alt-claude' },
  ]);
});

test('same-root explicit groups and unassigned sessions remain separate across rename and reassignment', async ({ page }) => {
  const common = { provider: 'claude', environment: 'local', host: 'local', lastActivity: 1793300000000, cwd: 'D:/SharedRoot' };
  await setup(page, { extraSessions: [
    { ...common, key: 'shared-a', id: 'shared-a', member: ['claude', 'account', 'shared-a'], title: 'Assigned A', claudeGroup: { id: 'a', name: 'Group A' } },
    { ...common, key: 'shared-b', id: 'shared-b', member: ['claude', 'account', 'shared-b'], title: 'Assigned B', claudeGroup: { id: 'b', name: 'Group B' } },
    { ...common, key: 'shared-loose', id: 'shared-loose', member: ['claude', 'account', 'shared-loose'], title: 'Unassigned Claude' },
    { ...common, key: 'shared-inferred', id: 'shared-inferred', member: ['codex', 'local', 'shared-inferred'], provider: 'codex', title: 'Unassigned Codex', codexProject: { id: 'inferred', name: 'SharedRoot' }, codexAssignment: null },
  ] });
  for (const name of ['Group A', 'Group B']) {
    await page.locator('.claude-group-row').filter({ hasText: name }).click();
    await expect(page.locator('.session-row')).toHaveCount(1);
    await expect(page.locator('.session-row')).toContainText(name === 'Group A' ? 'Assigned A' : 'Assigned B');
  }
  await page.locator('.path-row').filter({ hasText: 'SharedRoot' }).click();
  await expect(page.locator('.session-row')).toHaveCount(2);
  await expect(page.locator('.session-row')).toContainText(['Unassigned Claude', 'Unassigned Codex']);
  await page.screenshot({ path: '../verification/desktop-unified-project-conflicts.png' });
  await page.evaluate(() => { window.desktopSessions.find(s => s.key === 'shared-a').claudeGroup.name = 'Renamed A'; window.desktopSessions.reverse(); });
  await page.getByRole('button', { name: '↻ 새로고침' }).click();
  await expect(page.locator('.session-row')).toHaveCount(2);
  await expect(page.locator('.path-row.active')).toContainText('SharedRoot');
  await page.evaluate(() => { delete window.desktopSessions.find(s => s.key === 'shared-b').claudeGroup; });
  await page.getByRole('button', { name: '↻ 새로고침' }).click();
  await expect(page.locator('.path-row').filter({ hasText: 'SharedRoot' })).toHaveCount(0);
  await expect(page.locator('.session-row')).toHaveCount(6);
  await page.locator('.claude-group-row').filter({ hasText: 'Renamed A' }).click();
  await expect(page.locator('.session-row')).toHaveCount(4);
  await page.getByRole('textbox', { name: '세션 검색' }).fill('Renamed Unassigned');
  await expect(page.locator('.session-row')).toHaveCount(2);
  await showDetails(page, page.locator('[data-session-key="shared-inferred"] .session-row'));
  await expect(page.locator('.detail-card')).toContainText('Renamed A');
  await expect(page.locator('.detail-card')).not.toContainText('Claude 그룹');
});
