/**
 * 音频捕获与特征提取
 * 扩展版：13维MFCC + 26个Mel滤波器 + 频谱通量
 */
import { CONFIG } from './config.js';

export class AudioProcessor {
    constructor() {
        this.ctx = null;
        this.analyser = null;
        this.stream = null;
        this.isRunning = false;
        this.fftSize = CONFIG.audio.fftSize;
        this.sampleRate = 44100;
        this._timeBuf = null;
        this._freqBuf = null;
        this._byteFreqBuf = null;
        this._prevSpectrum = null;
    }

    async start() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
            });
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.sampleRate = this.ctx.sampleRate;
            const src = this.ctx.createMediaStreamSource(this.stream);
            this.analyser = this.ctx.createAnalyser();
            this.analyser.fftSize = this.fftSize;
            this.analyser.smoothingTimeConstant = CONFIG.audio.smoothingTimeConstant;
            src.connect(this.analyser);
            this._timeBuf = new Float32Array(this.fftSize);
            this._freqBuf = new Float32Array(this.analyser.frequencyBinCount);
            this._byteFreqBuf = new Uint8Array(this.analyser.frequencyBinCount);
            this._prevSpectrum = new Float32Array(this.analyser.frequencyBinCount);
            this.isRunning = true;
            return true;
        } catch (e) {
            console.error('[音频] 麦克风启动失败:', e);
            return false;
        }
    }

    stop() {
        if (this.stream) this.stream.getTracks().forEach(t => t.stop());
        if (this.ctx && this.ctx.state !== 'closed') this.ctx.close();
        this.isRunning = false;
    }

    getLevel() {
        if (!this.isRunning) return 0;
        this.analyser.getFloatTimeDomainData(this._timeBuf);
        let peak = 0;
        for (let i = 0; i < this._timeBuf.length; i++) {
            const v = Math.abs(this._timeBuf[i]);
            if (v > peak) peak = v;
        }
        return Math.min(peak, 1);
    }

    getFeatures() {
        if (!this.isRunning) return null;
        this.analyser.getFloatTimeDomainData(this._timeBuf);
        this.analyser.getFloatFrequencyData(this._freqBuf);

        const energy = this._energy();
        const loudness = this._loudness(energy);
        const zcr = this._zcr();
        const centroid = this._spectralCentroid();
        const pitch = this._pitch();
        const mfcc = this._mfcc();
        const spectralFlux = this._spectralFlux();

        return { energy, loudness, zcr, centroid, pitch, mfcc, spectralFlux };
    }

    getFloatFrequency() {
        if (!this.isRunning) return null;
        this.analyser.getFloatFrequencyData(this._freqBuf);
        return this._freqBuf;
    }

    getByteFrequency() {
        if (!this.isRunning) return null;
        this.analyser.getByteFrequencyData(this._byteFreqBuf);
        return this._byteFreqBuf;
    }

    getWaveform() { return this.isRunning ? this._timeBuf : null; }
    getStream() { return this.stream; }

    _energy() {
        let sum = 0;
        for (let i = 0; i < this._timeBuf.length; i++) sum += this._timeBuf[i] * this._timeBuf[i];
        return sum / this._timeBuf.length;
    }

    _loudness(energy) {
        if (energy === undefined) energy = this._energy();
        return 20 * Math.log10(Math.max(Math.sqrt(energy), 1e-10));
    }

    _zcr() {
        let crossings = 0;
        for (let i = 1; i < this._timeBuf.length; i++) {
            if ((this._timeBuf[i] >= 0) !== (this._timeBuf[i - 1] >= 0)) crossings++;
        }
        return crossings / (this._timeBuf.length - 1);
    }

    _spectralCentroid() {
        const freq = this._freqBuf;
        const binHz = this.sampleRate / this.fftSize;
        let wSum = 0, mSum = 0;
        for (let i = 0; i < freq.length; i++) {
            const mag = Math.pow(10, freq[i] / 20);
            wSum += i * binHz * mag;
            mSum += mag;
        }
        return mSum > 0 ? wSum / mSum : 0;
    }

    _pitch() {
        const buf = this._timeBuf;
        const len = buf.length;
        let rms = 0;
        for (let i = 0; i < len; i++) rms += buf[i] * buf[i];
        rms = Math.sqrt(rms / len);
        if (rms < 0.008) return 0;

        // 自相关法检测基频，搜索范围80Hz-600Hz
        const minP = Math.floor(this.sampleRate / 600);
        const maxP = Math.floor(this.sampleRate / 80);
        const searchLen = Math.min(maxP + 1, Math.floor(len / 2));

        // NSDF（归一化平方差函数）比纯自相关更准确
        let bestR = 0, bestP = 0;
        for (let p = minP; p < searchLen; p++) {
            let num = 0, den1 = 0, den2 = 0;
            for (let i = 0; i < len - p; i++) {
                num += buf[i] * buf[i + p];
                den1 += buf[i] * buf[i];
                den2 += buf[i + p] * buf[i + p];
            }
            const den = Math.sqrt(den1 * den2);
            const r = den > 0 ? num / den : 0;
            if (r > bestR) { bestR = r; bestP = p; }
        }

        // 抛物线插值提高精度
        if (bestR > 0.4 && bestP > minP && bestP < searchLen - 1) {
            const calcR = (p) => {
                let n = 0, d1 = 0, d2 = 0;
                for (let i = 0; i < len - p; i++) {
                    n += buf[i] * buf[i + p];
                    d1 += buf[i] * buf[i];
                    d2 += buf[i + p] * buf[i + p];
                }
                return n / Math.sqrt(d1 * d2 + 1e-10);
            };
            const rPrev = calcR(bestP - 1);
            const rNext = calcR(bestP + 1);
            const shift = (rPrev - rNext) / (2 * (rPrev - 2 * bestR + rNext));
            if (Math.abs(shift) < 1) {
                return this.sampleRate / (bestP + shift);
            }
            return this.sampleRate / bestP;
        }
        return (bestR > 0.4 && bestP > 0) ? this.sampleRate / bestP : 0;
    }

    /**
     * 扩展MFCC：13维系数，26个Mel滤波器
     */
    _mfcc() {
        const freq = this._freqBuf;
        const nBins = freq.length;
        const nFilters = CONFIG.audio.melFilters;
        const nCoeff = CONFIG.audio.mfccCoefficients;
        const lowMel = 0;
        const highMel = 2595 * Math.log10(1 + (this.sampleRate / 2) / 700);

        const pts = [];
        for (let i = 0; i < nFilters + 2; i++) pts.push(lowMel + (highMel - lowMel) * i / (nFilters + 1));
        const bins = pts.map(m => Math.floor((this.fftSize + 1) * (700 * (Math.pow(10, m / 2595) - 1)) / this.sampleRate));

        const melE = [];
        for (let i = 1; i <= nFilters; i++) {
            let e = 0;
            for (let j = bins[i - 1]; j < bins[i + 1] && j < nBins; j++) {
                const mag = Math.pow(10, freq[j] / 20);
                let w = 0;
                if (j <= bins[i]) w = (j - bins[i - 1]) / Math.max(bins[i] - bins[i - 1], 1);
                else w = (bins[i + 1] - j) / Math.max(bins[i + 1] - bins[i], 1);
                e += mag * mag * Math.max(w, 0);
            }
            melE.push(Math.log(Math.max(e, 1e-10)));
        }

        const mfcc = [];
        for (let k = 1; k <= nCoeff; k++) {
            let s = 0;
            for (let n = 0; n < nFilters; n++) s += melE[n] * Math.cos(Math.PI * k * (n + 0.5) / nFilters);
            mfcc.push(s);
        }
        return mfcc;
    }

    /**
     * 频谱通量（帧间频谱变化率）
     */
    _spectralFlux() {
        const freq = this._freqBuf;
        let flux = 0;
        for (let i = 0; i < freq.length; i++) {
            const diff = freq[i] - this._prevSpectrum[i];
            flux += diff > 0 ? diff * diff : 0; // 半波整流
            this._prevSpectrum[i] = freq[i];
        }
        return Math.sqrt(flux / freq.length) / 40; // 归一化
    }
}
