/**
 * FACS动画驱动器
 * 将情感混合比例通过FACS AU系统转换为blendshape权重
 * 支持300ms时间窗口插值平滑过渡
 */
import { CONFIG } from './config.js';
import { FACSDriver, EMOTION_AU_MAP, AU_TO_BLENDSHAPE } from './facs.js';

export class AnimationDriver {
    constructor(head) {
        this.head = head;
        this.time = 0;
        this.facs = new FACSDriver();

        const cfg = CONFIG.animation;

        // 当前blendshape权重
        this.currentWeights = {};

        // 过渡系统：起始快照 + 目标 + 进度
        this.transitionFrom = {};
        this.transitionTarget = {};
        this.transitionProgress = 1.0; // 1.0 = 过渡完成
        this.transitionDuration = cfg.transitionDurationMs / 1000; // 转为秒
        this.lastEmotionMix = {};

        // 眨眼
        this.blinkTimer = 0;
        this.blinkInterval = cfg.blinkIntervalMin + Math.random() * (cfg.blinkIntervalMax - cfg.blinkIntervalMin);
        this.blinking = false;
        this.blinkPhase = 0;
        this.blinkSpeed = cfg.blinkSpeed;

        // 微表情 & 呼吸
        this.breathAmp = cfg.breathAmplitude;
        this.breathFreq = cfg.breathFrequency;
        this.microAmp = cfg.microExpressionAmplitude;

        // 默认lerp
        this.lerpRate = cfg.defaultLerpRate;
    }

    /**
     * 主更新方法
     * @param {Object} emotionResult - {emotions: {happy:0.3,...}, dominant, confidence, calibrating}
     * @param {Object} features - 音频特征
     * @param {Object} visemeWeights - 口型blendshape权重
     * @param {number} dt - 帧间隔秒
     */
    update(emotionResult, features, visemeWeights, dt) {
        this.time += dt;
        if (!this.head.loaded) return;

        // 从情感混合计算AU目标
        const emotionTarget = this._computeEmotionBlendshapes(emotionResult, dt);

        // 合并口型权重（口型优先级高于情感对嘴部的控制）
        const merged = this._mergeViseme(emotionTarget, visemeWeights);

        // 添加微表情和呼吸
        this._addMicroExpressions(merged, dt);

        // 应用过渡插值
        const finalTarget = this._applyTransition(merged, dt);

        // 线性插值追踪
        const allKeys = new Set([...Object.keys(finalTarget), ...Object.keys(this.currentWeights)]);
        for (const k of allKeys) {
            const target = finalTarget[k] || 0;
            const cur = this.currentWeights[k] || 0;
            const newVal = cur + (target - cur) * Math.min(this.lerpRate * dt, 1);
            if (Math.abs(newVal) < 0.001 && target === 0) {
                delete this.currentWeights[k];
            } else {
                this.currentWeights[k] = newVal;
            }
        }

        // 眨眼
        this._updateBlink(dt);

        // 呼吸
        const breath = Math.sin(this.time * this.breathFreq * Math.PI * 2) * this.breathAmp;
        if (breath > 0) {
            this.currentWeights.jawOpen = (this.currentWeights.jawOpen || 0) + breath;
        }

        // 应用到头部模型
        this.head.setBlendshapes(this.currentWeights);
    }

    /**
     * 从情感混合计算目标blendshape
     */
    _computeEmotionBlendshapes(emotionResult, dt) {
        if (!emotionResult || emotionResult.calibrating) return {};

        const emotions = emotionResult.emotions || {};

        // 检测情感是否发生显著变化（触发过渡）
        if (this._emotionChanged(emotions)) {
            this._startTransition();
            this.lastEmotionMix = { ...emotions };
        }

        // 通过FACS计算AU值（同时更新内部状态用于UI显示）
        const auValues = this.facs.computeFromEmotions(emotions);

        // AU→blendshape转换（不再乘confidence，让表情幅度完全由情感强度决定）
        const weights = {};
        for (const [au, intensity] of Object.entries(auValues)) {
            if (intensity <= 0.001) continue;
            const mapping = AU_TO_BLENDSHAPE[au];
            if (!mapping) continue;
            for (const [bs, coeff] of Object.entries(mapping)) {
                weights[bs] = (weights[bs] || 0) + intensity * coeff;
            }
        }

        // Clamp
        for (const k of Object.keys(weights)) {
            weights[k] = Math.max(0, Math.min(1, weights[k]));
        }

        return weights;
    }

    /**
     * 检测情感是否有显著变化
     */
    _emotionChanged(newMix) {
        let totalDiff = 0;
        const allEmotions = new Set([...Object.keys(newMix), ...Object.keys(this.lastEmotionMix)]);
        for (const e of allEmotions) {
            totalDiff += Math.abs((newMix[e] || 0) - (this.lastEmotionMix[e] || 0));
        }
        return totalDiff > 0.15;
    }

    /**
     * 启动过渡：记录当前状态为起点
     */
    _startTransition() {
        this.transitionFrom = { ...this.currentWeights };
        this.transitionProgress = 0;
    }

    /**
     * 应用300ms过渡插值
     */
    _applyTransition(target, dt) {
        if (this.transitionProgress >= 1.0) return target;

        // 推进过渡进度
        this.transitionProgress += dt / this.transitionDuration;
        if (this.transitionProgress >= 1.0) {
            this.transitionProgress = 1.0;
            return target;
        }

        // 使用smoothstep缓动曲线
        const t = this.transitionProgress;
        const ease = t * t * (3 - 2 * t);

        // 在from和target之间插值
        const result = {};
        const allKeys = new Set([...Object.keys(this.transitionFrom), ...Object.keys(target)]);
        for (const k of allKeys) {
            const from = this.transitionFrom[k] || 0;
            const to = target[k] || 0;
            result[k] = from + (to - from) * ease;
        }
        return result;
    }

    /**
     * 合并口型权重
     * 嘴部blendshape: 口型优先（取max）；其他区域: 累加
     */
    _mergeViseme(emotionTarget, visemeWeights) {
        const merged = { ...emotionTarget };
        if (!visemeWeights) return merged;

        const mouthKeys = ['jawOpen', 'mouthOpen', 'mouthClose', 'mouthPucker', 'mouthFunnel',
            'mouthSmileLeft', 'mouthSmileRight', 'mouthFrownLeft', 'mouthFrownRight',
            'mouthStretchLeft', 'mouthStretchRight', 'mouthLeft', 'mouthRight',
            'mouthDimpleLeft', 'mouthDimpleRight', 'mouthPressLeft', 'mouthPressRight',
            'mouthRollLower', 'mouthRollUpper', 'mouthShrugLower', 'mouthShrugUpper',
            'mouthLowerDownLeft', 'mouthLowerDownRight', 'mouthUpperUpLeft', 'mouthUpperUpRight',
            'tongueOut'];

        for (const [k, v] of Object.entries(visemeWeights)) {
            if (mouthKeys.includes(k)) {
                // 口型权重覆盖情感（lip sync优先）
                merged[k] = Math.max(merged[k] || 0, v);
            } else {
                merged[k] = (merged[k] || 0) + v;
            }
        }
        return merged;
    }

    /**
     * 微表情：细微随机面部肌肉活动，提升真实感
     */
    _addMicroExpressions(weights, dt) {
        const amp = this.microAmp;
        const t = this.time;

        // 眉毛微动
        const browMicro = Math.sin(t * 1.3) * Math.sin(t * 0.7) * amp;
        weights.browInnerUp = (weights.browInnerUp || 0) + Math.max(browMicro, 0);

        // 嘴角微颤
        const mouthMicro = Math.sin(t * 2.1) * Math.cos(t * 1.1) * amp * 0.5;
        weights.mouthSmileLeft = (weights.mouthSmileLeft || 0) + Math.max(mouthMicro, 0);
        weights.mouthSmileRight = (weights.mouthSmileRight || 0) + Math.max(-mouthMicro, 0);

        // 鼻翼微动
        const noseMicro = Math.sin(t * 0.9) * amp * 0.3;
        weights.noseSneerLeft = (weights.noseSneerLeft || 0) + Math.max(noseMicro, 0);
    }

    _updateBlink(dt) {
        const cfg = CONFIG.animation;
        this.blinkTimer += dt;
        if (!this.blinking && this.blinkTimer >= this.blinkInterval) {
            this.blinking = true;
            this.blinkPhase = 0;
            this.blinkTimer = 0;
            this.blinkInterval = cfg.blinkIntervalMin + Math.random() * (cfg.blinkIntervalMax - cfg.blinkIntervalMin);
        }
        if (this.blinking) {
            this.blinkPhase += dt * this.blinkSpeed;
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

    /**
     * 获取FACS驱动器（供UI显示AU状态）
     */
    getFACS() {
        return this.facs;
    }

    idle(dt) {
        this.time += dt;
        if (!this.head.loaded) return;

        for (const k of Object.keys(this.currentWeights)) {
            this.currentWeights[k] *= 0.95;
            if (Math.abs(this.currentWeights[k]) < 0.001) delete this.currentWeights[k];
        }

        this._updateBlink(dt);

        // 呼吸
        const breath = Math.sin(this.time * this.breathFreq * Math.PI * 2) * this.breathAmp;
        if (breath > 0) this.currentWeights.jawOpen = breath;

        this.head.setBlendshapes(this.currentWeights);
    }
}
