import * as THREE from 'three';

export function makeSky(top: string, bottom: string, sunDir: THREE.Vector3): THREE.Mesh {
  const geo = new THREE.SphereGeometry(4000, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(top) },
      bottom: { value: new THREE.Color(bottom) },
      sunDir: { value: sunDir.clone().normalize() },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * p;
        gl_Position.z = gl_Position.w;
      }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 bottom; uniform vec3 sunDir;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, -0.2, 1.0);
        float k = pow(max(h, 0.0), 0.55);
        // retro: flat horizontal colour bands like an 8-bit sky
        k = floor(k * 6.0 + 0.5) / 6.0;
        vec3 c = mix(bottom, top, k);
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        c += vec3(1.0, 0.95, 0.8) * step(0.9985, s) * 1.6;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

export function makeWaterMaterial(color: string, sunDir: THREE.Vector3, opacity = 0.9): THREE.ShaderMaterial {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      time: { value: 0 },
      base: { value: new THREE.Color(color) },
      deep: { value: new THREE.Color(color).multiplyScalar(0.55) },
      sunDir: { value: sunDir.clone().normalize() },
      opacity: { value: opacity },
    },
  ]);
  return new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    fog: true,
    vertexShader: `
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float time; uniform vec3 base; uniform vec3 deep; uniform vec3 sunDir; uniform float opacity;
      varying vec3 vWorld;
      #include <fog_pars_fragment>
      void main() {
        vec2 p = vWorld.xz;
        float w1 = sin(p.x * 0.35 + time * 1.3) * cos(p.y * 0.28 - time * 1.1);
        float w2 = sin((p.x + p.y) * 0.9 + time * 2.1) * 0.5;
        vec3 n = normalize(vec3(w1 * 0.12 + w2 * 0.06, 1.0, (w2 - w1) * 0.1));
        vec3 v = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
        vec3 r = reflect(-v, n);
        float spec = pow(max(dot(r, sunDir), 0.0), 120.0);
        vec3 c = mix(deep, base, 0.5 + 0.5 * w1 * 0.4);
        c = mix(c, vec3(0.85, 0.93, 1.0), fres * 0.55) + spec * 1.2;
        gl_FragColor = vec4(c, opacity);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}

export function litMaterial(quality: string, params: THREE.MeshStandardMaterialParameters): THREE.Material {
  if (quality === 'low') {
    const { roughness: _r, metalness: _m, ...rest } = params;
    return new THREE.MeshLambertMaterial(rest as THREE.MeshLambertMaterialParameters);
  }
  return new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...params });
}
