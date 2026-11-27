// Shape codes are shared with the terrain shaders. X is the nominal long axis.
export const SMALL_BODY_SHAPES = ['sphere', 'ellipsoid', 'fragment', 'spinningTop', 'bilobed'];
export const SMALL_BODY_MATERIALS = ['silicate', 'carbon', 'metal', 'dirtyIce', 'cometCrust'];

// The profile and ripple are continuous in direction across all six cube faces.
// Keep the CPU evaluator and smallBodyGLSL together when changing a profile.
export function smallBodyRadius(radius, shape, seed, x, y, z) {
  if (shape.x === 0) return radius;
  const sy = y / shape.y, sz = z / shape.z;
  const length = Math.hypot(x, sy, sz);
  let profile = 1 / length;
  if (shape.x === 2) {
    // Clip the ellipsoid with three pairs of planes.
    profile = Math.min(profile, 0.84 / Math.max(Math.abs(x), Math.abs(sy), Math.abs(sz)));
  } else if (shape.x === 3) {
    profile = 1 / (Math.hypot(x, sz) + Math.abs(sy));
  } else if (shape.x === 4) {
    // Union of two overlapping spheres in ellipsoid space. Both contain the origin.
    const center = 0.4 * Math.abs(x) / length;
    profile *= center + Math.sqrt(0.2 + center * center);
  }
  const ripple = 0.08 * Math.sin(3 * x + 2 * y - z + seed.x)
               + 0.05 * Math.sin(x - 4 * y + 3 * z + seed.y);
  return radius * profile * (1 + shape.w * ripple);
}

export function smallBodyBounds(radius, shape) {
  if (shape.x === 0) return { inner: radius, outer: radius };
  const minimum = [1, 1, 0.84, Math.SQRT1_2, Math.sqrt(0.2)][shape.x];
  const variation = 0.13 * shape.w;
  return {
    inner: radius * Math.min(shape.y, shape.z) * minimum * (1 - variation),
    outer: radius * (1 + variation),
  };
}
