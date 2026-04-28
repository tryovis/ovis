const step = 0.5;	//the distance for the x-axis with the T-value scale
const hGridSingleCube = 10;
const scaleSingleCube = 25;
let maxVal: number;

export function calculateTNMValues(tnmData: any) {
    let uniqueTValues = [...new Set(tnmData.map((element: { T: string; }) => String(element.T)))].sort();
    let lengthOfT = uniqueTValues.length;

    let uniqueNValues = [...new Set(tnmData.map((element: { N: string; }) => String(element.N)))].sort();
    let lengthOfN = uniqueNValues.length;

    let uniqueMValues = [...new Set(tnmData.map((element: { M: string; }) => String(element.M)))].sort();
    let lengthOfM = uniqueMValues.length;

    return { uniqueTValues, uniqueNValues, uniqueMValues, lengthOfT, lengthOfN, lengthOfM };
}

function adjustScale(scale: number, lengthOfT: number, lengthOfN: number): number {
    // Changing scale based on the number of Ts or Ns
    if (lengthOfT > 10 || lengthOfN > 10) {
        return scale - (scale / 3);
    }
    // Return the original scale if no adjustment is needed
    return scale;
}

export function isTNMVisible(selectedType: { value: string; }): boolean {
    return selectedType.value !== "hide";
}

export 	function calculateCubesPlotArea(selectedTType: { value: string; }, selectedNType: { value: string; }, 
    lengthOfT: number, lengthOfN: number, lengthOfM: number) {

    const cubeGap = 4;	//distance between two cubes
    //used for coordinates of the plot area
    let minX: number, maxX: number, minZ: number, maxZ: number, distX: number, distZ: number;

    let nIndex = lengthOfN - 1;	//index of an element in the array with Ns, starts from the last element

    // Check if only one cube remains
    const isSingleCube = (lengthOfT === 1 && lengthOfN === 1);

    if (isSingleCube) {
        // Adjust for a single cube: give a small plot area to avoid collapsing into a point
        minX = -3;  // Increase the range for the grid area
        maxX = 3;
        minZ = -3;
        maxZ = 3;
        // Create smaller grid within the plot
        distX = distZ = 4;
    } else if (isTNMVisible(selectedTType) && isTNMVisible(selectedNType)) {
        //T and N are visible
        distX = distZ = cubeGap;
        maxX = (cubeGap * (lengthOfT - 1)) / 2;
        maxZ = (cubeGap * (lengthOfN - 1)) / 2;
        minZ = -(maxZ);
    } else if (!isTNMVisible(selectedTType) && isTNMVisible(selectedNType)) {
        //T is hidden, N is visible
        maxX = (cubeGap * (lengthOfN - 1)) / 2;
        minZ = maxZ = distZ = 1;
        distX = cubeGap;
        nIndex = 0; // starts from the first element of Ns
    } else if (isTNMVisible(selectedTType) && !isTNMVisible(selectedNType)) {
        //T is visible, N is hidden
        maxX = (cubeGap * (lengthOfT - 1)) / 2;
        minZ = maxZ = distZ = 1;
        distX = cubeGap;
    } else {
        //T and N are hidden
        maxX = (cubeGap * (lengthOfM - 1)) / 2;
        minZ = maxZ = distZ = 1;
        distX = cubeGap;
    }

    minX = -(maxX);

    return { minX, maxX, minZ, maxZ, distX, distZ, nIndex };
}

export function generateCubesData(tnmData: any, scale: number, selectedTType: { value: string; }, selectedNType: { value: string; }, selectedMType: { value: string; }) {

    let { uniqueTValues, uniqueNValues, uniqueMValues, lengthOfT, lengthOfN, lengthOfM } = calculateTNMValues(tnmData);
    
    // Check if there's only one cube
    const isSingleCube = (lengthOfT === 1 && lengthOfN === 1);

	let cubesData: any[] = [];

    //maximum count of TNM
    let maxCount = Math.max(...tnmData.map((item: { count: number; }) => item.count), 0);

    const cubeIndex: any = {};
    let i = 1;	//index of a cube in the array

    let mIndex = 0;	//index of an element in the array with Ms

    let { minX, maxX, minZ, maxZ, distX, distZ, nIndex } = calculateCubesPlotArea(selectedTType, selectedNType, lengthOfT, lengthOfN, lengthOfM);

    maxVal = maxX > maxZ ? maxX : maxZ;	//largest value on the X- and Z-axes

    let hGrid = 0;
    let adjustedScale = 0;

    //if there's only one cube
    if(isSingleCube) {
        adjustedScale = scaleSingleCube;
        if (selectedMType.value !== "detail" && selectedMType.value !== "detailnull") {
            hGrid = hGridSingleCube;
        } else {
            hGrid = hGridSingleCube - 2;    //for M detailed make the height smaller due to stacking of multiple cubes
        }
    } 
    else {
        adjustedScale = adjustScale(scale, lengthOfT, lengthOfN);
        hGrid = (maxVal + 1) * 2;	//height of the grid
    }
    
    //Values of N / Z-axis
    for (let z = minZ; z <= maxZ; z += distZ) {

        let tIndex = 0;	//index of an element in the array with Ts

        //Values of T / X-axis
        for (let x = minX; x <= maxX; x += distX) {

            // If there is only one cube, set x and z to 0
            if (isSingleCube) {
                x = 0;
                z = 0;
            }

            //T and N are hidden
            if(!isTNMVisible(selectedTType) && !isTNMVisible(selectedNType)) {
                tIndex = 0;	//index of "*"
                nIndex = 0;	//index of "*"
            }

            let count: number = 0;
            let tnm: string = "";

            const itemWithCount = tnmData.find(
                    (item: { T: string; N: string; M: string; }) => 
                    item.T === uniqueTValues[tIndex] && item.N === uniqueNValues[nIndex] && item.M === uniqueMValues[mIndex]
                );

            if (itemWithCount)
                count = parseInt(itemWithCount.count);
            else {	//If item is undefined -> there was no entry with this classification (count=0)
                tIndex++;	//next element of array with Ts
                continue;
            }

            tnm = makeTNMInfo(itemWithCount);

            //scaled height of the cube
            let h: number = (count * hGrid * 0.8) / maxCount;
            
            createCubeWithTNMInfo(x, z, h, 0, i, count, tnm, cubesData, cubeIndex);
            i++;

            if(isTNMVisible(selectedTType))	//T is visible
                tIndex++;	//next element of array with Ts
            else if(!isTNMVisible(selectedTType) && isTNMVisible(selectedNType))	//T is hidden, N is visible
                nIndex++;	//next element of array with Ns
            else if(!isTNMVisible(selectedTType) && !isTNMVisible(selectedNType))	//T and N are hidden
                mIndex++;	//next element of array with Ms
        }
        if(isTNMVisible(selectedTType))
            nIndex--;	//previous element of array with Ns
    }
    
    let count: number = 0;
    let tnm: string = "";

    //Values of M / Y-axis
    for (let y = 1; y < lengthOfM; y++) {

        if(!isTNMVisible(selectedMType) || (!isTNMVisible(selectedTType) && !isTNMVisible(selectedNType)))	//M is hidden or T and N are hidden
            break;

        for (let k = 1; k < i; k++) {

            let baseCubeTNM: string = cubesData[k-1].tnm;
            let tValue: string = "", nValue: string = "";

            // Ensure tnm is defined and is a string
              if (baseCubeTNM && typeof baseCubeTNM === 'string') {
                // Define a regular expression pattern to match T and N values
                const pattern = /(?:T(\w+|\d+))?\s*(?:N(\w+|\d+))?\s*(?:M(\w+|\d+))?/;
            
                // Use the match method to extract T and N values
                const matches = baseCubeTNM.match(pattern);

                // Check if there are matches and extract the values
                if (matches) {
                    tValue = matches[1] || '*';
                    nValue = matches[2] || '*';
                }
              }

            // Use the find method to find the count with matching T, N, and M values
            const itemWithCount = tnmData.find(
                (item: { T: string; N: string; M: string; }) => item.T === tValue && item.N === nValue && item.M === uniqueMValues[y]
            );

            // Check if the item was found and then access its 'count' property
            if (itemWithCount)
                count = itemWithCount.count; //count of TNM
            else {	//If item is undefined -> there was no entry with this classification (count=0)
                continue;
            }

            tnm = makeTNMInfo(itemWithCount);

            //scaled height of the cube
            let h: number = (count * hGrid * 0.8) / maxCount;

            const baseCube = cubeIndex[k];
            createCubeWithTNMInfo(baseCube.x, baseCube.z, h, baseCube.h, k, count, tnm, cubesData, cubeIndex);
        }
    }

    return { cubesData, maxVal, adjustedScale };
}

function makeTNMInfo(itemWithCount: any): string {
    const t = itemWithCount.T === '*' ? '' : `T${itemWithCount.T} `;
    const n = itemWithCount.N === '*' ? '' : `N${itemWithCount.N} `;
    const m = itemWithCount.M === '*' ? '' : `M${itemWithCount.M}`;

    return `${t}${n}${m}`;
}

function createCubeWithTNMInfo(x: number, z: number, height: number, heightBaseCube: number, index: number, 
    count: number, tnm: string, cubesData: any[], cubeIndex: any): void {

    const cube = makeCube(-height, x, z, heightBaseCube);
    cubeIndex[index] = { h: -height + heightBaseCube, x: x, z: z };	//height is a sum of the height of the base and the additional cube

    cube.id = `cube_${cubesData.length}`;
    cube.count = count;
    cube.tnm = tnm;
    cubesData.push(cube);
}

function makeCube(h: number, x: number, z: number, startHeigt: number): any {
    return [
        { x: x - 1, y: h + startHeigt, z: z + 1 }, // FRONT TOP LEFT
        { x: x - 1, y: startHeigt, z: z + 1 }, // FRONT BOTTOM LEFT
        { x: x + 1, y: startHeigt, z: z + 1 }, // FRONT BOTTOM RIGHT
        { x: x + 1, y: h + startHeigt, z: z + 1 }, // FRONT TOP RIGHT
        { x: x - 1, y: h + startHeigt, z: z - 1 }, // BACK  TOP LEFT
        { x: x - 1, y: startHeigt, z: z - 1 }, // BACK  BOTTOM LEFT
        { x: x + 1, y: startHeigt, z: z - 1 }, // BACK  BOTTOM RIGHT
        { x: x + 1, y: h + startHeigt, z: z - 1 } // BACK  TOP RIGHT
    ];
}

export function generateGridData(tnmData: any, selectedTType: { value: string; }, selectedNType: { value: string; }) {
    const startVal = maxVal + 1;
    let xGridData: any[] = [];
	let yGridData: any[] = [];
	let zGridData: any[] = [];

    let xLineData: { x: number; y: number; z: number; }[] = [];
	let zLineData: { x: number; y: number; z: number; }[] = [];
    let { lengthOfT, lengthOfN, lengthOfM } = calculateTNMValues(tnmData);

    for (let z = -startVal; z <= startVal; z += 2) {
        for (let x = -startVal; x <= startVal; x += 2) {
            xGridData.push({ x: x, y: 0, z: z});
        }
        for (let y = -startVal * 2; y <= 0; y += 2) {
            yGridData.push({ x: startVal, y: y, z: -z});
        }
    }

    for (let y = -startVal * 2; y <= 0; y += 2) {
        for (let x = -startVal; x <= startVal; x += 2) {
            zGridData.push({ x: x, y: y, z: -startVal});
        }
    }

    let { maxZ } = calculateCubesPlotArea(selectedTType, selectedNType, lengthOfT, lengthOfN, lengthOfM);

    for (let i = -startVal; i <= startVal; i+= step) {
        xLineData.push({ x: i, y: 0, z: maxZ + 1 });
    }

    for (let i = -startVal; i <= startVal; i++) {
        zLineData.push({ x: -startVal, y: 0, z: i });
    }

    return { xGridData, yGridData, zGridData, xLineData, zLineData };
}