/**
 * 七情混合情感识别引擎
 * 支持：happy/sad/angry/surprise/fear/disgust/neutral
 * 基于音频频谱特征 + 语速节奏推断，输出每种情感的混合比例和强度值
 */
import { CONFIG } from './config.js';

export class EmotionEngine {
    constructor() {
        const cfg = CONFIG.emotion;

        // 基线校准
        this.baseline = null;
        this.samples = [];
        this.calibrated = false;
        this.CAL_FRAMES = cfg.calibrationFrames;

        // EMA平滑
        this.smooth = null;
        this.ALPHA = cfg.featureAlpha;

        // 低通滤波后的各情感得分
        this.smoothScores = {};
        for (const e of cfg.emotions) this.smoothScores[e] = e === 'neutral' ? 1 : 0;
        this.LPF_ALPHA = cfg.scoreLpfAlpha;

        // 最终输出的混合情感
        this.emotionMix = {};
        for (const e of cfg.emotions) this.emotionMix[e] = e === 'neutral' ? 1 : 0;
        this.dominantEmotion = 'neutral';
        this.confidence = 0;

        // 语速检测（音节率估计）
        this.energyHistory = [];
        this.RHYTHM_WINDOW = cfg.rhythmWindowFrames;
        this.speechRate = 0;
        this.rhythmRegularity = 0;

        // 频谱特征缓存
        this.spectralFlux = 0;
        this.lastSpectrum = null;
        this.harmonicity = 0;
    }

    /**
     * 主更新方法
     * @param {Object} feat - {energy, loudness, zcr, centroid, pitch, mfcc, spectralFlux, harmonicity}
     * @returns {Object} {emotions: {happy:0.3, sad:0.1, ...}, dominant, confidence, calibrating}
     */
    update(feat) {
        if (!feat) return this._result();

        // 校准阶段
        if (!this.calibrated) {
            this.samples.push(feat);
            if (this.samples.length >= this.CAL_FRAMES) this._calibrate();
            return { emotions: this.emotionMix, dominant: 'neutral', confidence: 0, calibrating: true };
        }

        // EMA特征平滑
        this._ema(feat);

        // 语速/节奏分析
        this._updateRhythm(feat);

        // 频谱变化率
        this._updateSpectralDynamics(feat);

        // z-score归一化
        const z = this._computeZScores();

        // 静音快速返回（只有能量极低时才认为静音）
        if (this.smooth.energy < this.baseline.energy.mean * 1.2) {
            const silentScores = {};
            for (const e of CONFIG.emotion.emotions) silentScores[e] = e === 'neutral' ? 1 : 0;
            this._lpfScores(silentScores);
            this._computeMix();
            return this._result();
        }

        // 多维特征规则评分
        const scores = this._computeScores(z, feat);

        // 低通滤波
        this._lpfScores(scores);

        // 计算混合比例
        this._computeMix();

        return this._result();
    }

    /**
     * 计算7种情感的原始得分
     * 悲伤需要多维特征共同满足才触发高分，避免偏差
     */
    _computeScores(z, feat) {
        const scores = { happy: 0, sad: 0, angry: 0, surprise: 0, fear: 0, disgust: 0, neutral: 0 };

        // === 高兴 ===
        // 中高能量 + 明亮音色（高质心）+ 音高偏高
        if (z.energy > 0.1) scores.happy += 1.5;
        if (z.centroid > 0.2) scores.happy += 2;
        if (z.zcr > 0 && z.zcr < 1.5) scores.happy += 1;
        if (z.loudness > 0.1) scores.happy += 1;
        if (this.speechRate > 0.2) scores.happy += 1.5;
        if (z.pitch > 0.2) scores.happy += 2;
        if (feat.mfcc && feat.mfcc[1] > 2) scores.happy += 1;

        // === 悲伤 ===
        // 必须满足"低能量+低音高"的组合才开始加分——单独低能量不算悲伤
        const sadLowEnergy = z.energy < -0.3;
        const sadLowPitch = z.pitch < -0.4;
        const sadLowCentroid = z.centroid < -0.4;
        const sadSlow = this.speechRate < -0.3;

        // 核心条件：低能量且低音高同时满足才触发
        if (sadLowEnergy && sadLowPitch) scores.sad += 4;
        else if (sadLowEnergy && sadLowCentroid) scores.sad += 2.5;
        else if (sadLowPitch && sadLowCentroid) scores.sad += 2;
        // 附加条件
        if (sadSlow && (sadLowEnergy || sadLowPitch)) scores.sad += 1.5;
        if (z.loudness < -0.4 && sadLowPitch) scores.sad += 1;

        // === 愤怒 ===
        // 高能量 + 高ZCR + 高质心 + 快语速
        if (z.energy > 0.8) scores.angry += 3;
        if (z.zcr > 0.6) scores.angry += 2;
        if (z.centroid > 0.5) scores.angry += 1.5;
        if (z.loudness > 0.6) scores.angry += 2;
        if (this.speechRate > 0.5) scores.angry += 1.5;
        if (this.spectralFlux > 0.5) scores.angry += 1.5;

        // === 惊讶 ===
        // 突然能量跃变 + 高音高 + 高频谱变化率
        if (this.spectralFlux > 0.4) scores.surprise += 2;
        if (z.pitch > 0.6) scores.surprise += 2.5;
        if (z.energy > 0.3 && this.spectralFlux > 0.3) scores.surprise += 2;
        if (z.centroid > 0.4) scores.surprise += 1;
        if (z.loudness > 0.3) scores.surprise += 1;

        // === 恐惧 ===
        // 高音高 + 高ZCR + 不规则节奏
        if (z.pitch > 0.3) scores.fear += 2;
        if (z.zcr > 0.4) scores.fear += 1.5;
        if (this.rhythmRegularity < 0.3) scores.fear += 2;
        if (z.energy > 0.2 && z.energy < 0.8) scores.fear += 1;
        if (this.spectralFlux > 0.4 && this.rhythmRegularity < 0.4) scores.fear += 1.5;

        // === 厌恶 ===
        // 低音高 + 鼻音MFCC + 中等能量
        if (z.pitch < -0.2) scores.disgust += 1.5;
        if (z.zcr < 0 && z.zcr > -0.6) scores.disgust += 1;
        if (z.energy > -0.3 && z.energy < 0.4) scores.disgust += 1;
        if (this.speechRate < -0.1) scores.disgust += 1;
        if (z.centroid < -0.1) scores.disgust += 0.5;
        if (feat.mfcc && feat.mfcc[0] < -2 && Math.abs(feat.mfcc[1]) > 4) scores.disgust += 2.5;

        // === 中性 ===
        // 所有特征接近基线
        const dist = Math.abs(z.energy) + Math.abs(z.zcr) + Math.abs(z.centroid) + Math.abs(z.pitch);
        if (dist < 0.8) scores.neutral += 4;
        else if (dist < 1.5) scores.neutral += 2;
        else if (dist < 2.5) scores.neutral += 0.5;
        if (this.rhythmRegularity > 0.6 && Math.abs(this.speechRate) < 0.2) scores.neutral += 1;

        return scores;
    }

    /**
     * 语速和节奏特征更新
     */
    _updateRhythm(feat) {
        this.energyHistory.push(feat.energy);
        if (this.energyHistory.length > this.RHYTHM_WINDOW) this.energyHistory.shift();

        if (this.energyHistory.length < 10) return;

        // 语速估计：统计能量包络的峰值数（近似音节率）
        const history = this.energyHistory;
        const mean = history.reduce((a, b) => a + b, 0) / history.length;
        let peaks = 0;
        for (let i = 1; i < history.length - 1; i++) {
            if (history[i] > history[i-1] && history[i] > history[i+1] && history[i] > mean * 1.3) {
                peaks++;
            }
        }
        // 归一化到 [-1, 1] 范围（假设正常语速约3-5峰/30帧）
        const normalPeaks = 4;
        this.speechRate = (peaks - normalPeaks) / normalPeaks;

        // 节奏规则性：能量包络的自相关
        let autoCorr = 0, norm = 0;
        for (let i = 0; i < history.length - 5; i++) {
            autoCorr += (history[i] - mean) * (history[i + 5] - mean);
            norm += (history[i] - mean) ** 2;
        }
        this.rhythmRegularity = norm > 0 ? Math.max(0, autoCorr / norm) : 0.5;
    }

    /**
     * 频谱动态特征
     */
    _updateSpectralDynamics(feat) {
        if (feat.spectralFlux !== undefined) {
            this.spectralFlux += (feat.spectralFlux - this.spectralFlux) * 0.3;
        } else {
            // 从能量变化率估算
            if (this.energyHistory.length >= 2) {
                const prev = this.energyHistory[this.energyHistory.length - 2] || 0;
                const curr = feat.energy;
                const flux = Math.abs(curr - prev) / (Math.max(prev, 0.0001));
                this.spectralFlux += (Math.min(flux, 1) - this.spectralFlux) * 0.3;
            }
        }
    }

    /**
     * 计算z-scores
     */
    _computeZScores() {
        return {
            energy: this._z(this.smooth.energy, this.baseline.energy),
            zcr: this._z(this.smooth.zcr, this.baseline.zcr),
            centroid: this._z(this.smooth.centroid, this.baseline.centroid),
            loudness: this._z(this.smooth.loudness, this.baseline.loudness),
            pitch: this.smooth.pitch > 0 && this.baseline.pitch.std > 0
                ? this._z(this.smooth.pitch, this.baseline.pitch) : 0,
        };
    }

    /**
     * 计算混合情感比例
     */
    _computeMix() {
        const total = Object.values(this.smoothScores).reduce((a, b) => a + Math.max(b, 0), 0) || 1;

        let bestEmo = 'neutral', bestVal = 0;
        for (const [e, s] of Object.entries(this.smoothScores)) {
            const intensity = Math.max(s, 0) / total;
            this.emotionMix[e] = intensity < CONFIG.emotion.intensityThreshold ? 0 : intensity;
            if (s > bestVal) { bestVal = s; bestEmo = e; }
        }

        this.dominantEmotion = bestEmo;
        this.confidence = bestVal / total;
    }

    _lpfScores(rawScores) {
        const a = this.LPF_ALPHA;
        for (const k of Object.keys(this.smoothScores)) {
            const raw = rawScores[k] || 0;
            this.smoothScores[k] += (raw - this.smoothScores[k]) * a;
        }
    }

    _result() {
        return {
            emotions: { ...this.emotionMix },
            dominant: this.dominantEmotion,
            confidence: this.confidence,
            calibrating: !this.calibrated,
            // 兼容旧接口
            emotion: this.dominantEmotion,
        };
    }

    _ema(feat) {
        const a = this.ALPHA;
        if (!this.smooth) {
            this.smooth = { ...feat, pitch: feat.pitch || 0 };
            return;
        }
        this.smooth.energy = a * feat.energy + (1 - a) * this.smooth.energy;
        this.smooth.loudness = a * feat.loudness + (1 - a) * this.smooth.loudness;
        this.smooth.zcr = a * feat.zcr + (1 - a) * this.smooth.zcr;
        this.smooth.centroid = a * feat.centroid + (1 - a) * this.smooth.centroid;
        if (feat.pitch > 0) {
            this.smooth.pitch = a * feat.pitch + (1 - a) * (this.smooth.pitch || feat.pitch);
        }
    }

    _calibrate() {
        const calc = (arr) => {
            const valid = arr.filter(v => v > 0);
            if (valid.length === 0) return { mean: 0, std: 1 };
            const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
            const std = Math.sqrt(valid.reduce((s, v) => s + (v - mean) ** 2, 0) / valid.length);
            return { mean, std: Math.max(std, mean * 0.1 + 1e-6) };
        };
        // 滤掉能量过大的帧（可能用户在校准期间说话了）
        const energies = this.samples.map(f => f.energy);
        const medianEnergy = [...energies].sort((a, b) => a - b)[Math.floor(energies.length / 2)];
        const quietSamples = this.samples.filter(f => f.energy < medianEnergy * 3);
        const useSamples = quietSamples.length > 20 ? quietSamples : this.samples;

        this.baseline = {
            energy: calc(useSamples.map(f => f.energy)),
            loudness: calc(useSamples.map(f => f.loudness)),
            zcr: calc(useSamples.map(f => f.zcr)),
            centroid: calc(useSamples.map(f => f.centroid)),
            pitch: calc(useSamples.map(f => f.pitch).filter(p => p > 0)),
        };
        // 如果pitch基线没有样本，使用合理默认值
        if (this.baseline.pitch.mean === 0) {
            this.baseline.pitch = { mean: 180, std: 40 };
        }
        this.calibrated = true;
        console.log('[情绪] 七情引擎基线校准完成', this.baseline);
    }

    _z(value, stat) {
        return (value - stat.mean) / stat.std;
    }

    /**
     * 句子模式：对整段语音分析
     */
    classifySentence(featureArray) {
        if (!featureArray || featureArray.length === 0 || !this.calibrated) {
            return this._result();
        }

        const mean = this._computeMeanFeatures(featureArray);
        const z = {
            energy: this._z(mean.energy, this.baseline.energy),
            zcr: this._z(mean.zcr, this.baseline.zcr),
            centroid: this._z(mean.centroid, this.baseline.centroid),
            loudness: this._z(mean.loudness, this.baseline.loudness),
            pitch: mean.pitch > 0 && this.baseline.pitch.std > 0
                ? this._z(mean.pitch, this.baseline.pitch) : 0,
        };

        const scores = this._computeScores(z, mean);

        // 额外句子级特征
        const pitchValues = featureArray.filter(f => f.pitch > 0).map(f => f.pitch);
        if (pitchValues.length > 3) {
            const pitchRange = Math.max(...pitchValues) - Math.min(...pitchValues);
            if (pitchRange > 100) { scores.surprise += 1; scores.happy += 0.5; }
            if (pitchRange < 30) scores.sad += 1;
        }

        // 能量方差
        const eVar = this._variance(featureArray.map(f => f.energy));
        if (eVar > mean.energy * 0.5) scores.angry += 1;

        // 直接应用到smoothScores
        for (const k of Object.keys(this.smoothScores)) {
            this.smoothScores[k] = scores[k] || 0;
        }
        this._computeMix();
        return this._result();
    }

    _computeMeanFeatures(featureArray) {
        const n = featureArray.length;
        const sum = { energy: 0, loudness: 0, zcr: 0, centroid: 0, pitch: 0 };
        let pitchCount = 0;
        const mfccSum = new Array(CONFIG.audio.mfccCoefficients).fill(0);
        let mfccCount = 0;

        for (const f of featureArray) {
            sum.energy += f.energy;
            sum.loudness += f.loudness;
            sum.zcr += f.zcr;
            sum.centroid += f.centroid;
            if (f.pitch > 0) { sum.pitch += f.pitch; pitchCount++; }
            if (f.mfcc) {
                for (let i = 0; i < f.mfcc.length; i++) mfccSum[i] += f.mfcc[i];
                mfccCount++;
            }
        }

        const result = {
            energy: sum.energy / n,
            loudness: sum.loudness / n,
            zcr: sum.zcr / n,
            centroid: sum.centroid / n,
            pitch: pitchCount > 0 ? sum.pitch / pitchCount : 0,
        };
        if (mfccCount > 0) {
            result.mfcc = mfccSum.map(v => v / mfccCount);
        }
        return result;
    }

    _variance(arr) {
        if (arr.length === 0) return 0;
        const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
        return arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
    }

    /**
     * 获取当前情感混合（供外部读取）
     */
    getEmotionMix() {
        return { ...this.emotionMix };
    }
}
