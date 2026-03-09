import * as THREE from 'three'
import vertexShader from './shaders/water.vert?raw';
import fragmentShader from './shaders/water.frag?raw';

export default class Water {
    constructor(textureLoader) {

        this.params = {
            size: 150,
            waterLevel: 0,
        }

        this.createClippingPlanes();
        this.createFBOs();
        this.loadTextures(textureLoader);

        this.geometry = new THREE.PlaneGeometry(1, 1, 2, 2);
        this.geometry.rotateX(-Math.PI / 2);
        this.material = new THREE.MeshStandardMaterial({
            color: 0x3366aa,
            metalness: 0.0,
            roughness: 0.2,
            transparent: true,
        });

        this.material.onBeforeCompile = (shader) =>
        {
            shader.uniforms.uReflectionTexture = { value: this.reflectionTarget.texture };
            shader.uniforms.uRefractionTexture = { value: this.refractionTarget.texture };
            shader.uniforms.uDuDvTexture = { value: this.dudvTexture };
            shader.uniforms.uNormalMap = { value: this.normalMap };
            shader.uniforms.uMoveFactor = { value: 0.0 };
            shader.uniforms.uDepthTexture = { value: this.depthTarget.texture };

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
                `varying vec2 vUv;
                varying vec4 clipSpace;
         uniform sampler2D uReflectionTexture;
         uniform sampler2D uRefractionTexture;
         uniform sampler2D uDuDvTexture;
         uniform sampler2D uNormalMap;
         uniform sampler2D uDepthTexture;
         uniform float uMoveFactor;
         
         const float waveStrength = 1.6;
        ` + shader.fragmentShader;

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <normal_fragment_maps>',
                `#include <normal_fragment_maps>
        vec2 ndc = (clipSpace.xy / clipSpace.w) / 2.0 + 0.5;
        
        vec2 refractTexCoords = vec2(ndc.x, ndc.y);
        vec2 reflectTexCoords = vec2(ndc.x, 1.0 - ndc.y);

        vec2 distortedTexCoords = texture2D(uDuDvTexture, vec2(vUv.x + uMoveFactor, vUv.y)).rg * 0.1;
        distortedTexCoords = vUv + vec2(distortedTexCoords.x, distortedTexCoords.y + uMoveFactor);
        vec2 totalDist = (texture(uDuDvTexture, distortedTexCoords).rg * 2.0 - 1.0) * waveStrength;
        
        vec4 normalMap = texture2D(uNormalMap, distortedTexCoords);
        normal.xyz = vec3(normalMap.r * 2.0 - 1.0, normalMap.b, normalMap.g * 2.0 - 1.0);
        normal = normalize(normal);
        
        reflectTexCoords += totalDist;
        reflectTexCoords.x = clamp(reflectTexCoords.x, 0.001, 0.999);
        reflectTexCoords.y = clamp(reflectTexCoords.y, -0.999, -0.001);
        
        vec4 reflectTexture = texture2D(uReflectionTexture, reflectTexCoords);
        vec4 refractTexture = texture2D(uRefractionTexture, refractTexCoords);

        vec3 viewVector = normalize(vViewPosition);
        float refractiveFactor = 0.02 + (1.0 - 0.02) * pow(1.0 - dot(viewVector, normal), 5.0);
        refractiveFactor = pow(1.0 - refractiveFactor, 2.0);

        vec4 water = mix(reflectTexture, refractTexture, refractiveFactor);
        diffuseColor = mix(water, vec4(0.1, 0.2, 0.7, 1.0), 0.5);
        `
            );
        }

        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.scale.set(this.params.size, this.params.size, this.params.size);
        this.mesh.position.y = this.params.waterLevel;
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

        const depthTexture = new THREE.DepthTexture();
        depthTexture.type = THREE.UnsignedShortType;

        this.depthTarget = new THREE.WebGLRenderTarget(bufferWidth, bufferHeight, {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            depthTexture: depthTexture,
            depthBuffer: true
        });

        this.reflectionTarget.texture.colorSpace = THREE.SRGBColorSpace;
        this.refractionTarget.texture.colorSpace = THREE.SRGBColorSpace;
    }

    renderFBO(camera, scene, renderer) {
        this.mesh.visible = false;

        // --- RENDER REFLECTION ---
        // Mathematically flip the camera position for reflection
        const dist = (camera.position.y) * 2; // Assuming water is at Y=0
        camera.position.y -= dist;
        camera.up.set(0, -1, 0); // Flip camera orientation
        camera.updateMatrixWorld();

        renderer.clippingPlanes = [this.reflectionClipPlane];
        renderer.setRenderTarget(this.reflectionTarget);
        renderer.render(scene, camera);

        // --- RENDER REFRACTION ---
        // Reset camera to normal
        camera.position.y += dist;
        camera.up.set(0, 1, 0);
        camera.updateMatrixWorld()

        renderer.clippingPlanes = [this.refractionClipPlane];
        renderer.setRenderTarget(this.refractionTarget);
        renderer.render(scene, camera);

        renderer.setRenderTarget(this.depthTarget);
        renderer.render(scene, camera);

        renderer.setRenderTarget(null);
        renderer.clippingPlanes = [];
        this.mesh.visible = true;
    }

    createClippingPlanes() {
        this.refractionClipPlane = new THREE.Plane(new THREE.Vector3(0, this.params.waterLevel - 1, 0), 0);
        this.reflectionClipPlane = new THREE.Plane(new THREE.Vector3(0, this.params.waterLevel + 1, 0), 0);
    }

    loadTextures(loader) {
        this.dudvTexture = loader.load("public/water_dudv.png", (texture) => {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
        })

        this.normalMap = loader.load("public/water_normal.png", (texture) => {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
        })
    }
}