import { test, expect } from '@playwright/test';

async function setup(page) {
  await page.addInitScript(() => {
    const sessions = [
      { key: 'claude-key', member: ['claude', 'account', 'claude-id'], provider: 'claude', id: 'claude-id', title: 'Workflow validation', cwd: 'D:/Projects/Inspector', environment: 'ssh', host: 'build-host', lastActivity: 1793300000000 },
      { key: 'codex-key', member: ['codex', 'local', 'codex-id'], provider: 'codex', id: 'codex-id', title: 'Session manager UI', cwd: 'D:/Projects/SessionManager', environment: 'local', host: 'local', lastActivity: 1793290000000 },
    ];
    const groups = [];
    window.desktopCalls = [];
    window.go = { main: { App: { Call: async request => {
      window.desktopCalls.push(request);
      if (request.action === 'snapshot') return { sessions, groups, warnings: [], groupError: window.groupFailure ? 'Broken groups' : '' };
      if (request.action === 'activities') return { 'claude-key': { state: 'completed', detail: 'Main response completed', observed_at: Date.now() / 1000 } };
      if (request.action === 'open') { await new Promise(resolve => setTimeout(resolve, 300)); if (window.openFailure) throw new Error('Desktop link failed'); return { requested: true }; }
      if (request.action === 'create-group') { const group = { id: 'group-1', name: request.name, members: [] }; groups.push(group); return group; }
      if (request.action === 'add-member') groups[0].members.push(sessions.find(s => s.key === request.key).member);
      if (request.action === 'rename-group') groups[0].name = request.name;
      if (request.action === 'delete-group') groups.splice(0, groups.length);
      return groups;
    } } } };
  });
  await page.goto('/desktop.html');
  await expect(page.locator('.session-row')).toHaveCount(2);
}

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
  await expect(page.getByRole('heading', { name: 'Release ready' })).toBeVisible();
  await page.getByRole('button', { name: '그룹 삭제', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('대화는 보존됩니다');
  await page.getByRole('button', { name: '삭제 확인' }).click();
  await expect(page.locator('.session-row')).toHaveCount(2);
});

test('Desktop dashboard fits the minimum window size', async ({ page }) => {
  await setup(page);
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
  await page.screenshot({ path: '../verification/desktop-ui-preview.png' });
});
