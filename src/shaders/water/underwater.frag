uniform float uTime;
uniform float uStrength;
uniform vec2 uSpeed;
uniform sampler2D tDiffuse;
uniform float uUnderwaterFactor;

varying vec2 vUv;

void main() {

    vec2 uv = vUv;
    uv.x += sin(uv.x * (uSpeed.x * 0.01) + uTime);
    uv.y += -cos(uv.y * (uSpeed.y * 0.01) + uTime);

    gln_tFBMOpts opts;
    opts.seed = 0.1;
    opts.persistance = 0.8;
    opts.lacunarity = 3.0;
    opts.scale = 1.0;
    opts.redistribution = 2.0;
    opts.octaves = 3;
    opts.terbulance = false;
    opts.ridge = false;

    float n = gln_sfbm(uv, opts);
    vec2 noise = vec2(n);

    vec4 original = texture2D(tDiffuse, vUv);
    vec4 distorted = texture2D(tDiffuse, vUv + noise * (uStrength / 100.0));
    distorted.rgb *= vec3(0.2, 0.43, 0.76);

    gl_FragColor = mix(original, distorted, uUnderwaterFactor);
}