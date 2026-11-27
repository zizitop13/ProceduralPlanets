import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Raycaster, Vector3 } from 'three';
import { Planet, validateParams } from '../src/engine/Planet.js';
import { faceDir } from '../src/engine/PlanetWorld.js';
import { bakeGroup } from '../src/engine/PlanetBaker.js';
import { smallBodyBounds, SMALL_BODY_SHAPES } from '../src/engine/smallBodyShape.js';
import { snippetParams } from '../src/project/codeSnippet.js';
import { createTemplateParams } from '../src/project/ProjectTemplates.js';

const directions = Array.from({ length: 61 }, (_, i) => {
  const y = 1 - i / 30, r = Math.sqrt(1 - y * y);
  return new Vector3(r * Math.cos(i * 2.4), y, r * Math.sin(i * 2.4));
});

describe('irregular terrestrial surfaces', () => {
  it('resolves the Studio templates to the same parameters as the public presets', () => {
    for (const [id, preset] of Object.entries({
      'rocky-asteroid': 'rockyAsteroid', 'ridged-rubble-pile': 'ridgedRubblePile',
      'icy-ring-fragment': 'icyRingFragment', 'comet-nucleus': 'cometNucleus',
    })) {
      const body = new Planet({ preset, seed: 17 });
      expect(body.params).toEqual(createTemplateParams(id, 17));
      body.dispose();
    }
    expect(validateParams({ smallBodyWidthRatio: 0, smallBodyMaterial: 'lava' }).invalid)
      .toEqual(['smallBodyWidthRatio', 'smallBodyMaterial']);
  });

  it('keeps each seeded profile positive, bounded, seamless, and scale independent', () => {
    const body = new Planet({ radius: 1, preset: 'cometNucleus', heightScale: 0, seed: 17 });
    const profiles = new Set();
    for (const shape of SMALL_BODY_SHAPES.slice(1)) {
      body.set({ smallBodyShape: shape, smallBodyHeightRatio: 0.25, smallBodyIrregularity: 1 });
      const { inner, outer } = smallBodyBounds(1, body.uniforms.uSmallBody.value);
      const samples = directions.map(d => body.getSurfaceRadius(d));
      expect(inner).toBeGreaterThan(0);
      for (const radius of samples) {
        expect(radius).toBeGreaterThanOrEqual(inner);
        expect(radius).toBeLessThanOrEqual(outer);
      }
      profiles.add(JSON.stringify(samples));
      body.set('seed', 18);
      expect(directions.map(d => body.getSurfaceRadius(d))).not.toEqual(samples);
      body.set('seed', 17);
      expect(directions.map(d => body.getSurfaceRadius(d))).toEqual(samples);
      // Right edge of +Z meets the left edge of +X.
      for (const t of [0, 0.2, 0.5, 0.9, 1]) {
        const left = new Vector3(...faceDir(0, 1 - 1e-7, t));
        const right = new Vector3(...faceDir(2, 1e-7, t));
        expect(body.getSurfaceRadius(left)).toBeCloseTo(body.getSurfaceRadius(right), 5);
      }
    }
    expect(profiles.size).toBe(4);
    const large = new Planet({ preset: 'cometNucleus', radius: 1000, seed: 17 });
    const small = new Planet({ preset: 'cometNucleus', radius: 1, seed: 17 });
    expect(large.getSurfaceRadius(directions[8]) / 1000).toBeCloseTo(small.getSurfaceRadius(directions[8]), 8);
    small.set('heightScale', 80);
    expect(snippetParams(small.params).heightScale).toBe(80);
    body.dispose(); large.dispose(); small.dispose();
  });

  it('refines the long tip and short side on approach, including when inside the nominal sphere', () => {
    const p = new Planet({ preset: 'cometNucleus', radius: 100, heightScale: 0, maxDepth: 5 });
    const camera = new PerspectiveCamera(60, 1, 0.01, 10000);
    for (const [dir, face] of [[new Vector3(1,0,0), 2], [new Vector3(0,0,1), 0]]) {
      const surface = p.getSurfaceRadius(dir);
      const level = (altitude) => {
        camera.position.copy(dir).multiplyScalar(surface + altitude);
        camera.lookAt(0,0,0);
        p.world.update(camera.position, camera);
        return Math.max(...Array.from(p.world.chunks.values()).filter(n => n.f === face).map(n => n.level));
      };
      expect(level(1000)).toBeLessThan(5);
      expect(level(0.1)).toBe(5);
    }
    p.dispose();
  });

  it('picks a rotated, scaled lobe but misses the space above its waist', () => {
    const p = new Planet({ preset: 'cometNucleus', radius: 100, heightScale: 0, smallBodyIrregularity: 0 });
    p.position.set(80, 12, -24); p.rotation.set(0.4, 0.7, 0.2); p.scale.set(0.125, 0.25, 0.1);
    p.updateMatrixWorld();
    const cast = x => {
      const eye = p.localToWorld(new Vector3(x, 41, 200));
      const dir = new Vector3(0,0,-1).transformDirection(p.matrixWorld);
      return new Raycaster(eye, dir).intersectObject(p);
    };
    expect(cast(0)).toHaveLength(0);
    const [lobe] = cast(40);
    const local = p.worldToLocal(lobe.point.clone());
    expect(local.length()).toBeCloseTo(p.getSurfaceRadius(local), 6);
    p.dispose();
  });

  it('bakes the same painted radii sampled by the live API', async () => {
    const p = new Planet({ preset: 'cometNucleus', radius: 100, seed: 19 });
    p.paintLayers.stamp({ direction: new Vector3(0,0,1), radius: 12, planetRadius: 100, strength: 1, amount: 4 });
    const g = await bakeGroup(null, p.params, p.uniforms, { meshRes: 8, bakeColor: false, paint: p.paint });
    for (const mesh of g.children) {
      const positions = mesh.geometry.attributes.position;
      for (let i = 0; i < positions.count; i += 4) {
        const point = new Vector3().fromBufferAttribute(positions, i);
        expect(point.length()).toBeCloseTo(p.getSurfaceRadius(point), 4);
      }
      mesh.geometry.dispose(); mesh.material.dispose();
    }
    p.dispose();
  });
});
