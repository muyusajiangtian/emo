/**
 * 动画驱动 - 情绪映射到面部参数 + 音量点头 + 语速眨眼
 */
export class AnimationDriver {
    constructor(head) {
        this.head = head;
        this.time = 0;
        this.expressions = {
            happy:   { smile: 0.8, frown: 0, mouthOpen: 0.15, browRaise: 0.3, browFurrow: 0 },
            sad:     { smile: 0, frown: 0.7, mouthOpen: 0.05, browRaise: 0.15, browFurrow: 0.1 },
            angry:   { smile: 0, frown: 0.2, mouthOpen: 0.25, browRaise: 0, browFurrow: 0.85 },
            neutral: { smile: 0, frown: 0, mouthOpen: 0, browRaise: 0, browFurrow: 0 },
        };
        this.cur = { ...this.expressions.neutral };
        this.LERP = 0.06;
    }

    update(emotionResult, features, dt) {
        this.time += dt;
        if (!emotionResult || !features) {
            this._idle(dt);
            return;
        }

        // 情绪 -> 表情
        const expr = this.expressions[emotionResult.emotion] || this.expressions.neutral;
        const conf = Math.max(emotionResult.confidence || 0, 0.3);
        for (const k of Object.keys(this.cur)) {
            const t = expr[k] * conf;
            this.cur[k] += (t - this.cur[k]) * this.LERP;
        }

        // 说话时嘴部跟随能量
        if (features.loudness > -35) {
            const open = Math.min(Math.max((features.loudness + 35) / 25, 0), 1) * 0.7;
            this.cur.mouthOpen = Math.max(this.cur.mouthOpen, open);
        }

        // 音量 -> 点头
        const nod = Math.min(features.energy * 10, 0.06);
        const nodX = Math.sin(this.time * 2.5) * nod;
        const nodY = Math.sin(this.time * 1.7) * nod * 0.4;

        // 呼吸微动
        const breath = Math.sin(this.time * 0.8) * 0.004;

        this.head.setTarget({
            ...this.cur,
            nodX: nodX + breath,
            nodY: nodY,
        });
    }

    _idle(dt) {
        for (const k of Object.keys(this.cur)) {
            this.cur[k] *= 0.95;
        }
        const breath = Math.sin(this.time * 0.8) * 0.004;
        this.head.setTarget({ ...this.cur, nodX: breath, nodY: 0 });
    }
}
