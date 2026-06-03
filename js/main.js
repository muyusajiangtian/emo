/**
 * 主入口 - 协调音频/情绪/动画/UI
 */
import { AudioProcessor } from './audio.js';
import { EmotionEngine } from './emotion.js';
import { VirtualHead } from './head.js';
import { AnimationDriver } from './animation.js';
import { UIManager } from './ui.js';

class App {
    constructor() {
        this.audio = new AudioProcessor();
        this.emotion = new EmotionEngine();
        this.ui = new UIManager();
        this.head = new VirtualHead(document.getElementById('scene-container'));
        this.anim = new AnimationDriver(this.head);
        this.running = false;
        this.lastT = 0;
        this.logCounter = 0;

        document.getElementById('start-btn').onclick = () => this._start();
        document.getElementById('stop-btn').onclick = () => this._stop();

        this._loop(performance.now());
    }

    async _start() {
        document.getElementById('start-btn').disabled = true;
        this.ui.setStatus('请求麦克风权限...');

        const ok = await this.audio.start();
        if (ok) {
            this.running = true;
            document.getElementById('stop-btn').disabled = false;
            this.ui.setStatus('校准中（请说话）...');
            console.log('[主] 麦克风已启动, 采样率:', this.audio.sampleRate);
        } else {
            document.getElementById('start-btn').disabled = false;
            this.ui.setStatus('麦克风权限被拒绝');
        }
    }

    _stop() {
        this.audio.stop();
        this.running = false;
        document.getElementById('start-btn').disabled = false;
        document.getElementById('stop-btn').disabled = true;
        this.ui.setStatus('已停止');
        this.ui.setLevel(0);
    }

    _loop(ts) {
        if (this.lastT === 0) this.lastT = ts;
        const dt = Math.min((ts - this.lastT) / 1000, 0.1);
        this.lastT = ts;

        if (this.running) {
            // 电平
            this.ui.setLevel(this.audio.getLevel());

            // 特征
            const feat = this.audio.getFeatures();

            // 情绪
            const emo = this.emotion.update(feat);

            // 校准完成通知
            if (emo && !emo.calibrating && this.emotion.calibrated) {
                // 持续显示情绪结果
            }

            // 调试日志（每30帧一次）
            this.logCounter++;
            if (this.logCounter % 30 === 0 && feat) {
                console.log('[特征]', {
                    energy: feat.energy.toFixed(5),
                    loud: feat.loudness.toFixed(1),
                    zcr: feat.zcr.toFixed(4),
                    centroid: feat.centroid.toFixed(0),
                    pitch: feat.pitch.toFixed(1),
                    emotion: emo.emotion,
                    conf: (emo.confidence * 100).toFixed(0) + '%'
                });
            }

            // 动画
            this.anim.update(emo, feat, dt);

            // UI
            this.ui.updateEmotion(emo);
            this.ui.updateFeatures(feat);
            this.ui.drawWaveform(this.audio.getWaveform());
            this.ui.drawSpectrum(this.audio.getByteFrequency());
        } else {
            this.anim.update(null, null, dt);
        }

        this.head.update();
        requestAnimationFrame((t) => this._loop(t));
    }
}

window.addEventListener('DOMContentLoaded', () => { window.app = new App(); });
