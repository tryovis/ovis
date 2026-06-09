<script lang="ts">
	import { t } from '../../store/languageStore';
	import { userStore } from '../../store/userStore';
	import { onDestroy } from 'svelte';

	let primaryColor = '';

	const unsubscribe = userStore.subscribe((v: any) => {
		primaryColor = v?.primaryColor ?? '';
	});

	onDestroy(unsubscribe);
</script>

<div class="box_style box_level2 footer-content-box" style="--linkColor: {primaryColor}">
	<h1>{$t('licenseInformation')}</h1>

	<!-- Übersetzungsblock (enthält <section> mit .translated-link im Lizenz-Link) -->
	{@html $t('licenseInformationFull')}

	<!-- Zusätzliche Listen -->
	<section>
		<h3>{$t('dataSources')}</h3>
		<ul>
			<li>
				<a
					href="https://seer.cancer.gov/seerstat/variables/seer/raresiterecode/"
					target="_blank"
					rel="noopener noreferrer"
					>https://seer.cancer.gov/seerstat/variables/seer/raresiterecode/</a
				>
			</li>
			<li>
				<a
					href="https://www.suche-postleitzahl.org/downloads"
					target="_blank"
					rel="noopener noreferrer">https://www.suche-postleitzahl.org/downloads</a
				>
			</li>
			<li>
				<a href="https://www.bfarm.de/DE/Home/_node.html" target="_blank" rel="noopener noreferrer"
					>OPS / ICD10 / ICDO</a
				>
			</li>
		</ul>

		<h3>Icons</h3>
		<ul>
			<li>
				<a href="https://www.flaticon.com" target="_blank" rel="noopener noreferrer"
					>www.flaticon.com</a
				>
			</li>
			<li>
				<a href="https://icon-sets.iconify.design" target="_blank" rel="noopener noreferrer"
					>https://icon-sets.iconify.design</a
				>
			</li>
		</ul>

		<h3>{$t('bodyMapSources')}</h3>

		<p>{$t('bodyMapSourcesFull')}</p>

		<div class="source-table-wrapper">
			<table class="source-table">
				<thead>
					<tr>
						<th>File</th>
						<th>Source</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>Level_2C00-14</td>
						<td>
							<a href="https://en.wikipedia.org/wiki/Pharynx#/media/File:Illu01_head_neck.jpg" target="_blank" rel="noopener noreferrer">
								https://en.wikipedia.org/wiki/Pharynx#/media/File:Illu01_head_neck.jpg
							</a>
						</td>
					</tr>
					<tr>
						<td>Level_2C15-26</td>
						<td>
							<a href="https://commons.wikimedia.org/wiki/File:Digestive_system_diagram_edit.svg" target="_blank" rel="noopener noreferrer">
								https://commons.wikimedia.org/wiki/File:Digestive_system_diagram_edit.svg
							</a>
						</td>
					</tr>
					<tr>
						<td>Level_2C30-39</td>
						<td>Assembled by other OVIS used SVGs</td>
					</tr>
					<tr>
						<td>Level_2C40-41</td>
						<td>
							<a href="https://en.wikipedia.org/wiki/File:Human_skeleton_front_en.svg" target="_blank" rel="noopener noreferrer">
								https://en.wikipedia.org/wiki/File:Human_skeleton_front_en.svg
							</a>
						</td>
					</tr>
					<tr>
						<td>Level_2C43-44</td>
						<td>OVIS created</td>
					</tr>
					<tr>
						<td>Level_2C50-50</td>
						<td>
							<a href="https://it.wikipedia.org/wiki/File:Diagram_3_of_3_showing_stage_2B_breast_cancer_CRUK_015-it.svg" target="_blank" rel="noopener noreferrer">
								https://it.wikipedia.org/wiki/File:Diagram_3_of_3_showing_stage_2B_breast_cancer_CRUK_015-it.svg
							</a>
						</td>
					</tr>
					<tr>
						<td>Level_2C51-58</td>
						<td>
							<a href="https://commons.wikimedia.org/wiki/File:Scheme_female_reproductive_system-en.svg" target="_blank" rel="noopener noreferrer">
								https://commons.wikimedia.org/wiki/File:Scheme_female_reproductive_system-en.svg
							</a>
						</td>
					</tr>
					<tr>
						<td>Level_2C60-63</td>
						<td>
							<a href="https://commons.wikimedia.org/wiki/File:Male_anatomy_1.png#Licensing" target="_blank" rel="noopener noreferrer">
								https://commons.wikimedia.org/wiki/File:Male_anatomy_1.png#Licensing
							</a>
						</td>
					</tr>
					<tr>
						<td>Level_2C64-68</td>
						<td>
							<a href="https://commons.wikimedia.org/wiki/File:Urinary_system.svg" target="_blank" rel="noopener noreferrer">
								https://commons.wikimedia.org/wiki/File:Urinary_system.svg
							</a>
						</td>
					</tr>
					<tr>
						<td>Level_2C69-72</td>
						<td>
							<a href="https://commons.wikimedia.org/wiki/File:Brain_anatomy.svg" target="_blank" rel="noopener noreferrer">
								https://commons.wikimedia.org/wiki/File:Brain_anatomy.svg
							</a>
						</td>
					</tr>
					<tr>
						<td>Level_2C73-75</td>
						<td>Assembled by other OVIS used SVGs</td>
					</tr>
					<tr>
						<td>Level_1</td>
						<td>
							<a href="https://commons.wikimedia.org/wiki/File:Digestive_system_diagram_en.svg" target="_blank" rel="noopener noreferrer">
								https://commons.wikimedia.org/wiki/File:Digestive_system_diagram_en.svg
							</a>
						</td>
					</tr>

					<tr>
						<td>Level3_C00</td>
						<td>
							<a href="http://pmuinternational.com/irina-fomenko-perfect-lips-sketch-in-permanent-makeup/" target="_blank" rel="noopener noreferrer">
								http://pmuinternational.com/irina-fomenko-perfect-lips-sketch-in-permanent-makeup/
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C01</td>
						<td>
							<a href="https://humananatomy-libs.com/the-anatomy-of-the-mouth/" target="_blank" rel="noopener noreferrer">
								https://humananatomy-libs.com/the-anatomy-of-the-mouth/
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C02</td>
						<td>
							<a href="https://humananatomy-libs.com/the-anatomy-of-the-mouth/" target="_blank" rel="noopener noreferrer">
								https://humananatomy-libs.com/the-anatomy-of-the-mouth/
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C03</td>
						<td>
							<a href="https://en.wikipedia.org/wiki/Mouth_assessment" target="_blank" rel="noopener noreferrer">
								https://en.wikipedia.org/wiki/Mouth_assessment
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C04</td>
						<td>
							<a href="https://humananatomy-libs.com/the-anatomy-of-the-mouth/" target="_blank" rel="noopener noreferrer">
								https://humananatomy-libs.com/the-anatomy-of-the-mouth/
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C05</td>
						<td>
							<a href="https://humananatomy-libs.com/the-anatomy-of-the-mouth/" target="_blank" rel="noopener noreferrer">
								https://humananatomy-libs.com/the-anatomy-of-the-mouth/
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C06</td>
						<td>
							<a href="https://humananatomy-libs.com/the-anatomy-of-the-mouth/" target="_blank" rel="noopener noreferrer">
								https://humananatomy-libs.com/the-anatomy-of-the-mouth/
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C07</td>
						<td>
							<a href="https://en.wikipedia.org/wiki/Parotid_gland#/media/File:Blausen_0780_SalivaryGlands.png" target="_blank" rel="noopener noreferrer">
								https://en.wikipedia.org/wiki/Parotid_gland#/media/File:Blausen_0780_SalivaryGlands.png
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C08</td>
						<td>
							<a href="https://en.wikipedia.org/wiki/Parotid_gland#/media/File:Blausen_0780_SalivaryGlands.png" target="_blank" rel="noopener noreferrer">
								https://en.wikipedia.org/wiki/Parotid_gland#/media/File:Blausen_0780_SalivaryGlands.png
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C09</td>
						<td>
							<a href="https://commons.wikimedia.org/wiki/File:Illu_mouth.jpg" target="_blank" rel="noopener noreferrer">
								https://commons.wikimedia.org/wiki/File:Illu_mouth.jpg
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C10</td>
						<td>
							<a href="https://en.wikipedia.org/wiki/Pharynx#/media/File:Illu01_head_neck.jpg" target="_blank" rel="noopener noreferrer">
								https://en.wikipedia.org/wiki/Pharynx#/media/File:Illu01_head_neck.jpg
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C11</td>
						<td>
							<a href="https://en.wikipedia.org/wiki/Pharynx#/media/File:Illu01_head_neck.jpg" target="_blank" rel="noopener noreferrer">
								https://en.wikipedia.org/wiki/Pharynx#/media/File:Illu01_head_neck.jpg
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C12</td>
						<td>
							<a href="http://keywordsuggest.org/gallery/602818.html" target="_blank" rel="noopener noreferrer">
								http://keywordsuggest.org/gallery/602818.html
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C13</td>
						<td>
							<a href="https://en.wikipedia.org/wiki/Pharynx#/media/File:Illu01_head_neck.jpg" target="_blank" rel="noopener noreferrer">
								https://en.wikipedia.org/wiki/Pharynx#/media/File:Illu01_head_neck.jpg
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C15</td>
						<td>
							<a href="https://en.wikipedia.org/wiki/Esophagus#/media/File:Tractus_intestinalis_esophagus.svg" target="_blank" rel="noopener noreferrer">
								https://en.wikipedia.org/wiki/Esophagus#/media/File:Tractus_intestinalis_esophagus.svg
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C16</td>
						<td>
							<a href="https://commons.wikimedia.org/wiki/File:Stomach-ca.svg" target="_blank" rel="noopener noreferrer">
								https://commons.wikimedia.org/wiki/File:Stomach-ca.svg
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C17</td>
						<td>
							<a href="https://en.wikipedia.org/wiki/Small_intestine#/media/File:Blausen_0817_SmallIntestine_Anatomy.png" target="_blank" rel="noopener noreferrer">
								https://en.wikipedia.org/wiki/Small_intestine#/media/File:Blausen_0817_SmallIntestine_Anatomy.png
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C18</td>
						<td>
							<a href="https://pixabay.com/en/offal-marking-medical-intestine-1463369/" target="_blank" rel="noopener noreferrer">
								https://pixabay.com/en/offal-marking-medical-intestine-1463369/
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C19</td>
						<td>
							<a href="https://en.wikipedia.org/wiki/Rectum#/media/File:Rectum_anatomy_en.svg" target="_blank" rel="noopener noreferrer">
								https://en.wikipedia.org/wiki/Rectum#/media/File:Rectum_anatomy_en.svg
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C20</td>
						<td>
							<a href="https://en.wikipedia.org/wiki/Rectum#/media/File:Rectum_anatomy_en.svg" target="_blank" rel="noopener noreferrer">
								https://en.wikipedia.org/wiki/Rectum#/media/File:Rectum_anatomy_en.svg
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C21</td>
						<td>
							<a href="https://en.wikipedia.org/wiki/Rectum#/media/File:Rectum_anatomy_en.svg" target="_blank" rel="noopener noreferrer">
								https://en.wikipedia.org/wiki/Rectum#/media/File:Rectum_anatomy_en.svg
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C22</td>
						<td>
							<a href="https://en.wikipedia.org/wiki/Liver#/media/File:Anatomy_Abdomen_Tiesworks.jpg" target="_blank" rel="noopener noreferrer">
								https://en.wikipedia.org/wiki/Liver#/media/File:Anatomy_Abdomen_Tiesworks.jpg
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C23</td>
						<td>
							<a href="https://en.wikipedia.org/wiki/Pancreas#/media/File:Blausen_0699_PancreasAnatomy.png" target="_blank" rel="noopener noreferrer">
								https://en.wikipedia.org/wiki/Pancreas#/media/File:Blausen_0699_PancreasAnatomy.png
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C24</td>
						<td>Basic forms</td>
					</tr>
					<tr>
						<td>Level3_C25</td>
						<td>
							<a href="https://en.wikipedia.org/wiki/Pancreas#/media/File:Blausen_0699_PancreasAnatomy.png" target="_blank" rel="noopener noreferrer">
								https://en.wikipedia.org/wiki/Pancreas#/media/File:Blausen_0699_PancreasAnatomy.png
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C26</td>
						<td>
							<a href="https://commons.wikimedia.org/wiki/File:Digestive_system_diagram_en.svg" target="_blank" rel="noopener noreferrer">
								https://commons.wikimedia.org/wiki/File:Digestive_system_diagram_en.svg
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C30</td>
						<td>
							<a href="https://wps.aw.com/wps/media/objects/2943/3014195/ebk/htm/chp15_12.htm" target="_blank" rel="noopener noreferrer">
								https://wps.aw.com/wps/media/objects/2943/3014195/ebk/htm/chp15_12.htm
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C31</td>
						<td>OVIS created</td>
					</tr>
					<tr>
						<td>Level3_C32</td>
						<td>
							<a href="https://commons.wikimedia.org/wiki/File:Larynx_and_nearby_structures.jpg" target="_blank" rel="noopener noreferrer">
								https://commons.wikimedia.org/wiki/File:Larynx_and_nearby_structures.jpg
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C33</td>
						<td>
							<a href="https://commons.wikimedia.org/wiki/File:201701_Trachea_and_Bronchial_tree.svg" target="_blank" rel="noopener noreferrer">
								https://commons.wikimedia.org/wiki/File:201701_Trachea_and_Bronchial_tree.svg
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C34</td>
						<td>
							<a href="https://commons.wikimedia.org/wiki/File:Lungs_diagram_simple.svg" target="_blank" rel="noopener noreferrer">
								https://commons.wikimedia.org/wiki/File:Lungs_diagram_simple.svg
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C37</td>
						<td>
							<a href="https://commons.wikimedia.org/wiki/File:201701_Trachea_and_Bronchial_tree.svg" target="_blank" rel="noopener noreferrer">
								https://commons.wikimedia.org/wiki/File:201701_Trachea_and_Bronchial_tree.svg
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C38</td>
						<td>
							<a href="https://en.wikipedia.org/wiki/Mediastinal_tumors#/media/File:Compartments_of_the_mediastinum.svg" target="_blank" rel="noopener noreferrer">
								https://en.wikipedia.org/wiki/Mediastinal_tumors#/media/File:Compartments_of_the_mediastinum.svg
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C39</td>
						<td>Assembled by other OVIS used SVGs</td>
					</tr>
					<tr>
						<td>Level3_C40</td>
						<td>
							<a href="https://commons.wikimedia.org/wiki/File:Human_skeleton_front_en.svg" target="_blank" rel="noopener noreferrer">
								https://commons.wikimedia.org/wiki/File:Human_skeleton_front_en.svg
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C41</td>
						<td>
							<a href="https://commons.wikimedia.org/wiki/File:Human_skeleton_front_en.svg" target="_blank" rel="noopener noreferrer">
								https://commons.wikimedia.org/wiki/File:Human_skeleton_front_en.svg
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C43</td>
						<td>OVIS created</td>
					</tr>
					<tr>
						<td>Level3_C44</td>
						<td>OVIS created</td>
					</tr>
					<tr>
						<td>Level3_C50</td>
						<td>
							<a href="https://it.wikipedia.org/wiki/File:Diagram_3_of_3_showing_stage_2B_breast_cancer_CRUK_015-it.svg" target="_blank" rel="noopener noreferrer">
								https://it.wikipedia.org/wiki/File:Diagram_3_of_3_showing_stage_2B_breast_cancer_CRUK_015-it.svg
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C51</td>
						<td>OVIS created</td>
					</tr>
					<tr>
						<td>Level3_C52</td>
						<td>
							<a href="https://commons.wikimedia.org/wiki/File:Diagram_showing_a_radical_hysterectomy.jpg" target="_blank" rel="noopener noreferrer">
								https://commons.wikimedia.org/wiki/File:Diagram_showing_a_radical_hysterectomy.jpg
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C53</td>
						<td>
							<a href="https://commons.wikimedia.org/wiki/File:Diagram_showing_a_radical_hysterectomy.jpg" target="_blank" rel="noopener noreferrer">
								https://commons.wikimedia.org/wiki/File:Diagram_showing_a_radical_hysterectomy.jpg
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C54</td>
						<td>
							<a href="https://commons.wikimedia.org/wiki/File:Diagram_showing_stage_1A_and_1B_cancer.jpg" target="_blank" rel="noopener noreferrer">
								https://commons.wikimedia.org/wiki/File:Diagram_showing_stage_1A_and_1B_cancer.jpg
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C55</td>
						<td>
							<a href="https://commons.wikimedia.org/wiki/File:Diagram_showing_stage_1A_and_1B_cancer.jpg" target="_blank" rel="noopener noreferrer">
								https://commons.wikimedia.org/wiki/File:Diagram_showing_stage_1A_and_1B_cancer.jpg
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C56</td>
						<td>
							<a href="https://commons.wikimedia.org/wiki/File:Diagram_showing_stage_1A_and_1B_cancer.jpg" target="_blank" rel="noopener noreferrer">
								https://commons.wikimedia.org/wiki/File:Diagram_showing_stage_1A_and_1B_cancer.jpg
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C57</td>
						<td>
							<a href="https://commons.wikimedia.org/wiki/File:Diagram_showing_a_radical_hysterectomy.jpg" target="_blank" rel="noopener noreferrer">
								https://commons.wikimedia.org/wiki/File:Diagram_showing_a_radical_hysterectomy.jpg
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C58</td>
						<td>OVIS created</td>
					</tr>
					<tr>
						<td>Level3_C60</td>
						<td>
							<a href="https://commons.wikimedia.org/wiki/File:Male_anatomy_1.png#Licensing" target="_blank" rel="noopener noreferrer">
								https://commons.wikimedia.org/wiki/File:Male_anatomy_1.png#Licensing
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C61</td>
						<td>
							<a href="https://commons.wikimedia.org/wiki/File:Male_anatomy_1.png#Licensing" target="_blank" rel="noopener noreferrer">
								https://commons.wikimedia.org/wiki/File:Male_anatomy_1.png#Licensing
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C62</td>
						<td>OVIS created</td>
					</tr>
					<tr>
						<td>Level3_C63</td>
						<td>
							<a href="https://commons.wikimedia.org/wiki/File:Male_anatomy_1.png#Licensing" target="_blank" rel="noopener noreferrer">
								https://commons.wikimedia.org/wiki/File:Male_anatomy_1.png#Licensing
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C64</td>
						<td>
							<a href="https://commons.wikimedia.org/wiki/File:Urinary_system.svg" target="_blank" rel="noopener noreferrer">
								https://commons.wikimedia.org/wiki/File:Urinary_system.svg
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C65</td>
						<td>
							<a href="https://commons.wikimedia.org/wiki/File:Urinary_system.svg" target="_blank" rel="noopener noreferrer">
								https://commons.wikimedia.org/wiki/File:Urinary_system.svg
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C66</td>
						<td>
							<a href="https://commons.wikimedia.org/wiki/File:Urinary_system.svg" target="_blank" rel="noopener noreferrer">
								https://commons.wikimedia.org/wiki/File:Urinary_system.svg
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C67</td>
						<td>OVIS created</td>
					</tr>
					<tr>
						<td>Level3_C68</td>
						<td>
							<a href="https://en.wikipedia.org/wiki/Urinary_bladder#/media/File:2605_The_Bladder.jpg" target="_blank" rel="noopener noreferrer">
								https://en.wikipedia.org/wiki/Urinary_bladder#/media/File:2605_The_Bladder.jpg
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C69</td>
						<td>
							<a href="https://en.wikipedia.org/wiki/Three_Internal_chambers_of_the_Eye.png" target="_blank" rel="noopener noreferrer">
								https://en.wikipedia.org/wiki/Three_Internal_chambers_of_the_Eye.png
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C69</td>
						<td>
							<a href="https://commons.wikimedia.org/wiki/File:Tear_system.svg" target="_blank" rel="noopener noreferrer">
								https://commons.wikimedia.org/wiki/File:Tear_system.svg
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C70</td>
						<td>OVIS created</td>
					</tr>
					<tr>
						<td>Level3_C71</td>
						<td>
							<a href="https://en.wikipedia.org/wiki/Angular_gyrus" target="_blank" rel="noopener noreferrer">
								https://en.wikipedia.org/wiki/Angular_gyrus
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C72</td>
						<td>
							<a href="https://en.wikipedia.org/wiki/Cranial_nerve_disease#/media/File:Brain_human_normal_inferior_view_with_labels_en.svg" target="_blank" rel="noopener noreferrer">
								https://en.wikipedia.org/wiki/Cranial_nerve_disease#/media/File:Brain_human_normal_inferior_view_with_labels_en.svg
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C73</td>
						<td>OVIS created</td>
					</tr>
					<tr>
						<td>Level3_C74</td>
						<td>
							<a href="https://en.wikipedia.org/wiki/Adrenal_gland#/media/File:Illu_adrenal_gland.jpg" target="_blank" rel="noopener noreferrer">
								https://en.wikipedia.org/wiki/Adrenal_gland#/media/File:Illu_adrenal_gland.jpg
							</a>
						</td>
					</tr>
					<tr>
						<td>Level3_C75</td>
						<td>
							<a href="https://en.wikipedia.org/wiki/Adrenal_gland#/media/File:1801_The_Endocrine_System.jpg" target="_blank" rel="noopener noreferrer">
								https://en.wikipedia.org/wiki/Adrenal_gland#/media/File:1801_The_Endocrine_System.jpg
							</a>
						</td>
					</tr>
				</tbody>
			</table>
		</div>

		<!--
       <h3>{$t("images")}</h3>
    <ul>
      <li>
        <a
          href="https://www.flaticon.com"
          target="_blank"
          rel="noopener noreferrer"
          >www.flaticon.com</a
        >
      </li>
      <li>
        <a
          href="https://icon-sets.iconify.design"
          target="_blank"
          rel="noopener noreferrer"
          >https://icon-sets.iconify.design</a
        >
      </li>
    </ul>
  -->
	</section>
</div>

<style global>
	/* Links in diesem Block (inkl. {@html}-Inhalt) einfärben */
	.footer-content-box a,
	.footer-content-box .translated-link {
		color: var(--linkColor) !important;
		text-decoration: none;
	}

	.footer-content-box a:hover,
	.footer-content-box .translated-link:hover {
		text-decoration: underline;
	}

	.footer-content-box .source-table-wrapper {
		width: 100%;
		overflow-x: auto;
		margin-top: 0.75rem;
	}

	.footer-content-box .source-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
	}

	.footer-content-box .source-table th,
	.footer-content-box .source-table td {
		padding: 0.45rem 0.6rem;
		border: 1px solid rgba(0, 0, 0, 0.12);
		text-align: left;
		vertical-align: top;
	}

	.footer-content-box .source-table th {
		font-weight: 600;
	}

	.footer-content-box .source-table td:first-child {
		white-space: nowrap;
	}

	.footer-content-box .source-table td:last-child {
		word-break: break-word;
	}
</style>