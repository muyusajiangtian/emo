/**
 * 情绪识别 - 一阶低通滤波 + 严格5帧多数投票
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
        this.smoothConfidence = 0;

        // 一阶低通滤波参数
        this.LPF_ALPHA = 0.3;

        // 各情绪强度的低通状态
        this.smoothScores = { happy: 0, sad: 0, angry: 0, neutral: 1 };

        // EMA平滑后的特征
        this.smooth = null;
        this.ALPHA = 0.25;

        // 情绪切换需要连续稳定帧数
        this.stableCount = 0;
        this.stableEmotion = 'neutral';
        this.STABLE_THRESHOLD = 5;
    }

    /**
     * @param {Object} feat - {energy, loudness, zcr, centroid, pitch, mfcc}
     * @returns {Object} {emotion, confidence, calibrating}
     */
    update(feat) {
        if (!feat) return { emotion: this.current, confidence: this.smoothConfidence, calibrating: false };

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
            this._lpfScores({ happy: 0, sad: 0, angry: 0, neutral: 1 });
            return this._result();
        }

        // 阈值规则评分
        const scores = { happy: 0, sad: 0, angry: 0, neutral: 0 };

        if (z.energy > 0.3 && z.energy < 1.5) scores.happy += 2;
        if (z.centroid > 0.3) scores.happy += 2;
        if (z.zcr > 0 && z.zcr < 1) scores.happy += 1;
        if (z.loudness > 0.2) scores.happy += 1;

        if (z.energy < -0.2) scores.sad += 2;
        if (z.centroid < -0.3) scores.sad += 2;
        if (z.zcr < -0.2) scores.sad += 1;
        if (z.loudness < -0.3) scores.sad += 1;

        if (z.energy > 1.2) scores.angry += 3;
        if (z.zcr > 0.8) scores.angry += 2;
        if (z.centroid > 0.8) scores.angry += 1;
        if (z.loudness > 0.8) scores.angry += 1;

        const dist = Math.abs(z.energy) + Math.abs(z.zcr) + Math.abs(z.centroid);
        if (dist < 1.0) scores.neutral += 3;
        if (dist < 0.5) scores.neutral += 2;

        // 对每帧的得分进行低通滤波
        this._lpfScores(scores);

        // 从滤波后的得分中取最高
        let best = 'neutral', bestS = -1;
        for (const [e, s] of Object.entries(this.smoothScores)) {
            if (s > bestS) { bestS = s; best = e; }
        }

        this._vote(best);

        // 置信度也做低通
        const total = Object.values(this.smoothScores).reduce((a, b) => a + b, 0) || 1;
        const rawConf = bestS / total;
        this.smoothConfidence += (rawConf - this.smoothConfidence) * this.LPF_ALPHA;

        return this._result();
    }

    _lpfScores(rawScores) {
        const a = this.LPF_ALPHA;
        for (const k of Object.keys(this.smoothScores)) {
            const raw = rawScores[k] || 0;
            this.smoothScores[k] += (raw - this.smoothScores[k]) * a;
        }
    }

    _vote(emotion) {
        this.window.push(emotion);
        if (this.window.length > this.WIN_SIZE) this.window.shift();

        if (this.window.length >= this.WIN_SIZE) {
            const cnt = {};
            for (const e of this.window) cnt[e] = (cnt[e] || 0) + 1;
            let maxC = 0, winner = this.current;
            for (const [e, c] of Object.entries(cnt)) {
                if (c > maxC) { maxC = c; winner = e; }
            }

            // 稳定性检查：连续投票一致才切换
            if (winner !== this.current) {
                if (winner === this.stableEmotion) {
                    this.stableCount++;
                } else {
                    this.stableEmotion = winner;
                    this.stableCount = 1;
                }
                if (maxC >= 3 && this.stableCount >= this.STABLE_THRESHOLD) {
                    this.current = winner;
                    this.stableCount = 0;
                }
            } else {
                this.stableCount = 0;
                this.stableEmotion = this.current;
            }
        }
    }

    _result() {
        return { emotion: this.current, confidence: this.smoothConfidence, calibrating: false };
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
        console.log('[情绪] 基线校准完成:', JSON.stringify({
            energy: { mean: this.baseline.energy.mean.toFixed(6), std: this.baseline.energy.std.toFixed(6) },
            loudness: { mean: this.baseline.loudness.mean.toFixed(4), std: this.baseline.loudness.std.toFixed(4) },
            zcr: { mean: this.baseline.zcr.mean.toFixed(4), std: this.baseline.zcr.std.toFixed(4) },
            centroid: { mean: this.baseline.centroid.mean.toFixed(1), std: this.baseline.centroid.std.toFixed(1) },
        }));
    }

    _z(value, stat) {
        return (value - stat.mean) / (stat.std * 2);
    }

    /**
     * 句子模式：对整句特征进行分类
     * 使用整句MFCC均值 + 声学特征均值，产生稳定结果
     */
    classifySentence(featureArray) {
        console.log(`[情绪-句子] classifySentence被调用, 输入帧数=${featureArray ? featureArray.length : 0}`);
        if (!featureArray || featureArray.length === 0) {
            console.log('[情绪-句子] 无特征数据，返回neutral');
            return { emotion: 'neutral', confidence: 0, calibrating: false };
        }
        if (!this.calibrated) {
            console.log('[情绪-句子] 尚未校准，返回neutral');
            return { emotion: 'neutral', confidence: 0, calibrating: true };
        }

        const mean = this._computeMeanFeatures(featureArray);
        console.log(`[情绪-句子] 均值特征: energy=${mean.energy.toFixed(6)}, loudness=${mean.loudness.toFixed(4)}, zcr=${mean.zcr.toFixed(4)}, centroid=${mean.centroid.toFixed(1)}${mean.mfcc ? ', mfcc=[' + mean.mfcc.map(v=>v.toFixed(2)).join(',') + ']' : ''}`);

        const z = {
            energy: this._z(mean.energy, this.baseline.energy),
            zcr: this._z(mean.zcr, this.baseline.zcr),
            centroid: this._z(mean.centroid, this.baseline.centroid),
            loudness: this._z(mean.loudness, this.baseline.loudness),
        };
        console.log(`[情绪-句子] z-scores: energy=${z.energy.toFixed(3)}, zcr=${z.zcr.toFixed(3)}, centroid=${z.centroid.toFixed(3)}, loudness=${z.loudness.toFixed(3)}`);
        console.log(`[情绪-句子] 基线: energy(mean=${this.baseline.energy.mean.toFixed(6)}, std=${this.baseline.energy.std.toFixed(6)}), zcr(mean=${this.baseline.zcr.mean.toFixed(4)}, std=${this.baseline.zcr.std.toFixed(4)}), centroid(mean=${this.baseline.centroid.mean.toFixed(1)}, std=${this.baseline.centroid.std.toFixed(1)})`);

        const scores = { happy: 0, sad: 0, angry: 0, neutral: 0 };

        if (z.energy > 0.3 && z.energy < 1.5) scores.happy += 2;
        if (z.centroid > 0.3) scores.happy += 2;
        if (z.zcr > 0 && z.zcr < 1) scores.happy += 1;
        if (z.loudness > 0.2) scores.happy += 1;

        if (z.energy < -0.2) scores.sad += 2;
        if (z.centroid < -0.3) scores.sad += 2;
        if (z.zcr < -0.2) scores.sad += 1;
        if (z.loudness < -0.3) scores.sad += 1;

        if (z.energy > 1.2) scores.angry += 3;
        if (z.zcr > 0.8) scores.angry += 2;
        if (z.centroid > 0.8) scores.angry += 1;
        if (z.loudness > 0.8) scores.angry += 1;

        const dist = Math.abs(z.energy) + Math.abs(z.zcr) + Math.abs(z.centroid);
        if (dist < 1.0) scores.neutral += 3;
        if (dist < 0.5) scores.neutral += 2;

        // MFCC均值特征增强稳定性
        if (mean.mfcc) {
            const mfcc1 = mean.mfcc[0];
            const mfcc2 = mean.mfcc[1];
            if (mfcc1 > 5) scores.happy += 1;
            if (mfcc1 < -5) scores.sad += 1;
            if (Math.abs(mfcc2) > 8) scores.angry += 1;
        }

        // pitch变化范围
        const pitchValues = featureArray.filter(f => f.pitch > 0).map(f => f.pitch);
        if (pitchValues.length > 3) {
            const pitchRange = Math.max(...pitchValues) - Math.min(...pitchValues);
            const pitchMean = pitchValues.reduce((a, b) => a + b, 0) / pitchValues.length;
            if (pitchRange > 80) scores.happy += 1;
            if (pitchRange < 30 && pitchMean < 150) scores.sad += 1;
            if (pitchRange > 100 && z.energy > 0.5) scores.angry += 1;
        }

        // 能量方差
        const energyVar = this._variance(featureArray.map(f => f.energy));
        if (energyVar > mean.energy * 0.5) scores.angry += 1;
        if (energyVar < mean.energy * 0.1) scores.neutral += 1;

        console.log(`[情绪-句子] 得分: happy=${scores.happy}, sad=${scores.sad}, angry=${scores.angry}, neutral=${scores.neutral}`);
        console.log(`[情绪-句子] pitchValues=${pitchValues ? pitchValues.length : 0}个, energyVar=${energyVar.toFixed(6)}`);

        let best = 'neutral', bestS = -1;
        for (const [e, s] of Object.entries(scores)) {
            if (s > bestS) { bestS = s; best = e; }
        }

        const total = Object.values(scores).reduce((a, b) => a + b, 0) || 1;
        const confidence = bestS / total;

        console.log(`[情绪-句子] ★ 最终结果: ${best} (置信度=${(confidence*100).toFixed(1)}%)`);

        this.current = best;
        this.smoothConfidence = confidence;
        return { emotion: best, confidence, calibrating: false };
    }

    _computeMeanFeatures(featureArray) {
        const n = featureArray.length;
        const sum = { energy: 0, loudness: 0, zcr: 0, centroid: 0 };
        const mfccSum = [0, 0, 0];
        let mfccCount = 0;

        for (const f of featureArray) {
            sum.energy += f.energy;
            sum.loudness += f.loudness;
            sum.zcr += f.zcr;
            sum.centroid += f.centroid;
            if (f.mfcc) {
                mfccSum[0] += f.mfcc[0];
                mfccSum[1] += f.mfcc[1];
                mfccSum[2] += f.mfcc[2];
                mfccCount++;
            }
        }

        const result = {
            energy: sum.energy / n,
            loudness: sum.loudness / n,
            zcr: sum.zcr / n,
            centroid: sum.centroid / n,
        };

        if (mfccCount > 0) {
            result.mfcc = [mfccSum[0] / mfccCount, mfccSum[1] / mfccCount, mfccSum[2] / mfccCount];
        }

        return result;
    }

    _variance(arr) {
        if (arr.length === 0) return 0;
        const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
        return arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
    }
}
