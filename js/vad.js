/**
 * 语音活性检测 (Voice Activity Detection)
 * 基于能量+过零率的动态阈值检测
 */
import { CONFIG } from './config.js';

export class VAD {
    constructor() {
        const cfg = CONFIG.vad;
        this.sensitivity = cfg.defaultSensitivity;
        this.minSpeechFrames = cfg.minSpeechFrames;
        this.minSilenceMs = cfg.minSilenceMs;
        this.isSpeaking = false;
        this.speechFrameCount = 0;
        this.silenceFrameCount = 0;
        this.utteranceFeatures = [];
        this.segments = [];
        this.currentSegmentStart = 0;
        this.frameCount = 0;
        this.silenceDuration = 0;

        this.onSpeechStart = null;
        this.onSpeechEnd = null;

        this.noiseFloor = 0.0001;
        this.noiseZcr = 0.01;
        this.noiseFrames = [];
        this.noiseZcrFrames = [];
        this.NOISE_WINDOW = cfg.noiseWindow;

        this.smoothEnergy = 0;
        this.smoothZcr = 0;
        this.rawEnergy = 0;
        this.EMA_ALPHA = cfg.emaAlpha;
    }

    setSensitivity(v) {
        this.sensitivity = Math.max(0, Math.min(1, v));
    }

    update(features, dt) {
        if (!features) return;
        this.frameCount++;
        const frameDt = dt || (1 / 60);

        this.smoothEnergy += (features.energy - this.smoothEnergy) * this.EMA_ALPHA;
        this.smoothZcr += (features.zcr - this.smoothZcr) * this.EMA_ALPHA;
        this.rawEnergy = features.energy;

        if (!this.isSpeaking) {
            this.noiseFrames.push(features.energy);
            this.noiseZcrFrames.push(features.zcr);
            if (this.noiseFrames.length > this.NOISE_WINDOW) {
                this.noiseFrames.shift();
                this.noiseZcrFrames.shift();
            }
            if (this.noiseFrames.length >= 15) {
                const sorted = [...this.noiseFrames].sort((a, b) => a - b);
                this.noiseFloor = sorted[Math.floor(sorted.length * 0.5)];
                const sortedZcr = [...this.noiseZcrFrames].sort((a, b) => a - b);
                this.noiseZcr = sortedZcr[Math.floor(sortedZcr.length * 0.5)];
            }
        }

        const energyThreshold = this._computeEnergyThreshold();
        const zcrThreshold = this.noiseZcr * 1.8 + 0.015;

        const energyPass = this.smoothEnergy > energyThreshold;
        const energyStrongPass = this.rawEnergy > energyThreshold * 1.5;
        const zcrPass = this.smoothZcr > zcrThreshold;
        const isVoice = energyStrongPass || (energyPass && zcrPass);

        if (isVoice) {
            this.silenceFrameCount = 0;
            this.silenceDuration = 0;
            this.speechFrameCount++;

            if (!this.isSpeaking && this.speechFrameCount >= this.minSpeechFrames) {
                this.isSpeaking = true;
                this.utteranceFeatures = [];
                this.currentSegmentStart = this.frameCount;
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

                if (this.silenceDuration >= this.minSilenceMs) {
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
        const minMult = 1.5;
        const maxMult = 8.0;
        const mult = minMult + (1 - this.sensitivity) * (maxMult - minMult);
        return Math.max(this.noiseFloor * mult, 0.00002);
    }

    getSegments() { return this.segments; }

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
