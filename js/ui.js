/**
 * UI管理 - 七情雷达图 + AU面板 + 日志系统 + 操作说明
 */
import { CONFIG } from './config.js';

export class UIManager {
    constructor() {
        // 基础元素
        this.elEmotion = document.getElementById('emotion-label');
        this.elStatus = document.getElementById('emotion-status');
        this.elLevel = document.getElementById('level-bar');
        this.elModelStatus = document.getElementById('model-status');
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

        // 雷达图
        this.radarCanvas = document.getElementById('radar-canvas');
        this.radarCtx = this.radarCanvas ? this.radarCanvas.getContext('2d') : null;
        if (this.radarCanvas) this._fixCanvasSize(this.radarCanvas, this.radarCtx);

        // VAD
        this.elVadIndicator = document.getElementById('vad-indicator');

        // 音素
        this.elVisemeLabel = document.getElementById('viseme-label');
        this.visemeBars = {};
        const barIds = ['sil','PP','FF','TH','DD','kk','SS','SH','RR','aa','E','I','O','U','WW'];
        for (const id of barIds) {
            const el = document.getElementById(`vb-${id}`);
            if (el) this.visemeBars[id] = el;
        }

        // AU面板
        this.elAUPanel = document.getElementById('au-panel');

        // 录制
        this.elRecStatus = document.getElementById('rec-status');

        // 模式
        this.elModeRealtime = document.getElementById('mode-realtime');
        this.elModeSentence = document.getElementById('mode-sentence');

        // 日志面板
        this.elLogPanel = document.getElementById('log-panel');
        this.logEntries = [];

        // 情感颜色/文本映射
        this.emotionText = {
            happy: '高兴 Happy', sad: '悲伤 Sad', angry: '愤怒 Angry',
            surprise: '惊讶 Surprise', fear: '恐惧 Fear',
            disgust: '厌恶 Disgust', neutral: '中性 Neutral'
        };
        this.emotionColor = {
            happy: '#ffd700', sad: '#6495ed', angry: '#ff4444',
            surprise: '#ff8c00', fear: '#9b59b6',
            disgust: '#27ae60', neutral: '#aaa'
        };

        this.visemeText = {
            'sil': '静默', 'PP': '闭口 P/B/M', 'FF': '唇齿 F/V',
            'TH': '舌齿 TH', 'DD': '舌尖 T/D/N', 'kk': '软腭 K/G',
            'SS': '咝音 S/Z', 'SH': '腭擦 SH/CH', 'RR': '卷舌 R',
            'aa': '大开 AA', 'E': '中前 EH', 'I': '微笑 IY',
            'O': '圆口 OW', 'U': '嘟嘴 UW', 'WW': '圆唇 W',
        };
    }

    _fixCanvasSize(canvas, ctx) {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
    }

    setLevel(v) { this.elLevel.style.width = `${Math.round(v * 100)}%`; }
    setStatus(msg) { this.elStatus.textContent = msg; }
    setModelStatus(msg) { this.elModelStatus.textContent = msg; }
    setRecStatus(msg) { if (this.elRecStatus) this.elRecStatus.textContent = msg; }

    /**
     * 更新情感显示（七情混合）
     */
    updateEmotion(result) {
        if (!result) return;
        const dominant = result.dominant || result.emotion || 'neutral';
        const confidence = result.confidence || 0;

        // 主情感标签
        this.elEmotion.textContent = this.emotionText[dominant] || '--';
        this.elEmotion.style.color = this.emotionColor[dominant] || '#aaa';

        if (!result.calibrating) {
            this.elStatus.textContent = `置信度 ${Math.round(confidence * 100)}%`;
        }

        // 雷达图
        if (result.emotions && this.radarCtx) {
            this._drawRadar(result.emotions);
        }
    }

    /**
     * 绘制七情雷达图
     */
    _drawRadar(emotions) {
        const ctx = this.radarCtx;
        const canvas = this.radarCanvas;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        const cx = w / 2, cy = h / 2;
        const r = Math.min(w, h) * 0.38;
        const labels = ['happy', 'surprise', 'fear', 'disgust', 'sad', 'angry', 'neutral'];
        const n = labels.length;

        ctx.clearRect(0, 0, w, h);

        // 背景网格
        ctx.strokeStyle = '#2a3a5a';
        ctx.lineWidth = 0.5;
        for (let level = 0.25; level <= 1; level += 0.25) {
            ctx.beginPath();
            for (let i = 0; i <= n; i++) {
                const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
                const x = cx + Math.cos(angle) * r * level;
                const y = cy + Math.sin(angle) * r * level;
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.stroke();
        }

        // 轴线
        for (let i = 0; i < n; i++) {
            const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
            ctx.stroke();
        }

        // 数据区域
        ctx.fillStyle = 'rgba(83, 168, 182, 0.25)';
        ctx.strokeStyle = '#53a8b6';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i <= n; i++) {
            const idx = i % n;
            const angle = (Math.PI * 2 * idx) / n - Math.PI / 2;
            const val = Math.min(emotions[labels[idx]] || 0, 1);
            const x = cx + Math.cos(angle) * r * val;
            const y = cy + Math.sin(angle) * r * val;
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.fill();
        ctx.stroke();

        // 数据点
        for (let i = 0; i < n; i++) {
            const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
            const val = Math.min(emotions[labels[i]] || 0, 1);
            const x = cx + Math.cos(angle) * r * val;
            const y = cy + Math.sin(angle) * r * val;
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fillStyle = this.emotionColor[labels[i]] || '#53a8b6';
            ctx.fill();
        }

        // 标签
        ctx.font = '10px Microsoft YaHei';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#aaa';
        const labelShort = { happy:'高兴', surprise:'惊讶', fear:'恐惧', disgust:'厌恶', sad:'悲伤', angry:'愤怒', neutral:'中性' };
        for (let i = 0; i < n; i++) {
            const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
            const lx = cx + Math.cos(angle) * (r + 16);
            const ly = cy + Math.sin(angle) * (r + 16);
            ctx.fillStyle = this.emotionColor[labels[i]] || '#aaa';
            ctx.fillText(labelShort[labels[i]], lx, ly + 4);
        }
    }

    /**
     * 更新AU面板
     */
    updateAU(activeAUs) {
        if (!this.elAUPanel) return;
        if (!activeAUs || activeAUs.length === 0) {
            this.elAUPanel.innerHTML = '<span class="au-empty">无活跃AU</span>';
            return;
        }
        const html = activeAUs.slice(0, 8).map(a => {
            const pct = Math.round(a.intensity * 100);
            const color = pct > 60 ? '#ff6b6b' : pct > 30 ? '#ffd700' : '#53a8b6';
            return `<div class="au-item"><span class="au-name">${a.au}</span><div class="au-bar"><div class="au-fill" style="width:${pct}%;background:${color}"></div></div><span class="au-desc">${a.desc}</span></div>`;
        }).join('');
        this.elAUPanel.innerHTML = html;
    }

    updateVAD(vad) {
        if (!this.elVadIndicator) return;
        if (vad.isSpeaking) {
            this.elVadIndicator.textContent = '说话中 Speaking';
            this.elVadIndicator.className = 'vad-speaking';
        } else {
            this.elVadIndicator.textContent = '静默 Silent';
            this.elVadIndicator.className = 'vad-silent';
        }
    }

    updateViseme(visemeMapper) {
        if (!visemeMapper) return;
        const current = visemeMapper.getCurrent();
        if (this.elVisemeLabel) {
            this.elVisemeLabel.textContent = this.visemeText[current] || current;
        }
        const weights = visemeMapper.getWeights();
        for (const [name, el] of Object.entries(this.visemeBars)) {
            const w = weights[name] || 0;
            el.style.height = `${Math.round(w * 100)}%`;
        }
    }

    setMode(mode) {
        if (mode === 'realtime') {
            this.elModeRealtime.classList.add('active');
            this.elModeSentence.classList.remove('active');
        } else {
            this.elModeRealtime.classList.remove('active');
            this.elModeSentence.classList.add('active');
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
        const bins = Math.min(data.length, CONFIG.ui.spectrumBins);
        const barW = w / bins;
        for (let i = 0; i < bins; i++) {
            const v = data[i] / 255;
            const bh = v * h;
            ctx.fillStyle = `hsl(${(1 - v) * 240}, 70%, 50%)`;
            ctx.fillRect(i * barW, h - bh, barW - 0.5, bh);
        }
    }

    /**
     * 添加日志条目到UI
     */
    addLog(level, msg) {
        if (!this.elLogPanel || !CONFIG.log.showInUI) return;
        const levels = ['debug', 'info', 'warn', 'error'];
        if (levels.indexOf(level) < levels.indexOf(CONFIG.log.level)) return;

        this.logEntries.push({ level, msg, time: new Date().toLocaleTimeString() });
        if (this.logEntries.length > CONFIG.log.maxUILogs) this.logEntries.shift();

        const colors = { debug: '#666', info: '#53a8b6', warn: '#ffd700', error: '#ff4444' };
        const html = this.logEntries.slice(-8).map(e =>
            `<div class="log-entry" style="color:${colors[e.level]}">[${e.time}] ${e.msg}</div>`
        ).join('');
        this.elLogPanel.innerHTML = html;
    }
}
