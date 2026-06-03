/**
 * 音素/口型映射 (Viseme Mapper)
 * 将音频频谱映射到5种基本口型，驱动对应blendshapes
 */
export class VisemeMapper {
    constructor(sampleRate, fftSize) {
        this.sampleRate = sampleRate || 44100;
        this.fftSize = fftSize || 2048;
        this.binHz = this.sampleRate / this.fftSize;
        this.current = 'silence';
        this.weights = { AA: 0, IY: 0, UW: 0, OW: 0, MBP: 0 };
        this.smoothWeights = { AA: 0, IY: 0, UW: 0, OW: 0, MBP: 0 };
        this.SMOOTH = 0.35;
    }

    update(freqData, energy) {
        if (!freqData || energy < 0.0003) {
            // 静默或极低能量 → 闭口
            for (const k of Object.keys(this.weights)) this.weights[k] = 0;
            this.weights.MBP = 0.2;
            this.current = 'silence';
            this._smooth();
            return;
        }

        // 计算各频段能量
        const f1 = this._bandEnergy(freqData, 200, 900);
        const f2 = this._bandEnergy(freqData, 900, 2500);
        const f3 = this._bandEnergy(freqData, 2500, 4000);
        const total = f1 + f2 + f3 + 1e-10;

        const f1r = f1 / total;
        const f2r = f2 / total;
        const f3r = f3 / total;

        // 重置
        for (const k of Object.keys(this.weights)) this.weights[k] = 0;

        // 基于共振峰比例分类
        if (f1r > 0.55) {
            // 强F1(低频)：AA大开口
            this.weights.AA = Math.min(f1r * 1.2, 1);
            this.current = 'AA';
        } else if (f2r > 0.5) {
            // 强F2(中频)：IY微笑口型
            this.weights.IY = Math.min(f2r * 1.3, 1);
            this.current = 'IY';
        } else if (f1r > 0.35 && f2r < 0.3) {
            // 中等F1但低F2：UW嘟嘴
            this.weights.UW = 0.7;
            this.current = 'UW';
        } else if (f1r > 0.3 && f2r > 0.3 && f2r < 0.5) {
            // F1和F2都中等：OW圆口
            this.weights.OW = 0.65;
            this.current = 'OW';
        } else if (f3r > 0.35) {
            // 高频占比高：IY或辅音
            this.weights.IY = 0.5;
            this.current = 'IY';
        } else {
            // 其他：MBP闭口/鼻音
            this.weights.MBP = 0.6;
            this.current = 'MBP';
        }

        // 叠加能量强度
        const intensity = Math.min(energy * 50, 1);
        for (const k of Object.keys(this.weights)) {
            this.weights[k] *= intensity;
        }

        this._smooth();
    }

    _smooth() {
        const a = this.SMOOTH;
        for (const k of Object.keys(this.smoothWeights)) {
            this.smoothWeights[k] += (this.weights[k] - this.smoothWeights[k]) * a;
        }
    }

    _bandEnergy(freqData, lowHz, highHz) {
        const lowBin = Math.max(Math.floor(lowHz / this.binHz), 0);
        const highBin = Math.min(Math.floor(highHz / this.binHz), freqData.length - 1);
        if (highBin <= lowBin) return 0;
        let sum = 0;
        for (let i = lowBin; i <= highBin; i++) {
            const db = freqData[i];
            const mag = Math.pow(10, db / 20);
            sum += mag * mag;
        }
        return sum / (highBin - lowBin + 1);
    }

    getBlendshapeWeights() {
        const w = this.smoothWeights;
        return {
            jawOpen: w.AA * 0.7 + w.OW * 0.5 + w.UW * 0.2,
            mouthFunnel: w.OW * 0.6 + w.UW * 0.4,
            mouthPucker: w.UW * 0.8,
            mouthSmileLeft: w.IY * 0.35,
            mouthSmileRight: w.IY * 0.35,
            mouthOpen: w.AA * 0.5 + w.OW * 0.3,
            mouthClose: w.MBP * 0.7,
        };
    }

    getWeights() {
        return { ...this.smoothWeights };
    }

    getCurrent() {
        return this.current;
    }
}
