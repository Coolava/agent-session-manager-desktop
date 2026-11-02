<script lang="ts">
  import AgentIcon from './AgentIcon.svelte';
  import claudeIcon from '../../../assets/icons/claude.svg';
  import codexIcon from '../../../assets/icons/codex.svg';
  export let providers: string[];
</script>

{#if providers.includes('claude') && providers.includes('codex')}
  <span class="mixed-agent-icon" role="img" aria-label="Claude · Codex" title="Claude · Codex">
    <img class="claude-half" src={claudeIcon} alt="" />
    <img class="codex-half" src={codexIcon} alt="" />
  </span>
{:else if providers.length}
  <AgentIcon agent={providers[0]} size="sm" />
{:else}
  <span class="empty-group-icon" title="빈 그룹" aria-hidden="true">◇</span>
{/if}

<style>
  .mixed-agent-icon { position:relative; display:inline-block; width:16px; height:16px; flex-shrink:0; }
  .mixed-agent-icon img { position:absolute; inset:0; width:16px; height:16px; }
  .claude-half { clip-path:inset(0 50% 0 0); }
  .codex-half { clip-path:inset(0 0 0 50%); }
  .empty-group-icon { width:16px; flex-shrink:0; color:var(--accent-light); font-size:17px; }
</style>
