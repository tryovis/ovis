<script lang="ts">
	// @ts-nocheck
    import { onMount, afterUpdate, onDestroy } from 'svelte';
    import { userStore } from '../../store/userStore';
    import { variantStore } from '../../store/variantStore.js';
    import { publicAssetPath } from '$lib/path-utils';
    
    let isCCP: boolean = false;
    let svgPath = publicAssetPath('/Ovis_logo.svg');
    let svgPathCCP = publicAssetPath('/CCP_logo.svg');
    let colorPalette: string[] = [];
    let logoContainer: HTMLDivElement | null = null;
    let svgObject: SVGSVGElement | null = null;
    let mounted = false;
    let loadToken = 0;
    
    // Abonnement auf den Zustand
    variantStore.subscribe((value: any) => {
      ({ isCCP } = value);
      // Wenn sich der Zustand ändert, rufen Sie updateColors() erneut auf
      if (mounted) {
        destroySVG();
        createSVG();
      }
    });
    
    // Abonnement auf colorPalette im userStore
    userStore.subscribe((value: any) => {
      const { colorPalette: newColorPalette } = value;
      if (JSON.stringify(newColorPalette) !== JSON.stringify(colorPalette)) {
        colorPalette = newColorPalette;
        // Wenn sich der Zustand ändert, zerstöre das SVG-Element und erstelle es neu
        if (mounted) {
          destroySVG();
          createSVG();
        }
      }
    });
    
    onMount(() => {
      mounted = true;
      void createSVG();
    });
    
    // Funktion zum Erstellen des SVG-Elements
    async function createSVG() {
      const container = logoContainer;
      if (!container) return;

      const token = ++loadToken;
      const source = isCCP ? svgPathCCP : svgPath;

      try {
        const response = await fetch(source);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const parsedDocument = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
        if (parsedDocument.querySelector('parsererror')) throw new Error('Invalid SVG document');

        parsedDocument.querySelectorAll('script, foreignObject').forEach((element) => element.remove());
        const parsedSvg = parsedDocument.documentElement;
        if (parsedSvg.tagName.toLowerCase() !== 'svg' || token !== loadToken) return;

        const svg = document.importNode(parsedSvg, true) as SVGSVGElement;
        svg.id = 'logoSvg';
        svg.classList.add('bodymap');
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        svg.style.width = '100%';
        svg.style.height = 'auto';
        svg.style.maxWidth = '100%';
        svg.style.maxHeight = '100%';
        svg.style.display = 'block';
        svg.style.setProperty('background', 'transparent', 'important');

        const mount = container.shadowRoot ?? container.attachShadow({ mode: 'open' });
        mount.replaceChildren(svg);
        svgObject = svg;
        updateColors();
      } catch (error) {
        if (token !== loadToken) return;
        console.error('Failed to load logo:', source, error);

        const fallbackImg = document.createElement('img');
        fallbackImg.src = source;
        fallbackImg.alt = 'OVIS Logo';
        fallbackImg.style.width = '100%';
        fallbackImg.style.height = 'auto';
        fallbackImg.style.background = 'transparent';
        const mount = container.shadowRoot ?? container.attachShadow({ mode: 'open' });
        mount.replaceChildren(fallbackImg);
        svgObject = null;
      }
    }
    
    // Funktion zum Zerstören des SVG-Elements
    function destroySVG() {
      loadToken++;
      svgObject = null;
      logoContainer?.shadowRoot?.replaceChildren();
    }
    
    // Funktion zum Aktualisieren der Farben
    function updateColors() {
      if (svgObject) {
        const pfadeC1 = svgObject.querySelectorAll<SVGElement>('[id^="c1"]');
        pfadeC1.forEach(function(pfad) {
          if (colorPalette[0]) pfad.style.fill = colorPalette[0];
        });
        const pfadeC2 = svgObject.querySelectorAll<SVGElement>('[id^="c2"]');
        pfadeC2.forEach(function(pfad) {
          if (colorPalette[1]) pfad.style.fill = colorPalette[1];
        });
      }
    }
    
    // Nachdem das Update abgeschlossen ist, aktualisieren Sie die Farben erneut
    afterUpdate(() => {
      if (mounted) {
        updateColors();
      }
    });
    
    // Zerstöre das SVG-Element, wenn die Komponente zerstört wird
    onDestroy(() => {
      destroySVG();
    });
    
    // Hilfsfunktion, um zu überprüfen, ob die Komponente montiert ist
    function isMounted() {
      return mounted;
    }
  </script>
  
  <div bind:this={logoContainer} id="svgContainer" class="logo-container"></div>
  
  <style>
    .logo-container {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
    }
    
    .logo-container :global(.bodymap) {
      width: 100%;
      height: auto;
      max-width: 100%;
      max-height: 100%;
      background: transparent !important;
    }
  </style>
