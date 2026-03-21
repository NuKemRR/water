vec2 ndc = (clipSpace.xy / clipSpace.w) / 2.0 + 0.5;
vec2 refractUV = vec2(ndc.x, ndc.y);
vec2 reflectUV = vec2(ndc.x, 1.0 - ndc.y);

float depth = texture2D(uDepthTexture, refractUV).r;
float floorDistance = 2.0 * uNear * uFar / (uFar + uNear - (2.0 * depth - 1.0) * (uFar - uNear));

depth = gl_FragCoord.z;
float waterDistance = 2.0 * uNear * uFar / (uFar + uNear - (2.0 * depth - 1.0) * (uFar - uNear));
float waterDepth = floorDistance - waterDistance;

vec2 distortedUV = texture2D(uDuDvTexture, vec2(vUv.x + uMoveFactor, vUv.y)).rg * 0.1;
distortedUV = vUv + vec2(distortedUV.x, distortedUV.y + uMoveFactor);
vec2 totalDistortion = (texture2D(uDuDvTexture, distortedUV).rg * 2.0 - 1.0) * uWaveStrength;

totalDistortion *= clamp(waterDepth * 0.9, 0.0, 1.0);

refractUV += totalDistortion;
refractUV = clamp(refractUV, 0.001, 0.999);

reflectUV += totalDistortion;
reflectUV.x = clamp(reflectUV.x, 0.001, 0.999);
reflectUV.y = clamp(reflectUV.y, 0.001, 0.999);

vec4 reflectTexture = texture2D(uReflectionTexture, reflectUV);
vec4 refractTexture = texture2D(uRefractionTexture, refractUV);

vec4 normalMap = texture2D(uNormalMap, distortedUV);
normal.xyz = vec3(normalMap.r * 2.0 - 1.0, normalMap.b * 2.0 - 1.0, normalMap.g * 2.0 - 1.0);
normal = normalize(normal);

vec3 viewVector = normalize(vViewPosition);
float fresnel = dot(viewVector, normal);
fresnel = pow(fresnel, 8.0);
fresnel = clamp(fresnel, 0.0, 1.0);

vec4 water = mix(reflectTexture, refractTexture, fresnel);
diffuseColor = mix(water, vec4(uColor, 1.0), 0.2);
diffuseColor.a = clamp(waterDepth * 0.9, 0.0, 1.0);