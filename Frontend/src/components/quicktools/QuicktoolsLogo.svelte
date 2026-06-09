<script lang="ts">
	// @ts-nocheck
    import { onMount, afterUpdate, onDestroy } from 'svelte';
    import { userStore } from '../../store/userStore';
    import { variantStore } from '../../store/variantStore.js';
    import { publicAssetPath } from '$lib/path-utils';
    
    let isCCP: boolean = false;
    let svgPath = publicAssetPath('/Ovis_logo.svg');
    let svgPathCCP = publicAssetPath('/CCP_logo.svg');
    let primaryColor: string = "#29b8ff";
    let colorPalette: string[] = [];
    let svgObject: HTMLElement | null = null;
    let mounted = false;
    
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
      const { primaryColor, colorPalette: newColorPalette } = value;
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
      // Erstelle das SVG-Element beim ersten Rendern der Komponente
      createSVG();
      mounted = true;
    });
    
    // Funktion zum Erstellen des SVG-Elements
    function createSVG() {
      const container = document.getElementById('svgContainer');
      if (container) {
        container.innerHTML = '';
        const svg = document.createElement('object');
        svg.id = 'logoSvg';
        svg.type = 'image/svg+xml';
        svg.data = isCCP ? svgPathCCP : svgPath;
        svg.classList.add('bodymap');
        
        // Add error handling for logo loading
        svg.onerror = function() {
          console.error('Failed to load logo:', svg.data);
          // Fallback to regular img tag
          const fallbackImg = document.createElement('img');
          fallbackImg.src = svgPath;
          fallbackImg.alt = 'OVIS Logo';
          fallbackImg.style.width = '100%';
          fallbackImg.style.height = 'auto';
          container.innerHTML = '';
          container.appendChild(fallbackImg);
        };
        
        container.appendChild(svg);
        svgObject = svg;
        updateColors();
      }
    }
    
    // Funktion zum Zerstören des SVG-Elements
    function destroySVG() {
      if (svgObject) {
        svgObject.remove();
      }
    }
    
    // Funktion zum Aktualisieren der Farben
    function updateColors() {
      if (svgObject) {
        svgObject.addEventListener('load', function() {
          var svgDoc = svgObject!.contentDocument;
          var pfadeC1 = svgDoc!.querySelectorAll('[id^="c1"]');
          pfadeC1.forEach(function(pfad) {
            pfad.style.fill = colorPalette[0];
          });
          var pfadeC2 = svgDoc!.querySelectorAll('[id^="c2"]');
          pfadeC2.forEach(function(pfad) {
            pfad.style.fill = colorPalette[1];
          });
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
  
  <div id="svgContainer" class="logo-container"></div>
  
  <style>
    .logo-container {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .logo-container :global(.bodymap) {
      width: 100%;
      height: auto;
      max-width: 100%;
      max-height: 100%;
    }
  </style>
  