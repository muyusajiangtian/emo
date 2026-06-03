/**
 * 语音活性检测 (Voice Activity Detection)
 * 基于能量+过零率的动态阈值检测，静音超过400ms判定句子结束
 */
export class VAD {
    constructor() {
        this.sensitivity = 0.5;
        this.minSpeechFrames = 4;
        this.minSilenceMs = 400;
        this.isSpeaking = false;
        this.speechFrameCount = 0;
        this.silenceFrameCount = 0;
        this.utteranceFeatures = [];
        this.segments = [];
        this.currentSegmentStart = 0;
        this.frameCount = 0;
        this.lastFrameTime = 0;
        this.silenceDuration = 0;

        this.onSpeechStart = null;
        this.onSpeechEnd = null;

        // 自适应噪声底估计
        this.noiseFloor = 0.0001;
        this.noiseZcr = 0.01;
        this.noiseFrames = [];
        this.noiseZcrFrames = [];
        this.NOISE_WINDOW = 50;

        // 动态阈值的EMA
        this.smoothEnergy = 0;
        this.smoothZcr = 0;
        this.rawEnergy = 0;
        this.EMA_ALPHA = 0.35;
    }

    setSensitivity(v) {
        this.sensitivity = Math.max(0, Math.min(1, v));
    }

    update(features, dt) {
        if (!features) return;
        this.frameCount++;
        this._logInterval = (this._logInterval || 0) + 1;

        // 计算帧间隔（用于将帧数转为时间）
        const frameDt = dt || (1 / 60);

        // EMA平滑当前帧能量和ZCR
        this.smoothEnergy += (features.energy - this.smoothEnergy) * this.EMA_ALPHA;
        this.smoothZcr += (features.zcr - this.smoothZcr) * this.EMA_ALPHA;
        this.rawEnergy = features.energy;

        // 静默时更新噪声底
        if (!this.isSpeaking) {
            this.noiseFrames.push(features.energy);
            this.noiseZcrFrames.push(features.zcr);
            if (this.noiseFrames.length > this.NOISE_WINDOW) {
                this.noiseFrames.shift();
                this.noiseZcrFrames.shift();
            }
            if (this.noiseFrames.length >= 15) {
                // 取中位数而非均值，更鲁棒
                const sorted = [...this.noiseFrames].sort((a, b) => a - b);
                this.noiseFloor = sorted[Math.floor(sorted.length * 0.5)];
                const sortedZcr = [...this.noiseZcrFrames].sort((a, b) => a - b);
                this.noiseZcr = sortedZcr[Math.floor(sortedZcr.length * 0.5)];
            }
        }

        // 动态阈值
        const energyThreshold = this._computeEnergyThreshold();
        const zcrThreshold = this.noiseZcr * 1.8 + 0.015;

        // 判定逻辑：能量为主判据，ZCR为辅助（不再硬门控）
        // 方案：能量显著超阈值即可判定；或能量略超阈值+ZCR超阈值
        const energyPass = this.smoothEnergy > energyThreshold;
        const energyStrongPass = this.rawEnergy > energyThreshold * 1.5;
        const zcrPass = this.smoothZcr > zcrThreshold;
        const isVoice = energyStrongPass || (energyPass && zcrPass);

        // 每30帧输出一次详细日志
        if (this._logInterval % 30 === 0) {
            console.log(`[VAD详细] 帧#${this.frameCount} | energy=${this.smoothEnergy.toFixed(6)}(raw=${this.rawEnergy.toFixed(6)}) thresh=${energyThreshold.toFixed(6)} ${energyPass?'✓':'✗'}(strong=${energyStrongPass?'✓':'✗'}) | zcr=${this.smoothZcr.toFixed(4)} thresh=${zcrThreshold.toFixed(4)} ${zcrPass?'✓':'✗'} | isVoice=${isVoice} | speaking=${this.isSpeaking} | noiseFloor=${this.noiseFloor.toFixed(6)} | sens=${this.sensitivity}`);
        }

        if (isVoice) {
            this.silenceFrameCount = 0;
            this.silenceDuration = 0;
            this.speechFrameCount++;

            if (!this.isSpeaking && this.speechFrameCount >= this.minSpeechFrames) {
                this.isSpeaking = true;
                this.utteranceFeatures = [];
                this.currentSegmentStart = this.frameCount;
                console.log(`[VAD] ▶ 语音开始 | speechFrameCount=${this.speechFrameCount} | energy=${this.smoothEnergy.toFixed(6)} | zcr=${this.smoothZcr.toFixed(4)}`);
                if (this.onSpeechStart) this.onSpeechStart();
            }

            if (this.isSpeaking) {
                this.utteranceFeatures.push({ ...features });
            }
        } else {
            this.speechFrameCount = 0;

            if (this.isSpeaking) {
                this.silenceFrameCount++;
                this.silenceDuration += frameDt * 1000;

                // 每10帧输出静默计时
                if (this.silenceFrameCount % 10 === 0) {
                    console.log(`[VAD] 静默累计: ${this.silenceDuration.toFixed(0)}ms / ${this.minSilenceMs}ms`);
                }

                // 静音超过400ms判定句子结束
                if (this.silenceDuration >= this.minSilenceMs) {
                    console.log(`[VAD] ■ 语音结束 | 静默=${this.silenceDuration.toFixed(0)}ms | 累积特征帧=${this.utteranceFeatures.length}`);
                    this.isSpeaking = false;
                    this.segments.push({
                        start: this.currentSegmentStart,
                        end: this.frameCount,
                        frames: this.utteranceFeatures.length
                    });
                    if (this.segments.length > 10) this.segments.shift();

                    if (this.onSpeechEnd && this.utteranceFeatures.length > 0) {
                        this.onSpeechEnd([...this.utteranceFeatures]);
                    }
                    this.utteranceFeatures = [];
                    this.silenceDuration = 0;
                }
            }
        }
    }

    _computeEnergyThreshold() {
        // 基于噪声底的动态阈值，sensitivity控制倍数
        // sensitivity高(1.0)=更灵敏=低阈值, 低(0.0)=不灵敏=高阈值
        const minMult = 1.5;
        const maxMult = 8.0;
        const mult = minMult + (1 - this.sensitivity) * (maxMult - minMult);
        return Math.max(this.noiseFloor * mult, 0.00002);
    }

    getSegments() {
        return this.segments;
    }

    reset() {
        this.isSpeaking = false;
        this.speechFrameCount = 0;
        this.silenceFrameCount = 0;
        this.silenceDuration = 0;
        this.utteranceFeatures = [];
        this.segments = [];
        this.noiseFrames = [];
        this.noiseZcrFrames = [];
        this.frameCount = 0;
        this.smoothEnergy = 0;
        this.smoothZcr = 0;
        this.rawEnergy = 0;
    }
}
