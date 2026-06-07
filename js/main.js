/**
 * 主入口 - 协调所有模块
 * FACS肌肉驱动 + 七情混合检测 + CMU音素同步 + 平滑过渡 + 录制回放
 */
import { CONFIG } from './config.js';
import { AudioProcessor } from './audio.js';
import { EmotionEngine } from './emotion.js';
import { VirtualHead } from './head.js';
import { AnimationDriver } from './animation.js';
import { UIManager } from './ui.js';
import { VAD } from './vad.js';
import { VisemeMapper } from './viseme.js';
import { Recorder } from './recorder.js';

class App {
    constructor() {
        this.audio = new AudioProcessor();
        this.emotion = new EmotionEngine();
        this.vad = new VAD();
        this.viseme = null;
        this.recorder = new Recorder();
        this.ui = new UIManager();
        this.head = new VirtualHead(document.getElementById('scene-container'));
        this.anim = new AnimationDriver(this.head);

        this.mode = 'realtime';
        this.sentenceEmotion = null;
        this.running = false;
        this.lastT = 0;
        this.frameCount = 0;

        this._bindEvents();
        this._checkModelLoad();
        this._loop(performance.now());
        this._log('info', '系统初始化完成，点击"开始录音"启动');
    }

    _log(level, msg) {
        const prefix = { debug: '[调试]', info: '[信息]', warn: '[警告]', error: '[错误]' };
        console.log(`${prefix[level] || ''} ${msg}`);
        this.ui.addLog(level, msg);
    }

    _bindEvents() {
        document.getElementById('start-btn').onclick = () => this._start();
        document.getElementById('stop-btn').onclick = () => this._stop();

        document.getElementById('mode-realtime').onclick = () => this._setMode('realtime');
        document.getElementById('mode-sentence').onclick = () => this._setMode('sentence');

        const vadSlider = document.getElementById('vad-slider');
        vadSlider.oninput = () => {
            const v = vadSlider.value / 100;
            this.vad.setSensitivity(v);
            document.getElementById('vad-val').textContent = `${vadSlider.value}%`;
        };

        document.getElementById('rec-btn').onclick = () => this._toggleRecord();
        document.getElementById('play-btn').onclick = () => this._startPlayback();
        document.getElementById('stop-play-btn').onclick = () => this._stopPlayback();

        // 操作说明折叠
        const helpToggle = document.getElementById('help-toggle');
        if (helpToggle) {
            helpToggle.onclick = () => {
                const panel = document.getElementById('help-content');
                panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
            };
        }

        this.vad.onSpeechStart = () => {
            this._log('debug', '检测到语音开始');
        };
        this.vad.onSpeechEnd = (features) => {
            this._log('debug', `语音结束, ${features.length}帧`);
            if (this.mode === 'sentence') {
                this.sentenceEmotion = this.emotion.classifySentence(features);
                this._log('info', `句子情绪: ${this.sentenceEmotion.dominant} (${Math.round(this.sentenceEmotion.confidence * 100)}%)`);
            }
        };

        this.recorder.onPlaybackEnd = () => {
            document.getElementById('play-btn').disabled = false;
            document.getElementById('stop-play-btn').disabled = true;
            this.ui.setRecStatus('回放结束');
            this._log('info', '回放结束');
        };
    }

    _checkModelLoad() {
        const check = () => {
            if (this.head.loaded) {
                const count = this.head.getBlendshapeCount();
                this.ui.setModelStatus(`模型已加载 (${count}个blendshapes, FACS 43AU)`);
                this._log('info', `头部模型加载成功: ${count}个blendshapes`);
            } else if (this.head.loadError) {
                this.ui.setModelStatus(`模型错误: ${this.head.loadError}`);
                this._log('error', `模型加载失败: ${this.head.loadError}`);
            } else {
                setTimeout(check, 200);
            }
        };
        setTimeout(check, 500);
    }

    _setMode(mode) {
        this.mode = mode;
        this.ui.setMode(mode);
        this.sentenceEmotion = null;
        if (mode === 'sentence') this.vad.reset();
        this._log('info', `模式切换: ${mode === 'realtime' ? '实时' : '句子'}`);
    }

    async _start() {
        document.getElementById('start-btn').disabled = true;
        this.ui.setStatus('请求麦克风权限...');
        this._log('info', '正在请求麦克风权限...');

        try {
            const ok = await this.audio.start();
            if (ok) {
                this.running = true;
                document.getElementById('stop-btn').disabled = false;
                this.ui.setStatus('校准中（请说话）...');
                this.viseme = new VisemeMapper(this.audio.sampleRate, this.audio.fftSize);
                this.vad.reset();
                this._log('info', `麦克风已启动 (采样率: ${this.audio.sampleRate}Hz)`);
            } else {
                document.getElementById('start-btn').disabled = false;
                this.ui.setStatus('麦克风权限被拒绝');
                this._log('error', '麦克风权限被拒绝');
            }
        } catch (e) {
            document.getElementById('start-btn').disabled = false;
            this.ui.setStatus('启动失败');
            this._log('error', `启动失败: ${e.message}`);
        }
    }

    _stop() {
        this.audio.stop();
        this.running = false;
        document.getElementById('start-btn').disabled = false;
        document.getElementById('stop-btn').disabled = true;
        this.ui.setStatus('已停止');
        this.ui.setLevel(0);
        this._log('info', '已停止录音');
    }

    _toggleRecord() {
        const recBtn = document.getElementById('rec-btn');
        if (!this.recorder.isRecording) {
            if (!this.running) {
                this.ui.setRecStatus('请先开始录音');
                return;
            }
            const stream = this.audio.getStream();
            if (!stream) { this.ui.setRecStatus('无音频流'); return; }
            this.recorder.startRecording(stream);
            recBtn.textContent = '停止录制';
            recBtn.classList.add('recording');
            document.getElementById('play-btn').disabled = true;
            this.ui.setRecStatus('录制中...');
            this._log('info', '开始录制');
        } else {
            this.recorder.stopRecording().then((info) => {
                recBtn.textContent = '录制';
                recBtn.classList.remove('recording');
                document.getElementById('play-btn').disabled = false;
                if (info) {
                    const dur = (info.duration / 1000).toFixed(1);
                    this.ui.setRecStatus(`已录制 ${dur}s (${info.trackLength}帧)`);
                    this._log('info', `录制完成: ${dur}s, ${info.trackLength}帧`);
                }
            });
        }
    }

    _startPlayback() {
        if (this.recorder.startPlayback(this.head)) {
            document.getElementById('play-btn').disabled = true;
            document.getElementById('stop-play-btn').disabled = false;
            this.ui.setRecStatus('回放中...');
            this._log('info', '开始回放');
        }
    }

    _stopPlayback() {
        this.recorder.stopPlayback();
        document.getElementById('play-btn').disabled = false;
        document.getElementById('stop-play-btn').disabled = true;
        this.ui.setRecStatus('回放已停止');
    }

    _loop(ts) {
        if (this.lastT === 0) this.lastT = ts;
        const dt = Math.min((ts - this.lastT) / 1000, 0.1);
        this.lastT = ts;
        this.frameCount++;

        if (this.running && !this.recorder.isPlaying) {
            this.ui.setLevel(this.audio.getLevel());
            const feat = this.audio.getFeatures();

            // VAD
            this.vad.update(feat, dt);
            this.ui.updateVAD(this.vad);

            // 口型
            let visemeWeights = null;
            if (this.viseme && feat) {
                const freqData = this.audio.getFloatFrequency();
                this.viseme.update(freqData, feat.energy, dt);
                visemeWeights = this.viseme.getBlendshapeWeights();
                this.ui.updateViseme(this.viseme);
            }

            // 情绪
            let emo;
            if (this.mode === 'realtime') {
                emo = this.emotion.update(feat);
            } else {
                if (!this.emotion.calibrated && feat) {
                    const calibResult = this.emotion.update(feat);
                    if (calibResult && !calibResult.calibrating) {
                        this.ui.setStatus('校准完成，可以说话了');
                        this._log('info', '情绪引擎校准完成');
                    }
                }
                emo = this.sentenceEmotion || { emotions: { neutral: 1 }, dominant: 'neutral', confidence: 0, calibrating: !this.emotion.calibrated };
            }

            // 动画驱动
            this.anim.update(emo, feat, visemeWeights, dt);

            // AU面板更新（每10帧一次减少DOM操作）
            if (this.frameCount % 10 === 0) {
                const activeAUs = this.anim.getFACS().getActiveAUs();
                this.ui.updateAU(activeAUs);
            }

            // 录制帧
            if (this.recorder.isRecording) {
                this.recorder.recordFrame(this.anim.getCurrentWeights());
            }

            // UI更新
            this.ui.updateEmotion(emo);
            this.ui.updateFeatures(feat);
            this.ui.drawWaveform(this.audio.getWaveform());
            this.ui.drawSpectrum(this.audio.getByteFrequency());
        } else if (!this.recorder.isPlaying) {
            this.anim.idle(dt);
        }

        this.head.update();
        requestAnimationFrame((t) => this._loop(t));
    }
}

// 全局错误处理
window.onerror = (msg, url, line, col, err) => {
    console.error(`[全局错误] ${msg} at ${url}:${line}:${col}`, err);
    const status = document.getElementById('emotion-status');
    if (status) status.textContent = `错误: ${msg}`;
};

window.addEventListener('unhandledrejection', (e) => {
    console.error('[未处理Promise拒绝]', e.reason);
});

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => { window.app = new App(); });
} else {
    window.app = new App();
}
