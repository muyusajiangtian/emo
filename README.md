# 语音情绪虚拟头部 V3 - FACS驱动系统

# Voice Emotion Virtual Head V3 - FACS Driven

---

## 项目简介 / Introduction

基于Web Audio API和Three.js的实时语音情绪驱动虚拟头部系统。采用FACS（面部动作编码系统）标准的43个AU动作单元驱动面部肌肉变形，支持7种情感的混合检测，实现基于CMU词典的音素级嘴型同步，300毫秒平滑情感过渡。

A real-time voice-emotion-driven virtual head system built with Web Audio API and Three.js. Uses FACS (Facial Action Coding System) standard with 43 Action Units for muscle-driven facial deformation, supports 7-emotion blended detection, CMU dictionary-based phoneme lip sync, and 300ms smooth emotion transitions.

---

## 核心特性 / Features

- **FACS肌肉驱动** - 43个AU动作单元，基于真实面部解剖学的肌肉变形系统
- **七情混合检测** - happy/sad/angry/surprise/fear/disgust/neutral 混合比例和强度值
- **CMU音素嘴型** - 15组Viseme精确映射，共振峰分析驱动实时lip sync
- **300ms平滑过渡** - smoothstep缓动曲线，表情切换自然不跳变
- **录制回放** - 录制音频+动画轨迹，支持完整表情动画回放
- **七情雷达图** - 实时可视化7种情感的混合比例
- **配置外置** - 所有参数集中在config.js，无需改代码即可调参
- **日志系统** - UI内嵌日志面板 + 控制台详细日志
- **操作说明** - 窗口内可折叠操作指南

---

## 环境依赖 / Requirements

- 现代浏览器（Chrome/Edge/Firefox，需支持Web Audio API和MediaRecorder）
- 麦克风设备
- HTTP服务器（ES Module需要通过HTTP加载）
- Python 3.x 或 Node.js（用于启动本地服务器）

---

## 快速启动 / Quick Start

```bash
# Windows: 双击启动
start.bat

# Linux/Mac:
chmod +x start.sh
./start.sh

# 或手动启动服务器
python -m http.server 8080
# 然后访问 http://localhost:8080
```

---

## 项目结构 / Structure

```
emo/
├── index.html          # 主页面（UI布局+样式）
├── start.bat           # Windows启动脚本
├── start.sh            # Linux/Mac启动脚本
├── package.json        # 项目配置
├── js/
│   ├── config.js       # 全局配置参数（外置）
│   ├── main.js         # 主入口，模块协调
│   ├── facs.js         # FACS动作单元定义（43个AU）
│   ├── head.js         # Three.js虚拟头部（blendshape模型）
│   ├── animation.js    # FACS动画驱动器（300ms过渡）
│   ├── emotion.js      # 七情混合情感识别引擎
│   ├── viseme.js       # CMU音素嘴型映射（15组Viseme）
│   ├── audio.js        # 音频捕获与特征提取（13维MFCC）
│   ├── vad.js          # 语音活性检测
│   ├── recorder.js     # 录制与回放
│   └── ui.js           # UI管理（雷达图+AU面板+日志）
├── lib/
│   ├── three.min.js    # Three.js库
│   └── GLTFLoader.js   # GLTF加载器
└── models/
    └── head.glb        # 头部3D模型（可选，内置备用模型）
```

---

## 配置说明 / Configuration

编辑 `js/config.js` 调整所有参数：

| 参数路径 | 说明 | 默认值 |
|----------|------|--------|
| `animation.transitionDurationMs` | 情感过渡时长 | 300ms |
| `emotion.calibrationFrames` | 校准帧数 | 60 |
| `emotion.intensityThreshold` | 情感输出阈值 | 0.05 |
| `viseme.smoothAlpha` | 嘴型平滑系数 | 0.4 |
| `vad.minSilenceMs` | 句尾静音判定 | 400ms |
| `audio.mfccCoefficients` | MFCC维度 | 13 |
| `audio.melFilters` | Mel滤波器数量 | 26 |
| `facs.sphereSegments` | 备用模型网格精度 | 96 |
| `log.level` | 日志级别 | 'info' |

---

## 技术架构 / Architecture

```
麦克风 → Web Audio API → 特征提取(13-MFCC + 频谱通量 + 基频)
                              ↓
              ┌───────────────┼───────────────┐
              ↓               ↓               ↓
          VAD检测         情感识别(7情)    共振峰分析
              ↓               ↓               ↓
          句子分割      混合比例输出      音素估计(15组)
                              ↓               ↓
                    FACS AU计算(43个)   Viseme Blendshape
                              ↓               ↓
                    AU→Blendshape转换   嘴型权重合并
                              ↓               ↓
                        ┌─────┴───────────────┘
                        ↓
                  300ms Smoothstep缓动过渡
                        ↓
                  Three.js MorphTarget GPU渲染
```

---

## 测试指南 / Test Guide

### 情绪测试

| 情绪 | 测试方式 | 特征表现 |
|------|----------|----------|
| 高兴 | 明亮上扬语调 | AU6+AU12 (颧肌+嘴角上拉) |
| 悲伤 | 低沉缓慢 | AU1+AU15 (内眉上扬+嘴角下拉) |
| 愤怒 | 大声急促 | AU4+AU9+AU23 (皱眉+鼻翼+嘴唇收紧) |
| 惊讶 | 突然高音 | AU1+AU2+AU5+AU26 (扬眉+睁眼+张嘴) |
| 恐惧 | 颤抖高音 | AU1+AU5+AU20 (扬眉+睁眼+唇拉伸) |
| 厌恶 | 低沉缓慢 | AU9+AU10 (鼻翼皱缩+上唇提升) |

### 嘴型测试

- "啊" → aa (大开口, jawOpen高)
- "衣" → I (微笑口型)
- "呜" → U (嘟嘴, mouthPucker高)
- "哦" → O (圆口, mouthFunnel高)
- "嘶" → SS (咝音, 嘴角横拉)
- "啪" → PP (爆破, 闭口后张开)

---

## 浏览器兼容性 / Browser Compatibility

- Chrome 80+ (推荐)
- Edge 80+
- Firefox 76+
- Safari 14.1+

---

## 许可证 / License

ISC
