# 语音情绪驱动虚拟头部 V2 / Voice-Emotion Virtual Head V2

基于Web Audio API和Three.js的实时语音情绪识别与面部动画系统。通过麦克风捕获语音，分析声学特征识别情绪（高兴/悲伤/生气/中性），并驱动GLTF模型的28个面部混合形状(blendshapes)生成逼真面部动画。

Real-time voice emotion recognition and facial animation system based on Web Audio API and Three.js. Captures voice through microphone, analyzes acoustic features to recognize emotions (happy/sad/angry/neutral), and drives 28 facial blendshapes on a GLTF model.

---

## 功能特性 / Features

### 双情绪驱动模式 / Dual Emotion Modes
- **实时模式 (Real-time)**: 逐帧分析音频特征，实时驱动面部表情
- **句子模式 (Sentence)**: 通过VAD检测语音端点，整句说完后分析整体声学特征，产生更稳定的情绪判定

### 语音活性检测 (VAD)
- 基于能量阈值 + 过零率(ZCR)的双重检测
- 自适应噪声底估计
- 可调灵敏度滑块
- 实时显示"说话中/静默"状态

### 实时音素/口型映射 (Phoneme/Viseme)
- 5种基本口型：AA(大开口)、IY(微笑)、UW(嘟嘴)、OW(圆口)、MBP(闭口)
- 基于频段能量分析（F1/F2/F3共振峰区域）
- EMA平滑避免口型跳变
- 实时可视化各口型权重条形图

### 高精度GLTF头部模型
- 28个ARKit兼容面部混合形状
- 独立控制眉毛、眼睛、脸颊、嘴唇、鼻子等区域
- 自动眨眼、呼吸微动等程序化动画
- 线性插值平滑过渡，帧率≥30fps

### 录制测试功能 (Record & Playback)
- 录制音频(WebM) + 逐帧blendshape权重轨迹
- 回放时音频与模型动画同步
- 可验证情绪识别与口型映射是否匹配

---

## 快速启动 / Quick Start

### 1. 生成/下载模型 / Get the Model

```bash
# 运行Python脚本生成带blendshapes的示范模型
python download_model.py
```

这会在`models/`目录下生成`head.glb`文件。

也可以使用外部高精度模型替换（参见下方"模型下载"章节）。

### 2. 启动服务器 / Start Server

```bash
# 使用Python内置HTTP服务器
python -m http.server 8090

# 或使用Node.js的serve
npx serve -p 8090
```

### 3. 打开浏览器 / Open Browser

访问 http://localhost:8090

点击"开始录音"按钮，授予麦克风权限即可使用。

---

## 模型下载 / Model Download

项目自带的模型通过`download_model.py`程序化生成，包含28个blendshapes。若需更高精度的人脸模型，可从以下来源获取：

### Ready Player Me (推荐)
1. 访问 https://readyplayer.me
2. 创建免费账号并设计头像
3. 导出为GLB格式（确保包含ARKit blendshapes）
4. 将文件重命名为`head.glb`放入`models/`目录

### Sketchfab 开源模型
- 搜索: https://sketchfab.com/search?q=face+blendshapes&type=models
- 筛选许可证为CC0或CC-BY的模型
- 确保模型包含morph targets / blend shapes

### 模型要求 / Model Requirements
- 格式：GLB (GLTF Binary)
- 必须包含morph targets（混合形状）
- 推荐使用ARKit命名规范的blendshapes
- 支持的名称（至少需要以下部分）：
  - `jawOpen`, `jawForward`
  - `mouthSmileLeft/Right`, `mouthFrownLeft/Right`
  - `mouthPucker`, `mouthFunnel`, `mouthOpen`, `mouthClose`
  - `eyeBlinkLeft/Right`, `eyeSquintLeft/Right`, `eyeWideLeft/Right`
  - `browInnerUp`, `browDownLeft/Right`, `browOuterUpLeft/Right`
  - `cheekPuff`, `cheekSquintLeft/Right`
  - `noseSneerLeft/Right`

---

## 测试指南 / Test Guide

### 基础测试流程
1. 运行`python download_model.py`生成模型
2. 启动HTTP服务器
3. 在Chrome/Edge中打开页面
4. 点击"开始录音"，等待校准完成（约2秒内说几个字）
5. 开始测试不同情绪

### 测试不同情绪 / Testing Emotions

| 情绪 | 建议测试方式 |
|------|-------------|
| 高兴 Happy | 用明亮、上扬的语调说话，如"太好了！我今天超开心！" |
| 悲伤 Sad | 用低沉、缓慢的语调说话，如"唉...真的好难过啊" |
| 生气 Angry | 用大声、急促的语调说话，如"不行！这太过分了！" |
| 中性 Neutral | 用平稳的语调说话，如"今天天气不错" |

### 测试句子模式
1. 切换到"句子 Sentence"模式
2. 说一句完整的话，然后停顿
3. 观察VAD指示器从"说话中"变为"静默"
4. 情绪结果在句子结束时更新

### 测试口型
- 说"啊"(AA)：嘴巴大开
- 说"一"(IY)：嘴角上扬
- 说"呜"(UW)：嘴唇嘟起
- 说"哦"(OW)：圆口
- 闭嘴哼声(MBP)：嘴唇闭合

### 测试录制回放
1. 确保已开始录音
2. 点击"录制"按钮
3. 说几句不同情绪的话（每种2-3秒）
4. 点击"停止录制"
5. 点击"播放"，观察模型回放效果
6. 对比回放的面部动画与原始语音是否匹配

### 调节VAD灵敏度
- 滑块左移(低值)：对静音更敏感，适合安静环境
- 滑块右移(高值)：需要更大声才触发，适合嘈杂环境

---

## 项目结构 / Project Structure

```
emo/
├── index.html              # 主页面（布局+样式+脚本引用）
├── download_model.py       # 模型生成脚本
├── package.json            # 项目信息
├── lib/
│   ├── three.min.js        # Three.js r128 渲染引擎
│   └── GLTFLoader.js       # GLTF模型加载器
├── models/
│   └── head.glb            # 头部GLTF模型（含blendshapes）
├── js/
│   ├── main.js             # 主入口，模块协调
│   ├── audio.js            # 音频捕获与特征提取
│   ├── emotion.js          # 情绪识别引擎（实时+句子模式）
│   ├── head.js             # GLTF头部加载与blendshape控制
│   ├── animation.js        # 动画驱动（情绪+口型→blendshape权重）
│   ├── ui.js               # UI面板管理
│   ├── vad.js              # 语音活性检测
│   ├── viseme.js           # 音素/口型频率映射
│   └── recorder.js         # 录制与回放
└── README.md               # 本文件
```

---

## 技术细节 / Technical Details

### 音频特征提取
- 采样率：浏览器默认（通常44100Hz或48000Hz）
- FFT大小：2048
- 提取特征：能量(RMS²)、响度(dB)、过零率(ZCR)、频谱质心、基频(F0)、MFCC(3维)

### 情绪识别算法
- 自动基线校准（前50帧建立个人特征基线）
- EMA指数移动平均平滑（alpha=0.35）
- Z-score标准化后的阈值规则评分
- 5帧滑动窗口多数投票防抖
- 句子模式：额外使用pitch范围和能量方差提高稳定性

### 动画系统
- 线性插值速率：4.0/秒
- 自动眨眼：2.5~5.5秒随机间隔
- 呼吸微动：0.8Hz正弦波
- 口型平滑：EMA alpha=0.35

### 性能
- 单一requestAnimationFrame循环
- 无Web Worker，所有计算在主线程完成（特征提取O(N)，N=2048）
- GLB模型<400KB，morph target更新由Three.js GPU处理
- 目标帧率：60fps（保证≥30fps）

---

## 浏览器兼容性 / Browser Compatibility

- Chrome 80+ (推荐)
- Edge 80+
- Firefox 76+
- Safari 14.1+ (需要用户手势激活AudioContext)

需要：
- 麦克风权限
- WebGL支持
- MediaRecorder API（录制功能）

---

## 调试 / Debugging

打开浏览器F12控制台可看到：
- `[主] 麦克风已启动` - 启动确认和采样率
- `[头部] 模型已加载` - 模型和blendshape信息
- `[VAD] 检测到语音开始/结束` - VAD状态变化
- `[句子模式] 情绪:` - 句子模式分类结果

---

## 许可证 / License

MIT
