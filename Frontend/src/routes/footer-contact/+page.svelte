<script lang="ts">
    import { env } from '$env/dynamic/public';
    import { t, locale } from "../../store/languageStore";

    const technicalAdminName = env.PUBLIC_SITE_SPECIFIC_TECHNICAL_ADMIN_NAME?.trim() || 'Local Admin';
    const technicalAdminEmail = env.PUBLIC_SITE_SPECIFIC_TECHNICAL_ADMIN_EMAIL?.trim() || '';
</script>

<div class="box_style box_level2 footer-content-box">
   <h1>{$t("contact")}</h1>
    <h3>{$t("technicalCoordinatorTitle")}</h3>
    <i>{$t("technicalCoordinatorDesc")}</i>
    <p><strong>{technicalAdminName}</strong></p>
    <p>Email: {technicalAdminEmail}</p>
    <hr>
    <h3>{$t("leadDeveloperTitle")}</h3>
    <i>{$t("leadDeveloperDesc")}</i>
    <p>Dr. Daniel Nasseh</p>
    <p>Email: daniel.nasseh(AT)med.uni-muenchen.de</p>
    
</div>
