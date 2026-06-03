/**
 * Blendshape动画驱动
 * 将情绪和口型映射到ARKit blendshape权重，线性插值平滑过渡
 */
export class AnimationDriver {
    constructor(head) {
        this.head = head;
        this.time = 0;

        // 情绪→blendshape权重预设
        this.emotionPresets = {
            happy: {
                mouthSmileLeft: 0.7,
                mouthSmileRight: 0.7,
                cheekSquintLeft: 0.4,
                cheekSquintRight: 0.4,
                eyeSquintLeft: 0.3,
                eyeSquintRight: 0.3,
                browInnerUp: 0.15,
                browOuterUpLeft: 0.1,
                browOuterUpRight: 0.1,
            },
            sad: {
                mouthFrownLeft: 0.6,
                mouthFrownRight: 0.6,
                browInnerUp: 0.5,
                browDownLeft: 0.2,
                browDownRight: 0.2,
                mouthPucker: 0.15,
                eyeSquintLeft: 0.1,
                eyeSquintRight: 0.1,
            },
            angry: {
                browDownLeft: 0.8,
                browDownRight: 0.8,
                noseSneerLeft: 0.5,
                noseSneerRight: 0.5,
                jawForward: 0.3,
                mouthFrownLeft: 0.3,
                mouthFrownRight: 0.3,
                eyeSquintLeft: 0.4,
                eyeSquintRight: 0.4,
            },
            neutral: {},
        };

        // 当前blendshape权重
        this.currentWeights = {};
        this.LERP_RATE = 4.0;

        // 眨眼
        this.blinkTimer = 0;
        this.blinkInterval = 3.5;
        this.blinking = false;
        this.blinkPhase = 0;
    }

    update(emotionResult, features, visemeWeights, dt) {
        this.time += dt;
        if (!this.head.loaded) return;

        // 目标权重 = 情绪预设
        const emotionTarget = this._getEmotionTarget(emotionResult);

        // 合并口型权重（口部取max，其余叠加）
        const merged = { ...emotionTarget };
        if (visemeWeights) {
            for (const [k, v] of Object.entries(visemeWeights)) {
                if (k.startsWith('mouth') || k.startsWith('jaw')) {
                    merged[k] = Math.max(merged[k] || 0, v);
                } else {
                    merged[k] = (merged[k] || 0) + v;
                }
            }
        }

        // 线性插值到目标
        const allKeys = new Set([...Object.keys(merged), ...Object.keys(this.currentWeights)]);
        for (const k of allKeys) {
            const target = merged[k] || 0;
            const cur = this.currentWeights[k] || 0;
            const newVal = cur + (target - cur) * Math.min(this.LERP_RATE * dt, 1);
            if (Math.abs(newVal) < 0.001 && target === 0) {
                delete this.currentWeights[k];
            } else {
                this.currentWeights[k] = newVal;
            }
        }

        // 自动眨眼
        this._updateBlink(dt);

        // 呼吸微动
        const breath = Math.sin(this.time * 0.8) * 0.01;
        this.currentWeights.jawOpen = (this.currentWeights.jawOpen || 0) + Math.max(breath, 0);

        // 应用到头部
        this.head.setBlendshapes(this.currentWeights);
    }

    _getEmotionTarget(emotionResult) {
        if (!emotionResult || emotionResult.calibrating) return {};
        const preset = this.emotionPresets[emotionResult.emotion] || {};
        const conf = Math.max(emotionResult.confidence || 0, 0.3);
        const weighted = {};
        for (const [k, v] of Object.entries(preset)) {
            weighted[k] = v * conf;
        }
        return weighted;
    }

    _updateBlink(dt) {
        this.blinkTimer += dt;
        if (!this.blinking && this.blinkTimer >= this.blinkInterval) {
            this.blinking = true;
            this.blinkPhase = 0;
            this.blinkTimer = 0;
            this.blinkInterval = 2.5 + Math.random() * 3;
        }
        if (this.blinking) {
            this.blinkPhase += dt * 8;
            if (this.blinkPhase < 1) {
                const v = Math.sin(this.blinkPhase * Math.PI);
                this.currentWeights.eyeBlinkLeft = v;
                this.currentWeights.eyeBlinkRight = v;
            } else {
                this.blinking = false;
                this.currentWeights.eyeBlinkLeft = 0;
                this.currentWeights.eyeBlinkRight = 0;
            }
        }
    }

    getCurrentWeights() {
        return { ...this.currentWeights };
    }

    idle(dt) {
        this.time += dt;
        if (!this.head.loaded) return;

        // 衰减所有权重
        for (const k of Object.keys(this.currentWeights)) {
            this.currentWeights[k] *= 0.95;
            if (Math.abs(this.currentWeights[k]) < 0.001) {
                delete this.currentWeights[k];
            }
        }

        this._updateBlink(dt);
        this.head.setBlendshapes(this.currentWeights);
    }
}
