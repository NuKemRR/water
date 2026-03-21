vec2 waveUV = position.xz + uTime * 0.0005;

gln_tFBMOpts opts;
opts.seed = 0.214;
opts.persistance = 0.3;
opts.lacunarity = 2.0;
opts.scale = 1.0 + uWaveScale;
opts.redistribution = 1.0;
opts.octaves = 4;
opts.terbulance = true;
opts.ridge = false;

float wave = gln_sfbm(waveUV, opts);
wave += gln_sfbm(waveUV * 2.0, opts) * 0.5;

transformed.y += wave * uWaveHeight;
clipSpace = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);