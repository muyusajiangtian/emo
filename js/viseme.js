/**
 * CMU词典音素检测与嘴型同步
 * 基于ARPAbet音素集，每个音素对应一组精确的blendshape权重
 * 使用共振峰分析 + 能量包络实现实时音素估计
 */
import { CONFIG } from './config.js';

/**
 * CMU ARPAbet 音素到 Viseme 组映射
 * 将39个CMU音素归类到15个viseme组
 */
const PHONEME_TO_VISEME = {
    // 静默
    'SIL': 'sil',
    // 双唇音 (闭口)
    'P': 'PP', 'B': 'PP', 'M': 'PP',
    // 唇齿音
    'F': 'FF', 'V': 'FF',
    // 舌齿音
    'TH': 'TH', 'DH': 'TH',
    // 舌尖音
    'T': 'DD', 'D': 'DD', 'N': 'DD', 'L': 'DD',
    // 软腭音
    'K': 'kk', 'G': 'kk', 'NG': 'kk',
    // 咝音
    'S': 'SS', 'Z': 'SS',
    // 腭擦音
    'SH': 'SH', 'ZH': 'SH', 'CH': 'SH', 'JH': 'SH',
    // 卷舌音
    'R': 'RR',
    // 元音-大开口
    'AA': 'aa', 'AE': 'aa', 'AH': 'aa',
    // 元音-中开口
    'EH': 'E', 'ER': 'E', 'AX': 'E',
    // 元音-微笑口型
    'IY': 'I', 'IH': 'I',
    // 元音-圆口
    'OW': 'O', 'AO': 'O',
    // 元音-嘟嘴
    'UW': 'U', 'UH': 'U',
    // 半元音
    'W': 'WW', 'Y': 'I',
    // 声门音
    'HH': 'sil',
};

/**
 * 每个viseme组对应的blendshape权重
 * 精确模拟真人发音时的嘴型
 */
const VISEME_BLENDSHAPES = {
    'sil': {
        jawOpen: 0.0, mouthClose: 0.1,
        mouthPucker: 0.0, mouthFunnel: 0.0,
        mouthSmileLeft: 0.0, mouthSmileRight: 0.0,
        mouthOpen: 0.0, mouthStretchLeft: 0.0, mouthStretchRight: 0.0,
    },
    'PP': {
        jawOpen: 0.02, mouthClose: 0.7,
        mouthPressLeft: 0.5, mouthPressRight: 0.5,
        mouthPucker: 0.2, mouthRollLower: 0.1, mouthRollUpper: 0.1,
    },
    'FF': {
        jawOpen: 0.05, mouthClose: 0.3,
        mouthRollLower: 0.4, mouthShrugUpper: 0.3,
        mouthFunnel: 0.1,
    },
    'TH': {
        jawOpen: 0.1, mouthOpen: 0.15,
        mouthStretchLeft: 0.1, mouthStretchRight: 0.1,
        tongueOut: 0.3,
    },
    'DD': {
        jawOpen: 0.12, mouthOpen: 0.1,
        mouthStretchLeft: 0.15, mouthStretchRight: 0.15,
        mouthShrugUpper: 0.1,
    },
    'kk': {
        jawOpen: 0.15, mouthOpen: 0.2,
        mouthFunnel: 0.1, mouthStretchLeft: 0.1, mouthStretchRight: 0.1,
    },
    'SS': {
        jawOpen: 0.05, mouthClose: 0.2,
        mouthStretchLeft: 0.3, mouthStretchRight: 0.3,
        mouthSmileLeft: 0.15, mouthSmileRight: 0.15,
    },
    'SH': {
        jawOpen: 0.08, mouthFunnel: 0.5,
        mouthPucker: 0.3, mouthOpen: 0.1,
    },
    'RR': {
        jawOpen: 0.1, mouthFunnel: 0.4,
        mouthPucker: 0.25, mouthOpen: 0.1,
        mouthShrugLower: 0.15,
    },
    'aa': {
        jawOpen: 0.65, mouthOpen: 0.6,
        mouthFunnel: 0.1, mouthStretchLeft: 0.1, mouthStretchRight: 0.1,
        mouthLowerDownLeft: 0.2, mouthLowerDownRight: 0.2,
    },
    'E': {
        jawOpen: 0.3, mouthOpen: 0.35,
        mouthStretchLeft: 0.2, mouthStretchRight: 0.2,
        mouthSmileLeft: 0.1, mouthSmileRight: 0.1,
    },
    'I': {
        jawOpen: 0.15, mouthOpen: 0.15,
        mouthSmileLeft: 0.4, mouthSmileRight: 0.4,
        mouthStretchLeft: 0.25, mouthStretchRight: 0.25,
    },
    'O': {
        jawOpen: 0.4, mouthOpen: 0.3,
        mouthFunnel: 0.55, mouthPucker: 0.2,
    },
    'U': {
        jawOpen: 0.1, mouthOpen: 0.05,
        mouthPucker: 0.7, mouthFunnel: 0.3,
    },
    'WW': {
        jawOpen: 0.08, mouthPucker: 0.6,
        mouthFunnel: 0.4, mouthOpen: 0.05,
    },
};

/**
 * 共振峰到viseme的映射规则
 * F1(低频共振峰)对应开口度, F2(中频)对应前后位, F3(高频)对应圆展
 */
const FORMANT_RULES = [
    // [F1低, F1高, F2低, F2高, viseme, 权重]
    { f1: [0.5, 1.0], f2: [0.0, 0.3], viseme: 'aa', desc: '大开口低元音' },
    { f1: [0.3, 0.6], f2: [0.4, 0.7], viseme: 'E',  desc: '中前元音' },
    { f1: [0.1, 0.35], f2: [0.6, 1.0], viseme: 'I',  desc: '高前元音' },
    { f1: [0.3, 0.6], f2: [0.0, 0.35], viseme: 'O',  desc: '中后圆唇' },
    { f1: [0.05, 0.25], f2: [0.0, 0.3], viseme: 'U',  desc: '高后圆唇' },
    { f1: [0.0, 0.1], f2: [0.0, 0.2], f3hi: true, viseme: 'SS', desc: '咝音' },
    { f1: [0.0, 0.08], f2: [0.2, 0.5], viseme: 'SH', desc: '腭擦音' },
];

export class VisemeMapper {
    constructor(sampleRate, fftSize) {
        this.sampleRate = sampleRate || 44100;
        this.fftSize = fftSize || 2048;
        this.binHz = this.sampleRate / this.fftSize;
        const cfg = CONFIG.viseme;

        // 当前检测到的viseme
        this.currentViseme = 'sil';
        this.currentPhoneme = 'SIL';

        // 各viseme的激活权重（支持混合）
        this.visemeWeights = {};
        for (const v of Object.keys(VISEME_BLENDSHAPES)) this.visemeWeights[v] = 0;
        this.visemeWeights['sil'] = 1;

        // 平滑后的blendshape权重
        this.smoothBlendshapes = {};
        this.SMOOTH = cfg.smoothAlpha;

        // 频段配置
        this.bands = cfg.formantBands;

        // 能量历史（用于辅音检测）
        this.energyDelta = 0;
        this.prevEnergy = 0;

        // 音素持续时间追踪
        this.visemeDuration = 0;
        this.MIN_VISEME_DURATION = 30; // ms
    }

    /**
     * 更新口型检测
     * @param {Float32Array} freqData - 频率域数据
     * @param {number} energy - 当前能量值
     * @param {number} dt - 帧间隔（秒）
     */
    update(freqData, energy, dt) {
        const silenceThreshold = CONFIG.viseme.silenceThreshold;
        this.visemeDuration += (dt || 1/60) * 1000;

        // 能量变化率
        this.energyDelta = energy - this.prevEnergy;
        this.prevEnergy = energy;

        if (!freqData || energy < silenceThreshold) {
            this._setViseme('sil', 1.0);
            this._smoothBlendshapes();
            return;
        }

        // 计算各频段归一化能量
        const f1 = this._bandEnergy(freqData, this.bands.f1[0], this.bands.f1[1]);
        const f2 = this._bandEnergy(freqData, this.bands.f2[0], this.bands.f2[1]);
        const f3 = this._bandEnergy(freqData, this.bands.f3[0], this.bands.f3[1]);
        const f4 = this._bandEnergy(freqData, this.bands.f4[0], this.bands.f4[1]);
        const total = f1 + f2 + f3 + f4 + 1e-10;

        const f1r = f1 / total;
        const f2r = f2 / total;
        const f3r = f3 / total;
        const f4r = f4 / total;

        // 辅音检测：能量突变 + 高频占比高
        const isConsonantBurst = this.energyDelta > energy * 0.3 && f3r + f4r > 0.4;
        const isFricative = f3r + f4r > 0.5 && energy < 0.01;

        // 重置viseme权重
        for (const k of Object.keys(this.visemeWeights)) this.visemeWeights[k] = 0;

        if (isConsonantBurst) {
            // 爆破辅音
            if (f1r < 0.15) {
                this._setViseme('PP', 0.6);
                this.visemeWeights['DD'] = 0.3;
            } else {
                this._setViseme('kk', 0.7);
            }
        } else if (isFricative) {
            // 摩擦音
            if (f4r > f3r) {
                this._setViseme('SS', 0.8);
            } else {
                this._setViseme('SH', 0.7);
                this.visemeWeights['FF'] = 0.2;
            }
        } else {
            // 元音：基于共振峰比例匹配
            let bestViseme = 'E';
            let bestScore = 0;

            for (const rule of FORMANT_RULES) {
                let score = 0;
                if (f1r >= rule.f1[0] && f1r <= rule.f1[1]) score += 1;
                if (f2r >= rule.f2[0] && f2r <= rule.f2[1]) score += 1;
                if (rule.f3hi && f3r > 0.3) score += 0.5;
                if (score > bestScore) {
                    bestScore = score;
                    bestViseme = rule.viseme;
                }
            }

            // 设置主viseme
            this._setViseme(bestViseme, Math.min(0.8 + bestScore * 0.1, 1.0));

            // 添加相邻viseme的混合（更自然的过渡）
            if (bestViseme === 'aa' && f2r > 0.3) this.visemeWeights['E'] = 0.2;
            if (bestViseme === 'E' && f2r > 0.55) this.visemeWeights['I'] = 0.2;
            if (bestViseme === 'O' && f1r < 0.25) this.visemeWeights['U'] = 0.3;
        }

        // 能量调制
        const intensity = Math.min(energy * 40, 1);
        for (const k of Object.keys(this.visemeWeights)) {
            this.visemeWeights[k] *= intensity;
        }

        this._smoothBlendshapes();
    }

    _setViseme(viseme, weight) {
        if (viseme !== this.currentViseme && this.visemeDuration >= this.MIN_VISEME_DURATION) {
            this.currentViseme = viseme;
            this.visemeDuration = 0;
        }
        this.visemeWeights[viseme] = weight;
    }

    /**
     * 平滑计算最终blendshape权重
     */
    _smoothBlendshapes() {
        // 计算目标blendshape（加权混合所有活跃viseme的blendshape）
        const target = {};
        for (const [viseme, weight] of Object.entries(this.visemeWeights)) {
            if (weight < 0.01) continue;
            const bs = VISEME_BLENDSHAPES[viseme];
            if (!bs) continue;
            for (const [name, val] of Object.entries(bs)) {
                target[name] = (target[name] || 0) + val * weight;
            }
        }

        // 平滑过渡
        const a = this.SMOOTH;
        const allKeys = new Set([...Object.keys(target), ...Object.keys(this.smoothBlendshapes)]);
        for (const k of allKeys) {
            const t = target[k] || 0;
            const c = this.smoothBlendshapes[k] || 0;
            const v = c + (t - c) * a;
            if (v < 0.001) {
                delete this.smoothBlendshapes[k];
            } else {
                this.smoothBlendshapes[k] = Math.min(v, 1);
            }
        }
    }

    _bandEnergy(freqData, lowHz, highHz) {
        const lowBin = Math.max(Math.floor(lowHz / this.binHz), 0);
        const highBin = Math.min(Math.floor(highHz / this.binHz), freqData.length - 1);
        if (highBin <= lowBin) return 0;
        let sum = 0;
        for (let i = lowBin; i <= highBin; i++) {
            const mag = Math.pow(10, freqData[i] / 20);
            sum += mag * mag;
        }
        return sum / (highBin - lowBin + 1);
    }

    /**
     * 获取当前口型的blendshape权重（供AnimationDriver合并使用）
     */
    getBlendshapeWeights() {
        return { ...this.smoothBlendshapes };
    }

    /**
     * 获取各viseme组的权重（用于UI显示）
     */
    getWeights() {
        return { ...this.visemeWeights };
    }

    /**
     * 获取当前主要viseme名称
     */
    getCurrent() {
        return this.currentViseme;
    }

    /**
     * 获取所有viseme组名称（用于UI）
     */
    static getVisemeNames() {
        return Object.keys(VISEME_BLENDSHAPES);
    }
}
