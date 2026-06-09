<script lang="ts">
  import { t } from "../../store/languageStore";
  import { userStore } from "../../store/userStore";
  import { onDestroy } from "svelte";

  let primaryColor = "";

  const unsubscribe = userStore.subscribe((v: any) => {
    primaryColor = v?.primaryColor ?? "";
  });

  onDestroy(unsubscribe);
</script>

<div
  class="box_style box_level2 footer-content-box"
  style="--linkColor: {primaryColor}"
>
  <h1>{$t("knownIssues")}</h1>
  <ul class="issues-list">
    <li>
      <strong>{@html $t("issueMultiSelectStatusType")}</strong>
      <div><em>{@html $t("issueMultiSelectStatusTypeDesc")}</em></div>
    </li>
    <li>
      <strong>{@html $t("issueResolutionOptimization")}</strong>
      <div><em>{@html $t("issueResolutionOptimizationDesc")}</em></div>
    </li>
  </ul>
</div>

<style>

</style>
