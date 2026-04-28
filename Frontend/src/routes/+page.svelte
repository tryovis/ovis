<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { appPath } from '$lib/path-utils';

  onMount(() => {
    // sofortige Weiterleitung ohne History-Eintrag/Flicker
    goto(appPath('/patient-cohort'), { replaceState: true, noScroll: true });
  });
</script>
