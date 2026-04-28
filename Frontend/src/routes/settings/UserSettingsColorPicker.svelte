<script lang="ts">
	import { onMount } from 'svelte';

	import { userStore } from '../../store/userStore';
	import { updateUser } from '../../graphQl/gql-userManagement';
	import { colorArrays } from '../../components/ColorArray.js';

	let primaryColor: string;
	let colorPalette: string[];
	let paletteName: string;
	let currentUser: string;

	userStore.subscribe((value: any) => {
		({ primaryColor, colorPalette, paletteName, currentUser } = value);
	});

	let tmpPrimaryColor: string;

	//TODO: Funktion kommt auch in QuicktoolsLogo for => Duplette
	function hexToRgb(hex) {
		var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);

		return result
			? {
					r: parseInt(result[1], 16),

					g: parseInt(result[2], 16),

					b: parseInt(result[3], 16)
			  }
			: null;
	}

	onMount(() => {
		console.log('PaletteName', paletteName);
		console.log('Primary Color', primaryColor);
		tmpPrimaryColor = primaryColor;
	});

	let selectedColorArray: string[] = colorArrays[0].colors; // Default color array

	function setColorArray(colorArray: string[], name: string) {
		selectedColorArray = colorArray;
		paletteName = name;

		let input = { colorTheme: name }; // Das zu aktualisierende Feld und der neue Wert

		updateUser(currentUser, input).then((response) => {
			userStore.update((storeValues) => {
				storeValues.colorPalette = colorArray;
				storeValues.primaryColor = colorArray[0];
				storeValues.primaryColorRGB = hexToRgb(colorArray[0]);
				storeValues.paletteName = paletteName;
				return storeValues;
			});
		});
	}
</script>

<div class="labeldiv">
	<label style="width:100px" for="colorPicker"><b>Color Theme:</b></label>
</div>

{#each colorArrays as { name, colors }, index}
	<div class="themediv">
		<input
			type="radio"
			id="html{index}"
			name="fav_language"
			on:change={() => setColorArray(colors, name)}
			checked={paletteName === name}
		/>
		{#each colors as color, index (color)}
			<span style="background-color: {color}" class="color-point" />
		{/each}
		<p>{name}</p>
	</div>
{/each}

<style>
	.labeldiv {
		display: flex;
		align-items: center;
	}
	.themediv {
		display: flex;
		align-items: center;
		margin-left: 100px;
	}

	label {
		margin-right: 10px;
	}

	input {
		margin-right: 10px;
	}

	p {
		margin-bottom: 5px; /* Füge Platz unter dem Schriftzug hinzu */
	}

	/* Neuer Stil für die farbigen Punkte */
	.color-points {
		display: flex;
		margin-top: 10px;
	}

	.color-point {
		width: 20px;
		height: 20px;
		margin-right: 5px;
		border: 1px solid #000; /* Optional: Füge einen Rand hinzu */
	}
</style>
