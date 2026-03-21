import * as THREE from 'three'
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer.js'
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass.js'
import {ShaderPass} from 'three/examples/jsm/postprocessing/ShaderPass.js'
import common from './shaders/common.glsl?raw'
import simplex from './shaders/simplex.glsl?raw'
import waterVertex from './shaders/water/water.vert?raw'
import waterFragment from './shaders/water/water.frag?raw'
import underwaterVertex from './shaders/water/underwater.vert?raw'
import underwaterFragment from './shaders/water/underwater.frag?raw'
import {OutputPass} from 'three/examples/jsm/postprocessing/OutputPass.js'

export default class Water {
    constructor(textureLoader, camera, scene, renderer) {

        this.params = {
            size: 30,
            waterLevel: 0,
            color: new THREE.Color(0.34, 0.4, 0.8),
            moveFactor: 0.05,
            waveStrength: 0.03,
            underwaterFactor: 0.01,
            waterWaveHeight: 0.0,
        }

        this.underwaterShader = {

            uniforms: {
                tDiffuse: {value: null},
                uTime: {value: 0.0},
                uStrength: {value: 2.0},
                uSpeed: {value: new THREE.Vector2(0.03, 0.07)},
                uUnderwaterFactor: {value: 0.5},
            },

            vertexShader: underwaterVertex,

            fragmentShader: `${common}\n${simplex}\n${underwaterFragment}`
        }

        this.composer = new EffectComposer(renderer)

        this.renderPass = new RenderPass(scene, camera)
        this.composer.addPass(this.renderPass)

        this.underwaterPass = new ShaderPass(this.underwaterShader)
        this.underwaterPass.enabled = false

        this.composer.addPass(this.underwaterPass)

        this.createClippingPlanes();
        this.createFBOs();
        this.loadTextures(textureLoader);

        this.geometry = new THREE.PlaneGeometry(1, 1, 128, 128);
        this.geometry.rotateX(-Math.PI / 2);
        this.material = new THREE.MeshStandardMaterial({
            metalness: 0.0,
            roughness: 0.2,
            transparent: true,
            depthTest: true,
            depthWrite: false,
            wireframe: false,
        });

        this.material.onBeforeCompile = (shader) => {
            shader.uniforms.uTime = {value: 0.0};
            shader.uniforms.uWaveHeight = {value: this.params.waterWaveHeight};
            shader.uniforms.uWaveScale = {value: 1.0};
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
            shader.uniforms.uFoamDepth = { value: 0.5 };      // depth threshold where foam appears
            shader.uniforms.uFoamStrength = { value: 2.0 };   // foam brightness
            shader.uniforms.uFoamSpeed = { value: 0.1 };      // how fast foam animates

            this.material.userData.shader = shader;

            shader.vertexShader = shader.vertexShader.replace(
                '#include <uv_vertex>',
                `
                #include <uv_vertex>
                vUv = uv * 2.0;`);

            shader.vertexShader =
                `${common}${simplex}\n
                varying vec2 vUv;
                
                uniform float uTime;
                uniform float uWaveHeight;
                uniform float uWaveScale;\n` + shader.vertexShader;

            shader.vertexShader = `varying vec4 clipSpace;${shader.vertexShader}`.replace('#include <begin_vertex>', `#include <begin_vertex>\n${waterVertex}`);

            // Fragment - Uniforms
            shader.fragmentShader =
                `${common}\n${simplex}\n
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
         uniform float uFoamDepth;
         uniform float uFoamStrength;
         uniform float uFoamSpeed;
        ` + shader.fragmentShader;

            shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${waterFragment}`);
        }

        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.scale.set(this.params.size, this.params.size, this.params.size);
        this.mesh.position.y = this.params.waterLevel;
        this.mesh.scale.set(this.params.size, 1, this.params.size)

        this.outputPass = new OutputPass();
        this.composer.addPass(this.outputPass);

        this.underwaterPass.enabled = true;
    }

    getMesh() {
        return this.mesh;
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

    renderFBO(camera, scene, renderer, time) {

        if (this.material.userData.shader) {
            this.material.userData.shader.uniforms.uTime.value = time;
        }

        this.mesh.visible = false;

        this.refractionClipPlane.constant = this.params.waterLevel;
        this.reflectionClipPlane.constant = -this.params.waterLevel;

        const originalPosition = camera.position.clone();
        const originalQuaternion = camera.quaternion.clone();
        const originalUp = camera.up.clone();

        const waterLevel = this.params.waterLevel;

        const normal = new THREE.Vector3(0, 1, 0);
        const planePoint = new THREE.Vector3(0, waterLevel, 0);

        /* ======================
           REFLECTION PASS
        ====================== */

        const camPos = camera.position.clone();
        const toPlane = camPos.clone().sub(planePoint);

        const reflectedPos = camPos.clone().sub(
            normal.clone().multiplyScalar(2 * toPlane.dot(normal))
        );

        const lookDir = new THREE.Vector3();
        camera.getWorldDirection(lookDir);

        const target = camPos.clone().add(lookDir);
        const targetToPlane = target.clone().sub(planePoint);

        const reflectedTarget = target.clone().sub(
            normal.clone().multiplyScalar(2 * targetToPlane.dot(normal))
        );

        camera.position.copy(reflectedPos);
        camera.up.set(0, 1, 0);
        camera.lookAt(reflectedTarget);
        camera.updateMatrixWorld();

        renderer.clippingPlanes = [this.reflectionClipPlane];
        renderer.setRenderTarget(this.reflectionTarget);
        renderer.render(scene, camera);

        /* ======================
           RESTORE CAMERA
        ====================== */

        camera.position.copy(originalPosition);
        camera.quaternion.copy(originalQuaternion);
        camera.up.copy(originalUp);
        camera.updateMatrixWorld();

        /* ======================
           REFRACTION PASS
        ====================== */

        renderer.clippingPlanes = [this.refractionClipPlane];
        renderer.setRenderTarget(this.refractionTarget);
        renderer.render(scene, camera);

        /* ======================
           RESET
        ====================== */

        renderer.clippingPlanes = [];
        renderer.setRenderTarget(null);

        this.mesh.visible = true;

        const depth = this.params.waterLevel - camera.position.y;
        const range = 0.9;
        let targetWaterLevel = THREE.MathUtils.clamp(depth / range, 0, 1);
        targetWaterLevel = targetWaterLevel * targetWaterLevel * (3 - 2 * targetWaterLevel);

        const current = this.underwaterPass.uniforms.uUnderwaterFactor.value;

        this.underwaterPass.uniforms.uUnderwaterFactor.value =
            THREE.MathUtils.lerp(current, targetWaterLevel, 0.05);

        this.underwaterPass.uniforms.uTime.value = time;
        this.composer.render();
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