<script lang="ts">
  import { t } from "../../store/languageStore";
</script>

<style>
  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
  }

  thead th {
    background-color: rgb(220, 220, 220);
    padding: 8px;
    text-align: left;
    border: 1px solid rgb(245, 245, 245);
  }

  tbody td {
    background-color: rgb(235, 235, 235);
    padding: 8px;
    border: 1px solid rgb(245, 245, 245);
    vertical-align: top;
  }

  ul {
    list-style-type: disc;
    padding-left: 20px;
    margin: 0;
  }

  a {
    text-decoration: none;
  }
</style>

<div class="box_style box_level2">
  <table>
    <thead>
      <tr>
        <th>{$t("kmTable.variant")}</th>
        <th>{$t("kmTable.start")}</th>
        <th>{$t("kmTable.end")}</th>
        <th>{$t("kmTable.comment")}</th>
      </tr>
    </thead>

    <tbody>
      <!-- Overall Survival (OAS) -->
      <tr>
        <td><b>{$t("km.oas.title")}</b></td>
        <td>{$t("km.oas.start")}</td>
        <td>
          <ul>
            <li>0: <strong>{$t("km.labels.censor")}</strong> = {$t("km.oas.end.0")}</li>
            <li>1: <strong>{$t("km.labels.event")}</strong> = {$t("km.oas.end.1")}</li>
          </ul>
        </td>
        <td>{$t("km.oas.comment")}</td>
      </tr>

      <!-- Metastasefreies Überleben (MFS) -->
      <tr>
        <td><b>{$t("km.mfs.title")}</b></td>
        <td>{$t("km.mfs.start")}</td>
        <td>
          <ul>
            <li>0: <strong>{$t("km.labels.censor")}</strong> = {$t("km.mfs.end.0")}</li>
            <li>1: <strong>{$t("km.labels.event")}</strong> = {$t("km.mfs.end.1")}</li>
          </ul>
        </td>
        <td>
          <ul>
            <li>
              <a href="tnm">{$t("km.links.metastasisDetails")}</a>
              {$t("km.mfs.comment.rule1")}
            </li>
            <li>
              <a href="progress">{$t("km.links.progress")}</a>
              {$t("km.mfs.comment.rule2")}
            </li>
            <li>{$t("km.mfs.comment.exclusion")}</li>
          </ul>
          <br />
          {$t("km.mfs.comment.outro")}
        </td>
      </tr>

      <!-- Progressfreies Überleben (PFS) -->
      <tr>
        <td><b>{$t("km.pfs.title")}</b></td>
        <td>{$t("km.pfs.start")}</td>
        <td>
          <ul>
            <li>0: <strong>{$t("km.labels.censor")}</strong> = {$t("km.pfs.end.0")}</li>
            <li>1: <strong>{$t("km.labels.event")}</strong> = {$t("km.pfs.end.1")}</li>
          </ul>
        </td>
        <td>
          <ul>
            <li>
              <a href="progress">{$t("km.links.progress")}</a>
              {$t("km.pfs.comment.rule1")}
            </li>
            <li>{$t("km.pfs.comment.rule2")}</li>
          </ul>
          <br />
          {$t("km.pfs.comment.outro")}
        </td>
      </tr>

      <!-- Überleben ab Progression (SAP) -->
      <tr>
        <td><b>{$t("km.sap.title")}</b></td>
        <td>{$t("km.sap.start")}</td>
        <td>
          <ul>
            <li>0: <strong>{$t("km.labels.censor")}</strong> = {$t("km.sap.end.0")}</li>
            <li>1: <strong>{$t("km.labels.event")}</strong> = {$t("km.sap.end.1")}</li>
          </ul>
        </td>
        <td>
          <ul>
            <li>
              <a href="progress">{$t("km.links.progress")}</a>
              {$t("km.sap.comment.rule1")}
            </li>
            <li>{$t("km.sap.comment.rule2")}</li>
          </ul>
          <br />
          {$t("km.sap.comment.outro")}
        </td>
      </tr>

      <!-- Rezidivfreies Überleben (RFS) -->
      <tr>
        <td><b>{$t("km.rfs.title")}</b></td>
        <td>{$t("km.rfs.start")}</td>
        <td>
          <ul>
            <li>0: <strong>{$t("km.labels.censor")}</strong> = {$t("km.rfs.end.0")}</li>
            <li>1: <strong>{$t("km.labels.event")}</strong> = {$t("km.rfs.end.1")}</li>
          </ul>
        </td>
        <td>
          <ul>
            <li>
              <a href="progress">{$t("km.links.progress")}</a>:
              {$t("km.rfs.comment.rule1")}
            </li>
            <li>
              <a href="progress">{$t("km.links.progress")}</a>:
              {$t("km.rfs.comment.rule2")}
            </li>
            <li>
              <a href="progress">{$t("km.links.progress")}</a>:
              {$t("km.rfs.comment.rule3")}
            </li>
            <li>{$t("km.rfs.comment.rule4")}</li>
          </ul>
          <br />
          {$t("km.rfs.comment.outro")}
        </td>
      </tr>

      <!-- Disease Free Survival (DFS) -->
      <tr>
        <td><b>{$t("km.dfs.title")}</b></td>
        <td>
          {$t("km.dfs.start")}
          <br />
          ({$t("km.dfs.startNote")})
        </td>
        <td>
          <ul>
            <li>0: <strong>{$t("km.labels.censor")}</strong> = {$t("km.dfs.end.0")}</li>
            <li>1: <strong>{$t("km.labels.event")}</strong> = {$t("km.dfs.end.1")}</li>
          </ul>
        </td>
        <td>
          {$t("km.dfs.comment.p2a")}
          <a href="progress">{$t("km.links.progress")}</a>
          {$t("km.dfs.comment.p2b")}
          <a href="tnm">{$t("km.links.tnm")}</a>
          {$t("km.dfs.comment.p2c")}
          (<code>OVIS_PREPROC_DFS_*</code>).
          <br />
          {$t("km.dfs.comment.p3")}
        </td>
      </tr>
    </tbody>
  </table>
</div>
