/**
 * 情绪识别 - 阈值规则 + 5帧多数滤波
 */
export class EmotionEngine {
    constructor() {
        // 基线（自动校准）
        this.baseline = null;
        this.samples = [];
        this.calibrated = false;
        this.CAL_FRAMES = 50;

        // 5帧投票窗口
        this.window = [];
        this.WIN_SIZE = 5;
        this.current = 'neutral';
        this.confidence = 0;

        // EMA平滑后的特征
        this.smooth = null;
        this.ALPHA = 0.35;
    }

    /**
     * @param {Object} feat - {energy, loudness, zcr, centroid, pitch, mfcc}
     * @returns {Object} {emotion, confidence, calibrating}
     */
    update(feat) {
        if (!feat) return { emotion: this.current, confidence: 0, calibrating: false };

        // 校准阶段
        if (!this.calibrated) {
            this.samples.push(feat);
            if (this.samples.length >= this.CAL_FRAMES) this._calibrate();
            return { emotion: 'neutral', confidence: 0, calibrating: true };
        }

        // EMA平滑
        this._ema(feat);

        // 归一化特征 -> z-score
        const z = {
            energy: this._z(this.smooth.energy, this.baseline.energy),
            zcr: this._z(this.smooth.zcr, this.baseline.zcr),
            centroid: this._z(this.smooth.centroid, this.baseline.centroid),
            loudness: this._z(this.smooth.loudness, this.baseline.loudness),
        };

        // 静音检测
        if (this.smooth.energy < this.baseline.energy.mean * 0.3) {
            this._vote('neutral');
            return this._result();
        }

        // 阈值规则评分
        const scores = { happy: 0, sad: 0, angry: 0, neutral: 0 };

        // 高兴：中高能量、高质心、正ZCR
        if (z.energy > 0.3 && z.energy < 1.5) scores.happy += 2;
        if (z.centroid > 0.3) scores.happy += 2;
        if (z.zcr > 0 && z.zcr < 1) scores.happy += 1;
        if (z.loudness > 0.2) scores.happy += 1;

        // 悲伤：低能量、低质心、低ZCR
        if (z.energy < -0.2) scores.sad += 2;
        if (z.centroid < -0.3) scores.sad += 2;
        if (z.zcr < -0.2) scores.sad += 1;
        if (z.loudness < -0.3) scores.sad += 1;

        // 生气：高能量、高ZCR、高质心
        if (z.energy > 1.2) scores.angry += 3;
        if (z.zcr > 0.8) scores.angry += 2;
        if (z.centroid > 0.8) scores.angry += 1;
        if (z.loudness > 0.8) scores.angry += 1;

        // 中性：都在基线附近
        const dist = Math.abs(z.energy) + Math.abs(z.zcr) + Math.abs(z.centroid);
        if (dist < 1.0) scores.neutral += 3;
        if (dist < 0.5) scores.neutral += 2;

        // 取最高分
        let best = 'neutral', bestS = -1;
        for (const [e, s] of Object.entries(scores)) {
            if (s > bestS) { bestS = s; best = e; }
        }

        this._vote(best);
        // 置信度
        const total = Object.values(scores).reduce((a, b) => a + b, 0) || 1;
        this.confidence = bestS / total;

        return this._result();
    }

    _vote(emotion) {
        this.window.push(emotion);
        if (this.window.length > this.WIN_SIZE) this.window.shift();

        // 多数投票
        if (this.window.length >= this.WIN_SIZE) {
            const cnt = {};
            for (const e of this.window) cnt[e] = (cnt[e] || 0) + 1;
            let maxC = 0, winner = this.current;
            for (const [e, c] of Object.entries(cnt)) {
                if (c > maxC) { maxC = c; winner = e; }
            }
            // 需>=3票才切换
            if (winner !== this.current && maxC >= 3) this.current = winner;
            else if (winner === this.current) this.current = winner;
        }
    }

    _result() {
        return { emotion: this.current, confidence: this.confidence, calibrating: false };
    }

    _ema(feat) {
        const a = this.ALPHA;
        if (!this.smooth) { this.smooth = { ...feat }; return; }
        this.smooth.energy = a * feat.energy + (1 - a) * this.smooth.energy;
        this.smooth.loudness = a * feat.loudness + (1 - a) * this.smooth.loudness;
        this.smooth.zcr = a * feat.zcr + (1 - a) * this.smooth.zcr;
        this.smooth.centroid = a * feat.centroid + (1 - a) * this.smooth.centroid;
    }

    _calibrate() {
        const calc = (arr) => {
            const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
            const std = Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length);
            return { mean, std: Math.max(std, 1e-6) };
        };
        this.baseline = {
            energy: calc(this.samples.map(f => f.energy)),
            loudness: calc(this.samples.map(f => f.loudness)),
            zcr: calc(this.samples.map(f => f.zcr)),
            centroid: calc(this.samples.map(f => f.centroid)),
        };
        this.calibrated = true;
        console.log('[情绪] 基线校准完成:', this.baseline);
    }

    _z(value, stat) {
        return (value - stat.mean) / (stat.std * 2);
    }
}
