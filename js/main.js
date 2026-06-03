/**
 * 主入口 - 协调所有模块：音频/情绪/VAD/口型/动画/录制/UI
 */
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

        this._bindEvents();
        this._checkModelLoad();
        this._loop(performance.now());
    }

    _bindEvents() {
        document.getElementById('start-btn').onclick = () => this._start();
        document.getElementById('stop-btn').onclick = () => this._stop();

        // 模式切换
        document.getElementById('mode-realtime').onclick = () => this._setMode('realtime');
        document.getElementById('mode-sentence').onclick = () => this._setMode('sentence');

        // VAD灵敏度
        const vadSlider = document.getElementById('vad-slider');
        vadSlider.oninput = () => {
            const v = vadSlider.value / 100;
            this.vad.setSensitivity(v);
            document.getElementById('vad-val').textContent = `${vadSlider.value}%`;
        };

        // 录制/回放
        document.getElementById('rec-btn').onclick = () => this._toggleRecord();
        document.getElementById('play-btn').onclick = () => this._startPlayback();
        document.getElementById('stop-play-btn').onclick = () => this._stopPlayback();

        // VAD回调
        this.vad.onSpeechStart = () => {
            console.log('[VAD→Main] 检测到语音开始, 当前模式:', this.mode, ', 已校准:', this.emotion.calibrated);
        };
        this.vad.onSpeechEnd = (features) => {
            console.log(`[VAD→Main] 语音结束, ${features.length}帧, 当前模式: ${this.mode}, 已校准: ${this.emotion.calibrated}`);
            if (this.mode === 'sentence') {
                console.log('[VAD→Main] 进入句子模式情绪分析...');
                this.sentenceEmotion = this.emotion.classifySentence(features);
                console.log('[句子模式] 结果:', this.sentenceEmotion.emotion,
                    '置信度:', (this.sentenceEmotion.confidence * 100).toFixed(0) + '%');
            } else {
                console.log('[VAD→Main] 非句子模式，跳过整句分析');
            }
        };

        // 录制回放结束
        this.recorder.onPlaybackEnd = () => {
            document.getElementById('play-btn').disabled = false;
            document.getElementById('stop-play-btn').disabled = true;
            this.ui.setRecStatus('回放结束 Playback ended');
        };
    }

    _checkModelLoad() {
        const check = () => {
            if (this.head.loaded) {
                const count = this.head.getBlendshapeCount();
                this.ui.setModelStatus(`模型已加载 (${count}个blendshapes)`);
            } else if (this.head.loadError) {
                this.ui.setModelStatus(`模型错误: ${this.head.loadError}`);
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
        if (mode === 'sentence') {
            this.vad.reset();
        }
        console.log('[模式切换]', mode === 'realtime' ? '实时模式' : '句子模式');
    }

    async _start() {
        document.getElementById('start-btn').disabled = true;
        this.ui.setStatus('请求麦克风权限...');

        const ok = await this.audio.start();
        if (ok) {
            this.running = true;
            document.getElementById('stop-btn').disabled = false;
            this.ui.setStatus('校准中（请说话）...');

            // 初始化Viseme映射器（需要采样率）
            this.viseme = new VisemeMapper(this.audio.sampleRate, this.audio.fftSize);
            this.vad.reset();
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

    _toggleRecord() {
        const recBtn = document.getElementById('rec-btn');
        if (!this.recorder.isRecording) {
            if (!this.running) {
                this.ui.setRecStatus('请先开始录音');
                return;
            }
            const stream = this.audio.getStream();
            if (!stream) {
                this.ui.setRecStatus('无音频流');
                return;
            }
            this.recorder.startRecording(stream);
            recBtn.textContent = '停止录制';
            recBtn.classList.add('recording');
            document.getElementById('play-btn').disabled = true;
            this.ui.setRecStatus('录制中... Recording...');
        } else {
            this.recorder.stopRecording().then((info) => {
                recBtn.textContent = '录制';
                recBtn.classList.remove('recording');
                document.getElementById('play-btn').disabled = false;
                if (info) {
                    const dur = (info.duration / 1000).toFixed(1);
                    this.ui.setRecStatus(`已录制 ${dur}s (${info.trackLength}帧)`);
                }
            });
        }
    }

    _startPlayback() {
        if (this.recorder.startPlayback(this.head)) {
            document.getElementById('play-btn').disabled = true;
            document.getElementById('stop-play-btn').disabled = false;
            this.ui.setRecStatus('回放中... Playing...');
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

        if (this.running && !this.recorder.isPlaying) {
            // 电平
            this.ui.setLevel(this.audio.getLevel());

            // 特征提取
            const feat = this.audio.getFeatures();

            // VAD检测（传入dt用于精确计时）
            this.vad.update(feat, dt);
            this.ui.updateVAD(this.vad);

            // 口型映射
            let visemeWeights = null;
            if (this.viseme && feat) {
                const freqData = this.audio.getFloatFrequency();
                this.viseme.update(freqData, feat.energy);
                visemeWeights = this.viseme.getBlendshapeWeights();
                this.ui.updateViseme(this.viseme);
            }

            // 情绪识别（根据模式）
            let emo;
            if (this.mode === 'realtime') {
                emo = this.emotion.update(feat);
            } else {
                // 句子模式：校准阶段仍需喂数据
                if (!this.emotion.calibrated && feat) {
                    const calibResult = this.emotion.update(feat);
                    if (calibResult && !calibResult.calibrating) {
                        console.log('[Main-句子模式] 校准完成！基线已建立。');
                        this.ui.setStatus('校准完成，可以说话了');
                    }
                }
                // 使用VAD整句分析后的稳定结果，不受帧级干扰
                emo = this.sentenceEmotion || { emotion: 'neutral', confidence: 0, calibrating: !this.emotion.calibrated };
            }

            // 动画驱动
            this.anim.update(emo, feat, visemeWeights, dt);

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

window.addEventListener('DOMContentLoaded', () => { window.app = new App(); });
