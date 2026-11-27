// GPU mirror of smallBodyRadius. Directions are body-local unit vectors.
export const SMALL_BODY_SHAPE_GLSL = /* glsl */ `
uniform vec4 uSmallBody; // profile index, Y/X, Z/X, irregularity
#ifdef SMALL_BODY
float bodyBaseRadius(vec3 d) {
  vec3 s = d / vec3(1.0, uSmallBody.yz);
  float len = length(s);
  float profile = 1.0 / len;
  if (uSmallBody.x == 2.0) profile = min(profile, 0.84 / max(abs(s.x), max(abs(s.y), abs(s.z))));
  if (uSmallBody.x == 3.0) profile = 1.0 / (length(s.xz) + abs(s.y));
  if (uSmallBody.x == 4.0) {
    float c = 0.4 * abs(s.x) / len;
    profile *= c + sqrt(0.2 + c*c);
  }
  float ripple = 0.08 * sin(dot(d, vec3(3,2,-1)) + uSeedOffset.x)
               + 0.05 * sin(dot(d, vec3(1,-4,3)) + uSeedOffset.y);
  return uRadius * profile * (1.0 + uSmallBody.w * ripple);
}

// Only the tangent component is needed for a radial surface normal.
vec3 bodyBaseGradient(vec3 d) {
  vec3 t = normalize(cross(abs(d.y) < 0.9 ? vec3(0,1,0) : vec3(1,0,0), d));
  vec3 b = cross(d, t);
  const float e = 0.001;
  return (t * (bodyBaseRadius(normalize(d+e*t)) - bodyBaseRadius(normalize(d-e*t)))
        + b * (bodyBaseRadius(normalize(d+e*b)) - bodyBaseRadius(normalize(d-e*b)))) / (2.0*e);
}
#else
float bodyBaseRadius(vec3 d) { return uRadius; }
vec3 bodyBaseGradient(vec3 d) { return vec3(0.0); }
#endif
`;

export const SMALL_BODY_SURFACE_GLSL = /* glsl */ `
uniform float uSmallBodyMaterial;
vec3 smallBodyAlbedo(vec3 d, float detail, float slope) {
  vec3 p = d * 14.0 + uSeedOffset;
  float grain = clamp(0.5 + 0.5 * sin(p.x + sin(p.y)) * sin(p.z - p.y) + detail * 0.2, 0.0, 1.0);
  if (uSmallBodyMaterial == 1.0) return mix(vec3(0.025), vec3(0.105,0.095,0.087), grain);
  if (uSmallBodyMaterial == 2.0) return mix(vec3(0.12,0.10,0.09), vec3(0.44,0.40,0.33), grain);
  float ice = smoothstep(0.60, 0.84, grain + 0.15 * slope);
  if (uSmallBodyMaterial == 3.0) {
    float vein = abs(gnoise(d * 8.0 + uSeedOffset));
    float fracture = 1.0 - smoothstep(0.0, max(0.035, fwidth(vein)), vein);
    vec3 frost = mix(vec3(0.19,0.16,0.14), vec3(0.76,0.85,0.92), 0.28 + 0.72 * ice);
    return frost * (1.0 - 0.48 * fracture);
  }
  if (uSmallBodyMaterial == 4.0) return mix(vec3(0.048,0.038,0.032) * (0.7 + grain), vec3(0.65,0.73,0.78), ice * ice);
  return mix(vec3(0.13,0.095,0.073), vec3(0.40,0.32,0.24), grain);
}
`;
