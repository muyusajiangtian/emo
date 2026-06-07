/**
 * 全局配置 - 所有可调参数集中管理
 */
export const CONFIG = {
    // ===== FACS AU系统 =====
    facs: {
        // 备用模型网格精度
        sphereSegments: 96,
        sphereRings: 72,
        // AU变形强度全局缩放
        deformScale: 2.2,
    },

    // ===== 情感识别 =====
    emotion: {
        // 校准帧数（需要足够安静环境采样）
        calibrationFrames: 90,
        // 支持的7种情感
        emotions: ['happy', 'sad', 'angry', 'surprise', 'fear', 'disgust', 'neutral'],
        // EMA平滑系数（特征）——越大响应越快
        featureAlpha: 0.4,
        // 情感得分低通系数——越大跟随越快
        scoreLpfAlpha: 0.35,
        // 混合情感输出：低于此阈值的情感不输出
        intensityThreshold: 0.03,
        // 语速检测窗口（秒）
        speechRateWindow: 2.0,
        // 节奏特征窗口帧数
        rhythmWindowFrames: 40,
    },

    // ===== 动画过渡 =====
    animation: {
        // 情感切换过渡时间（毫秒）
        transitionDurationMs: 300,
        // 默认lerp速率（当不在过渡中时的追踪速度）
        defaultLerpRate: 6.0,
        // 眨眼间隔范围（秒）
        blinkIntervalMin: 2.5,
        blinkIntervalMax: 5.5,
        // 眨眼速度
        blinkSpeed: 8.0,
        // 呼吸幅度
        breathAmplitude: 0.008,
        breathFrequency: 0.8,
        // 微表情（微动）幅度
        microExpressionAmplitude: 0.015,
    },

    // ===== 音素/口型 =====
    viseme: {
        // 平滑系数
        smoothAlpha: 0.4,
        // CMU音素到viseme组的映射启用
        useCmuMapping: true,
        // 能量门限（低于此闭口）
        silenceThreshold: 0.0003,
        // 共振峰检测频段
        formantBands: {
            f1: [200, 900],
            f2: [900, 2500],
            f3: [2500, 4000],
            f4: [4000, 6000],
        },
    },

    // ===== VAD =====
    vad: {
        defaultSensitivity: 0.5,
        minSpeechFrames: 4,
        minSilenceMs: 400,
        noiseWindow: 50,
        emaAlpha: 0.35,
    },

    // ===== 音频 =====
    audio: {
        fftSize: 4096,
        smoothingTimeConstant: 0.6,
        // MFCC系数数量
        mfccCoefficients: 13,
        // Mel滤波器数量
        melFilters: 40,
    },

    // ===== 录制 =====
    recorder: {
        // 录制chunk间隔ms
        chunkIntervalMs: 100,
        // 回放插值
        interpolatePlayback: true,
    },

    // ===== UI =====
    ui: {
        // 情感雷达图启用
        showEmotionRadar: true,
        // AU面板显示
        showAUPanel: true,
        // 波形显示bin数
        spectrumBins: 128,
    },

    // ===== 日志 =====
    log: {
        // 日志级别: 'debug' | 'info' | 'warn' | 'error'
        level: 'info',
        // 是否在界面显示日志
        showInUI: true,
        // 最大UI日志条数
        maxUILogs: 50,
    },
};
