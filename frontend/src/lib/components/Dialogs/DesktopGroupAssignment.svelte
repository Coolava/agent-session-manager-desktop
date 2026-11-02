<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { canAssignGroup, linkTargets, type GroupSource, type UserGroup } from '../../utils/desktopGroups';

  export let target: { kind: 'session'; key: string; name: string; member: string[] } | { kind: 'group'; source: GroupSource };
  export let groups: UserGroup[];
  export let unavailable = '';
  export let inheritedGroups: string[] = [];
  export let call: <T>(action: string, payload: Record<string, unknown>) => Promise<T>;
  const dispatch = createEventDispatcher<{ updated: UserGroup[]; busy: boolean; close: void }>();
  let dialog: HTMLDialogElement;
  let busy = false;
  let error = '';
  let name = '';
  const selectedMember = target.kind === 'session' ? JSON.stringify(target.member) : '';
  let choices = new Set(target.kind === 'session'
    ? groups.filter(group => group.members.some(member => JSON.stringify(member) === selectedMember)).map(group => group.id)
    : linkTargets(target.source, groups));
  $: missingChoices = [...choices].some(id => !groups.some(group => group.id === id));

  function close() { if (!busy) dispatch('close'); }
  function trapTab(event: KeyboardEvent) {
    if (event.key !== 'Tab') return;
    const controls = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)')];
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  function setBusy(value: boolean) { busy = value; dispatch('busy', value); }
  function toggle(id: string, checked: boolean) {
    const next = new Set(choices);
    if (checked) next.add(id); else next.delete(id);
    choices = next;
  }
  async function create() {
    if (busy || unavailable || !name.trim()) return;
    setBusy(true); error = '';
    try {
      const group = await call<UserGroup>('create-group', { name });
      dispatch('updated', [...groups, group]);
      choices = new Set([...choices, group.id]);
      name = '';
    } catch (failure) { error = String(failure); }
    finally { setBusy(false); }
  }
  async function apply() {
    if (busy || unavailable || missingChoices) return;
    setBusy(true); error = '';
    try {
      const payload = target.kind === 'session' ? { key: target.key, targets: [...choices] } : { source: target.source, targets: [...choices] };
      const result = await call<UserGroup[]>(target.kind === 'session' ? 'assign-session' : 'assign-group', payload);
      dispatch('updated', result);
      dispatch('close');
    } catch (failure) { error = String(failure); }
    finally { setBusy(false); }
  }
  onMount(() => {
    dialog.showModal();
    (dialog.querySelector<HTMLElement>('input:not(:disabled)') || dialog.querySelector<HTMLElement>('button:not(:disabled)'))?.focus();
  });
</script>

<dialog bind:this={dialog} class="assignment-dialog" aria-labelledby="assignment-title" aria-describedby="assignment-description"
  on:keydown={trapTab} on:cancel={event => { event.preventDefault(); close(); }}>
  <div class="assignment-heading"><h2 id="assignment-title">그룹 할당</h2><button aria-label="그룹 할당 닫기" disabled={busy} on:click={close}>×</button></div>
  <p class="target-name">{target.kind === 'session' ? target.name : target.source.name}</p>
  <p id="assignment-description">{target.kind === 'session' ? '세션을 선택한 사용자 그룹에 직접 배정합니다. 직접 배정은 자동 그룹 연결보다 우선합니다.' : '그룹 자체를 연결합니다. 이후 이 그룹에 추가되는 세션도 함께 분류됩니다.'} 선택을 해제하면 배정이 해제됩니다.</p>
  {#if inheritedGroups.length}<p class="inherited-groups">그룹 연결로 포함된 소속: {inheritedGroups.join(', ')}. 아래 선택은 직접 배정에 적용됩니다.</p>{/if}
  {#if unavailable || error}<div role="alert" class="dialog-error">{unavailable || error}</div>{/if}
  {#if missingChoices}<div role="alert" class="dialog-error">선택한 그룹이 삭제되었습니다. <button on:click={() => choices = new Set([...choices].filter(id => groups.some(group => group.id === id)))}>사라진 그룹 선택 해제</button></div>{/if}
  <fieldset disabled={busy || !!unavailable}>
    <legend>사용자 그룹 선택 <small>여러 그룹 선택 가능</small></legend>
    <div class="group-choices">
      {#each groups as group (group.id)}
        {@const blocked = target.kind === 'group' && !canAssignGroup(target.source, group.id, groups)}
        <label class:blocked title={blocked ? '자기 자신 또는 순환하는 그룹은 연결할 수 없습니다.' : group.name}>
          <input type="checkbox" checked={choices.has(group.id)} disabled={blocked} on:change={event => toggle(group.id, event.currentTarget.checked)} />
          <span>{group.name}</span>{#if blocked}<small>연결 불가</small>{/if}
        </label>
      {:else}<p class="empty-choices">아직 사용자 그룹이 없습니다. 아래에서 새 그룹을 만드세요.</p>{/each}
    </div>
  </fieldset>
  <form class="create-group" on:submit|preventDefault={create}>
    <input aria-label="새 그룹 이름" bind:value={name} maxlength="100" placeholder="새 그룹 이름" disabled={busy || !!unavailable} />
    <button disabled={busy || !!unavailable || !name.trim()}>그룹 만들기</button>
  </form>
  <div class="dialog-actions"><button disabled={busy} on:click={close}>취소</button><button class="apply" disabled={busy || !!unavailable || missingChoices} on:click={apply}>{busy ? '저장 중…' : '할당 적용'}</button></div>
</dialog>

<style>
  .assignment-dialog { width:min(500px,calc(100vw - 48px)); max-height:calc(100vh - 48px); box-sizing:border-box; margin:auto; padding:24px; border:1px solid rgba(var(--accent-rgb),.35); border-radius:14px; background:var(--bg-raised); color:#e4e4e7; box-shadow:0 24px 80px #0009; overflow-y:auto; }
  .assignment-dialog::backdrop { background:#0009; }
  .assignment-heading { display:flex; align-items:center; justify-content:space-between; gap:16px; } h2 { font-size:17px; margin:0; }
  button,input { font:inherit; color:inherit; } button { cursor:pointer; background:#ffffff06; border:1px solid #ffffff20; border-radius:7px; padding:9px 13px; } button:disabled,input:disabled { opacity:.5; cursor:default; }
  .assignment-heading button { border:0; background:none; font-size:24px; padding:0 4px; }
  .target-name { font-weight:600; font-size:14px; margin:18px 0 8px; overflow-wrap:anywhere; } #assignment-description { color:#a1a1aa; font-size:12px; line-height:1.7; margin-bottom:20px; }
  .inherited-groups { color:var(--accent-lighter); font-size:12px; line-height:1.7; margin-bottom:16px; overflow-wrap:anywhere; }
  fieldset { min-width:0; padding:0; border:0; } legend { font-size:12px; margin-bottom:10px; width:100%; } legend small { float:right; color:#71717a; font-size:11px; }
  .group-choices { max-height:220px; overflow-y:auto; border:1px solid #ffffff12; border-radius:8px; padding:6px; }
  label { display:flex; align-items:center; gap:10px; padding:10px 8px; font-size:13px; border-radius:5px; } label:hover { background:#ffffff05; } label span { flex:1; min-width:0; overflow-wrap:anywhere; } label small { color:#71717a; white-space:nowrap; } .blocked { opacity:.5; }
  input[type=checkbox] { accent-color:var(--accent); } .empty-choices { padding:12px; font-size:12px; color:#a1a1aa; line-height:1.7; }
  .create-group { display:flex; gap:8px; margin-top:14px; } .create-group input { flex:1; min-width:0; background:var(--bg-sunken); border:1px solid #ffffff20; border-radius:7px; padding:10px; } .create-group button { white-space:nowrap; }
  .dialog-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:24px; } .apply { background:var(--accent); border-color:var(--accent-light); color:var(--accent-ink); }
  .dialog-error { margin-bottom:12px; background:#ef444413; color:#fca5a5; padding:12px; border-radius:7px; font-size:12px; overflow-wrap:anywhere; } .dialog-error button { margin-top:8px; }
</style>
