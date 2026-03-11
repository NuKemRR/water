import * as THREE from 'three'

export default class Water {
    constructor(textureLoader, camera) {

        this.params = {
            size: 30,
            waterLevel: 0,
            color: new THREE.Color(0.1, 0.3, 1.0),
            moveFactor: 0.05,
            waveStrength: 0.03,
            showDepth: true,
        }

        this.createClippingPlanes();
        this.createFBOs();
        this.loadTextures(textureLoader);

        this.geometry = new THREE.PlaneGeometry(1, 1, 1, 1);
        this.geometry.rotateX(-Math.PI / 2);
        this.material = new THREE.MeshStandardMaterial({
            metalness: 0.0,
            roughness: 0.2,
            transparent: true,
            depthTest: true,
            depthWrite: false,
        });

        this.material.onBeforeCompile = (shader) => {
            shader.uniforms.uReflectionTexture = {value: this.reflectionTarget.texture};
            shader.uniforms.uRefractionTexture = {value: this.refractionTarget.texture};
            shader.uniforms.uDepthTexture = {value: this.refractionTarget.depthTexture};
            shader.uniforms.uDuDvTexture = {value: this.dudvTexture};
            shader.uniforms.uNormalMap = {value: this.normalMap};
            shader.uniforms.uMoveFactor = {value: this.params.moveFactor};
            shader.uniforms.uWaveStrength = {value: this.params.waveStrength};
            shader.uniforms.uColor = {value: this.params.color};
            shader.uniforms.uNear = {value: camera.near};
            shader.uniforms.uFar = {value: camera.far};

            this.material.userData.shader = shader;

            shader.vertexShader = shader.vertexShader.replace(
                '#include <uv_vertex>',
                `
                #include <uv_vertex>
                vUv = uv * 2.0;`);

            shader.vertexShader =
                `varying vec2 vUv;\n` + shader.vertexShader;

            shader.vertexShader = `
varying vec4 clipSpace;
${shader.vertexShader}
`.replace(
                '#include <begin_vertex>',
                `#include <begin_vertex>
  clipSpace = projectionMatrix * viewMatrix * vec4(transformed, 1.0);`
            );

            shader.fragmentShader =
                `
         varying vec2 vUv;
         varying vec4 clipSpace;
         uniform sampler2D uReflectionTexture;
         uniform sampler2D uRefractionTexture;
         uniform sampler2D uDuDvTexture;
         uniform sampler2D uDepthTexture;
         uniform sampler2D uNormalMap;
         uniform vec3 uColor;
         uniform float uMoveFactor;
         uniform float uWaveStrength;
         uniform float uNear;
         uniform float uFar;
        ` + shader.fragmentShader;

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <normal_fragment_maps>',
                `#include <normal_fragment_maps>
        vec2 ndc = (clipSpace.xy / clipSpace.w) / 2.0 + 0.5;
        vec2 refractUV = vec2(ndc.x, ndc.y);
        vec2 reflectUV = vec2(ndc.x, -ndc.y);
        
        float depth = texture2D(uDepthTexture, refractUV).r;
        float floorDistance = 2.0 * uNear * uFar / (uFar + uNear - (2.0 * depth - 1.0) * (uFar - uNear));

        depth = gl_FragCoord.z;
        float waterDistance = 2.0 * uNear * uFar / (uFar + uNear - (2.0 * depth - 1.0) * (uFar - uNear));
        float waterDepth = floorDistance - waterDistance;
        
        vec2 distortedUV = texture(uDuDvTexture, vec2(vUv.x + uMoveFactor, vUv.y)).rg * 0.1;
        distortedUV = vUv + vec2(distortedUV.x, distortedUV.y + uMoveFactor);
        vec2 totalDistortion = (texture2D(uDuDvTexture, distortedUV).rg * 2.0 - 1.0) * uWaveStrength;
        
        totalDistortion *= clamp(waterDepth / 5.0, 0.0, 1.0);
        
        refractUV += totalDistortion;
        refractUV = clamp(refractUV, 0.001, 0.999);
        
        reflectUV += totalDistortion;
        reflectUV.x = clamp(reflectUV.x, 0.001, 0.999);
        reflectUV.y = clamp(reflectUV.y, -0.999, -0.001);
        
        vec4 reflectTexture = texture(uReflectionTexture, reflectUV);
        vec4 refractTexture = texture(uRefractionTexture, refractUV);
        
        vec4 normalMap = texture2D(uNormalMap, distortedUV);
        normal.xyz = vec3(normalMap.r * 2.0 - 1.0, normalMap.b, normalMap.g * 2.0 - 1.0);
        normal = normalize(normal);

        vec3 viewVector = normalize(vViewPosition);
        float refractiveFactor = dot(viewVector, normal);
        refractiveFactor = pow(refractiveFactor, 2.0);

        vec4 water = mix(reflectTexture, refractTexture, refractiveFactor);
        diffuseColor = mix(water, vec4(uColor, 1.0), 0.5);
        diffuseColor.a = clamp(waterDepth / 5.0, 0.0, 1.0);
        `
            );
        }

        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.scale.set(this.params.size, this.params.size, this.params.size);
        this.mesh.position.y = this.params.waterLevel;
        this.mesh.scale.set(this.params.size, 1, this.params.size)
    }

    getMesh() {
        return this.mesh;
    }

    update(camera) {

    }

    createFBOs() {
        const bufferWidth = window.innerWidth;
        const bufferHeight = window.innerHeight;

        this.reflectionTarget = new THREE.WebGLRenderTarget(bufferWidth, bufferHeight, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
        });

        this.refractionTarget = new THREE.WebGLRenderTarget(bufferWidth, bufferHeight, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
        });
        this.refractionTarget.depthTexture = new THREE.DepthTexture(bufferWidth, bufferHeight);
        this.refractionTarget.depthTexture.type = THREE.FloatType;
        this.refractionTarget.depthTexture.format = THREE.DepthFormat;

        this.reflectionTarget.texture.colorSpace = THREE.SRGBColorSpace;
        this.refractionTarget.texture.colorSpace = THREE.SRGBColorSpace;
    }

    renderFBO(camera, scene, renderer) {
        this.mesh.visible = false;

        const originalQuaternion = camera.quaternion.clone();

        // Reflection
        const dist = 2 * (camera.position.y - this.params.waterLevel);
        camera.position.y -= dist;
        camera.up.set(0, -1, 0);
        camera.updateMatrixWorld();

        renderer.clippingPlanes = [this.reflectionClipPlane];
        renderer.setRenderTarget(this.reflectionTarget);
        renderer.render(scene, camera);

        // Refraction
        camera.position.y += dist;
        camera.up.set(0, 1, 0);
        camera.quaternion.copy(originalQuaternion);  // restore original orientation
        camera.updateMatrixWorld();

        renderer.clippingPlanes = [this.refractionClipPlane];
        renderer.setRenderTarget(this.refractionTarget);
        renderer.render(scene, camera);

        renderer.clippingPlanes = [];
        renderer.setRenderTarget(null);

        this.mesh.visible = true;
    }

    createClippingPlanes() {
        this.refractionClipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), this.params.waterLevel + 1);
        this.reflectionClipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.params.waterLevel + 1);
    }

    loadTextures(loader) {
        this.dudvTexture = loader.load("/water_dudv.png", (texture) => {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
        })

        this.normalMap = loader.load("/water_normal.png", (texture) => {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
        })
    }
}