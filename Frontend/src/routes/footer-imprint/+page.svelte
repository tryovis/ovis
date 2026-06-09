<script lang="ts">
  import { env } from '$env/dynamic/public';

  import { t, locale } from "../../store/languageStore";

  const webhostOrganization = env.PUBLIC_SITE_SPECIFIC_IMPRINT_RESPONSIBLE_WEBHOST_ORGANIZATION?.trim() || '';
  const webhostPerson = env.PUBLIC_SITE_SPECIFIC_IMPRINT_RESPONSIBLE_WEBHOST_PERSON?.trim() || '';
  const webhostStreet = env.PUBLIC_SITE_SPECIFIC_IMPRINT_RESPONSIBLE_WEBHOST_ADDRESS_STREET?.trim() || '';
  const webhostArea = env.PUBLIC_SITE_SPECIFIC_IMPRINT_RESPONSIBLE_WEBHOST_ADDRESS_AREA?.trim() || '';
  const hospitalPassus = env.PUBLIC_SITE_SPECIFIC_IMPRINT_HOSPITAL_PASSUS?.trim() || '';
  const hospitalDirector = env.PUBLIC_SITE_SPECIFIC_IMPRINT_RESPONSIBLE_HOSPITAL_DIRECTOR?.trim() || '';
  const hospitalName = env.PUBLIC_SITE_SPECIFIC_IMPRINT_HOSPITAL_NAME?.trim() || '';
  const hospitalStreet = env.PUBLIC_SITE_SPECIFIC_IMPRINT_ADDRESS_STREET?.trim() || '';
  const hospitalArea = env.PUBLIC_SITE_SPECIFIC_IMPRINT_ADDRESS_AREA?.trim() || '';

</script>

    <div class="box_style box_level2 footer-content-box">
  <h1>{$t("imprint")}</h1>

  <section>
    <h2>{$t("serviceProvider")}</h2>
    <p>
      <strong>{hospitalName}</strong> – {hospitalPassus}
    </p>
    <p>
      {hospitalStreet}<br />
      {hospitalArea}
    </p>
  </section>

  <section>
    <h2>{$t("authorizedRepresentative")}</h2>
    <p>
      <strong>{hospitalDirector}</strong>
    </p>
  </section>

  <section>
    <h2>{$t("responsibleForContent")}</h2>
    <p><strong>{webhostOrganization}</strong></p>
    <p><strong>{webhostPerson}</strong></p>
    <p>
      {webhostStreet}<br />
      {webhostArea}
    </p>
  </section>
</div>

