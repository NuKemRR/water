import * as THREE from 'three'

export default class Water {
    constructor(textureLoader, camera, scene, renderer) {

        this.params = {
            size: 30,
            waterLevel: 0,
            color: new THREE.Color(0.34, 0.4, 0.8),
            moveFactor: 0.05,
            waveStrength: 0.03,
            showDepth: true,
        }

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
            shader.uniforms.uWaveHeight = {value: 2.0};
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

            this.material.userData.shader = shader;

            shader.vertexShader = shader.vertexShader.replace(
                '#include <uv_vertex>',
                `
                #include <uv_vertex>
                vUv = uv * 2.0;`);

            shader.vertexShader =
                `
                varying vec2 vUv;
                
                uniform float uTime;
                uniform float uWaveHeight;
                uniform float uWaveScale;
                float hash(vec2 p){
    return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453);
}

float noise(vec2 p){
    vec2 i = floor(p);
    vec2 f = fract(p);

    float a = hash(i);
    float b = hash(i + vec2(1.0,0.0));
    float c = hash(i + vec2(0.0,1.0));
    float d = hash(i + vec2(1.0,1.0));

    vec2 u = f*f*(3.0-2.0*f);

    return mix(a,b,u.x) +
           (c-a)*u.y*(1.0-u.x) +
           (d-b)*u.x*u.y;
}

float fbm(vec2 p){
    float v = 0.0;
    float a = 0.5;

    for(int i=0;i<4;i++){
        v += a * noise(p);
        p *= 2.0;
        a *= 0.5;
    }

    return v;
}
                `+shader.vertexShader;

            shader.vertexShader = `
varying vec4 clipSpace;
${shader.vertexShader}
`.replace(
                '#include <begin_vertex>',
                `#include <begin_vertex>
    vec2 waveUV = position.xz * uWaveScale + uTime * 0.05;
    
    float wave = fbm(waveUV);
    wave += fbm(waveUV * 2.0) * 0.5;
    
    transformed.y += wave * uWaveHeight;
    clipSpace = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);`
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
        vec2 reflectUV = vec2(ndc.x, 1.0 - ndc.y);
        
        float depth = texture2D(uDepthTexture, refractUV).r;
        float floorDistance = 2.0 * uNear * uFar / (uFar + uNear - (2.0 * depth - 1.0) * (uFar - uNear));

        depth = gl_FragCoord.z;
        float waterDistance = 2.0 * uNear * uFar / (uFar + uNear - (2.0 * depth - 1.0) * (uFar - uNear));
        float waterDepth = floorDistance - waterDistance;
        
        vec2 distortedUV = texture2D(uDuDvTexture, vec2(vUv.x + uMoveFactor, vUv.y)).rg * 0.01;
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

    update(time) {
        if (this.material.userData.shader)
        {
            this.material.userData.shader.uniforms.uTime.value = time;
        }
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