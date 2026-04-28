<script lang="ts">
  import { env } from '$env/dynamic/public';
  import { t, locale } from "../../store/languageStore";

  const webhostOrganization = env.PUBLIC_SITE_SPECIFIC_IMPRINT_RESPONSIBLE_WEBHOST_ORGANIZATION?.trim() || '';
  const webhostPerson = env.PUBLIC_SITE_SPECIFIC_IMPRINT_RESPONSIBLE_WEBHOST_PERSON?.trim() || '';
  const webhostStreet = env.PUBLIC_SITE_SPECIFIC_IMPRINT_RESPONSIBLE_WEBHOST_ADDRESS_STREET?.trim() || '';
  const webhostArea = env.PUBLIC_SITE_SPECIFIC_IMPRINT_RESPONSIBLE_WEBHOST_ADDRESS_AREA?.trim() || '';
  const hospitalName = env.PUBLIC_SITE_SPECIFIC_IMPRINT_HOSPITAL_NAME?.trim() || '';
  const hospitalStreet = env.PUBLIC_SITE_SPECIFIC_IMPRINT_ADDRESS_STREET?.trim() || '';
  const hospitalArea = env.PUBLIC_SITE_SPECIFIC_IMPRINT_ADDRESS_AREA?.trim() || '';
  const dataProtectionOfficerName = env.PUBLIC_SITE_SPECIFIC_IMPRINT_DATA_PROTECTION_OFFICER_NAME?.trim() || '';
  const dataProtectionOfficerStreet = env.PUBLIC_SITE_SPECIFIC_IMPRINT_DATA_PROTECTION_OFFICER_STREET?.trim() || '';
  const dataProtectionOfficerArea = env.PUBLIC_SITE_SPECIFIC_IMPRINT_DATA_PROTECTION_OFFICER_AREA?.trim() || '';
  const dataProtectionOfficerEmail = env.PUBLIC_SITE_SPECIFIC_IMPRINT_DATA_PROTECTION_OFFICER_EMAIL?.trim() || '';
</script>
   
<div class="box_style box_level2 footer-content-box">
  {@html $t("privacyPolicyPart1")}
      <p>
        <strong>{hospitalName}</strong><br>
        {hospitalStreet}<br>
        {hospitalArea}
      </p>
      <i>  {@html $t("privacyPolicyPart2")}</i>
      <p>
        <strong>{webhostOrganization}</strong><br>
        {webhostPerson}<br>
        {webhostStreet}<br>
         {webhostArea}
      </p>


    <section id="dsb">
      <h2>  {@html $t("privacyProtectionOfficer")}</h2>
      <p>
       <strong>{dataProtectionOfficerName}</strong><br>
        {dataProtectionOfficerStreet}<br>
        {dataProtectionOfficerArea}<br>
        {dataProtectionOfficerEmail}<br>
      </p>
    </section>

     {@html $t("privacyPolicyPart3")}

</div>
