varying vec4 clipSpace;
varying vec2 vUv;
varying vec3 toCameraVector;

uniform sampler2D uReflectionTexture;
uniform sampler2D uRefractionTexture;
uniform sampler2D uDuDvTexture;
uniform sampler2D uNormalMap;

uniform float uMoveFactor;

const float waveStrength = 1.6;

void main()
{
    vec2 ndc = (clipSpace.xy / clipSpace.w) / 2.0 + 0.5;

    vec2 refractTexCoords = vec2(ndc.x, ndc.y);
    vec2 reflectTexCoords = vec2(ndc.x, 1.0 - ndc.y);

    vec2 distortedTexCoords = texture2D(uDuDvTexture, vec2(vUv.x + uMoveFactor, vUv.y)).rg * 0.1;
    distortedTexCoords = vUv + vec2(distortedTexCoords.x, distortedTexCoords.y + uMoveFactor);
    vec2 totalDist = (texture(uDuDvTexture, distortedTexCoords).rg * 2.0 - 1.0) * waveStrength;

    refractTexCoords += totalDist;
    refractTexCoords = clamp(refractTexCoords, 0.001, 0.999);

    reflectTexCoords += totalDist;
    reflectTexCoords.x = clamp(reflectTexCoords.x, 0.001, 0.999);
    reflectTexCoords.y = clamp(reflectTexCoords.y, -0.999, -0.001);

    vec4 reflectTexture = texture2D(uReflectionTexture, reflectTexCoords);
    vec4 refractTexture = texture2D(uRefractionTexture, refractTexCoords);

    vec3 viewVector = normalize(toCameraVector);
    float refractiveFactor = dot(viewVector, vec3(0.0, 1.0, 0.0));
    refractiveFactor = pow(refractiveFactor, 10.0);

    vec4 color = mix(reflectTexture, refractTexture, refractiveFactor);
    color = mix(color, vec4(0.1, 0.2, 0.7, 1.0), 0.2);
    gl_FragColor = color;
}