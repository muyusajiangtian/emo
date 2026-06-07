/**
 * 参数化人脸头部模型
 * 使用多层几何体构建可辨识的五官：眼球、鼻子、嘴唇、眉毛、下巴
 * 每个blendshape变形量足够大，AU驱动有明确可见效果
 */
import { CONFIG } from './config.js';

// 完整blendshape列表
const FULL_BLENDSHAPE_NAMES = [
    'browInnerUp', 'browOuterUpLeft', 'browOuterUpRight',
    'browDownLeft', 'browDownRight',
    'eyeBlinkLeft', 'eyeBlinkRight',
    'eyeWideLeft', 'eyeWideRight',
    'eyeSquintLeft', 'eyeSquintRight',
    'cheekPuff', 'cheekSquintLeft', 'cheekSquintRight',
    'noseSneerLeft', 'noseSneerRight',
    'jawOpen', 'jawForward', 'jawLeft', 'jawRight',
    'mouthSmileLeft', 'mouthSmileRight',
    'mouthFrownLeft', 'mouthFrownRight',
    'mouthPucker', 'mouthFunnel',
    'mouthOpen', 'mouthClose',
    'mouthLeft', 'mouthRight',
    'mouthStretchLeft', 'mouthStretchRight',
    'mouthDimpleLeft', 'mouthDimpleRight',
    'mouthPressLeft', 'mouthPressRight',
    'mouthRollLower', 'mouthRollUpper',
    'mouthShrugLower', 'mouthShrugUpper',
    'mouthLowerDownLeft', 'mouthLowerDownRight',
    'mouthUpperUpLeft', 'mouthUpperUpRight',
    'tongueOut',
];

export class VirtualHead {
    constructor(container) {
        this.container = container;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);

        const w = container.clientWidth || 600;
        const h = container.clientHeight || 400;
        this.camera = new THREE.PerspectiveCamera(30, w / h, 0.1, 50);
        this.camera.position.set(0, 0, 4.2);
        this.camera.lookAt(0, -0.1, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setSize(w, h);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(this.renderer.domElement);

        this._setupLights();

        this.mesh = null;
        this.morphTargets = {};
        this.loaded = false;
        this.loadError = null;
        this.faceGroup = null;

        this.nameAliases = {
            'browDown_L': 'browDownLeft', 'browDown_R': 'browDownRight',
            'browOuterUp_L': 'browOuterUpLeft', 'browOuterUp_R': 'browOuterUpRight',
            'eyeBlink_L': 'eyeBlinkLeft', 'eyeBlink_R': 'eyeBlinkRight',
            'eyeSquint_L': 'eyeSquintLeft', 'eyeSquint_R': 'eyeSquintRight',
            'eyeWide_L': 'eyeWideLeft', 'eyeWide_R': 'eyeWideRight',
            'mouthSmile_L': 'mouthSmileLeft', 'mouthSmile_R': 'mouthSmileRight',
            'mouthFrown_L': 'mouthFrownLeft', 'mouthFrown_R': 'mouthFrownRight',
            'noseSneer_L': 'noseSneerLeft', 'noseSneer_R': 'noseSneerRight',
        };

        this._loadModel();
        window.addEventListener('resize', () => this._resize());
    }

    _setupLights() {
        this.scene.add(new THREE.AmbientLight(0x404050, 0.5));
        this.scene.add(new THREE.HemisphereLight(0xffeedd, 0x333344, 0.6));
        const key = new THREE.DirectionalLight(0xffffff, 1.0);
        key.position.set(2, 3, 5);
        this.scene.add(key);
        const fill = new THREE.DirectionalLight(0x8899cc, 0.5);
        fill.position.set(-3, 1, 3);
        this.scene.add(fill);
        const rim = new THREE.DirectionalLight(0xffffee, 0.3);
        rim.position.set(0, 2, -3);
        this.scene.add(rim);
        // 从下方柔光，让五官阴影更明显
        const bottom = new THREE.DirectionalLight(0x334455, 0.2);
        bottom.position.set(0, -2, 2);
        this.scene.add(bottom);
    }

    async _loadModel() {
        // 直接使用参数化人脸模型（比外部glb模型有更完整的blendshape支持）
        this._buildFace();
    }

    /**
     * 构建参数化人脸：多组件组合（头部基形 + 眼球 + 眉毛 + 鼻子 + 嘴唇）
     */
    _buildFace() {
        this.faceGroup = new THREE.Group();

        // === 1. 头部基础形状 ===
        const headGeo = this._createHeadGeometry();
        const headMat = new THREE.MeshStandardMaterial({
            color: 0xdba882, roughness: 0.7, metalness: 0.0,
            morphTargets: true, morphNormals: true,
        });

        // 生成morph targets
        const pos = headGeo.attributes.position;
        const morphPositions = [];
        for (const bsName of FULL_BLENDSHAPE_NAMES) {
            const arr = new Float32Array(pos.count * 3);
            for (let i = 0; i < pos.count; i++) {
                const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
                const [dx, dy, dz] = this._computeDeformation(bsName, x, y, z);
                arr[i * 3] = dx;
                arr[i * 3 + 1] = dy;
                arr[i * 3 + 2] = dz;
            }
            morphPositions.push(new THREE.BufferAttribute(arr, 3));
        }
        headGeo.morphAttributes.position = morphPositions;
        headGeo.morphTargetsRelative = true;

        this.mesh = new THREE.Mesh(headGeo, headMat);
        this.mesh.morphTargetInfluences = new Array(FULL_BLENDSHAPE_NAMES.length).fill(0);
        this.mesh.morphTargetDictionary = {};
        FULL_BLENDSHAPE_NAMES.forEach((name, i) => { this.mesh.morphTargetDictionary[name] = i; });
        this.morphTargets = { ...this.mesh.morphTargetDictionary };

        this.faceGroup.add(this.mesh);

        // === 2. 眼球 ===
        this._addEyes();

        // === 3. 嘴巴内部（牙齿暗示 + 口腔） ===
        this._addMouthInterior();

        this.scene.add(this.faceGroup);
        this.loaded = true;
        this.loadError = null;
    }

    /**
     * 创建有明确五官凹凸的头部网格——高精度版
     * 128x96网格，精细面部解剖比例
     */
    _createHeadGeometry() {
        const seg = 128, ring = 96;
        const geo = new THREE.SphereGeometry(1, seg, ring);
        const pos = geo.attributes.position;

        for (let i = 0; i < pos.count; i++) {
            let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);

            // 头部整体比例：纵向1.3倍拉长，侧面略窄，前后压扁——更接近人类头骨
            y *= 1.3;
            x *= 0.92;
            z *= 0.85;

            // 额头饱满弧度
            if (y > 0.45 && z > 0) {
                z += 0.06 * this._sm(0.45, 0.9, y) * this._sm(0, 0.5, z);
            }

            // 太阳穴内凹
            if (Math.abs(x) > 0.4 && Math.abs(x) < 0.7 && y > 0.2 && y < 0.6 && z > 0.1) {
                const tf = this._sm(0.4, 0.55, Math.abs(x)) * (1 - this._sm(0.6, 0.7, Math.abs(x)))
                    * this._sm(0.2, 0.4, y) * (1 - this._sm(0.5, 0.6, y)) * this._sm(0.1, 0.3, z);
                x *= (1 - 0.06 * tf);
                z -= 0.04 * tf;
            }

            // 下颌收窄 + 下巴前凸
            if (y < -0.2) {
                const jawNarrow = 1 - this._sm(-0.2, -0.9, y) * 0.55;
                x *= jawNarrow;
                // 下巴尖端前突
                if (y < -0.55 && y > -0.95 && Math.abs(x) < 0.15 && z > 0) {
                    const chinF = this._sm(-0.55, -0.75, y) * (1 - this._sm(-0.8, -0.95, y))
                        * this._sm(0, 0.35, z) * (1 - (Math.abs(x) / 0.15) ** 2);
                    z += 0.14 * chinF;
                    y -= 0.03 * chinF;
                }
                // 下颌角隆起
                if (Math.abs(x) > 0.2 && Math.abs(x) < 0.5 && y > -0.6 && y < -0.3 && z > -0.1 && z < 0.3) {
                    const jawAngle = this._sm(0.2, 0.35, Math.abs(x)) * (1 - this._sm(0.4, 0.5, Math.abs(x)))
                        * this._sm(-0.6, -0.4, y) * (1 - this._sm(-0.35, -0.3, y));
                    x += Math.sign(x) * 0.04 * jawAngle;
                }
            }

            // ===== 眼窝（深陷+精细轮廓） =====
            for (const side of [-1, 1]) {
                const ecx = side * 0.30, ecy = 0.15;
                const dx2 = ((x - ecx) / 0.17) ** 2, dy2 = ((y - ecy) / 0.10) ** 2;
                const d = dx2 + dy2;
                if (d < 1.5 && z > 0.3) {
                    const depth = Math.pow(Math.max(0, 1 - d / 1.2), 2.2);
                    z -= 0.17 * depth * this._sm(0.3, 0.6, z);
                    // 上眼眶骨更突出
                    if (y > ecy && y < ecy + 0.12 && d > 0.4 && d < 1.5) {
                        const rimTop = Math.max(0, 1 - Math.abs(d - 0.8) / 0.5) * this._sm(0.3, 0.5, z) * 0.06;
                        z += rimTop;
                        y += 0.01;
                    }
                    // 下眼眶
                    if (y < ecy - 0.02 && y > ecy - 0.1 && d > 0.5 && d < 1.3) {
                        z += 0.03 * (1 - Math.abs(d - 0.9) / 0.4) * this._sm(0.3, 0.5, z);
                    }
                }
            }

            // ===== 眉弓（明显骨性隆起） =====
            if (y > 0.24 && y < 0.4 && z > 0.3 && Math.abs(x) < 0.55) {
                const browF = this._sm(0.24, 0.30, y) * (1 - this._sm(0.35, 0.4, y))
                    * this._sm(0.3, 0.55, z) * (1 - (Math.abs(x) / 0.55) ** 1.8);
                z += 0.1 * browF;
                y += 0.015 * browF;
            }

            // ===== 鼻梁（从眉间到鼻尖的连续脊线） =====
            if (Math.abs(x) < 0.08 && y > -0.15 && y < 0.28 && z > 0.4) {
                const noseW = 1 - (Math.abs(x) / 0.08) ** 1.5;
                const noseH = this._sm(0.4, 0.7, z);
                // 鼻梁从上到下渐宽渐突出
                const profile = 0.07 + 0.08 * this._sm(0.25, -0.1, y);
                z += profile * noseW * noseH;
                // 鼻骨侧面轮廓
                if (Math.abs(x) > 0.04 && Math.abs(x) < 0.11) {
                    const sideF = this._sm(0.04, 0.08, Math.abs(x)) * (1 - this._sm(0.09, 0.11, Math.abs(x)));
                    z += 0.03 * sideF * noseH * this._sm(-0.1, 0.1, y);
                }
            }

            // ===== 鼻尖（圆润突出） =====
            {
                const ntDist = Math.sqrt(x * x + (y + 0.1) ** 2);
                if (ntDist < 0.08 && z > 0.55) {
                    const f = Math.pow(1 - ntDist / 0.08, 2.0);
                    z += 0.22 * f;
                    y -= 0.025 * f;
                }
            }

            // ===== 鼻翼（两侧饱满球体） =====
            for (const side of [-1, 1]) {
                const nwx = side * 0.07, nwy = -0.12;
                const dw = Math.sqrt((x - nwx) ** 2 + (y - nwy) ** 2);
                if (dw < 0.055 && z > 0.55) {
                    const f = Math.pow(1 - dw / 0.055, 2.2);
                    z += 0.09 * f;
                    x += side * 0.035 * f;
                }
            }

            // ===== 鼻唇沟（法令纹） =====
            for (const side of [-1, 1]) {
                const nlx = side * 0.14;
                const nlDist = Math.abs(x - nlx);
                if (nlDist < 0.04 && z > 0.4 && y > -0.4 && y < -0.05) {
                    const depthF = (1 - nlDist / 0.04)
                        * this._sm(0.4, 0.6, z) * this._sm(-0.05, -0.15, y) * (1 - this._sm(-0.3, -0.4, y));
                    z -= 0.05 * depthF;
                }
            }

            // ===== 上唇（精细唇形+人中） =====
            {
                const lipY = -0.33;
                const lipDy = y - lipY;
                if (Math.abs(lipDy) < 0.045 && Math.abs(x) < 0.18 && z > 0.52) {
                    const lipF = (1 - (Math.abs(lipDy) / 0.045) ** 1.5) * (1 - (Math.abs(x) / 0.18) ** 1.8) * this._sm(0.52, 0.65, z);
                    z += 0.09 * lipF;
                    // 人中凹陷（philtrum）
                    if (lipDy > 0.01 && lipDy < 0.04 && Math.abs(x) < 0.025) {
                        z -= 0.04 * (1 - Math.abs(x) / 0.025) * (1 - Math.abs(lipDy - 0.025) / 0.015);
                    }
                    // 唇峰（cupid's bow）
                    if (lipDy > 0 && lipDy < 0.02 && Math.abs(x) > 0.02 && Math.abs(x) < 0.07) {
                        z += 0.025 * (1 - Math.abs(Math.abs(x) - 0.045) / 0.025) * lipF;
                    }
                }
            }

            // ===== 下唇（饱满圆润） =====
            {
                const llipY = -0.39;
                const llipDy = y - llipY;
                if (Math.abs(llipDy) < 0.035 && Math.abs(x) < 0.16 && z > 0.52) {
                    const f = (1 - (Math.abs(llipDy) / 0.035) ** 2) * (1 - (Math.abs(x) / 0.16) ** 2) * this._sm(0.52, 0.65, z);
                    z += 0.08 * f;
                }
            }

            // ===== 嘴裂线 =====
            {
                const mouthY = -0.36;
                if (Math.abs(y - mouthY) < 0.01 && Math.abs(x) < 0.15 && z > 0.57) {
                    const f = (1 - Math.abs(y - mouthY) / 0.01) * (1 - (Math.abs(x) / 0.15) ** 1.5) * this._sm(0.57, 0.65, z);
                    z -= 0.045 * f;
                }
            }

            // ===== 颧骨（高颧骨造型） =====
            if (y > -0.12 && y < 0.1 && Math.abs(x) > 0.3 && Math.abs(x) < 0.65 && z > 0.15) {
                const f = this._sm(0.3, 0.45, Math.abs(x)) * (1 - this._sm(0.5, 0.65, Math.abs(x)))
                    * (1 - (Math.abs(y + 0.01) / 0.12) ** 2) * this._sm(0.15, 0.35, z);
                z += 0.07 * f;
                x += Math.sign(x) * 0.02 * f;
            }

            // ===== 面颊微凹（脸颊内收造成的面部轮廓感） =====
            if (y > -0.35 && y < -0.1 && Math.abs(x) > 0.2 && Math.abs(x) < 0.5 && z > 0.2) {
                const cheekHollow = this._sm(0.2, 0.35, Math.abs(x)) * (1 - this._sm(0.4, 0.5, Math.abs(x)))
                    * this._sm(-0.35, -0.2, y) * (1 - this._sm(-0.15, -0.1, y)) * this._sm(0.2, 0.4, z);
                z -= 0.03 * cheekHollow;
            }

            // ===== 耳朵（侧面突起） =====
            for (const side of [-1, 1]) {
                const earCenter = side > 0 ? 0.78 : -0.78;
                if (Math.abs(x - earCenter) < 0.12 && Math.abs(y - 0.05) < 0.18 && Math.abs(z) < 0.15) {
                    const ef = (1 - (Math.abs(x - earCenter) / 0.12) ** 2) * (1 - (Math.abs(y - 0.05) / 0.18) ** 2)
                        * (1 - (Math.abs(z) / 0.15) ** 2);
                    x += side * 0.1 * Math.max(0, ef);
                    z -= 0.02 * Math.max(0, ef);
                }
            }

            // ===== 后脑勺圆润 =====
            if (z < -0.3 && y > -0.3) {
                z -= 0.1 * this._sm(-0.3, -0.7, z) * this._sm(-0.3, 0.3, y);
            }

            pos.setXYZ(i, x, y, z);
        }
        geo.computeVertexNormals();
        return geo;
    }

    /**
     * 添加眼球几何体——匹配新眼窝位置
     */
    _addEyes() {
        const eyeGeo = new THREE.SphereGeometry(0.06, 28, 20);
        const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xfcfcfc, roughness: 0.15, metalness: 0 });
        const irisMat = new THREE.MeshStandardMaterial({ color: 0x3d2b1f, roughness: 0.25, metalness: 0.1 });
        const pupilMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.1, metalness: 0 });

        for (const side of [-1, 1]) {
            // 眼白
            const eyeball = new THREE.Mesh(eyeGeo, eyeWhiteMat);
            eyeball.position.set(side * 0.30, 0.15, 0.70);
            eyeball.scale.set(1, 0.82, 0.65);
            this.faceGroup.add(eyeball);

            // 虹膜
            const irisGeo = new THREE.CircleGeometry(0.032, 24);
            const iris = new THREE.Mesh(irisGeo, irisMat);
            iris.position.set(side * 0.30, 0.15, 0.745);
            this.faceGroup.add(iris);

            // 瞳孔
            const pupilGeo = new THREE.CircleGeometry(0.016, 20);
            const pupil = new THREE.Mesh(pupilGeo, pupilMat);
            pupil.position.set(side * 0.30, 0.15, 0.748);
            this.faceGroup.add(pupil);
        }
    }

    /**
     * 添加口腔内部（张嘴时可见的暗色+牙齿）
     */
    _addMouthInterior() {
        // 口腔暗面
        const mouthGeo = new THREE.PlaneGeometry(0.22, 0.06);
        const mouthMat = new THREE.MeshStandardMaterial({ color: 0x1a0505, roughness: 1.0, side: THREE.DoubleSide });
        const mouthPlane = new THREE.Mesh(mouthGeo, mouthMat);
        mouthPlane.position.set(0, -0.36, 0.58);
        this.faceGroup.add(mouthPlane);

        // 上牙
        const teethGeo = new THREE.PlaneGeometry(0.14, 0.02);
        const teethMat = new THREE.MeshStandardMaterial({ color: 0xf0f0e8, roughness: 0.4 });
        const teeth = new THREE.Mesh(teethGeo, teethMat);
        teeth.position.set(0, -0.345, 0.60);
        this.faceGroup.add(teeth);
    }

    /**
     * 计算每个blendshape对顶点的变形
     * 平衡版：幅度适中、过渡平滑、不撕裂网格
     */
    _computeDeformation(bsName, x, y, z) {
        let dx = 0, dy = 0, dz = 0;
        const S = 2.0; // 全局变形强度（平衡可见性和网格完整性）

        // === 下颌 ===
        if (bsName === 'jawOpen') {
            // 下巴以下区域大幅下移
            if (y < -0.25 && z > 0) {
                const f = this._sm(-0.25, -0.7, y) * this._sm(0, 0.3, z);
                dy = -0.28 * S * f;
                dz = -0.05 * S * f;
                // 嘴唇区域也跟着张开
                if (y > -0.45 && y < -0.3 && Math.abs(x) < 0.2 && z > 0.5) {
                    dy -= 0.1 * S * (1 - Math.abs(x) / 0.2);
                }
            }
        } else if (bsName === 'jawForward') {
            if (y < -0.2 && z > 0.1) {
                const f = this._sm(-0.2, -0.6, y) * this._sm(0.1, 0.4, z);
                dz = 0.12 * S * f;
            }
        } else if (bsName === 'jawLeft') {
            if (y < -0.25) { dx = -0.08 * S * this._sm(-0.25, -0.6, y); }
        } else if (bsName === 'jawRight') {
            if (y < -0.25) { dx = 0.08 * S * this._sm(-0.25, -0.6, y); }
        }
        // === 嘴角微笑（上拉+外扩）——扩大影响范围 ===
        else if (bsName === 'mouthSmileLeft') {
            if (y > -0.55 && y < -0.15 && x < 0.05 && z > 0.3) {
                const f = Math.max(0, 1 - Math.abs(y + 0.35) / 0.2) * this._sm(0.05, -0.15, x) * this._sm(0.3, 0.55, z);
                dx = -0.08 * S * f;
                dy = 0.1 * S * f;
                dz = 0.03 * S * f;
            }
        } else if (bsName === 'mouthSmileRight') {
            if (y > -0.55 && y < -0.15 && x > -0.05 && z > 0.3) {
                const f = Math.max(0, 1 - Math.abs(y + 0.35) / 0.2) * this._sm(-0.05, 0.15, x) * this._sm(0.3, 0.55, z);
                dx = 0.08 * S * f;
                dy = 0.1 * S * f;
                dz = 0.03 * S * f;
            }
        }
        // === 嘴角下拉——扩大范围 ===
        else if (bsName === 'mouthFrownLeft') {
            if (y > -0.6 && y < -0.15 && x < 0 && z > 0.3) {
                const f = Math.max(0, 1 - Math.abs(y + 0.38) / 0.2) * this._sm(0, -0.12, x) * this._sm(0.3, 0.55, z);
                dx = -0.04 * S * f;
                dy = -0.1 * S * f;
            }
        } else if (bsName === 'mouthFrownRight') {
            if (y > -0.6 && y < -0.15 && x > 0 && z > 0.3) {
                const f = Math.max(0, 1 - Math.abs(y + 0.38) / 0.2) * this._sm(0, 0.12, x) * this._sm(0.3, 0.55, z);
                dx = 0.04 * S * f;
                dy = -0.1 * S * f;
            }
        }
        // === 嘟嘴 ===
        else if (bsName === 'mouthPucker') {
            if (y > -0.5 && y < -0.2 && Math.abs(x) < 0.2 && z > 0.5) {
                const f = Math.max(0, 1 - Math.abs(y + 0.35) / 0.12) * (1 - (Math.abs(x) / 0.2) ** 1.5) * this._sm(0.5, 0.65, z);
                dx = -x * 0.5 * S * f;
                dz = 0.12 * S * f;
            }
        }
        // === 漏斗嘴 ===
        else if (bsName === 'mouthFunnel') {
            if (y > -0.5 && y < -0.2 && Math.abs(x) < 0.2 && z > 0.5) {
                const f = Math.max(0, 1 - Math.abs(y + 0.35) / 0.12) * (1 - Math.abs(x) / 0.2) * this._sm(0.5, 0.65, z);
                dx = -x * 0.35 * S * f;
                dy = (y + 0.35) * 0.3 * S * f;
                dz = 0.08 * S * f;
            }
        }
        // === 嘴张开（上下唇分离） ===
        else if (bsName === 'mouthOpen') {
            if (y > -0.5 && y < -0.25 && Math.abs(x) < 0.2 && z > 0.45) {
                const f = Math.max(0, 1 - Math.abs(y + 0.35) / 0.12) * this._sm(0.45, 0.6, z);
                dy = y < -0.35 ? -0.12 * S * f : 0.08 * S * f;
            }
        }
        // === 嘴闭合 ===
        else if (bsName === 'mouthClose') {
            if (y > -0.45 && y < -0.28 && Math.abs(x) < 0.18 && z > 0.5) {
                const f = Math.max(0, 1 - Math.abs(y + 0.35) / 0.08) * this._sm(0.5, 0.6, z);
                dy = y < -0.35 ? 0.04 * S * f : -0.04 * S * f;
                dz = 0.03 * S * f;
            }
        }
        // === 嘴左右移 ===
        else if (bsName === 'mouthLeft') {
            if (y > -0.5 && y < -0.2 && Math.abs(x) < 0.3 && z > 0.4) {
                const f = Math.max(0, 1 - Math.abs(y + 0.35) / 0.15) * this._sm(0.4, 0.55, z);
                dx = -0.1 * S * f;
            }
        } else if (bsName === 'mouthRight') {
            if (y > -0.5 && y < -0.2 && Math.abs(x) < 0.3 && z > 0.4) {
                const f = Math.max(0, 1 - Math.abs(y + 0.35) / 0.15) * this._sm(0.4, 0.55, z);
                dx = 0.1 * S * f;
            }
        }
        // === 嘴唇拉伸 ===
        else if (bsName === 'mouthStretchLeft') {
            if (y > -0.5 && y < -0.2 && x < -0.02 && z > 0.4) {
                const f = Math.max(0, 1 - Math.abs(y + 0.35) / 0.12) * this._sm(-0.02, -0.2, x) * this._sm(0.4, 0.55, z);
                dx = -0.1 * S * f;
            }
        } else if (bsName === 'mouthStretchRight') {
            if (y > -0.5 && y < -0.2 && x > 0.02 && z > 0.4) {
                const f = Math.max(0, 1 - Math.abs(y + 0.35) / 0.12) * this._sm(0.02, 0.2, x) * this._sm(0.4, 0.55, z);
                dx = 0.1 * S * f;
            }
        }
        // === 嘴角酒窝 ===
        else if (bsName === 'mouthDimpleLeft') {
            if (y > -0.45 && y < -0.25 && x < -0.1 && z > 0.4) {
                const f = Math.max(0, 1 - Math.abs(y + 0.35) / 0.1) * this._sm(-0.1, -0.2, x) * this._sm(0.4, 0.55, z);
                dz = -0.06 * S * f;
            }
        } else if (bsName === 'mouthDimpleRight') {
            if (y > -0.45 && y < -0.25 && x > 0.1 && z > 0.4) {
                const f = Math.max(0, 1 - Math.abs(y + 0.35) / 0.1) * this._sm(0.1, 0.2, x) * this._sm(0.4, 0.55, z);
                dz = -0.06 * S * f;
            }
        }
        // === 嘴唇按压 ===
        else if (bsName === 'mouthPressLeft' || bsName === 'mouthPressRight') {
            const sx = bsName.includes('Left') ? -1 : 1;
            if (y > -0.42 && y < -0.28 && z > 0.55) {
                const f = Math.max(0, 1 - Math.abs(y + 0.35) / 0.07) * this._sm(0.55, 0.65, z) * this._sm(0, sx * 0.1, x);
                dy = -0.02 * S * f;
                dz = 0.03 * S * f;
            }
        }
        // === 卷唇 ===
        else if (bsName === 'mouthRollLower') {
            if (y < -0.34 && y > -0.44 && Math.abs(x) < 0.15 && z > 0.5) {
                const f = Math.max(0, 1 - Math.abs(y + 0.39) / 0.05) * this._sm(0.5, 0.6, z);
                dz = -0.05 * S * f; dy = 0.03 * S * f;
            }
        } else if (bsName === 'mouthRollUpper') {
            if (y > -0.36 && y < -0.28 && Math.abs(x) < 0.15 && z > 0.5) {
                const f = Math.max(0, 1 - Math.abs(y + 0.32) / 0.04) * this._sm(0.5, 0.6, z);
                dz = -0.05 * S * f; dy = -0.03 * S * f;
            }
        }
        // === 嘴唇耸起 ===
        else if (bsName === 'mouthShrugLower') {
            if (y < -0.35 && y > -0.48 && Math.abs(x) < 0.12 && z > 0.5) {
                const f = Math.max(0, 1 - Math.abs(y + 0.42) / 0.07) * this._sm(0.5, 0.62, z);
                dy = 0.05 * S * f; dz = 0.03 * S * f;
            }
        } else if (bsName === 'mouthShrugUpper') {
            if (y > -0.35 && y < -0.25 && Math.abs(x) < 0.12 && z > 0.5) {
                const f = Math.max(0, 1 - Math.abs(y + 0.3) / 0.05) * this._sm(0.5, 0.62, z);
                dy = -0.04 * S * f; dz = 0.03 * S * f;
            }
        }
        // === 下唇下拉 ===
        else if (bsName === 'mouthLowerDownLeft' || bsName === 'mouthLowerDownRight') {
            const sx = bsName.includes('Left') ? -1 : 1;
            if (y < -0.34 && y > -0.5 && z > 0.45) {
                const f = Math.max(0, 1 - Math.abs(y + 0.42) / 0.08) * this._sm(0.45, 0.6, z) * this._sm(0, sx * 0.12, x);
                dy = -0.08 * S * f;
            }
        }
        // === 上唇上提 ===
        else if (bsName === 'mouthUpperUpLeft' || bsName === 'mouthUpperUpRight') {
            const sx = bsName.includes('Left') ? -1 : 1;
            if (y > -0.36 && y < -0.26 && z > 0.5) {
                const f = Math.max(0, 1 - Math.abs(y + 0.31) / 0.05) * this._sm(0.5, 0.62, z) * this._sm(0, sx * 0.1, x);
                dy = 0.06 * S * f;
            }
        }
        // === 眨眼（上眼睑大幅下降） ===
        else if (bsName === 'eyeBlinkLeft') {
            if (y > 0.05 && y < 0.28 && x < -0.15 && x > -0.5 && z > 0.45) {
                const f = Math.max(0, 1 - Math.abs(y - 0.17) / 0.12) * this._sm(0.45, 0.6, z) * this._sm(-0.15, -0.25, x) * (1 - this._sm(-0.4, -0.5, x));
                dy = -0.1 * S * f;
                dz = -0.02 * S * f;
            }
        } else if (bsName === 'eyeBlinkRight') {
            if (y > 0.05 && y < 0.28 && x > 0.15 && x < 0.5 && z > 0.45) {
                const f = Math.max(0, 1 - Math.abs(y - 0.17) / 0.12) * this._sm(0.45, 0.6, z) * this._sm(0.15, 0.25, x) * (1 - this._sm(0.4, 0.5, x));
                dy = -0.1 * S * f;
                dz = -0.02 * S * f;
            }
        }
        // === 眼睛睁大 ===
        else if (bsName === 'eyeWideLeft') {
            if (y > 0.08 && y < 0.3 && x < -0.15 && x > -0.5 && z > 0.45) {
                const f = Math.max(0, 1 - Math.abs(y - 0.19) / 0.11) * this._sm(0.45, 0.6, z);
                dy = 0.07 * S * f;
            }
        } else if (bsName === 'eyeWideRight') {
            if (y > 0.08 && y < 0.3 && x > 0.15 && x < 0.5 && z > 0.45) {
                const f = Math.max(0, 1 - Math.abs(y - 0.19) / 0.11) * this._sm(0.45, 0.6, z);
                dy = 0.07 * S * f;
            }
        }
        // === 眯眼 ===
        else if (bsName === 'eyeSquintLeft') {
            if (y > 0.02 && y < 0.26 && x < -0.15 && x > -0.48 && z > 0.4) {
                const f = Math.max(0, 1 - Math.abs(y - 0.14) / 0.12) * this._sm(0.4, 0.6, z);
                dy = -0.04 * S * f;
                dz = 0.03 * S * f;
            }
        } else if (bsName === 'eyeSquintRight') {
            if (y > 0.02 && y < 0.26 && x > 0.15 && x < 0.48 && z > 0.4) {
                const f = Math.max(0, 1 - Math.abs(y - 0.14) / 0.12) * this._sm(0.4, 0.6, z);
                dy = -0.04 * S * f;
                dz = 0.03 * S * f;
            }
        }
        // === 内眉上扬（AU1）——扩大范围 ===
        else if (bsName === 'browInnerUp') {
            if (y > 0.25 && y < 0.5 && Math.abs(x) < 0.28 && z > 0.3) {
                const f = this._sm(0.25, 0.33, y) * (1 - this._sm(0.42, 0.5, y)) * (1 - (Math.abs(x) / 0.28) ** 1.8) * this._sm(0.3, 0.5, z);
                dy = 0.12 * S * f;
                dz = 0.02 * S * f;
            }
        }
        // === 外眉上扬（AU2）——扩大范围 ===
        else if (bsName === 'browOuterUpLeft') {
            if (y > 0.22 && y < 0.45 && x < -0.15 && x > -0.6 && z > 0.25) {
                const f = this._sm(0.22, 0.3, y) * (1 - this._sm(0.38, 0.45, y)) * this._sm(-0.15, -0.35, x) * (1 - this._sm(-0.5, -0.6, x)) * this._sm(0.25, 0.45, z);
                dy = 0.1 * S * f;
            }
        } else if (bsName === 'browOuterUpRight') {
            if (y > 0.22 && y < 0.45 && x > 0.15 && x < 0.6 && z > 0.25) {
                const f = this._sm(0.22, 0.3, y) * (1 - this._sm(0.38, 0.45, y)) * this._sm(0.15, 0.35, x) * (1 - this._sm(0.5, 0.6, x)) * this._sm(0.25, 0.45, z);
                dy = 0.1 * S * f;
            }
        }
        // === 皱眉（AU4）眉毛下压——扩大范围 ===
        else if (bsName === 'browDownLeft') {
            if (y > 0.15 && y < 0.42 && x < -0.05 && x > -0.55 && z > 0.3) {
                const f = Math.max(0, 1 - Math.abs(y - 0.3) / 0.14) * this._sm(-0.05, -0.2, x) * (1 - this._sm(-0.45, -0.55, x)) * this._sm(0.3, 0.5, z);
                dy = -0.09 * S * f;
                dz = -0.02 * S * f;
            }
        } else if (bsName === 'browDownRight') {
            if (y > 0.15 && y < 0.42 && x > 0.05 && x < 0.55 && z > 0.3) {
                const f = Math.max(0, 1 - Math.abs(y - 0.3) / 0.14) * this._sm(0.05, 0.2, x) * (1 - this._sm(0.45, 0.55, x)) * this._sm(0.3, 0.5, z);
                dy = -0.09 * S * f;
                dz = -0.02 * S * f;
            }
        }
        // === 鼓腮 ===
        else if (bsName === 'cheekPuff') {
            if (y > -0.3 && y < 0.05 && Math.abs(x) > 0.25 && Math.abs(x) < 0.65 && z > 0.1) {
                const f = this._sm(0.25, 0.45, Math.abs(x)) * (1 - this._sm(0.5, 0.65, Math.abs(x))) * (1 - Math.abs(y + 0.12) / 0.18) * this._sm(0.1, 0.3, z);
                dx = Math.sign(x) * 0.1 * S * f;
                dz = 0.07 * S * f;
            }
        }
        // === 颧肌收缩 ===
        else if (bsName === 'cheekSquintLeft') {
            if (y > -0.08 && y < 0.15 && x < -0.2 && x > -0.5 && z > 0.3) {
                const f = this._sm(-0.2, -0.35, x) * Math.max(0, 1 - Math.abs(y - 0.03) / 0.12) * this._sm(0.3, 0.5, z);
                dy = 0.05 * S * f;
                dz = 0.03 * S * f;
            }
        } else if (bsName === 'cheekSquintRight') {
            if (y > -0.08 && y < 0.15 && x > 0.2 && x < 0.5 && z > 0.3) {
                const f = this._sm(0.2, 0.35, x) * Math.max(0, 1 - Math.abs(y - 0.03) / 0.12) * this._sm(0.3, 0.5, z);
                dy = 0.05 * S * f;
                dz = 0.03 * S * f;
            }
        }
        // === 鼻翼皱缩——柔化过渡 ===
        else if (bsName === 'noseSneerLeft') {
            if (y > -0.2 && y < 0.12 && x < 0.05 && x > -0.25 && z > 0.45) {
                const f = Math.max(0, 1 - Math.abs(y + 0.03) / 0.15) * this._sm(0.05, -0.1, x) * (1 - this._sm(-0.2, -0.25, x)) * this._sm(0.45, 0.65, z);
                dy = 0.05 * S * f;
                dx = -0.02 * S * f;
                dz = 0.02 * S * f;
            }
        } else if (bsName === 'noseSneerRight') {
            if (y > -0.2 && y < 0.12 && x > -0.05 && x < 0.25 && z > 0.45) {
                const f = Math.max(0, 1 - Math.abs(y + 0.03) / 0.15) * this._sm(-0.05, 0.1, x) * (1 - this._sm(0.2, 0.25, x)) * this._sm(0.45, 0.65, z);
                dy = 0.05 * S * f;
                dx = 0.02 * S * f;
                dz = 0.02 * S * f;
            }
        }
        // === 舌头 ===
        else if (bsName === 'tongueOut') {
            if (y < -0.32 && y > -0.48 && Math.abs(x) < 0.07 && z > 0.5) {
                const f = Math.max(0, 1 - Math.abs(y + 0.4) / 0.08) * this._sm(0.5, 0.6, z);
                dz = 0.15 * S * f;
                dy = -0.05 * S * f;
            }
        }

        return [dx, dy, dz];
    }

    // smoothstep工具
    _sm(e0, e1, x) {
        if (e0 === e1) return x >= e0 ? 1 : 0;
        const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
        return t * t * (3 - 2 * t);
    }

    setBlendshape(name, weight) {
        if (!this.loaded || !this.mesh) return;
        const idx = this.morphTargets[name];
        if (idx === undefined) return;
        this.mesh.morphTargetInfluences[idx] = Math.max(0, Math.min(1, weight));
    }

    setBlendshapes(weights) {
        if (!this.loaded || !this.mesh) return;
        for (const [name, w] of Object.entries(weights)) {
            this.setBlendshape(name, w);
        }
    }

    resetBlendshapes() {
        if (!this.loaded || !this.mesh) return;
        for (let i = 0; i < this.mesh.morphTargetInfluences.length; i++) {
            this.mesh.morphTargetInfluences[i] = 0;
        }
    }

    getBlendshapeNames() { return Object.keys(this.morphTargets); }
    getBlendshapeCount() { return Object.keys(this.morphTargets).length; }
    update() { this.renderer.render(this.scene, this.camera); }

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
