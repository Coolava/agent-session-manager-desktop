<script lang="ts">
  import { onMount, tick } from 'svelte';
  import AgentIcon from './lib/components/common/AgentIcon.svelte';
  import DesktopGroupIcon from './lib/components/common/DesktopGroupIcon.svelte';
  import DesktopGroupAssignment from './lib/components/Dialogs/DesktopGroupAssignment.svelte';
  import logo from './assets/icons/asmgr.svg';
  import { buildSessionTree, sessionTreeRows, type DesktopSession as Session } from './lib/utils/desktopSessionTree';
  import { classificationSession, sourceGroup, sourceProject } from './lib/utils/desktopProjects';
  import { resolveGroups, directlyContains, type GroupSource, type UserGroup as Group, type GroupView } from './lib/utils/desktopGroups';
  import { WindowMinimise, WindowToggleMaximise, Quit } from '../wailsjs/runtime/runtime';

  type Snapshot = { sessions: Session[]; groups: Group[]; warnings: string[]; groupError: string };
  type Activity = { state: string; detail: string; observed_at: number };
  const labels: Record<string, string> = { working: '작업 중', completed: '완료', interrupted: '중단', idle: 'Idle', not_running: '미실행', unknown: '확인 불가', error: '오류', refused: '응답 거절' };
  let sessions: Session[] = [];
  let groups: Group[] = [];
  let warnings: string[] = [];
  let groupError = '';
  let error = '';
  let refreshError = '';
  let activityErrors = { claude: '', codex: '' };
  let notice = '';
  let query = '';
  let scope = 'all';
  let selectedKey = '';
  type MenuTarget = { kind: 'session'; key: string } | { kind: 'group'; source: GroupSource };
  let sessionMenu: { target: MenuTarget; x: number; y: number; trigger: HTMLButtonElement } | null = null;
  let assignment: { kind: 'session'; key: string; name: string; member: string[] } | { kind: 'group'; source: GroupSource } | null = null;
  let assignmentTrigger: HTMLElement | null = null;
  let groupRevision = 0;
  let menuElement: HTMLDivElement;
  let loading = false;
  let opening = false;
  let activityLoading = { claude: false, codex: false };
  let autoRefresh = true;
  let activities: Record<string, Activity> = {};
  let now = Date.now();
  let groupName = '';
  let groupEditName = '';
  let deletingGroup: Group | null = null;
  let targetGroup = '';
  let groupBusy = false;
  let expandedKeys = new Set<string>();
  let searchCollapsed = new Set<string>();
  let lastQuery = '';
  let lastScope = 'all';

  async function call<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
    const host = window as unknown as { go: { main: { App: { Call(request: Record<string, unknown>): Promise<T> } } } };
    return host.go.main.App.Call({ action, ...payload });
  }

  function activity(session: Session, timestamp: number): Activity {
    const observed = activities[session.key];
    if (!observed || timestamp / 1000 - observed.observed_at > 15) return { state: 'unknown', detail: '아직 상태를 확인하지 않았거나 마지막 관찰이 15초 이상 지연되었습니다.', observed_at: 0 };
    return observed;
  }

  async function refreshActivities(provider: 'claude' | 'codex') {
    if (activityLoading[provider]) return;
    activityLoading = { ...activityLoading, [provider]: true };
    try {
      const result = await call<Record<string, Activity>>(provider === 'codex' ? 'codex-activities' : 'activities');
      activities = { ...activities, ...result };
      activityErrors = { ...activityErrors, [provider]: '' };
    } catch (failure) { activityErrors = { ...activityErrors, [provider]: `${provider === 'codex' ? 'Codex' : 'Claude'} 상태 조회 실패: ${String(failure)}` }; }
    finally { activityLoading = { ...activityLoading, [provider]: false }; }
  }

  async function refresh() {
    if (loading) return;
    loading = true;
    const revision = groupRevision;
    try {
      const data = await call<Snapshot>('snapshot');
      sessions = data.sessions; if (revision === groupRevision && !groupBusy) { if (!data.groupError) groups = data.groups; groupError = data.groupError; } warnings = data.warnings;
      if (selectedKey && !sessions.some(s => s.key === selectedKey)) selectedKey = '';
      const menuTarget = sessionMenu?.target;
      if (menuTarget?.kind === 'session' && !sessions.some(s => s.key === menuTarget.key)) closeSessionMenu();
      if (scope.startsWith('group:') && !groups.some(g => `group:${g.id}` === scope)) scope = 'all';
      if (!groups.some(g => g.id === targetGroup)) targetGroup = groups[0]?.id ?? '';
      refreshError = '';
      void refreshActivities('claude');
      void refreshActivities('codex');
    } catch (failure) { refreshError = `목록 조회 실패: ${String(failure)}`; }
    finally { loading = false; }
  }

  async function openSession(session: Session) {
    closeSessionMenu();
    if (opening) return;
    opening = true; error = ''; notice = '';
    try {
      await call('open', { key: session.key });
      notice = `${session.provider === 'codex' ? 'Codex' : 'Claude'} Desktop에 세션 열기를 요청했습니다.`;
    } catch (failure) { error = String(failure); }
    finally { opening = false; }
  }

  function closeSessionMenu(restoreFocus = false) {
    const trigger = sessionMenu?.trigger;
    sessionMenu = null;
    if (restoreFocus) trigger?.focus();
  }

  async function showSessionMenu(event: MouseEvent | KeyboardEvent, target: MenuTarget) {
    event.preventDefault();
    const trigger = event.currentTarget as HTMLButtonElement;
    const rect = trigger.getBoundingClientRect();
    const x = event instanceof MouseEvent ? event.clientX : rect.left;
    const y = event instanceof MouseEvent ? event.clientY : rect.bottom;
    const menu = { target, x, y, trigger };
    sessionMenu = menu;
    await tick();
    if (sessionMenu !== menu) return;
    const bounds = menuElement.getBoundingClientRect();
    sessionMenu = { ...menu, x: Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8)), y: Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8)) };
    menuElement.querySelector('button')?.focus();
  }

  function showSessionDetails() {
    if (sessionMenu?.target.kind === 'session') selectedKey = sessionMenu.target.key;
    closeSessionMenu();
  }

  function menuKeydown(event: KeyboardEvent) {
    if (!sessionMenu) return;
    if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape') event.preventDefault();
      closeSessionMenu(true);
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const buttons = [...menuElement.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }
  }

  async function showAssignment(target: MenuTarget, trigger?: HTMLElement) {
    assignmentTrigger = trigger || sessionMenu?.trigger || document.activeElement as HTMLElement;
    if (target.kind === 'session') {
      const session = sessions.find(session => session.key === target.key);
      if (!session) return;
      assignment = { kind: 'session', key: session.key, name: session.title, member: session.member };
    } else assignment = target;
    closeSessionMenu();
    await tick();
  }

  async function closeAssignment() {
    assignment = null;
    await tick();
    if (assignmentTrigger?.isConnected) assignmentTrigger.focus();
    else document.querySelector<HTMLButtonElement>('aside .nav-row.active, aside .nav-row')?.focus();
  }

  function updateGroups(updated: Group[]) { groupRevision += 1; groups = updated; }

  function chooseGroup(group: GroupView) {
    scope = group.id; selectedKey = '';
    if (!group.automatic) groupEditName = group.name;
  }

  function linkedName(source: GroupSource) { return source.kind === 'user' ? groups.find(group => group.id === source.id)?.name || source.name : source.name; }

  function assignmentProblem(target: typeof assignment, currentSessions: Session[], currentGroups: Group[], failure: string) {
    if (failure) return '그룹 파일을 읽지 못했습니다. 새로고침 후 다시 시도하세요.';
    if (target?.kind === 'session' && !currentSessions.some(session => session.key === target.key)) return '해당 세션이 사라졌습니다. 목록을 새로고침하고 다시 선택하세요.';
    if (target?.kind === 'group' && target.source.kind === 'user') {
      const id = target.source.id;
      if (!currentGroups.some(group => group.id === id)) return '해당 사용자 그룹이 삭제되었습니다. 다시 선택하세요.';
    }
    return '';
  }

  async function groupAction(action: string, payload: Record<string, unknown>) {
    if (groupBusy) return;
    groupBusy = true; error = '';
    try {
      const result = await call<Group | Group[]>(action, payload);
      if (action === 'create-group') { targetGroup = (result as Group).id; groupName = ''; updateGroups([...groups, result as Group]); }
      else updateGroups(result as Group[]);
      await refresh();
    } catch (failure) { error = String(failure); }
    finally { groupBusy = false; }
  }

  function folder(path: string) { return path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path || '작업 폴더 없음'; }
  function date(value: number) { return value ? new Date(value).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '기록 없음'; }
  function toggleChildren(key: string, automatic: boolean) {
    const target = new Set(automatic ? searchCollapsed : expandedKeys);
    if (target.has(key)) target.delete(key); else target.add(key);
    if (automatic) searchCollapsed = target; else expandedKeys = target;
  }

  $: tree = buildSessionTree(sessions);
  $: groupResolution = resolveGroups(tree, groups, !groupError);
  $: selected = sessions.find(s => s.key === selectedKey);
  $: selectedProject = selected && groupResolution.automatic.find(group => group.keys.has(selected.key));
  $: selectedSourceGroup = selected && sourceGroup(classificationSession(selected, tree));
  $: selectedSourceProject = selected && sourceProject(classificationSession(selected, tree));
  $: selectedNode = tree.byKey.get(selectedKey);
  $: selectedGroup = groups.find(g => `group:${g.id}` === scope);
  $: projectNames = new Map(sessions.map(session => [session.key, groupResolution.views.filter(group => group.keys.has(session.key)).map(group => group.name).join(' ')] as const));
  $: if ((scope.startsWith('path:') || scope.startsWith('group:')) && !groupResolution.views.some(group => group.id === scope)) scope = 'all';
  $: activeGroup = groupResolution.views.find(group => group.id === scope);
  $: assignmentUnavailable = assignmentProblem(assignment, sessions, groups, groupError);
  $: assignmentSession = assignment?.kind === 'session' ? tree.byKey.get(assignment.key)?.session : undefined;
  $: inheritedGroups = assignmentSession ? groups.filter(group => groupResolution.userKeys.get(group.id)?.has(assignmentSession.key) && !directlyContains(group, assignmentSession)).map(group => group.name) : [];
  $: scopedKeys = new Set(sessions.filter(session => {
    if (scope === 'claude' || scope === 'codex') { if (session.provider !== scope) return false; }
    if (activeGroup && !activeGroup.keys.has(session.key)) return false;
    return true;
  }).map(session => session.key));
  $: if (query !== lastQuery || scope !== lastScope) { lastQuery = query; lastScope = scope; searchCollapsed = new Set(); }
  $: rows = sessionTreeRows(tree, scopedKeys, query, expandedKeys, searchCollapsed, projectNames);

  onMount(() => {
    void refresh();
    const timer = setInterval(() => { now = Date.now(); }, 1000);
    const refreshTimer = setInterval(() => { if (autoRefresh) void refresh(); }, 5000);
    return () => { clearInterval(timer); clearInterval(refreshTimer); };
  });
</script>

<svelte:window
  on:pointerdown={event => { if (!(event.target instanceof Element) || !event.target.closest('.session-menu')) closeSessionMenu(); }}
  on:keydown={menuKeydown}
  on:scroll|capture={() => closeSessionMenu()}
  on:resize={() => closeSessionMenu()}
  on:blur={() => closeSessionMenu()}
/>

<div class="desktop-app">
  <header style="--wails-draggable:drag">
    <div class="brand"><img src={logo} alt="Agent Session Manager" /><div><strong>Agent Session Manager</strong><span>DESKTOP SESSIONS</span></div></div>
    <div class="header-tools" style="--wails-draggable:no-drag">
      <label class="search"><span>⌕</span><input aria-label="세션 검색" bind:value={query} placeholder="세션, 폴더, 호스트 검색…" /></label>
      <label class="auto-refresh"><input type="checkbox" bind:checked={autoRefresh} /> 자동 갱신 · 5초</label>
      <button class="refresh" on:click={refresh} disabled={loading}>{loading ? '조회 중…' : '↻ 새로고침'}</button>
      <button class="window-button" aria-label="최소화" on:click={WindowMinimise}>—</button>
      <button class="window-button" aria-label="최대화" on:click={WindowToggleMaximise}>□</button>
      <button class="window-button close" aria-label="닫기" on:click={Quit}>×</button>
    </div>
  </header>

  <div class="workspace">
    <aside>
      <div class="sidebar-label">WORKSPACE</div>
      {#each [['all', '전체 세션'], ['claude', 'Claude Desktop'], ['codex', 'Codex Desktop']] as [id, name]}
        <button class="nav-row" class:active={scope === id} on:click={() => { scope = id; selectedKey = ''; }}>
          {#if id === 'all'}<span class="grid-icon">▦</span>{:else}<AgentIcon agent={id} size="sm" />{/if}
          <span>{name}</span><small>{id === 'all' ? sessions.length : sessions.filter(s => s.provider === id).length}</small>
        </button>
      {/each}
      {#each [{ name: 'My Groups', automatic: false }, { name: 'Groups', automatic: true }] as section (section.name)}
        {@const sectionGroups = groupResolution.views.filter(group => group.automatic === section.automatic)}
        <section aria-label={section.name}>
          <div class="sidebar-label spaced">{section.name} <span>{sectionGroups.length}</span></div>
          <div class="groups-list">
            {#each sectionGroups as group (group.id)}
              <button class="nav-row group-row" class:active={scope === group.id} data-group-id={group.id} data-group-kind={group.automatic ? 'automatic' : 'user'}
                title={`${group.name} · ${group.hint}`} on:click={() => chooseGroup(group)}
                on:contextmenu={event => showSessionMenu(event, { kind: 'group', source: group.source })}
                on:keydown={event => { if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) void showSessionMenu(event, { kind: 'group', source: group.source }); }} aria-haspopup="menu">
                <DesktopGroupIcon providers={group.providers} /><span><span class="group-name">{group.name}</span>{#if groupResolution.views.some(other => other.id !== group.id && other.name === group.name)}<small class="project-root-hint">{group.hint}</small>{/if}</span><small class="group-count">{group.keys.size}</small>
              </button>
            {/each}
          </div>
          {#if !section.automatic}
            <form class="new-group" on:submit|preventDefault={() => groupAction('create-group', { name: groupName })}>
              <input aria-label="새 그룹 이름" bind:value={groupName} maxlength="100" placeholder="새 그룹 이름" disabled={!!groupError} />
              <button aria-label="그룹 만들기" disabled={!groupName.trim() || groupBusy || !!groupError}>＋</button>
            </form>
          {/if}
        </section>
      {/each}
      <div class="sidebar-footer"><span class="connection-dot"></span> Local desktop connections</div>
    </aside>

    <main>
      {#if error}<div role="alert" class="banner error">{error}</div>{/if}
      {#if refreshError}<div role="alert" class="banner error">{refreshError}</div>{/if}
      {#each Object.values(activityErrors).filter(Boolean) as activityError}<div role="alert" class="banner error">{activityError}</div>{/each}
      {#if groupError}<div role="alert" class="banner error">그룹 파일을 읽지 못했습니다. {groupError}</div>{/if}
      {#if warnings.length}<details class="banner warning"><summary>조회 알림 {warnings.length}개</summary>{#each warnings as warning}<p>{warning}</p>{/each}</details>{/if}
      {#if notice}<div role="status" class="banner success">{notice}</div>{/if}
      {#if selectedGroup && !selected}
        <h2 class="selected-group-name">{selectedGroup.name}</h2>
        <form class="group-tools" on:submit|preventDefault={() => groupAction('rename-group', { id: selectedGroup.id, name: groupEditName })}>
          <input aria-label="그룹 이름 변경" bind:value={groupEditName} maxlength="100" disabled={groupBusy || !!groupError} />
          <button disabled={groupBusy || !!groupError || !groupEditName.trim()}>이름 변경</button>
          <button type="button" disabled={groupBusy || !!groupError} on:click={() => deletingGroup = selectedGroup}>그룹 삭제</button>
        </form>
        {#if selectedGroup.links?.length}
          <section class="linked-groups" aria-label="연결된 그룹"><h3>연결된 그룹</h3><p>연결된 그룹에 추가되는 세션도 함께 분류됩니다.</p>
            {#each selectedGroup.links as source}
              <button disabled={groupBusy || !!groupError} on:click={event => showAssignment({ kind: 'group', source }, event.currentTarget)}>{linkedName(source)} <span>연결 변경…</span></button>
            {/each}
          </section>
        {/if}
      {/if}
      {#if deletingGroup}
        {@const groupToDelete = deletingGroup}
        <div class="banner warning" role="alert">‘{groupToDelete.name}’ 그룹을 삭제할까요? 대화는 보존됩니다.
          <button disabled={groupBusy} on:click={() => { void groupAction('delete-group', { id: groupToDelete.id }); deletingGroup = null; }}>삭제 확인</button>
          <button on:click={() => deletingGroup = null}>취소</button>
        </div>
      {/if}

      {#if selected}
        {@const state = activity(selected, now)}
        <button class="back" on:click={() => selectedKey = ''}>← 세션 목록</button>
        <section class="detail-card">
          <div class="detail-heading"><AgentIcon agent={selected.provider} size="lg" /><span class="provider">{selected.provider === 'codex' ? 'Codex' : 'Claude'} Desktop</span><span class="badge {state.state}">{labels[state.state]}</span></div>
          <h2>{selected.title}</h2>
          {#if selectedNode?.parent}
            <div class="parent-link">상위 대화 <button on:click={() => selectedKey = selectedNode!.parent!.session.key}>{selectedNode.parent.session.title}</button></div>
          {:else if selectedNode?.parentUnavailable}
            <div class="parent-link">부모 대화 확인 불가</div>
          {/if}
          <dl><dt>작업 폴더</dt><dd>{selected.cwd || '기록 없음'}</dd><dt>환경</dt><dd>{selected.environment === 'ssh' ? `SSH · ${selected.host}` : '로컬'}</dd><dt>최근 활동</dt><dd>{date(selected.lastActivity)}</dd><dt>세션 ID</dt><dd class="mono">{selected.id}</dd>{#if selectedSourceGroup}<dt>Claude 그룹</dt><dd>{selectedSourceGroup.name}</dd>{/if}{#if selectedSourceProject}<dt>Codex 프로젝트</dt><dd>{selectedSourceProject.name}</dd>{/if}{#if selectedProject}<dt>통합 프로젝트</dt><dd>{selectedProject.name}</dd>{/if}<dt>상태 근거</dt><dd>{state.detail}</dd></dl>
          <button class="primary open-button" on:click={() => openSession(selected)} disabled={opening}>{opening ? '세션을 여는 중…' : `${selected.provider === 'codex' ? 'Codex' : 'Claude'} Desktop에서 열기`} <span>↗</span></button>
          <div class="group-assignment"><label for="target-group">그룹</label><select id="target-group" bind:value={targetGroup} disabled={!!groupError || groups.length === 0}><option value="" disabled>그룹 선택</option>{#each groups as group}<option value={group.id}>{group.name}</option>{/each}</select><button disabled={!targetGroup || groupBusy || !!groupError} on:click={() => groupAction('add-member', { id: targetGroup, key: selected.key })}>그룹에 추가</button><button disabled={groupBusy || !!groupError} on:click={event => showAssignment({ kind: 'session', key: selected.key }, event.currentTarget)}>그룹 할당…</button></div>
          <div class="membership">{#each groups.filter(g => directlyContains(g, selected)) as group}<button title="이 그룹에서 제외" disabled={groupBusy || !!groupError} on:click={() => groupAction('remove-member', { id: group.id, key: selected.key })}>{group.name} ×</button>{/each}</div>
        </section>
      {:else}
        <section class="session-panel">
          <div class="panel-heading"><h2>Sessions</h2><span>최근 활동 순</span></div>
          {#if loading && !sessions.length}<div class="empty">Desktop 세션을 가져오는 중입니다…</div>
          {:else if !rows.length}<div class="empty">표시할 세션이 없습니다.{#if query}<button on:click={() => query = ''}>검색 지우기</button>{/if}</div>
          {:else}
            <div class="table-heading"><span>세션</span><span>작업 폴더</span><span>상태</span><span>최근 활동</span></div>
            {#each rows as row (row.node.session.key)}
              {@const session = row.node.session}
              {@const state = activity(session, now)}
              {@const workingChildren = row.descendants.filter(child => activity(child, now).state === 'working').length}
              <div class="session-entry" class:child-entry={row.depth > 0} class:branch-entry={row.descendants.length > 0} class:expanded-entry={row.expanded} class:context-entry={!scopedKeys.has(session.key)} data-session-key={session.key} style={`--tree-indent:${Math.min(row.depth, 4) * 28}px`}>
                <span class="tree-lines" aria-hidden="true">
                  {#each row.continuations.slice(0, 4) as continues, level}
                    {#if continues || level === row.depth - 1}
                      <span class="tree-guide" class:guide-end={!continues && level === row.depth - 1} style={`left:${36 + level * 28}px`}></span>
                    {/if}
                  {/each}
                  {#if row.depth > 0 && row.depth <= 4}<span class="tree-branch"></span>{/if}
                  {#if row.expanded && row.depth < 4}<span class="tree-stem"></span>{/if}
                </span>
                {#if row.descendants.length}
                  <button class="tree-toggle" aria-label={`${row.expanded ? '하위 세션 접기' : '하위 세션 펼치기'}: ${session.title}`} aria-expanded={row.expanded} on:click={() => toggleChildren(session.key, row.automatic)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg></button>
                {/if}
                <button class="session-row" on:click={event => { if (event.detail < 2) void openSession(session); }} on:contextmenu={event => showSessionMenu(event, { kind: 'session', key: session.key })} on:keydown={event => { if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) void showSessionMenu(event, { kind: 'session', key: session.key }); }} aria-haspopup="menu" disabled={opening} title={session.title}>
                  <span class="session-title"><AgentIcon agent={session.provider} size="md" /><span><strong>{session.childName || session.title}</strong><small>{session.environment === 'ssh' ? `SSH · ${session.host}` : `${session.provider === 'codex' ? 'Codex' : 'Claude'} · 로컬`}{#if session.parentKey}{' · 하위 세션'}{/if}{#if row.node.parentUnavailable}<span class="missing-parent">{' · 부모 대화 확인 불가'}</span>{/if}{#if !scopedKeys.has(session.key)}<span class="context-label">{' · 문맥 표시'}</span>{/if}</small>{#if row.descendants.length}<small class="hierarchy-summary" title="현재 필터에 포함된 하위 세션">하위 {row.descendants.length}개{#if workingChildren}<span class="descendant-working">{' · '}{workingChildren}개 작업 중</span>{/if}</small>{/if}</span></span>
                  <span class="session-path" title={session.cwd}>{folder(session.cwd)}<small>{session.cwd}</small></span>
                  <span class="badge {state.state}">{labels[state.state]}</span><time>{date(session.lastActivity)}</time>
                </button>
              </div>
            {/each}
          {/if}
        </section>
      {/if}
      <footer>{activityLoading.claude || activityLoading.codex ? '실행 상태 확인 중…' : '완료 상태는 최근 응답의 정상 종료를 뜻합니다.'}<span>대화는 각 Desktop 앱에서 실행됩니다.</span></footer>
    </main>
  </div>
  {#if sessionMenu}
    <div class="session-menu" role="menu" aria-label={sessionMenu.target.kind === 'session' ? '세션 메뉴' : '그룹 메뉴'} tabindex="-1" bind:this={menuElement} style={`left:${sessionMenu.x}px;top:${sessionMenu.y}px`}>
      {#if sessionMenu.target.kind === 'session'}<button role="menuitem" on:click={showSessionDetails}>세션 상세</button>{/if}
      <button role="menuitem" disabled={groupBusy || !!groupError} on:click={() => { if (sessionMenu) void showAssignment(sessionMenu.target); }}>그룹 할당…</button>
    </div>
  {/if}
  {#if assignment}
    <DesktopGroupAssignment target={assignment} {groups} {call} {inheritedGroups} unavailable={assignmentUnavailable}
      on:updated={event => updateGroups(event.detail)} on:busy={event => groupBusy = event.detail} on:close={closeAssignment} />
  {/if}
</div>

<style>
  .desktop-app { height:100vh; display:flex; flex-direction:column; background:linear-gradient(135deg,var(--bg-surface),var(--bg-sunken),var(--bg-surface)); color:#e4e4e7; font-size:13px; }
  .session-menu { position:fixed; z-index:100; width:180px; padding:6px; border:1px solid #ffffff20; border-radius:8px; background:var(--bg-raised); box-shadow:0 8px 24px #0008; } .session-menu button { display:block; width:100%; border:0; border-radius:4px; padding:10px 12px; background:none; text-align:left; } .session-menu button:hover,.session-menu button:focus-visible { background:rgba(var(--accent-rgb),.15); outline:none; }
  header { height:66px; flex-shrink:0; display:flex; align-items:center; justify-content:space-between; padding:0 12px 0 22px; border-bottom:1px solid rgba(var(--accent-rgb),.16); background:var(--bg-base); }
  .brand { display:flex; align-items:center; gap:12px; } .brand img { width:34px; height:34px; } .brand strong { display:block; font-size:14px; } .brand span { display:block; font-size:9px; color:var(--accent-light); letter-spacing:2px; margin-top:5px; }
  .header-tools { display:flex; align-items:center; gap:8px; } button,input { font:inherit; } button { cursor:pointer; color:inherit; } button:disabled { cursor:default; opacity:.5; }
  .search { width:280px; display:flex; align-items:center; gap:9px; padding:9px 12px; background:var(--bg-surface); border:1px solid #ffffff15; border-radius:8px; color:#71717a; } input { min-width:0; color:#e4e4e7; } .search input { width:100%; background:none; border:0; outline:0; }
  .refresh,.group-assignment button { border:1px solid #ffffff18; border-radius:7px; padding:8px 13px; background:#ffffff06; } .window-button { border:0; background:none; width:32px; height:32px; font-size:17px; color:#a1a1aa; } .window-button:hover { background:#ffffff10; border-radius:6px; } .window-button.close:hover { background:#ef4444; color:white; }
  .workspace { flex:1; min-height:0; display:flex; } aside { width:272px; flex-shrink:0; display:flex; flex-direction:column; padding:22px 12px 12px; border-right:1px solid rgba(var(--accent-rgb),.12); background:var(--bg-surface); overflow-y:auto; }
  .sidebar-label { display:flex; justify-content:space-between; color:#71717a; font-size:10px; letter-spacing:1.3px; font-weight:650; padding:0 12px 12px; } .spaced { margin-top:26px; } .sidebar-label span { color:#52525b; }
  .nav-row { display:flex; align-items:center; gap:11px; width:100%; padding:11px 12px; text-align:left; border:1px solid transparent; border-radius:8px; background:none; margin-bottom:3px; } .nav-row:hover { background:#ffffff05; } .nav-row.active { background:rgba(var(--accent-rgb),.12); color:var(--accent-lighter); border-color:rgba(var(--accent-rgb),.22); } .nav-row > span:nth-child(2) { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } .nav-row small { color:#71717a; font-size:11px; } .grid-icon { width:16px; color:var(--accent-light); font-size:17px; }
  .new-group { display:flex; margin:8px 8px 0; gap:4px; } .new-group input { width:100%; border:1px solid #ffffff10; border-radius:6px; background:var(--bg-sunken); padding:8px; font-size:11px; } .new-group button { background:rgba(var(--accent-rgb),.12); border:0; border-radius:6px; color:var(--accent-light); width:30px; flex-shrink:0; } summary { cursor:pointer; } .sidebar-footer { margin-top:auto; padding:16px 10px 4px; border-top:1px solid #ffffff0a; color:#71717a; font-size:10px; display:flex; align-items:center; gap:7px; } .connection-dot { width:5px; height:5px; border-radius:50%; background:#34d399; }
  .selected-group-name { margin:0 0 14px; font-size:18px; line-height:1.5; overflow-wrap:anywhere; }
  .group-tools { display:flex; gap:8px; margin-bottom:18px; } .group-tools input { flex:1; min-width:0; background:var(--bg-raised); border:1px solid #ffffff18; padding:8px 12px; border-radius:7px; } .group-tools button,.warning button { background:#ffffff06; border:1px solid #ffffff18; padding:8px 12px; border-radius:7px; } .warning button { margin:8px 0 0 8px; }
  main { flex:1; min-width:0; overflow-y:auto; padding:32px 34px 16px; } .auto-refresh { display:flex; align-items:center; gap:8px; color:#a1a1aa; font-size:11px; white-space:nowrap; } input[type=checkbox] { accent-color:var(--accent); }
  .session-panel { border:1px solid #ffffff0c; border-radius:12px; overflow:hidden; background:rgba(var(--bg-base-rgb),.42); } .panel-heading { display:flex; justify-content:space-between; align-items:center; padding:18px 20px; border-bottom:1px solid #ffffff0a; } .panel-heading h2 { font-size:13px; font-weight:600; } .panel-heading > span { font-size:10px; color:#71717a; }
  .nav-row .project-root-hint { display:block; overflow:hidden; text-overflow:ellipsis; font-size:10px; margin-top:5px; }
  .group-name { display:block; overflow:hidden; text-overflow:ellipsis; } .group-count { margin-left:auto; flex-shrink:0; } .group-row :global(.agent-icon) { flex-shrink:0; }
  .new-group { margin-bottom:20px; } .group-tools { flex-wrap:wrap; } .linked-groups { margin-bottom:20px; border:1px solid #ffffff12; padding:16px; border-radius:8px; } .linked-groups h3 { font-size:12px; margin:0; } .linked-groups p { font-size:11px; color:#a1a1aa; margin:8px 0 12px; } .linked-groups button { background:#ffffff06; border:1px solid #ffffff18; padding:8px 12px; border-radius:6px; margin:0 8px 8px 0; max-width:100%; overflow-wrap:anywhere; text-align:left; } .linked-groups button span { color:var(--accent-light); font-size:11px; margin-left:8px; }
  .table-heading,.session-row { display:grid; grid-template-columns:minmax(210px,1.5fr) minmax(130px,1fr) 85px 115px; gap:18px; align-items:center; } .table-heading { padding:12px 20px; color:#52525b; font-size:10px; background:#ffffff02; } .session-row { width:100%; background:none; border:0; border-top:1px solid #ffffff06; text-align:left; padding:16px 20px; } .session-row:hover { background:rgba(var(--accent-rgb),.07); } .session-title { min-width:0; display:flex; align-items:center; gap:12px; } .session-title > span { min-width:0; } .session-title strong { display:block; font-size:12px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; } .session-title small,.session-path small { display:block; color:#52525b; font-size:10px; margin-top:6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; } .session-path { min-width:0; color:#a1a1aa; font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } time { font-size:10px; color:#71717a; }
  .badge { display:inline-flex; justify-content:center; width:fit-content; gap:5px; font-size:10px; padding:4px 8px; border-radius:5px; background:#ffffff06; color:#71717a; white-space:nowrap; } .badge.working { background:#8b5cf61a; color:#c4b5fd; } .badge.completed { background:#10b98118; color:#34d399; } .badge.interrupted { background:#f59e0b18; color:#fbbf24; } .badge.idle { color:#a1a1aa; } .badge.error,.badge.refused { color:#fca5a5; background:#ef444418; }
  .session-entry { position:relative; } .session-entry .session-title { padding-left:calc(44px + var(--tree-indent)); } .tree-toggle { position:absolute; z-index:1; left:calc(20px + var(--tree-indent)); top:50%; transform:translateY(-50%); display:flex; align-items:center; justify-content:center; width:32px; height:32px; padding:0; border:1px solid rgba(var(--accent-rgb),.45); border-radius:7px; color:var(--accent-lighter); background:rgba(var(--accent-rgb),.16); } .tree-toggle:hover { background:rgba(var(--accent-rgb),.3); border-color:var(--accent-light); } .tree-toggle:focus-visible { outline:2px solid var(--accent-light); outline-offset:2px; } .tree-toggle[aria-expanded=true] svg { transform:rotate(90deg); } .session-title .hierarchy-summary { color:#a1a1aa; } .session-title .descendant-working { color:#c4b5fd; } .missing-parent { color:#fbbf24; } .session-title .context-label { color:#a1a1aa; } .parent-link { margin-top:14px; color:#a1a1aa; font-size:12px; } .parent-link button { border:0; background:none; color:var(--accent-light); text-align:left; }
  .expanded-entry { background:rgba(var(--accent-rgb),.1); }
  .expanded-entry .session-title strong { font-weight:600; }
  .child-entry { background:rgba(var(--accent-rgb),.055); box-shadow:inset 3px 0 rgba(var(--accent-rgb),.35); }
  .tree-lines { position:absolute; inset:0; pointer-events:none; }
  .tree-guide,.tree-stem { position:absolute; top:0; bottom:0; border-left:1px solid rgba(var(--accent-rgb),.4); }
  .tree-guide.guide-end { bottom:50%; }
  .tree-branch { position:absolute; left:calc(8px + var(--tree-indent)); top:50%; width:12px; border-top:1px solid rgba(var(--accent-rgb),.4); }
  .child-entry:not(.branch-entry) .tree-branch { width:48px; }
  .tree-stem { left:calc(36px + var(--tree-indent)); top:calc(50% + 16px); }
  .child-entry .session-title small { color:#8b879d; }
  .child-entry .session-title .hierarchy-summary { color:var(--accent-lighter); }
  .child-entry + .session-entry:not(.child-entry) { margin-top:8px; border-top:1px solid rgba(var(--accent-rgb),.2); }
  .banner { padding:12px 16px; border-radius:8px; margin-bottom:18px; font-size:12px; white-space:pre-wrap; overflow-wrap:anywhere; } .banner.error { background:#ef444413; border:1px solid #ef44442c; color:#fca5a5; } .banner.success { background:#10b98112; border:1px solid #10b98125; color:#6ee7b7; } .banner.warning { color:#fbbf24; background:#f59e0b0c; border:1px solid #f59e0b20; } .warning p { margin-top:8px; font-size:11px; }
  .back { border:0; background:none; color:#a1a1aa; font-size:12px; padding:0 0 18px; } .detail-card { padding:28px; border:1px solid rgba(var(--accent-rgb),.18); border-radius:12px; background:linear-gradient(145deg,var(--bg-base),var(--bg-sunken)); } .detail-heading { display:flex; align-items:center; gap:12px; margin-bottom:18px; } .provider { color:#a1a1aa; font-size:12px; } .detail-heading .badge { margin-left:auto; } .detail-card h2 { font-size:22px; line-height:1.5; overflow-wrap:anywhere; white-space:pre-wrap; } dl { display:grid; grid-template-columns:100px 1fr; row-gap:20px; margin-top:28px; } dt { color:#71717a; font-size:11px; } dd { color:#d4d4d8; font-size:12px; overflow-wrap:anywhere; } .mono { font-family:monospace; color:#a1a1aa; } .primary { border:1px solid rgba(var(--accent-rgb),.6); border-radius:8px; background:var(--accent); color:var(--accent-ink); padding:12px 18px; } .open-button { margin-top:28px; display:flex; align-items:center; gap:28px; } .open-button span { font-size:18px; } .group-assignment { display:flex; align-items:center; gap:12px; border-top:1px solid #ffffff0a; padding-top:24px; margin-top:28px; } .group-assignment label { color:#71717a; } .group-assignment select { min-width:160px; font:inherit; } .membership { display:flex; flex-wrap:wrap; gap:8px; margin-top:16px; } .membership button { border:1px solid rgba(var(--accent-rgb),.2); background:rgba(var(--accent-rgb),.1); color:var(--accent-lighter); font-size:11px; padding:5px 9px; border-radius:5px; }
  .empty { padding:60px 20px; text-align:center; color:#71717a; } .empty button { display:block; margin:16px auto 0; background:none; border:0; color:var(--accent-light); } footer { display:flex; justify-content:space-between; gap:16px; color:#52525b; font-size:10px; padding:18px 2px; }
  @media(max-width:1100px) { aside { width:230px; } main { padding:24px; } .search { width:200px; } .table-heading,.session-row { grid-template-columns:minmax(180px,1.4fr) minmax(100px,1fr) 78px; gap:12px; } .table-heading > span:last-child,.session-row time { display:none; } .brand strong { font-size:12px; } }
</style>
