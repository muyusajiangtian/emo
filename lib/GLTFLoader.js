/**
 * Three.js GLTFLoader (simplified for r128, global THREE namespace)
 * Supports: meshes with morph targets, materials, scene hierarchy
 * Based on Three.js examples/js/loaders/GLTFLoader.js
 */
(function () {

    function GLTFLoader(manager) {
        this.manager = manager || THREE.DefaultLoadingManager;
    }

    GLTFLoader.prototype = {
        constructor: GLTFLoader,

        load: function (url, onLoad, onProgress, onError) {
            const loader = new THREE.FileLoader(this.manager);
            loader.setResponseType('arraybuffer');
            loader.load(url, (data) => {
                try {
                    this.parse(data, '', (gltf) => {
                        onLoad(gltf);
                    }, onError);
                } catch (e) {
                    if (onError) onError(e);
                    else console.error(e);
                }
            }, onProgress, onError);
        },

        parse: function (data, path, onLoad, onError) {
            let json;
            let buffers;
            const magic = new Uint32Array(data, 0, 1)[0];

            if (magic === 0x46546C67) {
                // GLB
                const parsed = this._parseGLB(data);
                json = parsed.json;
                buffers = parsed.buffers;
            } else {
                const text = new TextDecoder().decode(data);
                json = JSON.parse(text);
                buffers = [];
            }

            const parser = new GLTFParser(json, buffers, path);
            parser.parse((scene, meshes) => {
                onLoad({ scene, scenes: [scene], animations: [] });
            });
        },

        _parseGLB: function (data) {
            const headerView = new DataView(data, 0, 12);
            const version = headerView.getUint32(4, true);
            const length = headerView.getUint32(8, true);

            let offset = 12;
            let json = null;
            const buffers = [];

            while (offset < length) {
                const chunkView = new DataView(data, offset, 8);
                const chunkLength = chunkView.getUint32(0, true);
                const chunkType = chunkView.getUint32(4, true);
                offset += 8;

                if (chunkType === 0x4E4F534A) {
                    const jsonData = new Uint8Array(data, offset, chunkLength);
                    json = JSON.parse(new TextDecoder().decode(jsonData));
                } else if (chunkType === 0x004E4942) {
                    buffers.push(data.slice(offset, offset + chunkLength));
                }
                offset += chunkLength;
            }

            return { json, buffers };
        }
    };

    function GLTFParser(json, buffers, path) {
        this.json = json;
        this.buffers = buffers;
        this.path = path;
        this.cache = {};
    }

    GLTFParser.prototype = {
        parse: function (onComplete) {
            const scene = new THREE.Group();
            const meshes = [];

            if (this.json.scenes && this.json.scenes.length > 0) {
                const sceneDef = this.json.scenes[this.json.scene || 0];
                if (sceneDef.nodes) {
                    for (const nodeIdx of sceneDef.nodes) {
                        const node = this._buildNode(nodeIdx);
                        if (node) scene.add(node);
                    }
                }
            }

            scene.traverse((child) => {
                if (child.isMesh) meshes.push(child);
            });

            onComplete(scene, meshes);
        },

        _buildNode: function (nodeIdx) {
            const nodeDef = this.json.nodes[nodeIdx];
            if (!nodeDef) return null;

            let obj;
            if (nodeDef.mesh !== undefined) {
                obj = this._buildMesh(nodeDef.mesh);
            } else {
                obj = new THREE.Group();
            }

            if (nodeDef.name) obj.name = nodeDef.name;

            if (nodeDef.translation) obj.position.fromArray(nodeDef.translation);
            if (nodeDef.rotation) obj.quaternion.fromArray(nodeDef.rotation);
            if (nodeDef.scale) obj.scale.fromArray(nodeDef.scale);
            if (nodeDef.matrix) {
                const m = new THREE.Matrix4();
                m.fromArray(nodeDef.matrix);
                m.decompose(obj.position, obj.quaternion, obj.scale);
            }

            if (nodeDef.children) {
                for (const childIdx of nodeDef.children) {
                    const child = this._buildNode(childIdx);
                    if (child) obj.add(child);
                }
            }

            return obj;
        },

        _buildMesh: function (meshIdx) {
            const meshDef = this.json.meshes[meshIdx];
            if (!meshDef) return new THREE.Group();

            const group = new THREE.Group();
            if (meshDef.name) group.name = meshDef.name;

            for (const primDef of meshDef.primitives) {
                const geometry = this._buildGeometry(primDef);
                const material = this._buildMaterial(primDef.material);

                let mesh;
                if (primDef.mode === 1) mesh = new THREE.LineSegments(geometry, material);
                else if (primDef.mode === 3) mesh = new THREE.Line(geometry, material);
                else mesh = new THREE.Mesh(geometry, material);

                if (geometry.morphAttributes && Object.keys(geometry.morphAttributes).length > 0) {
                    mesh.morphTargetInfluences = [];
                    mesh.morphTargetDictionary = {};

                    const targetNames = meshDef.extras && meshDef.extras.targetNames
                        ? meshDef.extras.targetNames
                        : (primDef.targets || []).map((_, i) => `morph_${i}`);

                    for (let i = 0; i < targetNames.length; i++) {
                        mesh.morphTargetDictionary[targetNames[i]] = i;
                        mesh.morphTargetInfluences.push(0);
                    }
                }

                group.add(mesh);
            }

            if (group.children.length === 1) {
                const single = group.children[0];
                single.name = group.name || single.name;
                return single;
            }
            return group;
        },

        _buildGeometry: function (primDef) {
            const geometry = new THREE.BufferGeometry();
            const accessors = this.json.accessors;
            const bufferViews = this.json.bufferViews;

            const attrMap = {
                POSITION: 'position',
                NORMAL: 'normal',
                TEXCOORD_0: 'uv',
                TEXCOORD_1: 'uv2',
                COLOR_0: 'color',
                JOINTS_0: 'skinIndex',
                WEIGHTS_0: 'skinWeight',
                TANGENT: 'tangent'
            };

            for (const [gltfAttr, threeAttr] of Object.entries(attrMap)) {
                if (primDef.attributes[gltfAttr] !== undefined) {
                    const attr = this._buildAttribute(primDef.attributes[gltfAttr]);
                    if (attr) geometry.setAttribute(threeAttr, attr);
                }
            }

            if (primDef.indices !== undefined) {
                const indexAttr = this._buildAttribute(primDef.indices);
                if (indexAttr) geometry.setIndex(indexAttr);
            }

            if (primDef.targets) {
                const morphPositions = [];
                const morphNormals = [];

                for (const target of primDef.targets) {
                    if (target.POSITION !== undefined) {
                        morphPositions.push(this._buildAttribute(target.POSITION));
                    }
                    if (target.NORMAL !== undefined) {
                        morphNormals.push(this._buildAttribute(target.NORMAL));
                    }
                }

                if (morphPositions.length > 0) {
                    geometry.morphAttributes.position = morphPositions;
                }
                if (morphNormals.length > 0) {
                    geometry.morphAttributes.normal = morphNormals;
                }
                geometry.morphTargetsRelative = true;
            }

            return geometry;
        },

        _buildAttribute: function (accessorIdx) {
            const accessor = this.json.accessors[accessorIdx];
            if (!accessor) return null;

            const bufferView = this.json.bufferViews[accessor.bufferView];
            const buffer = this.buffers[bufferView.buffer];
            if (!buffer) return null;

            const byteOffset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
            const componentType = accessor.componentType;
            const count = accessor.count;
            const type = accessor.type;

            let itemSize;
            switch (type) {
                case 'SCALAR': itemSize = 1; break;
                case 'VEC2': itemSize = 2; break;
                case 'VEC3': itemSize = 3; break;
                case 'VEC4': itemSize = 4; break;
                case 'MAT2': itemSize = 4; break;
                case 'MAT3': itemSize = 9; break;
                case 'MAT4': itemSize = 16; break;
                default: itemSize = 1;
            }

            let TypedArray;
            switch (componentType) {
                case 5120: TypedArray = Int8Array; break;
                case 5121: TypedArray = Uint8Array; break;
                case 5122: TypedArray = Int16Array; break;
                case 5123: TypedArray = Uint16Array; break;
                case 5125: TypedArray = Uint32Array; break;
                case 5126: TypedArray = Float32Array; break;
                default: TypedArray = Float32Array;
            }

            const byteStride = bufferView.byteStride;
            let array;

            if (byteStride && byteStride !== itemSize * TypedArray.BYTES_PER_ELEMENT) {
                const totalItems = count * itemSize;
                array = new TypedArray(totalItems);
                const srcView = new DataView(buffer, byteOffset);
                for (let i = 0; i < count; i++) {
                    for (let j = 0; j < itemSize; j++) {
                        const srcOff = i * byteStride + j * TypedArray.BYTES_PER_ELEMENT;
                        if (TypedArray === Float32Array) {
                            array[i * itemSize + j] = srcView.getFloat32(srcOff, true);
                        } else if (TypedArray === Uint16Array) {
                            array[i * itemSize + j] = srcView.getUint16(srcOff, true);
                        } else if (TypedArray === Uint32Array) {
                            array[i * itemSize + j] = srcView.getUint32(srcOff, true);
                        } else {
                            array[i * itemSize + j] = srcView.getUint8(srcOff);
                        }
                    }
                }
            } else {
                array = new TypedArray(buffer, byteOffset, count * itemSize);
            }

            if (componentType === 5123 || componentType === 5125) {
                return new THREE.BufferAttribute(array, itemSize);
            }

            return new THREE.BufferAttribute(array, itemSize, componentType === 5121);
        },

        _buildMaterial: function (materialIdx) {
            if (materialIdx === undefined || !this.json.materials || !this.json.materials[materialIdx]) {
                return new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.7, metalness: 0.0 });
            }

            const matDef = this.json.materials[materialIdx];
            const params = { side: THREE.FrontSide };

            if (matDef.pbrMetallicRoughness) {
                const pbr = matDef.pbrMetallicRoughness;
                if (pbr.baseColorFactor) {
                    params.color = new THREE.Color(pbr.baseColorFactor[0], pbr.baseColorFactor[1], pbr.baseColorFactor[2]);
                    if (pbr.baseColorFactor[3] < 1) params.transparent = true;
                    params.opacity = pbr.baseColorFactor[3];
                }
                params.roughness = pbr.roughnessFactor !== undefined ? pbr.roughnessFactor : 1.0;
                params.metalness = pbr.metallicFactor !== undefined ? pbr.metallicFactor : 0.0;
            }

            if (matDef.doubleSided) params.side = THREE.DoubleSide;
            if (matDef.alphaMode === 'BLEND') params.transparent = true;

            params.morphTargets = true;
            params.morphNormals = true;

            return new THREE.MeshStandardMaterial(params);
        }
    };

    THREE.GLTFLoader = GLTFLoader;

})();
