/**
 * FACS (Facial Action Coding System) 动作单元定义
 * 覆盖43个AU，每个AU定义影响的面部区域和变形参数
 */
import { CONFIG } from './config.js';

// 43个AU动作单元完整定义
export const AU_DEFINITIONS = {
    // === 上半脸 AU ===
    AU1:  { name: 'innerBrowRaise',    region: 'brow',   side: 'both', desc: '内眉上扬' },
    AU2:  { name: 'outerBrowRaise',    region: 'brow',   side: 'both', desc: '外眉上扬' },
    AU4:  { name: 'browLowerer',       region: 'brow',   side: 'both', desc: '皱眉' },
    AU5:  { name: 'upperLidRaise',     region: 'eye',    side: 'both', desc: '上眼睑提升' },
    AU6:  { name: 'cheekRaise',        region: 'cheek',  side: 'both', desc: '颧肌收缩' },
    AU7:  { name: 'lidTightener',      region: 'eye',    side: 'both', desc: '眼睑收紧' },
    AU8:  { name: 'lipsToward',        region: 'mouth',  side: 'both', desc: '嘴唇相向' },
    AU9:  { name: 'noseWrinkler',      region: 'nose',   side: 'both', desc: '鼻翼皱缩' },
    AU10: { name: 'upperLipRaise',     region: 'mouth',  side: 'both', desc: '上唇提升' },
    AU11: { name: 'nasolabialDeepen',  region: 'cheek',  side: 'both', desc: '鼻唇沟加深' },
    AU12: { name: 'lipCornerPull',     region: 'mouth',  side: 'both', desc: '嘴角上拉(微笑)' },
    AU13: { name: 'sharpLipPull',      region: 'mouth',  side: 'both', desc: '尖唇拉伸' },
    AU14: { name: 'dimpler',           region: 'mouth',  side: 'both', desc: '酒窝' },
    AU15: { name: 'lipCornerDepress',  region: 'mouth',  side: 'both', desc: '嘴角下拉' },
    AU16: { name: 'lowerLipDepress',   region: 'mouth',  side: 'both', desc: '下唇下压' },
    AU17: { name: 'chinRaise',         region: 'chin',   side: 'both', desc: '下巴上提' },
    AU18: { name: 'lipPucker',         region: 'mouth',  side: 'both', desc: '嘴唇噘起' },
    AU19: { name: 'tongueShow',        region: 'mouth',  side: 'both', desc: '伸舌' },
    AU20: { name: 'lipStretcher',      region: 'mouth',  side: 'both', desc: '嘴唇横拉' },
    AU21: { name: 'neckTightener',     region: 'neck',   side: 'both', desc: '颈部紧张' },
    AU22: { name: 'lipFunneler',       region: 'mouth',  side: 'both', desc: '嘴唇漏斗形' },
    AU23: { name: 'lipTightener',      region: 'mouth',  side: 'both', desc: '嘴唇收紧' },
    AU24: { name: 'lipPresser',        region: 'mouth',  side: 'both', desc: '嘴唇紧压' },
    AU25: { name: 'lipsPart',          region: 'mouth',  side: 'both', desc: '嘴唇分开' },
    AU26: { name: 'jawDrop',           region: 'jaw',    side: 'both', desc: '下颌下落' },
    AU27: { name: 'mouthStretch',      region: 'mouth',  side: 'both', desc: '嘴部拉伸(大张)' },
    AU28: { name: 'lipSuck',           region: 'mouth',  side: 'both', desc: '嘴唇内收' },
    AU29: { name: 'jawThrust',         region: 'jaw',    side: 'both', desc: '下颌前突' },
    AU30: { name: 'jawSideways',       region: 'jaw',    side: 'both', desc: '下颌侧移' },
    AU31: { name: 'jawClench',         region: 'jaw',    side: 'both', desc: '咬牙' },
    AU32: { name: 'lipBite',           region: 'mouth',  side: 'both', desc: '咬唇' },
    AU33: { name: 'cheekBlow',         region: 'cheek',  side: 'both', desc: '鼓腮' },
    AU34: { name: 'cheekPuff',         region: 'cheek',  side: 'both', desc: '单侧鼓腮' },
    AU35: { name: 'cheekSuck',         region: 'cheek',  side: 'both', desc: '吸腮' },
    AU36: { name: 'tongueBulge',       region: 'mouth',  side: 'both', desc: '舌头顶腮' },
    AU37: { name: 'lipWipe',           region: 'mouth',  side: 'both', desc: '舔唇' },
    AU38: { name: 'nostrilDilate',     region: 'nose',   side: 'both', desc: '鼻孔扩张' },
    AU39: { name: 'nostrilCompress',   region: 'nose',   side: 'both', desc: '鼻孔压缩' },
    AU41: { name: 'lidDroop',          region: 'eye',    side: 'both', desc: '眼睑下垂' },
    AU42: { name: 'innerBrowLower',    region: 'brow',   side: 'both', desc: '内眉下降' },
    AU43: { name: 'eyesClosed',        region: 'eye',    side: 'both', desc: '闭眼' },
    AU44: { name: 'eyeSquint',         region: 'eye',    side: 'both', desc: '眯眼' },
    AU45: { name: 'blink',             region: 'eye',    side: 'both', desc: '眨眼' },
};

// AU编号列表
export const AU_LIST = Object.keys(AU_DEFINITIONS);

/**
 * AU到ARKit blendshape的映射关系
 * 每个AU激活时影响哪些blendshape及其权重系数
 */
export const AU_TO_BLENDSHAPE = {
    AU1:  { browInnerUp: 1.0 },
    AU2:  { browOuterUpLeft: 1.0, browOuterUpRight: 1.0 },
    AU4:  { browDownLeft: 0.8, browDownRight: 0.8, browInnerUp: -0.3 },
    AU5:  { eyeWideLeft: 1.0, eyeWideRight: 1.0 },
    AU6:  { cheekSquintLeft: 1.0, cheekSquintRight: 1.0 },
    AU7:  { eyeSquintLeft: 0.7, eyeSquintRight: 0.7 },
    AU8:  { mouthClose: 0.5, mouthPucker: 0.3 },
    AU9:  { noseSneerLeft: 1.0, noseSneerRight: 1.0 },
    AU10: { mouthShrugUpper: 0.8, noseSneerLeft: 0.3, noseSneerRight: 0.3 },
    AU11: { mouthFrownLeft: 0.3, mouthFrownRight: 0.3, cheekSquintLeft: 0.4, cheekSquintRight: 0.4 },
    AU12: { mouthSmileLeft: 1.0, mouthSmileRight: 1.0 },
    AU13: { mouthSmileLeft: 0.5, mouthSmileRight: 0.5, mouthPucker: 0.3 },
    AU14: { mouthDimpleLeft: 0.8, mouthDimpleRight: 0.8 },
    AU15: { mouthFrownLeft: 1.0, mouthFrownRight: 1.0 },
    AU16: { mouthLowerDownLeft: 0.8, mouthLowerDownRight: 0.8 },
    AU17: { mouthShrugLower: 0.9 },
    AU18: { mouthPucker: 1.0 },
    AU19: { tongueOut: 1.0 },
    AU20: { mouthStretchLeft: 0.9, mouthStretchRight: 0.9 },
    AU21: { /* 颈部张力 - 无对应blendshape，仅标记 */ },
    AU22: { mouthFunnel: 1.0 },
    AU23: { mouthPressLeft: 0.8, mouthPressRight: 0.8 },
    AU24: { mouthPressLeft: 1.0, mouthPressRight: 1.0, mouthClose: 0.3 },
    AU25: { mouthOpen: 0.5, jawOpen: 0.1 },
    AU26: { jawOpen: 0.7 },
    AU27: { jawOpen: 1.0, mouthOpen: 0.8 },
    AU28: { mouthRollLower: 0.7, mouthRollUpper: 0.7 },
    AU29: { jawForward: 1.0 },
    AU30: { mouthLeft: 0.7, mouthRight: -0.7 },
    AU31: { jawOpen: -0.2, mouthClose: 0.5 },
    AU32: { mouthRollLower: 0.5, mouthClose: 0.3 },
    AU33: { cheekPuff: 1.0 },
    AU34: { cheekPuff: 0.6 },
    AU35: { cheekPuff: -0.4 },
    AU36: { cheekPuff: 0.3 },
    AU37: { mouthRollLower: 0.3, mouthRollUpper: 0.3 },
    AU38: { noseSneerLeft: 0.4, noseSneerRight: 0.4 },
    AU39: { noseSneerLeft: -0.3, noseSneerRight: -0.3 },
    AU41: { eyeBlinkLeft: 0.4, eyeBlinkRight: 0.4 },
    AU42: { browDownLeft: 0.5, browDownRight: 0.5, browInnerUp: -0.4 },
    AU43: { eyeBlinkLeft: 1.0, eyeBlinkRight: 1.0 },
    AU44: { eyeSquintLeft: 1.0, eyeSquintRight: 1.0 },
    AU45: { eyeBlinkLeft: 1.0, eyeBlinkRight: 1.0 },
};

/**
 * 情感到AU组合的映射（FACS编码标准）
 * 每种情感由特定AU组合及其强度构成
 */
export const EMOTION_AU_MAP = {
    happy: {
        AU6:  { base: 0.7, range: 0.3 },
        AU12: { base: 0.8, range: 0.2 },
        AU7:  { base: 0.2, range: 0.2 },
        AU25: { base: 0.2, range: 0.3 },
    },
    sad: {
        AU1:  { base: 0.6, range: 0.3 },
        AU4:  { base: 0.3, range: 0.2 },
        AU15: { base: 0.6, range: 0.3 },
        AU17: { base: 0.3, range: 0.2 },
        AU41: { base: 0.3, range: 0.2 },
    },
    angry: {
        AU4:  { base: 0.8, range: 0.2 },
        AU5:  { base: 0.3, range: 0.3 },
        AU7:  { base: 0.5, range: 0.3 },
        AU9:  { base: 0.4, range: 0.3 },
        AU10: { base: 0.3, range: 0.2 },
        AU23: { base: 0.5, range: 0.3 },
        AU25: { base: 0.3, range: 0.2 },
    },
    surprise: {
        AU1:  { base: 0.8, range: 0.2 },
        AU2:  { base: 0.8, range: 0.2 },
        AU5:  { base: 0.9, range: 0.1 },
        AU26: { base: 0.6, range: 0.3 },
        AU27: { base: 0.4, range: 0.3 },
    },
    fear: {
        AU1:  { base: 0.7, range: 0.3 },
        AU2:  { base: 0.5, range: 0.3 },
        AU4:  { base: 0.5, range: 0.2 },
        AU5:  { base: 0.7, range: 0.3 },
        AU7:  { base: 0.3, range: 0.2 },
        AU20: { base: 0.5, range: 0.3 },
        AU25: { base: 0.4, range: 0.2 },
    },
    disgust: {
        AU9:  { base: 0.8, range: 0.2 },
        AU10: { base: 0.6, range: 0.3 },
        AU4:  { base: 0.3, range: 0.2 },
        AU15: { base: 0.3, range: 0.2 },
        AU16: { base: 0.3, range: 0.2 },
        AU25: { base: 0.3, range: 0.2 },
    },
    neutral: {},
};

/**
 * FACS驱动器 - 管理AU激活状态并转换为blendshape权重
 */
export class FACSDriver {
    constructor() {
        // 当前各AU的激活强度 [0, 1]
        this.auValues = {};
        for (const au of AU_LIST) {
            this.auValues[au] = 0;
        }
    }

    /**
     * 设置单个AU强度
     */
    setAU(auName, intensity) {
        if (auName in this.auValues) {
            this.auValues[auName] = Math.max(0, Math.min(1, intensity));
        }
    }

    /**
     * 批量设置AU强度
     */
    setAUs(auMap) {
        for (const [au, val] of Object.entries(auMap)) {
            this.setAU(au, val);
        }
    }

    /**
     * 重置所有AU
     */
    reset() {
        for (const au of AU_LIST) {
            this.auValues[au] = 0;
        }
    }

    /**
     * 从情感混合比例计算AU激活值，同时更新内部状态
     * @param {Object} emotionMix - { happy: 0.7, sad: 0.2, ... } 各情感强度
     */
    computeFromEmotions(emotionMix) {
        for (const au of AU_LIST) this.auValues[au] = 0;

        for (const [emotion, intensity] of Object.entries(emotionMix)) {
            if (intensity <= 0) continue;
            const auDef = EMOTION_AU_MAP[emotion];
            if (!auDef) continue;

            for (const [au, params] of Object.entries(auDef)) {
                const val = params.base * intensity;
                this.auValues[au] = Math.max(this.auValues[au], val);
            }
        }
        return { ...this.auValues };
    }

    /**
     * 将当前AU值转换为blendshape权重
     * @returns {Object} blendshape名称到权重的映射
     */
    toBlendshapes() {
        const weights = {};
        for (const [au, intensity] of Object.entries(this.auValues)) {
            if (intensity <= 0.001) continue;
            const mapping = AU_TO_BLENDSHAPE[au];
            if (!mapping) continue;

            for (const [bs, coeff] of Object.entries(mapping)) {
                const contribution = intensity * coeff;
                // 累加，但最终clamp到[0,1]
                weights[bs] = (weights[bs] || 0) + contribution;
            }
        }

        // Clamp
        for (const k of Object.keys(weights)) {
            weights[k] = Math.max(0, Math.min(1, weights[k]));
        }
        return weights;
    }

    /**
     * 获取当前所有AU状态
     */
    getAUValues() {
        return { ...this.auValues };
    }

    /**
     * 获取非零AU列表（用于UI显示）
     */
    getActiveAUs() {
        const active = [];
        for (const [au, val] of Object.entries(this.auValues)) {
            if (val > 0.01) {
                active.push({ au, intensity: val, desc: AU_DEFINITIONS[au].desc });
            }
        }
        return active.sort((a, b) => b.intensity - a.intensity);
    }
}
