/**
 * 录制与回放模块
 * 录制音频(MediaRecorder) + blendshape动画轨迹，支持同步回放
 */
import { CONFIG } from './config.js';

export class Recorder {
    constructor() {
        this.isRecording = false;
        this.isPlaying = false;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.animationTrack = [];
        this.startTime = 0;
        this.audioBlob = null;
        this.audioElement = null;
        this.playbackRAF = null;
        this.hasRecording = false;
        this.onPlaybackEnd = null;
    }

    startRecording(stream) {
        if (this.isRecording) return;
        this.audioChunks = [];
        this.animationTrack = [];

        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus' : 'audio/webm';

        this.mediaRecorder = new MediaRecorder(stream, { mimeType });
        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) this.audioChunks.push(e.data);
        };
        this.mediaRecorder.start(CONFIG.recorder.chunkIntervalMs);
        this.startTime = performance.now();
        this.isRecording = true;
    }

    recordFrame(blendshapeWeights) {
        if (!this.isRecording) return;
        const time = performance.now() - this.startTime;
        this.animationTrack.push({ time, weights: { ...blendshapeWeights } });
    }

    stopRecording() {
        if (!this.isRecording) return Promise.resolve(null);
        return new Promise((resolve) => {
            this.mediaRecorder.onstop = () => {
                this.audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                this.isRecording = false;
                this.hasRecording = this.animationTrack.length > 0;
                resolve({
                    audioBlob: this.audioBlob,
                    trackLength: this.animationTrack.length,
                    duration: this.animationTrack.length > 0
                        ? this.animationTrack[this.animationTrack.length - 1].time : 0
                });
            };
            this.mediaRecorder.stop();
        });
    }

    startPlayback(head) {
        if (!this.hasRecording || this.isPlaying) return false;
        if (!this.audioBlob || this.animationTrack.length === 0) return false;

        this.isPlaying = true;
        const url = URL.createObjectURL(this.audioBlob);
        this.audioElement = new Audio(url);
        this.audioElement.play();

        const startTime = performance.now();
        const track = this.animationTrack;
        const totalDuration = track[track.length - 1].time;
        const interpolate = CONFIG.recorder.interpolatePlayback;

        const animate = () => {
            if (!this.isPlaying) return;
            const elapsed = performance.now() - startTime;

            let frameIdx = 0;
            for (let i = 0; i < track.length; i++) {
                if (track[i].time <= elapsed) frameIdx = i;
                else break;
            }

            if (interpolate) {
                const curFrame = track[frameIdx];
                const nextFrame = track[Math.min(frameIdx + 1, track.length - 1)];
                if (curFrame && nextFrame && nextFrame.time > curFrame.time) {
                    const t = Math.min((elapsed - curFrame.time) / (nextFrame.time - curFrame.time), 1);
                    const interpolated = {};
                    const allKeys = new Set([...Object.keys(curFrame.weights), ...Object.keys(nextFrame.weights)]);
                    for (const k of allKeys) {
                        const a = curFrame.weights[k] || 0;
                        const b = nextFrame.weights[k] || 0;
                        interpolated[k] = a + (b - a) * t;
                    }
                    head.setBlendshapes(interpolated);
                } else if (curFrame) {
                    head.setBlendshapes(curFrame.weights);
                }
            } else {
                head.setBlendshapes(track[frameIdx].weights);
            }

            if (elapsed < totalDuration + 200) {
                this.playbackRAF = requestAnimationFrame(animate);
            } else {
                this.stopPlayback();
                if (this.onPlaybackEnd) this.onPlaybackEnd();
            }
        };

        this.playbackRAF = requestAnimationFrame(animate);
        return true;
    }

    stopPlayback() {
        this.isPlaying = false;
        if (this.playbackRAF) {
            cancelAnimationFrame(this.playbackRAF);
            this.playbackRAF = null;
        }
        if (this.audioElement) {
            this.audioElement.pause();
            if (this.audioElement.src) URL.revokeObjectURL(this.audioElement.src);
            this.audioElement = null;
        }
    }

    getDuration() {
        if (this.animationTrack.length === 0) return 0;
        return this.animationTrack[this.animationTrack.length - 1].time;
    }
}
