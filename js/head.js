/**
 * Three.js程序化头部 - 纯内置几何体，无外部依赖
 * 使用SphereGeometry + 程序化法线贴图
 */
export class VirtualHead {
    constructor(container) {
        this.container = container;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);
        this.clock = new THREE.Clock();

        const w = container.clientWidth || 600;
        const h = container.clientHeight || 400;
        this.camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 50);
        this.camera.position.set(0, 0.1, 3.8);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setSize(w, h);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(this.renderer.domElement);

        this._setupLights();
        this.head = new THREE.Group();
        this.scene.add(this.head);
        this._buildSkull();
        this._buildEyes();
        this._buildEyelids();
        this._buildEyebrows();
        this._buildNose();
        this._buildMouth();

        // 动画状态
        this.state = { mouthOpen: 0, smile: 0, frown: 0, browRaise: 0, browFurrow: 0, blinkL: 0, blinkR: 0, nodX: 0, nodY: 0 };
        this.target = { ...this.state };

        // 眨眼
        this.blinkTimer = 0;
        this.blinkInterval = 3;
        this.blinking = false;
        this.blinkPhase = 0;

        window.addEventListener('resize', () => this._resize());
    }

    _setupLights() {
        this.scene.add(new THREE.AmbientLight(0x555566, 0.5));
        this.scene.add(new THREE.HemisphereLight(0xffeedd, 0x444466, 0.6));
        const key = new THREE.DirectionalLight(0xffffff, 0.9);
        key.position.set(3, 4, 5);
        this.scene.add(key);
        const fill = new THREE.DirectionalLight(0x8899ff, 0.3);
        fill.position.set(-3, 2, 3);
        this.scene.add(fill);
    }

    _buildSkull() {
        const geo = new THREE.SphereGeometry(1, 64, 64);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
            y *= 1.2;
            z *= 0.9;
            if (y < -0.3) { const f = 1 - Math.abs(y + 0.3) * 0.4; x *= Math.max(f, 0.5); z *= Math.max(f, 0.6); }
            if (y > 0.4 && z > 0) z += 0.08 * (y - 0.4);
            pos.setXYZ(i, x, y, z);
        }
        geo.computeVertexNormals();

        const nmap = this._skinNormalMap(128);
        const mat = new THREE.MeshStandardMaterial({ color: 0xf5c5a3, roughness: 0.65, metalness: 0, normalMap: nmap, normalScale: new THREE.Vector2(0.25, 0.25) });
        this.skull = new THREE.Mesh(geo, mat);
        this.head.add(this.skull);
    }

    _skinNormalMap(size) {
        const data = new Uint8Array(size * size * 4);
        for (let i = 0; i < size * size; i++) {
            const idx = i * 4;
            const n = (Math.random() - 0.5) * 15;
            data[idx] = 128 + n;
            data[idx + 1] = 128 + n;
            data[idx + 2] = 255;
            data[idx + 3] = 255;
        }
        const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.needsUpdate = true;
        return tex;
    }

    _buildEyes() {
        const mkEye = (x) => {
            const grp = new THREE.Group();
            const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 24), new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 80 }));
            grp.add(sclera);
            const iris = new THREE.Mesh(new THREE.SphereGeometry(0.06, 20, 20), new THREE.MeshPhongMaterial({ color: 0x3d2b1f, shininess: 40 }));
            iris.position.z = 0.09;
            grp.add(iris);
            const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 12), new THREE.MeshBasicMaterial({ color: 0x000000 }));
            pupil.position.z = 0.115;
            grp.add(pupil);
            const hl = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
            hl.position.set(0.02, 0.02, 0.12);
            grp.add(hl);
            grp.position.set(x, 0.15, 0.72);
            return grp;
        };
        this.eyeL = mkEye(-0.27);
        this.eyeR = mkEye(0.27);
        this.head.add(this.eyeL);
        this.head.add(this.eyeR);
    }

    _buildEyelids() {
        const lidGeo = this._lidGeometry();
        const mat = new THREE.MeshStandardMaterial({ color: 0xe8a880, roughness: 0.8 });
        this.lidLT = new THREE.Mesh(lidGeo, mat);
        this.lidLT.position.set(-0.27, 0.24, 0.75);
        this.lidLB = new THREE.Mesh(lidGeo, mat.clone());
        this.lidLB.position.set(-0.27, 0.06, 0.75);
        this.lidLB.rotation.x = Math.PI;
        this.lidLB.scale.y = 0.5;
        this.lidRT = new THREE.Mesh(lidGeo, mat.clone());
        this.lidRT.position.set(0.27, 0.24, 0.75);
        this.lidRB = new THREE.Mesh(lidGeo, mat.clone());
        this.lidRB.position.set(0.27, 0.06, 0.75);
        this.lidRB.rotation.x = Math.PI;
        this.lidRB.scale.y = 0.5;
        this.head.add(this.lidLT, this.lidLB, this.lidRT, this.lidRB);
    }

    _lidGeometry() {
        const shape = new THREE.Shape();
        shape.moveTo(-0.13, 0);
        shape.quadraticCurveTo(0, 0.055, 0.13, 0);
        shape.quadraticCurveTo(0, 0.015, -0.13, 0);
        return new THREE.ExtrudeGeometry(shape, { depth: 0.025, bevelEnabled: false });
    }

    _buildEyebrows() {
        const shape = new THREE.Shape();
        shape.moveTo(-0.14, 0);
        shape.quadraticCurveTo(0, 0.035, 0.14, 0);
        shape.quadraticCurveTo(0, -0.01, -0.14, 0);
        const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.015, bevelEnabled: false });
        const mat = new THREE.MeshStandardMaterial({ color: 0x2a1f14, roughness: 0.9 });
        this.browL = new THREE.Mesh(geo, mat);
        this.browL.position.set(-0.27, 0.37, 0.77);
        this.browR = new THREE.Mesh(geo, mat.clone());
        this.browR.position.set(0.27, 0.37, 0.77);
        this.head.add(this.browL, this.browR);
    }

    _buildNose() {
        const mat = new THREE.MeshStandardMaterial({ color: 0xf0b890, roughness: 0.7 });
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 12), mat);
        cone.position.set(0, 0, 0.88);
        cone.rotation.x = -Math.PI / 2 + 0.3;
        this.head.add(cone);
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.048, 12, 12), mat.clone());
        tip.position.set(0, -0.05, 0.92);
        this.head.add(tip);
    }

    _buildMouth() {
        this.mouthGrp = new THREE.Group();
        this.mouthGrp.position.set(0, -0.35, 0.83);
        const mat = new THREE.MeshStandardMaterial({ color: 0xcc6666, roughness: 0.5 });

        // 上唇
        const upShape = new THREE.Shape();
        upShape.moveTo(-0.18, 0);
        upShape.quadraticCurveTo(-0.09, 0.025, 0, 0.018);
        upShape.quadraticCurveTo(0.09, 0.025, 0.18, 0);
        upShape.quadraticCurveTo(0.09, -0.008, 0, -0.008);
        upShape.quadraticCurveTo(-0.09, -0.008, -0.18, 0);
        this.upperLip = new THREE.Mesh(new THREE.ExtrudeGeometry(upShape, { depth: 0.02, bevelEnabled: false }), mat);
        this.mouthGrp.add(this.upperLip);

        // 下唇
        const loShape = new THREE.Shape();
        loShape.moveTo(-0.16, 0);
        loShape.quadraticCurveTo(-0.08, -0.03, 0, -0.025);
        loShape.quadraticCurveTo(0.08, -0.03, 0.16, 0);
        loShape.quadraticCurveTo(0.08, 0.008, 0, 0.008);
        loShape.quadraticCurveTo(-0.08, 0.008, -0.16, 0);
        this.lowerLip = new THREE.Mesh(new THREE.ExtrudeGeometry(loShape, { depth: 0.02, bevelEnabled: false }), mat.clone());
        this.lowerLip.position.y = -0.015;
        this.mouthGrp.add(this.lowerLip);

        // 口腔内部
        this.mouthInner = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.06), new THREE.MeshBasicMaterial({ color: 0x1a0000 }));
        this.mouthInner.position.z = -0.005;
        this.mouthInner.visible = false;
        this.mouthGrp.add(this.mouthInner);

        this.head.add(this.mouthGrp);
    }

    setTarget(params) { Object.assign(this.target, params); }
    setBlinkInterval(v) { this.blinkInterval = Math.max(2, Math.min(5, v)); }

    update() {
        const dt = this.clock.getDelta();
        const lerp = 5;

        // 插值
        for (const k of Object.keys(this.state)) {
            this.state[k] += (this.target[k] - this.state[k]) * lerp * dt;
        }

        // 眨眼
        this.blinkTimer += dt;
        if (!this.blinking && this.blinkTimer >= this.blinkInterval) {
            this.blinking = true;
            this.blinkPhase = 0;
            this.blinkTimer = 0;
        }
        if (this.blinking) {
            this.blinkPhase += dt * 8;
            if (this.blinkPhase < 1) {
                const v = Math.sin(this.blinkPhase * Math.PI);
                this.state.blinkL = v;
                this.state.blinkR = v;
            } else {
                this.blinking = false;
                this.state.blinkL = 0;
                this.state.blinkR = 0;
            }
        }

        this._applyFace();
        this.head.rotation.x = this.state.nodX;
        this.head.rotation.y = this.state.nodY;
        this.renderer.render(this.scene, this.camera);
    }

    _applyFace() {
        const s = this.state;

        // 嘴
        const open = s.mouthOpen * 0.05;
        this.upperLip.position.y = open * 0.3 + s.smile * 0.015;
        this.lowerLip.position.y = -0.015 - open - s.frown * 0.02;
        this.upperLip.scale.x = 1 + s.smile * 0.12;
        this.lowerLip.scale.x = 1 + s.smile * 0.12;
        this.mouthInner.visible = s.mouthOpen > 0.25;

        // 眼睑
        const bL = Math.max(s.blinkL, 0);
        const bR = Math.max(s.blinkR, 0);
        const squint = s.smile * 0.25;
        this.lidLT.position.y = 0.24 - bL * 0.13 - squint * 0.04;
        this.lidLB.position.y = 0.06 + bL * 0.05 + squint * 0.02;
        this.lidRT.position.y = 0.24 - bR * 0.13 - squint * 0.04;
        this.lidRB.position.y = 0.06 + bR * 0.05 + squint * 0.02;

        // 眉毛
        const raise = s.browRaise;
        const furrow = s.browFurrow;
        this.browL.position.y = 0.37 + raise * 0.05 - furrow * 0.03;
        this.browR.position.y = 0.37 + raise * 0.05 - furrow * 0.03;
        this.browL.position.x = -0.27 + furrow * 0.03;
        this.browR.position.x = 0.27 - furrow * 0.03;
        // 八字眉（悲伤）
        this.browL.rotation.z = s.frown * 0.2;
        this.browR.rotation.z = -s.frown * 0.2;
        // 瞪眼（生气）
        if (furrow > 0.3) {
            this.lidLT.position.y += furrow * 0.03;
            this.lidRT.position.y += furrow * 0.03;
        }
    }

    _resize() {
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        if (w === 0 || h === 0) return;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }

    dispose() {
        this.renderer.dispose();
        this.container.removeChild(this.renderer.domElement);
    }
}
