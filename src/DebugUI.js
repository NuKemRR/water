import * as THREE from 'three'
import {Pane} from 'tweakpane'

export default class DebugUI {
    constructor(water) {
        const pane = new Pane();

        const folderWater = pane.addFolder({title: "Water", expanded: true});

        folderWater.addBinding(water.params, 'color', {label: "Color", view: "color", color: {type: 'float'}}).on('change', (e)=>{
            water.material.userData.shader.uniforms.uColor.value.r = e.value.r;
            water.material.userData.shader.uniforms.uColor.value.g = e.value.g;
            water.material.userData.shader.uniforms.uColor.value.b = e.value.b;
        });

        folderWater.addBinding(water.params, 'size', {label: "Size", min: 1, max: 1000, step: 1}).on('change', (e)=>{
            water.mesh.scale.set(e.value, 1, e.value)
        });

        folderWater.addBinding(water.params, 'waterLevel', {label: "Water Y", min: 0, max: 10, step: 0.01}).on('change', (e)=>{
            water.mesh.position.set(0, e.value, 0);
        });

        folderWater.addBinding(water.params, 'moveFactor', {label: "Move Factor", min: 0, max: 1, step: 0.01})

        folderWater.addBinding(water.params, 'waveStrength', {label: "Wave Strength", min: 0, max: 10, step: 0.01}).on('change', (e)=>{
            water.material.userData.shader.uniforms.uWaveStrength.value = e.value;
        });

        folderWater.addBinding(water.params, 'showDepth',
            {label: "Show Depth Buffer"})
            .on('change', (e)=>{
                water.debugMesh.visible = e.value;
                water.debugCamera.visible = e.value;
        })
    }
}