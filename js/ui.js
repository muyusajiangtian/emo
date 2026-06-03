/**
 * UI管理 - 情绪标签 + 波形/频谱 + 电平条
 */
export class UIManager {
    constructor() {
        this.elEmotion = document.getElementById('emotion-label');
        this.elStatus = document.getElementById('emotion-status');
        this.elLevel = document.getElementById('level-bar');
        this.els = {
            energy: document.getElementById('f-energy'),
            loudness: document.getElementById('f-loudness'),
            zcr: document.getElementById('f-zcr'),
            centroid: document.getElementById('f-centroid'),
            mfcc1: document.getElementById('f-mfcc1'),
            mfcc2: document.getElementById('f-mfcc2'),
            mfcc3: document.getElementById('f-mfcc3'),
            pitch: document.getElementById('f-pitch'),
        };
        this.waveCanvas = document.getElementById('waveform-canvas');
        this.specCanvas = document.getElementById('spectrum-canvas');
        this.waveCtx = this.waveCanvas.getContext('2d');
        this.specCtx = this.specCanvas.getContext('2d');
        this._fixCanvasSize(this.waveCanvas, this.waveCtx);
        this._fixCanvasSize(this.specCanvas, this.specCtx);

        this.emotionText = { happy: '高兴', sad: '悲伤', angry: '生气', neutral: '中性' };
        this.emotionColor = { happy: '#ffd700', sad: '#6495ed', angry: '#ff4444', neutral: '#aaa' };
    }

    _fixCanvasSize(canvas, ctx) {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
    }

    setLevel(v) {
        this.elLevel.style.width = `${Math.round(v * 100)}%`;
    }

    setStatus(msg) {
        this.elStatus.textContent = msg;
    }

    updateEmotion(result) {
        if (!result) return;
        const { emotion, confidence } = result;
        this.elEmotion.textContent = this.emotionText[emotion] || '--';
        this.elEmotion.style.color = this.emotionColor[emotion] || '#aaa';
        if (!result.calibrating) {
            this.elStatus.textContent = `置信度 ${Math.round((confidence || 0) * 100)}%`;
        }
    }

    updateFeatures(f) {
        if (!f) return;
        this.els.energy.textContent = f.energy.toFixed(5);
        this.els.loudness.textContent = f.loudness.toFixed(1);
        this.els.zcr.textContent = f.zcr.toFixed(4);
        this.els.centroid.textContent = f.centroid.toFixed(0);
        this.els.pitch.textContent = f.pitch > 0 ? f.pitch.toFixed(1) : '--';
        if (f.mfcc) {
            this.els.mfcc1.textContent = f.mfcc[0].toFixed(2);
            this.els.mfcc2.textContent = f.mfcc[1].toFixed(2);
            this.els.mfcc3.textContent = f.mfcc[2].toFixed(2);
        }
    }

    drawWaveform(data) {
        if (!data) return;
        const ctx = this.waveCtx;
        const w = this.waveCanvas.clientWidth;
        const h = this.waveCanvas.clientHeight;
        ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = '#53a8b6';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        const step = data.length / w;
        for (let i = 0; i < w; i++) {
            const idx = Math.floor(i * step);
            const y = (1 - (data[idx] + 1) / 2) * h;
            i === 0 ? ctx.moveTo(0, y) : ctx.lineTo(i, y);
        }
        ctx.stroke();
    }

    drawSpectrum(data) {
        if (!data) return;
        const ctx = this.specCtx;
        const w = this.specCanvas.clientWidth;
        const h = this.specCanvas.clientHeight;
        ctx.clearRect(0, 0, w, h);
        const bins = Math.min(data.length, 128);
        const barW = w / bins;
        for (let i = 0; i < bins; i++) {
            const v = data[i] / 255;
            const bh = v * h;
            ctx.fillStyle = `hsl(${(1 - v) * 240}, 70%, 50%)`;
            ctx.fillRect(i * barW, h - bh, barW - 0.5, bh);
        }
    }
}
