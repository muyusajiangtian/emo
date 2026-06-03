/**
 * GLTF Blendshape头部 - 加载GLB模型并通过混合形状驱动面部动画
 */
export class VirtualHead {
    constructor(container) {
        this.container = container;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);
        this.clock = new THREE.Clock();

        const w = container.clientWidth || 600;
        const h = container.clientHeight || 400;
        this.camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 50);
        this.camera.position.set(0, 0.05, 3.5);
        this.camera.lookAt(0, -0.1, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setSize(w, h);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(this.renderer.domElement);

        this._setupLights();

        // Blendshape相关
        this.mesh = null;
        this.morphTargets = {};
        this.loaded = false;
        this.loadError = null;

        // 名称别名映射（兼容不同模型的命名）
        this.nameAliases = {
            'browDown_L': 'browDownLeft',
            'browDown_R': 'browDownRight',
            'browInnerUp': 'browInnerUp',
            'browOuterUp_L': 'browOuterUpLeft',
            'browOuterUp_R': 'browOuterUpRight',
            'eyeBlink_L': 'eyeBlinkLeft',
            'eyeBlink_R': 'eyeBlinkRight',
            'eyeSquint_L': 'eyeSquintLeft',
            'eyeSquint_R': 'eyeSquintRight',
            'eyeWide_L': 'eyeWideLeft',
            'eyeWide_R': 'eyeWideRight',
            'cheekPuff': 'cheekPuff',
            'cheekSquint_L': 'cheekSquintLeft',
            'cheekSquint_R': 'cheekSquintRight',
            'jawOpen': 'jawOpen',
            'jawForward': 'jawForward',
            'mouthSmile_L': 'mouthSmileLeft',
            'mouthSmile_R': 'mouthSmileRight',
            'mouthFrown_L': 'mouthFrownLeft',
            'mouthFrown_R': 'mouthFrownRight',
            'mouthPucker': 'mouthPucker',
            'mouthFunnel': 'mouthFunnel',
            'mouthOpen': 'mouthOpen',
            'mouthClose': 'mouthClose',
            'mouthLeft': 'mouthLeft',
            'mouthRight': 'mouthRight',
            'noseSneer_L': 'noseSneerLeft',
            'noseSneer_R': 'noseSneerRight',
        };

        this._loadModel();
        window.addEventListener('resize', () => this._resize());
    }

    _setupLights() {
        this.scene.add(new THREE.AmbientLight(0x404050, 0.4));
        this.scene.add(new THREE.HemisphereLight(0xffeedd, 0x333344, 0.5));
        const key = new THREE.DirectionalLight(0xffffff, 1.2);
        key.position.set(2, 3, 4);
        this.scene.add(key);
        const fill = new THREE.DirectionalLight(0x8899cc, 0.4);
        fill.position.set(-3, 1, 2);
        this.scene.add(fill);
        const rim = new THREE.DirectionalLight(0xffffee, 0.3);
        rim.position.set(0, -1, -4);
        this.scene.add(rim);
    }

    async _loadModel() {
        try {
            const loader = new THREE.GLTFLoader();
            const gltf = await new Promise((resolve, reject) => {
                loader.load('models/head.glb', resolve, undefined, reject);
            });

            // 查找含有morph targets的mesh
            gltf.scene.traverse((child) => {
                if (child.isMesh && child.morphTargetInfluences && child.morphTargetInfluences.length > 0) {
                    if (!this.mesh || child.morphTargetInfluences.length > this.mesh.morphTargetInfluences.length) {
                        this.mesh = child;
                    }
                }
            });

            if (!this.mesh) {
                console.warn('[头部] 模型中未找到含morph targets的mesh，启用备用模型');
                this._buildFallbackModel();
                return;
            }

            // 构建标准名称→索引映射
            const dict = this.mesh.morphTargetDictionary || {};
            this.morphTargets = {};

            for (const [name, idx] of Object.entries(dict)) {
                this.morphTargets[name] = idx;
            }

            for (const [alias, standard] of Object.entries(this.nameAliases)) {
                if (alias in dict && !(standard in this.morphTargets)) {
                    this.morphTargets[standard] = dict[alias];
                }
            }

            gltf.scene.position.set(0, 0, 0);
            this.scene.add(gltf.scene);

            this.loaded = true;
            console.log(`[头部] 模型已加载, ${Object.keys(this.morphTargets).length}个blendshapes:`,
                Object.keys(this.morphTargets).join(', '));
        } catch (e) {
            console.warn('[头部] GLTF模型加载失败，启用备用模型:', e.message);
            this._buildFallbackModel();
        }
    }

    _buildFallbackModel() {
        const segments = 80;
        const rings = 60;
        const geo = new THREE.SphereGeometry(1, segments, rings);
        const pos = geo.attributes.position;

        const smoothstep = (e0, e1, x) => {
            const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
            return t * t * (3 - 2 * t);
        };

        // 头部变形 - 高精度五官
        for (let i = 0; i < pos.count; i++) {
            let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);

            // 整体头部形状
            y *= 1.3;
            z *= 0.92;

            // 下巴收窄
            if (y < -0.3) {
                const jaw_f = 1 - Math.abs(y + 0.3) * 0.45;
                x *= Math.max(jaw_f, 0.4);
                z *= Math.max(jaw_f, 0.5);
            }
            if (y < -0.5 && z > 0) {
                const cf = smoothstep(-0.5, -0.9, y) * smoothstep(0, 0.3, z);
                z += 0.12 * cf;
                y -= 0.05 * cf;
            }

            // 眉弓
            if (y > 0.2 && y < 0.45 && z > 0.3 && Math.abs(x) < 0.55) {
                const bf = smoothstep(0.2, 0.32, y) * (1 - smoothstep(0.38, 0.45, y)) * smoothstep(0.3, 0.5, z) * (1 - smoothstep(0.5, 0.55, Math.abs(x)));
                z += 0.07 * bf;
                y += 0.02 * bf;
            }

            // 眼窝
            const eyePositions = [[-0.28, 0.18], [0.28, 0.18]];
            for (const [ecx, ecy] of eyePositions) {
                const dxe = (x - ecx) / 0.14;
                const dye = (y - ecy) / 0.09;
                const de = dxe * dxe + dye * dye;
                if (de < 1.0 && z > 0.3) {
                    const depth = Math.pow(1 - de, 1.5);
                    const zf = smoothstep(0.3, 0.6, z);
                    z -= 0.11 * depth * zf;
                    if (de > 0.6 && de < 1.2) {
                        z += 0.025 * (1 - Math.abs(de - 0.85) / 0.35) * zf;
                    }
                }
            }

            // 鼻梁
            if (Math.abs(x) < 0.12 && y > -0.15 && y < 0.28 && z > 0.4) {
                const nbf = (1 - Math.abs(x) / 0.12) * smoothstep(0.4, 0.6, z);
                const bh = 0.06 + 0.04 * smoothstep(-0.15, 0.2, y);
                z += bh * nbf;
            }

            // 鼻尖
            const dnt = Math.sqrt(x * x + (y + 0.1) * (y + 0.1));
            if (dnt < 0.1 && z > 0.5) {
                z += 0.14 * Math.pow(1 - dnt / 0.1, 2);
            }

            // 鼻翼
            for (const side of [-1, 1]) {
                const wcx = side * 0.08;
                const dw = Math.sqrt((x - wcx) * (x - wcx) + (y + 0.14) * (y + 0.14));
                if (dw < 0.07 && z > 0.5) {
                    const wf = Math.pow(1 - dw / 0.07, 2);
                    z += 0.06 * wf;
                    x += side * 0.03 * wf;
                }
            }

            // 上唇
            const mcy = -0.35;
            if (y > mcy - 0.02 && y < mcy + 0.06 && Math.abs(x) < 0.2 && z > 0.4) {
                const ulf = smoothstep(mcy - 0.02, mcy + 0.01, y) * (1 - smoothstep(mcy + 0.03, mcy + 0.06, y)) * (1 - Math.abs(x) / 0.2) * smoothstep(0.4, 0.6, z);
                z += 0.05 * ulf;
            }
            // 下唇
            if (y < mcy && y > mcy - 0.08 && Math.abs(x) < 0.17 && z > 0.4) {
                const llf = smoothstep(mcy - 0.08, mcy - 0.04, y) * (1 - smoothstep(mcy - 0.02, mcy, y)) * (1 - Math.abs(x) / 0.17) * smoothstep(0.4, 0.6, z);
                z += 0.045 * llf;
            }

            // 颧骨
            if (y > -0.15 && y < 0.15 && Math.abs(x) > 0.35 && z > 0.2) {
                const ckf = smoothstep(0.35, 0.55, Math.abs(x)) * (1 - smoothstep(0.55, 0.7, Math.abs(x))) * (1 - Math.abs(y) / 0.15) * smoothstep(0.2, 0.4, z);
                z += 0.05 * ckf;
            }

            // 耳朵
            for (const side of [-1, 1]) {
                const earCx = side * 0.75;
                const dxEar = Math.abs(x) - Math.abs(earCx);
                const dyEar = y - 0.05;
                if (Math.abs(x) > 0.6 && Math.abs(dxEar) < 0.12 && Math.abs(dyEar) < 0.18 && Math.abs(z) < 0.3) {
                    const ed = (dxEar / 0.12) ** 2 + (dyEar / 0.18) ** 2;
                    if (ed < 1.0) {
                        const ef = Math.pow(1 - ed, 1.2);
                        x += side * 0.1 * ef;
                    }
                }
            }

            // 下巴凸起
            if (Math.abs(x) < 0.12 && y < -0.55 && y > -0.8 && z > 0.2) {
                const cpf = (1 - Math.abs(x) / 0.12) * smoothstep(-0.8, -0.65, y) * (1 - smoothstep(-0.58, -0.55, y)) * smoothstep(0.2, 0.4, z);
                z += 0.06 * cpf;
            }

            pos.setXYZ(i, x, y, z);
        }
        geo.computeVertexNormals();

        // 生成morph targets
        const blendshapeNames = [
            'browInnerUp', 'browOuterUpLeft', 'browOuterUpRight',
            'browDownLeft', 'browDownRight',
            'eyeBlinkLeft', 'eyeBlinkRight', 'eyeWideLeft', 'eyeWideRight',
            'eyeSquintLeft', 'eyeSquintRight',
            'cheekPuff', 'cheekSquintLeft', 'cheekSquintRight',
            'jawOpen', 'jawForward',
            'mouthSmileLeft', 'mouthSmileRight',
            'mouthFrownLeft', 'mouthFrownRight',
            'mouthPucker', 'mouthFunnel', 'mouthOpen', 'mouthClose',
            'mouthLeft', 'mouthRight',
            'noseSneerLeft', 'noseSneerRight',
        ];

        const morphPositions = [];
        const S = 2.0;

        for (const bsName of blendshapeNames) {
            const arr = new Float32Array(pos.count * 3);
            for (let i = 0; i < pos.count; i++) {
                const bx = pos.getX(i), by = pos.getY(i), bz = pos.getZ(i);
                let dx = 0, dy = 0, dz = 0;

                if (bsName === 'jawOpen' && by < -0.25 && bz > 0.05) {
                    const f = smoothstep(-0.25, -0.6, by) * smoothstep(0.05, 0.2, bz);
                    dy = -0.2 * S * f; dz = -0.04 * S * f;
                } else if (bsName === 'mouthSmileLeft' && by < -0.15 && by > -0.55 && bx < -0.05 && bz > 0.4) {
                    const f = Math.max(0, 1 - Math.abs(by + 0.35) / 0.2) * smoothstep(-0.05, -0.15, bx) * smoothstep(0.4, 0.6, bz);
                    dx = -0.05 * S * f; dy = 0.06 * S * f;
                } else if (bsName === 'mouthSmileRight' && by < -0.15 && by > -0.55 && bx > 0.05 && bz > 0.4) {
                    const f = Math.max(0, 1 - Math.abs(by + 0.35) / 0.2) * smoothstep(0.05, 0.15, bx) * smoothstep(0.4, 0.6, bz);
                    dx = 0.05 * S * f; dy = 0.06 * S * f;
                } else if (bsName === 'mouthFrownLeft' && by < -0.2 && by > -0.6 && bx < -0.05 && bz > 0.4) {
                    const f = Math.max(0, 1 - Math.abs(by + 0.4) / 0.2) * smoothstep(-0.05, -0.15, bx) * smoothstep(0.4, 0.6, bz);
                    dx = -0.03 * S * f; dy = -0.06 * S * f;
                } else if (bsName === 'mouthFrownRight' && by < -0.2 && by > -0.6 && bx > 0.05 && bz > 0.4) {
                    const f = Math.max(0, 1 - Math.abs(by + 0.4) / 0.2) * smoothstep(0.05, 0.15, bx) * smoothstep(0.4, 0.6, bz);
                    dx = 0.03 * S * f; dy = -0.06 * S * f;
                } else if (bsName === 'mouthPucker' && by < -0.2 && by > -0.5 && Math.abs(bx) < 0.2 && bz > 0.5) {
                    const f = Math.max(0, 1 - Math.abs(by + 0.35) / 0.15) * Math.max(0, 1 - Math.abs(bx) / 0.2) * smoothstep(0.5, 0.65, bz);
                    dx = -bx * 0.25 * S * f; dz = 0.07 * S * f;
                } else if (bsName === 'mouthFunnel' && by < -0.2 && by > -0.5 && Math.abs(bx) < 0.18 && bz > 0.5) {
                    const f = Math.max(0, 1 - Math.abs(by + 0.35) / 0.15) * Math.max(0, 1 - Math.abs(bx) / 0.18) * smoothstep(0.5, 0.65, bz);
                    dx = -bx * 0.18 * S * f; dy = (0.35 + by) * 0.12 * S * f; dz = 0.06 * S * f;
                } else if (bsName === 'mouthOpen' && by < -0.25 && by > -0.5 && Math.abs(bx) < 0.18 && bz > 0.45) {
                    const f = Math.max(0, 1 - Math.abs(by + 0.38) / 0.13) * smoothstep(0.45, 0.6, bz);
                    dy = by < -0.35 ? -0.09 * S * f : 0.04 * S * f;
                } else if (bsName === 'mouthClose' && by < -0.25 && by > -0.45 && Math.abs(bx) < 0.18 && bz > 0.5) {
                    const f = Math.max(0, 1 - Math.abs(by + 0.35) / 0.1) * smoothstep(0.5, 0.6, bz);
                    dy = by < -0.35 ? 0.03 * S * f : -0.025 * S * f; dz = 0.02 * S * f;
                } else if (bsName === 'mouthLeft' && by < -0.2 && by > -0.5 && Math.abs(bx) < 0.25 && bz > 0.4) {
                    const f = Math.max(0, 1 - Math.abs(by + 0.35) / 0.15) * smoothstep(0.4, 0.55, bz);
                    dx = -0.07 * S * f;
                } else if (bsName === 'mouthRight' && by < -0.2 && by > -0.5 && Math.abs(bx) < 0.25 && bz > 0.4) {
                    const f = Math.max(0, 1 - Math.abs(by + 0.35) / 0.15) * smoothstep(0.4, 0.55, bz);
                    dx = 0.07 * S * f;
                } else if (bsName === 'eyeBlinkLeft' && by > 0.05 && by < 0.32 && bx < -0.12 && bx > -0.45 && bz > 0.45) {
                    const f = Math.max(0, 1 - Math.abs(by - 0.18) / 0.13) * smoothstep(0.45, 0.6, bz);
                    dy = -0.06 * S * f;
                } else if (bsName === 'eyeBlinkRight' && by > 0.05 && by < 0.32 && bx > 0.12 && bx < 0.45 && bz > 0.45) {
                    const f = Math.max(0, 1 - Math.abs(by - 0.18) / 0.13) * smoothstep(0.45, 0.6, bz);
                    dy = -0.06 * S * f;
                } else if (bsName === 'eyeWideLeft' && by > 0.05 && by < 0.35 && bx < -0.12 && bx > -0.45 && bz > 0.45) {
                    const f = Math.max(0, 1 - Math.abs(by - 0.2) / 0.15) * smoothstep(0.45, 0.6, bz);
                    dy = 0.04 * S * f;
                } else if (bsName === 'eyeWideRight' && by > 0.05 && by < 0.35 && bx > 0.12 && bx < 0.45 && bz > 0.45) {
                    const f = Math.max(0, 1 - Math.abs(by - 0.2) / 0.15) * smoothstep(0.45, 0.6, bz);
                    dy = 0.04 * S * f;
                } else if (bsName === 'browInnerUp' && by > 0.25 && Math.abs(bx) < 0.25 && bz > 0.35) {
                    const f = smoothstep(0.25, 0.35, by) * (1 - Math.abs(bx) / 0.25) * smoothstep(0.35, 0.5, bz);
                    dy = 0.07 * S * f;
                } else if (bsName === 'browOuterUpLeft' && by > 0.25 && bx < -0.2 && bz > 0.3) {
                    const f = smoothstep(0.25, 0.35, by) * smoothstep(-0.2, -0.4, bx) * smoothstep(0.3, 0.5, bz);
                    dy = 0.06 * S * f;
                } else if (bsName === 'browOuterUpRight' && by > 0.25 && bx > 0.2 && bz > 0.3) {
                    const f = smoothstep(0.25, 0.35, by) * smoothstep(0.2, 0.4, bx) * smoothstep(0.3, 0.5, bz);
                    dy = 0.06 * S * f;
                } else if (bsName === 'browDownLeft' && by > 0.15 && by < 0.4 && bx < -0.1 && bz > 0.35) {
                    const f = Math.max(0, 1 - Math.abs(by - 0.27) / 0.12) * smoothstep(-0.1, -0.3, bx) * smoothstep(0.35, 0.5, bz);
                    dy = -0.05 * S * f;
                } else if (bsName === 'browDownRight' && by > 0.15 && by < 0.4 && bx > 0.1 && bz > 0.35) {
                    const f = Math.max(0, 1 - Math.abs(by - 0.27) / 0.12) * smoothstep(0.1, 0.3, bx) * smoothstep(0.35, 0.5, bz);
                    dy = -0.05 * S * f;
                } else if (bsName === 'eyeSquintLeft' && by > 0 && by < 0.28 && bx < -0.1 && bx > -0.42 && bz > 0.45) {
                    const f = Math.max(0, 1 - Math.abs(by - 0.14) / 0.14) * smoothstep(0.45, 0.6, bz);
                    dy = -0.025 * S * f; dz = 0.02 * S * f;
                } else if (bsName === 'eyeSquintRight' && by > 0 && by < 0.28 && bx > 0.1 && bx < 0.42 && bz > 0.45) {
                    const f = Math.max(0, 1 - Math.abs(by - 0.14) / 0.14) * smoothstep(0.45, 0.6, bz);
                    dy = -0.025 * S * f; dz = 0.02 * S * f;
                } else if (bsName === 'cheekPuff' && by > -0.35 && by < 0.05 && Math.abs(bx) > 0.3 && bz > 0.15) {
                    const f = smoothstep(0.3, 0.5, Math.abs(bx)) * Math.max(0, 1 - Math.abs(by + 0.15) / 0.2) * smoothstep(0.15, 0.3, bz);
                    dx = Math.sign(bx) * 0.07 * S * f; dz = 0.04 * S * f;
                } else if (bsName === 'cheekSquintLeft' && by > -0.08 && by < 0.15 && bx < -0.2 && bz > 0.35) {
                    const f = smoothstep(-0.2, -0.4, bx) * Math.max(0, 1 - Math.abs(by - 0.03) / 0.12) * smoothstep(0.35, 0.5, bz);
                    dy = 0.03 * S * f; dz = 0.02 * S * f;
                } else if (bsName === 'cheekSquintRight' && by > -0.08 && by < 0.15 && bx > 0.2 && bz > 0.35) {
                    const f = smoothstep(0.2, 0.4, bx) * Math.max(0, 1 - Math.abs(by - 0.03) / 0.12) * smoothstep(0.35, 0.5, bz);
                    dy = 0.03 * S * f; dz = 0.02 * S * f;
                } else if (bsName === 'jawForward' && by < -0.2 && bz > 0.2) {
                    const f = smoothstep(-0.2, -0.5, by) * smoothstep(0.2, 0.4, bz);
                    dz = 0.08 * S * f;
                } else if (bsName === 'noseSneerLeft' && by > -0.12 && by < 0.08 && bx < 0 && bz > 0.55) {
                    const f = Math.max(0, 1 - Math.abs(by + 0.02) / 0.1) * smoothstep(0, -0.15, bx) * smoothstep(0.55, 0.7, bz);
                    dy = 0.035 * S * f; dx = -0.02 * S * f;
                } else if (bsName === 'noseSneerRight' && by > -0.12 && by < 0.08 && bx > 0 && bz > 0.55) {
                    const f = Math.max(0, 1 - Math.abs(by + 0.02) / 0.1) * smoothstep(0, 0.15, bx) * smoothstep(0.55, 0.7, bz);
                    dy = 0.035 * S * f; dx = 0.02 * S * f;
                }

                arr[i * 3] = dx;
                arr[i * 3 + 1] = dy;
                arr[i * 3 + 2] = dz;
            }
            morphPositions.push(new THREE.BufferAttribute(arr, 3));
        }

        geo.morphAttributes.position = morphPositions;
        geo.morphTargetsRelative = true;

        const mat = new THREE.MeshStandardMaterial({
            color: 0xe0b090, roughness: 0.6, metalness: 0,
            morphTargets: true, morphNormals: true
        });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.morphTargetInfluences = new Array(blendshapeNames.length).fill(0);
        this.mesh.morphTargetDictionary = {};
        blendshapeNames.forEach((name, i) => { this.mesh.morphTargetDictionary[name] = i; });

        this.morphTargets = { ...this.mesh.morphTargetDictionary };
        this.scene.add(this.mesh);
        this.loaded = true;
        this.loadError = null;
        console.log(`[头部] 高精度备用模型已加载 (80×60网格, ${blendshapeNames.length}个blendshapes, 含五官特征)`);
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

    getBlendshapeNames() {
        return Object.keys(this.morphTargets);
    }

    getBlendshapeCount() {
        return Object.keys(this.morphTargets).length;
    }

    update() {
        this.renderer.render(this.scene, this.camera);
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
