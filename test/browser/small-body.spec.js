import { test, expect } from '@playwright/test';

test('a comet template survives editing, file export, legacy import and reopen', async ({ page }, testInfo) => {
  await page.route('**/api/**', route => route.fulfill({ json: { user: null, projects: [], authenticated: false } }));
  await page.setViewportSize({ width: 900, height: 580 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Browse templates', exact: true }).click();
  await page.locator('.lp-card-main').filter({ hasText: 'Comet nucleus' }).click();
  await page.getByRole('button', { name: 'Create Comet nucleus' }).click();
  const finish = page.locator('[data-param="smallBodyMaterial"] select');
  await expect(finish).toHaveValue('cometCrust');
  await finish.selectOption('metal');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: /Download .ppplanet/ }).click();
  const file = testInfo.outputPath('nucleus.ppplanet');
  await (await download).saveAs(file);
  const input = page.locator('#topbar input[type=file]');
  await input.setInputFiles({ name: 'legacy.ppplanet', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ params: { mode: 'planet', seed: 1, radius: 800 } })) });
  await expect(page.locator('[data-param="smallBodyShape"] select')).toHaveValue('sphere');
  await input.setInputFiles(file);
  await expect(finish).toHaveValue('metal');
  await expect(page.locator('[data-param="smallBodyShape"] select')).toHaveValue('bilobed');
});

test('mesh depth follows sampled radii and leaves the comet waist open across LODs', async ({ page }) => {
  const errors = [];
  page.on('console', msg => { if (/THREE.WebGLProgram: Shader Error/.test(msg.text())) errors.push(msg.text()); });
  await page.route('**/small-body-test-host', route => route.fulfill({ contentType: 'text/html', body: '<canvas></canvas>' }));
  await page.goto('/small-body-test-host');
  const result = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { Planet, PlanetRenderer, bakePlanet } = await import('/src/lib/index.js');
    const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('canvas') });
    renderer.setSize(65, 65);
    const target = new THREE.WebGLRenderTarget(65, 65);
    const camera = new THREE.PerspectiveCamera(40, 1, 1, 3000);
    const p = new Planet({ preset: 'cometNucleus', seed: 17, radius: 100, smallBodyIrregularity: 0.15,
      heightScale: 2, octaves: 3, chunkRes: 16, maxDepth: 4, analyticTerrainDepth: true });
    const pass = new PlanetRenderer(renderer, { autoUpdate: false });
    const marker = new THREE.Mesh(new THREE.PlaneGeometry(3,3), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    const scene = new THREE.Scene();
    scene.add(marker);
    const pixel = new Uint8Array(4);
    const cameraAt = (aim, direction, distance) => {
      camera.position.copy(aim).addScaledVector(direction, distance);
      camera.lookAt(aim); camera.updateMatrixWorld();
      marker.quaternion.copy(camera.quaternion);
    };
    const aim = new THREE.Vector3(), z = new THREE.Vector3(0,0,1);
    cameraAt(aim, z, 300);
    await pass.prepare(p, camera, { target });
    renderer.autoClear = false;
    const markerVisible = position => {
      renderer.setRenderTarget(target);
      renderer.clear();
      pass.render(p, camera, { target, delta: 0 });
      if (pass.info.pending || pass.info.impostors) throw new Error('Expected live terrain');
      marker.position.copy(position);
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, 32, 32, 1, 1, pixel);
      return pixel[0] > 245 && pixel[1] < 10 && pixel[2] < 10;
    };
    const samples = [];
    for (const dir of [z, new THREE.Vector3(1,0,0), new THREE.Vector3(0.4,0.8,0.3).normalize()]) {
      cameraAt(aim, dir, 200);
      const r = p.getSurfaceRadius(dir);
      // Bracket the sampled surface within one local unit of its triangulation.
      samples.push([markerVisible(dir.clone().multiplyScalar(r-1)), markerVisible(dir.clone().multiplyScalar(r+1))]);
    }
    const waist = new THREE.Vector3(0, 42, 0);
    const lod = [];
    for (const distance of [550, 35]) {
      cameraAt(waist, z, distance);
      const visible = markerVisible(waist.clone().addScaledVector(z,-20));
      lod.push({ visible, level: Math.max(...Array.from(p.world.chunks.values(), leaf => leaf.level)) });
    }
    const baked = await bakePlanet(renderer, { planet: p, meshResolution: 8, textureSize: 64 });
    const bakedErrors = baked.children.map(face => {
      const v = new THREE.Vector3().fromBufferAttribute(face.geometry.attributes.position, 40);
      return Math.abs(v.length() - p.getSurfaceRadius(v));
    });
    baked.dispose(); pass.dispose(); p.dispose(); marker.geometry.dispose(); marker.material.dispose(); target.dispose(); renderer.dispose();
    return { samples, lod, bakedErrors };
  });
  expect(errors).toEqual([]);
  expect(result.samples).toEqual([[false,true], [false,true], [false,true]]);
  expect(result.lod.map(s => s.visible)).toEqual([true,true]);
  expect(result.lod[0].level).toBeLessThan(result.lod[1].level);
  expect(Math.max(...result.bakedErrors)).toBeLessThan(1e-4);
});
