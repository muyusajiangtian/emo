/**
 * 音频捕获与特征提取
 * 使用标准Web Audio API AnalyserNode
 */
export class AudioProcessor {
    constructor() {
        this.ctx = null;
        this.analyser = null;
        this.stream = null;
        this.isRunning = false;
        this.fftSize = 2048;
        this.sampleRate = 44100;
        this._timeBuf = null;
        this._freqBuf = null;
        this._byteFreqBuf = null;
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
            this.analyser.smoothingTimeConstant = 0.75;
            src.connect(this.analyser);
            this._timeBuf = new Float32Array(this.fftSize);
            this._freqBuf = new Float32Array(this.analyser.frequencyBinCount);
            this._byteFreqBuf = new Uint8Array(this.analyser.frequencyBinCount);
            this.isRunning = true;
            return true;
        } catch (e) {
            console.error('麦克风启动失败:', e);
            return false;
        }
    }

    stop() {
        if (this.stream) this.stream.getTracks().forEach(t => t.stop());
        if (this.ctx && this.ctx.state !== 'closed') this.ctx.close();
        this.isRunning = false;
    }

    /** 峰值电平 0~1 */
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

    /** 获取全部特征 */
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

        return { energy, loudness, zcr, centroid, pitch, mfcc };
    }

    /** Float频谱数据（用于Viseme音素分析） */
    getFloatFrequency() {
        if (!this.isRunning) return null;
        this.analyser.getFloatFrequencyData(this._freqBuf);
        return this._freqBuf;
    }

    /** Uint8频谱用于绘图 */
    getByteFrequency() {
        if (!this.isRunning) return null;
        this.analyser.getByteFrequencyData(this._byteFreqBuf);
        return this._byteFreqBuf;
    }

    /** 波形数据(Float) */
    getWaveform() {
        if (!this.isRunning) return null;
        return this._timeBuf;
    }

    /** 获取原始MediaStream（用于Recorder） */
    getStream() {
        return this.stream;
    }

    // --- 内部方法 ---

    _energy() {
        let sum = 0;
        for (let i = 0; i < this._timeBuf.length; i++) sum += this._timeBuf[i] * this._timeBuf[i];
        return sum / this._timeBuf.length;
    }

    _loudness(energy) {
        if (energy === undefined) energy = this._energy();
        const rms = Math.sqrt(energy);
        return 20 * Math.log10(Math.max(rms, 1e-10));
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
        if (rms < 0.01) return 0;

        const minP = Math.floor(this.sampleRate / 500);
        const maxP = Math.floor(this.sampleRate / 80);
        let bestR = -1, bestP = 0;
        for (let p = minP; p < maxP && p < len / 2; p++) {
            let c = 0, n1 = 0, n2 = 0;
            for (let i = 0; i < len - p; i++) {
                c += buf[i] * buf[i + p];
                n1 += buf[i] * buf[i];
                n2 += buf[i + p] * buf[i + p];
            }
            const norm = Math.sqrt(n1 * n2);
            if (norm > 0) c /= norm;
            if (c > bestR) { bestR = c; bestP = p; }
        }
        return (bestR > 0.5 && bestP > 0) ? this.sampleRate / bestP : 0;
    }

    _mfcc() {
        const freq = this._freqBuf;
        const nBins = freq.length;
        const nFilters = 20;
        const nCoeff = 3;
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
}
