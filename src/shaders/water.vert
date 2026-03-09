varying vec4 clipSpace;
varying vec2 vUv;
varying vec3 toCameraVector;

uniform vec3 uCamPos;

const float tiling = 4.0;

void main() {
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectedPosition = projectionMatrix * viewPosition;

    clipSpace = projectedPosition;

    vUv = uv * tiling;

    toCameraVector = uCamPos - modelPosition.xyz;

    gl_Position = clipSpace;
}