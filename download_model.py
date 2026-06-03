#!/usr/bin/env python3
"""
生成高精度GLB头部模型 / Generate High-Precision GLB Head Model
包含可辨识的五官特征：眼窝、鼻梁、嘴唇、眉弓、耳朵、下巴
Contains distinguishable facial features: eye sockets, nose, lips, brow ridge, ears, chin

Usage: python download_model.py
"""

import struct
import json
import math
import os


def smoothstep(edge0, edge1, x):
    t = max(0, min(1, (x - edge0) / (edge1 - edge0)))
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return a + (b - a) * t


def clamp(v, lo=0, hi=1):
    return max(lo, min(hi, v))


def generate_head_model():
    """生成带有五官特征和blendshapes的高精度头部GLB模型"""

    segments = 80
    rings = 60
    positions = []
    normals = []
    indices = []

    for j in range(rings + 1):
        phi = math.pi * j / rings
        for i in range(segments + 1):
            theta = 2 * math.pi * i / segments

            # 基础球体坐标
            sx = math.sin(phi) * math.cos(theta)
            sy = math.cos(phi)
            sz = math.sin(phi) * math.sin(theta)

            x, y, z = sx, sy, sz

            # === 头部整体形状 ===
            # 拉长为椭圆形头部
            y *= 1.3
            z *= 0.92

            # 下巴收窄
            if y < -0.3:
                jaw_factor = 1 - abs(y + 0.3) * 0.45
                x *= max(jaw_factor, 0.4)
                z *= max(jaw_factor, 0.5)
            # 下巴前突
            if y < -0.5 and z > 0:
                chin_f = smoothstep(-0.5, -0.9, y) * smoothstep(0, 0.3, z)
                z += 0.12 * chin_f
                y -= 0.05 * chin_f

            # 头顶略扁
            if y > 0.8:
                top_f = smoothstep(0.8, 1.3, y)
                y -= 0.05 * top_f

            # 后脑勺凸出
            if z < -0.2 and y > -0.2 and y < 0.8:
                back_f = smoothstep(-0.2, -0.7, z) * (1 - smoothstep(0.8, 1.0, abs(y)))
                z -= 0.08 * back_f

            # 太阳穴内凹
            if abs(x) > 0.6 and y > 0.1 and y < 0.6 and z > -0.1:
                temple_f = smoothstep(0.6, 0.85, abs(x)) * smoothstep(0.1, 0.3, y) * (1 - smoothstep(0.5, 0.7, y))
                x *= (1 - 0.06 * temple_f / max(abs(x), 0.01))

            # === 眉弓 ===
            if y > 0.2 and y < 0.45 and z > 0.3 and abs(x) < 0.55:
                brow_f = smoothstep(0.2, 0.32, y) * (1 - smoothstep(0.38, 0.45, y))
                brow_f *= smoothstep(0.3, 0.5, z) * (1 - smoothstep(0.5, 0.55, abs(x)))
                z += 0.12 * brow_f
                y += 0.03 * brow_f

            # === 眼窝（深凹陷）===
            eye_cx_l = -0.28
            eye_cx_r = 0.28
            eye_cy = 0.18
            eye_rx = 0.15
            eye_ry = 0.10

            for eye_cx in [eye_cx_l, eye_cx_r]:
                dx_eye = (x - eye_cx) / eye_rx
                dy_eye = (y - eye_cy) / eye_ry
                dist_eye = dx_eye * dx_eye + dy_eye * dy_eye
                if dist_eye < 1.0 and z > 0.3:
                    depth = (1 - dist_eye) ** 1.5
                    z_factor = smoothstep(0.3, 0.6, z)
                    z -= 0.20 * depth * z_factor
                    # 眼窝周围微微凸起（眼眶骨）
                    if dist_eye > 0.5 and dist_eye < 1.3:
                        rim_f = (1 - abs(dist_eye - 0.85) / 0.4)
                        z += 0.04 * rim_f * z_factor

            # === 鼻子 ===
            # 鼻梁（从眉间向下延伸）
            if abs(x) < 0.12 and y > -0.15 and y < 0.28 and z > 0.4:
                nose_bridge_f = (1 - abs(x) / 0.12) * smoothstep(0.4, 0.6, z)
                bridge_height = lerp(0.10, 0.16, smoothstep(-0.15, 0.2, y))
                z += bridge_height * nose_bridge_f

            # 鼻尖（球形凸起）
            nose_tip_cx = 0
            nose_tip_cy = -0.1
            nose_tip_cz = 0.85
            dx_nose = x - nose_tip_cx
            dy_nose = y - nose_tip_cy
            dist_nose_tip = math.sqrt(dx_nose**2 + dy_nose**2)
            if dist_nose_tip < 0.12 and z > 0.5:
                tip_f = (1 - dist_nose_tip / 0.12) ** 2
                z += 0.22 * tip_f

            # 鼻翼（两侧球形）
            for side in [-1, 1]:
                wing_cx = side * 0.09
                wing_cy = -0.14
                dx_w = x - wing_cx
                dy_w = y - wing_cy
                dist_w = math.sqrt(dx_w**2 + dy_w**2)
                if dist_w < 0.08 and z > 0.5:
                    wing_f = (1 - dist_w / 0.08) ** 2
                    z += 0.10 * wing_f
                    x += side * 0.04 * wing_f

            # 鼻根凹陷（眉间到鼻梁过渡）
            if abs(x) < 0.1 and y > 0.15 and y < 0.3 and z > 0.5:
                root_f = (1 - abs(x) / 0.1) * smoothstep(0.15, 0.22, y) * (1 - smoothstep(0.25, 0.3, y))
                z -= 0.06 * root_f

            # === 嘴唇 ===
            mouth_cy = -0.35
            mouth_rx = 0.18
            mouth_ry = 0.06

            dx_mouth = x / mouth_rx
            dy_mouth = (y - mouth_cy) / mouth_ry
            dist_mouth = dx_mouth**2 + dy_mouth**2

            if dist_mouth < 2.5 and z > 0.4:
                mouth_z_f = smoothstep(0.4, 0.6, z)
                # 上唇凸起
                if y > mouth_cy - 0.02 and y < mouth_cy + 0.06 and abs(x) < 0.2:
                    upper_lip_f = smoothstep(mouth_cy - 0.02, mouth_cy + 0.01, y) * (1 - smoothstep(mouth_cy + 0.03, mouth_cy + 0.06, y))
                    upper_lip_f *= (1 - abs(x) / 0.2) * mouth_z_f
                    z += 0.08 * upper_lip_f
                    # 人中唇弓（M形）
                    if abs(x) < 0.06:
                        cupid_f = (1 - abs(x) / 0.06) * upper_lip_f
                        y -= 0.015 * cupid_f

                # 下唇凸起（更厚）
                if y < mouth_cy and y > mouth_cy - 0.08 and abs(x) < 0.17:
                    lower_lip_f = smoothstep(mouth_cy - 0.08, mouth_cy - 0.04, y) * (1 - smoothstep(mouth_cy - 0.02, mouth_cy, y))
                    lower_lip_f *= (1 - abs(x) / 0.17) * mouth_z_f
                    z += 0.07 * lower_lip_f

                # 嘴角凹陷
                for side in [-1, 1]:
                    corner_cx = side * 0.16
                    corner_cy_val = mouth_cy - 0.01
                    dc_x = x - corner_cx
                    dc_y = y - corner_cy_val
                    dist_corner = math.sqrt(dc_x**2 + dc_y**2)
                    if dist_corner < 0.04:
                        corner_f = (1 - dist_corner / 0.04) ** 2 * mouth_z_f
                        z -= 0.025 * corner_f

            # 人中沟
            if abs(x) < 0.04 and y > mouth_cy + 0.03 and y < 0.0 and z > 0.5:
                philtrum_f = (1 - abs(x) / 0.04) * smoothstep(mouth_cy + 0.03, mouth_cy + 0.06, y) * (1 - smoothstep(-0.05, 0.0, y))
                z -= 0.02 * philtrum_f

            # === 颧骨 ===
            if y > -0.15 and y < 0.15 and abs(x) > 0.35 and z > 0.2:
                cheek_f = smoothstep(0.35, 0.55, abs(x)) * (1 - smoothstep(0.55, 0.7, abs(x)))
                cheek_f *= (1 - abs(y) / 0.15) * smoothstep(0.2, 0.4, z)
                z += 0.08 * cheek_f
                x += (0.04 if x > 0 else -0.04) * cheek_f

            # === 下颌线 ===
            if y < -0.4 and y > -0.75 and abs(x) > 0.2 and z > -0.1:
                jaw_line_f = smoothstep(0.2, 0.4, abs(x)) * smoothstep(-0.75, -0.5, y) * (1 - smoothstep(-0.4, -0.3, y))
                x += (0.02 if x > 0 else -0.02) * jaw_line_f

            # === 耳朵（简化凸起）===
            for side in [-1, 1]:
                ear_cx = side * 0.75
                ear_cy = 0.05
                dx_ear = abs(x) - abs(ear_cx)
                dy_ear = y - ear_cy
                # 耳朵位于头部侧面
                if abs(x) > 0.6 and abs(dx_ear) < 0.15 and abs(dy_ear) < 0.2 and abs(z) < 0.35:
                    ear_dist = (dx_ear / 0.15)**2 + (dy_ear / 0.2)**2
                    if ear_dist < 1.0:
                        ear_f = (1 - ear_dist) ** 1.2
                        x += side * 0.14 * ear_f
                        # 耳垂
                        if dy_ear < -0.1:
                            lobe_f = smoothstep(-0.1, -0.18, dy_ear) * ear_f
                            x += side * 0.04 * lobe_f
                            y -= 0.025 * lobe_f

            # === 颏唇沟（下唇下方凹陷）===
            if abs(x) < 0.15 and y < mouth_cy - 0.06 and y > mouth_cy - 0.14 and z > 0.4:
                chin_groove_f = (1 - abs(x) / 0.15) * smoothstep(mouth_cy - 0.14, mouth_cy - 0.1, y) * (1 - smoothstep(mouth_cy - 0.07, mouth_cy - 0.06, y))
                z -= 0.05 * chin_groove_f

            # === 下巴凸起 ===
            if abs(x) < 0.12 and y < -0.55 and y > -0.8 and z > 0.2:
                chin_prom_f = (1 - abs(x) / 0.12) * smoothstep(-0.8, -0.65, y) * (1 - smoothstep(-0.58, -0.55, y))
                chin_prom_f *= smoothstep(0.2, 0.4, z)
                z += 0.1 * chin_prom_f

            # 法线（近似）
            length = math.sqrt(x*x + y*y + z*z)
            if length < 0.001:
                length = 0.001
            nx, ny, nz = x/length, y/length, z/length

            positions.extend([x, y, z])
            normals.extend([nx, ny, nz])

    # 索引
    for j in range(rings):
        for i in range(segments):
            a = j * (segments + 1) + i
            b = a + 1
            c = a + (segments + 1)
            d = c + 1
            indices.extend([a, c, b, b, c, d])

    vertex_count = (rings + 1) * (segments + 1)

    # 28个ARKit blendshapes
    blendshape_names = [
        "browInnerUp", "browOuterUpLeft", "browOuterUpRight",
        "browDownLeft", "browDownRight",
        "eyeBlinkLeft", "eyeBlinkRight",
        "eyeWideLeft", "eyeWideRight",
        "eyeSquintLeft", "eyeSquintRight",
        "cheekPuff", "cheekSquintLeft", "cheekSquintRight",
        "jawOpen", "jawForward",
        "mouthSmileLeft", "mouthSmileRight",
        "mouthFrownLeft", "mouthFrownRight",
        "mouthPucker", "mouthFunnel",
        "mouthOpen", "mouthClose",
        "mouthLeft", "mouthRight",
        "noseSneerLeft", "noseSneerRight",
    ]

    # 为每个blendshape生成位移数据
    morph_targets = []
    for bs_name in blendshape_names:
        displacements = [0.0] * (vertex_count * 3)

        for j in range(rings + 1):
            phi = math.pi * j / rings
            for i in range(segments + 1):
                theta = 2 * math.pi * i / segments
                idx = (j * (segments + 1) + i) * 3

                # 用基础球面坐标作为参考（用于区域判断）
                base_x = math.sin(phi) * math.cos(theta)
                base_y = math.cos(phi)
                base_z = math.sin(phi) * math.sin(theta)
                base_y *= 1.3
                base_z *= 0.92

                dx, dy, dz = 0, 0, 0
                S = 2.0

                if bs_name == "browInnerUp":
                    if base_y > 0.25 and abs(base_x) < 0.25 and base_z > 0.35:
                        f = smoothstep(0.25, 0.35, base_y) * (1 - abs(base_x) / 0.25) * smoothstep(0.35, 0.5, base_z)
                        dy = 0.07 * S * f

                elif bs_name == "browOuterUpLeft":
                    if base_y > 0.25 and base_x < -0.2 and base_z > 0.3:
                        f = smoothstep(0.25, 0.35, base_y) * smoothstep(-0.2, -0.4, base_x) * smoothstep(0.3, 0.5, base_z)
                        dy = 0.06 * S * f

                elif bs_name == "browOuterUpRight":
                    if base_y > 0.25 and base_x > 0.2 and base_z > 0.3:
                        f = smoothstep(0.25, 0.35, base_y) * smoothstep(0.2, 0.4, base_x) * smoothstep(0.3, 0.5, base_z)
                        dy = 0.06 * S * f

                elif bs_name == "browDownLeft":
                    if base_y > 0.15 and base_y < 0.4 and base_x < -0.1 and base_z > 0.35:
                        f = (1 - abs(base_y - 0.27) / 0.12) * smoothstep(-0.1, -0.3, base_x) * smoothstep(0.35, 0.5, base_z)
                        f = max(0, f)
                        dy = -0.05 * S * f

                elif bs_name == "browDownRight":
                    if base_y > 0.15 and base_y < 0.4 and base_x > 0.1 and base_z > 0.35:
                        f = (1 - abs(base_y - 0.27) / 0.12) * smoothstep(0.1, 0.3, base_x) * smoothstep(0.35, 0.5, base_z)
                        f = max(0, f)
                        dy = -0.05 * S * f

                elif bs_name == "eyeBlinkLeft":
                    if base_y > 0.05 and base_y < 0.32 and base_x < -0.12 and base_x > -0.45 and base_z > 0.45:
                        f = (1 - abs(base_y - 0.18) / 0.13) * smoothstep(0.45, 0.6, base_z)
                        f = max(0, f)
                        dy = -0.06 * S * f

                elif bs_name == "eyeBlinkRight":
                    if base_y > 0.05 and base_y < 0.32 and base_x > 0.12 and base_x < 0.45 and base_z > 0.45:
                        f = (1 - abs(base_y - 0.18) / 0.13) * smoothstep(0.45, 0.6, base_z)
                        f = max(0, f)
                        dy = -0.06 * S * f

                elif bs_name == "eyeWideLeft":
                    if base_y > 0.05 and base_y < 0.35 and base_x < -0.12 and base_x > -0.45 and base_z > 0.45:
                        f = (1 - abs(base_y - 0.2) / 0.15) * smoothstep(0.45, 0.6, base_z)
                        f = max(0, f)
                        dy = 0.04 * S * f

                elif bs_name == "eyeWideRight":
                    if base_y > 0.05 and base_y < 0.35 and base_x > 0.12 and base_x < 0.45 and base_z > 0.45:
                        f = (1 - abs(base_y - 0.2) / 0.15) * smoothstep(0.45, 0.6, base_z)
                        f = max(0, f)
                        dy = 0.04 * S * f

                elif bs_name == "eyeSquintLeft":
                    if base_y > 0.0 and base_y < 0.28 and base_x < -0.1 and base_x > -0.42 and base_z > 0.45:
                        f = (1 - abs(base_y - 0.14) / 0.14) * smoothstep(0.45, 0.6, base_z)
                        f = max(0, f)
                        dy = -0.025 * S * f
                        dz = 0.02 * S * f

                elif bs_name == "eyeSquintRight":
                    if base_y > 0.0 and base_y < 0.28 and base_x > 0.1 and base_x < 0.42 and base_z > 0.45:
                        f = (1 - abs(base_y - 0.14) / 0.14) * smoothstep(0.45, 0.6, base_z)
                        f = max(0, f)
                        dy = -0.025 * S * f
                        dz = 0.02 * S * f

                elif bs_name == "cheekPuff":
                    if base_y > -0.35 and base_y < 0.05 and abs(base_x) > 0.3 and base_z > 0.15:
                        f = smoothstep(0.3, 0.5, abs(base_x)) * (1 - abs(base_y + 0.15) / 0.2) * smoothstep(0.15, 0.3, base_z)
                        f = max(0, f)
                        dx = (1 if base_x > 0 else -1) * 0.07 * S * f
                        dz = 0.04 * S * f

                elif bs_name == "cheekSquintLeft":
                    if base_y > -0.08 and base_y < 0.15 and base_x < -0.2 and base_z > 0.35:
                        f = smoothstep(-0.2, -0.4, base_x) * (1 - abs(base_y - 0.03) / 0.12) * smoothstep(0.35, 0.5, base_z)
                        f = max(0, f)
                        dy = 0.03 * S * f
                        dz = 0.02 * S * f

                elif bs_name == "cheekSquintRight":
                    if base_y > -0.08 and base_y < 0.15 and base_x > 0.2 and base_z > 0.35:
                        f = smoothstep(0.2, 0.4, base_x) * (1 - abs(base_y - 0.03) / 0.12) * smoothstep(0.35, 0.5, base_z)
                        f = max(0, f)
                        dy = 0.03 * S * f
                        dz = 0.02 * S * f

                elif bs_name == "jawOpen":
                    if base_y < -0.25 and base_z > 0.05:
                        f = smoothstep(-0.25, -0.6, base_y) * smoothstep(0.05, 0.2, base_z)
                        dy = -0.2 * S * f
                        dz = -0.04 * S * f

                elif bs_name == "jawForward":
                    if base_y < -0.2 and base_z > 0.2:
                        f = smoothstep(-0.2, -0.5, base_y) * smoothstep(0.2, 0.4, base_z)
                        dz = 0.08 * S * f

                elif bs_name == "mouthSmileLeft":
                    if base_y < -0.15 and base_y > -0.55 and base_x < -0.05 and base_z > 0.4:
                        f = (1 - abs(base_y + 0.35) / 0.2) * smoothstep(-0.05, -0.15, base_x) * smoothstep(0.4, 0.6, base_z)
                        f = max(0, f)
                        dx = -0.05 * S * f
                        dy = 0.06 * S * f

                elif bs_name == "mouthSmileRight":
                    if base_y < -0.15 and base_y > -0.55 and base_x > 0.05 and base_z > 0.4:
                        f = (1 - abs(base_y + 0.35) / 0.2) * smoothstep(0.05, 0.15, base_x) * smoothstep(0.4, 0.6, base_z)
                        f = max(0, f)
                        dx = 0.05 * S * f
                        dy = 0.06 * S * f

                elif bs_name == "mouthFrownLeft":
                    if base_y < -0.2 and base_y > -0.6 and base_x < -0.05 and base_z > 0.4:
                        f = (1 - abs(base_y + 0.4) / 0.2) * smoothstep(-0.05, -0.15, base_x) * smoothstep(0.4, 0.6, base_z)
                        f = max(0, f)
                        dx = -0.03 * S * f
                        dy = -0.06 * S * f

                elif bs_name == "mouthFrownRight":
                    if base_y < -0.2 and base_y > -0.6 and base_x > 0.05 and base_z > 0.4:
                        f = (1 - abs(base_y + 0.4) / 0.2) * smoothstep(0.05, 0.15, base_x) * smoothstep(0.4, 0.6, base_z)
                        f = max(0, f)
                        dx = 0.03 * S * f
                        dy = -0.06 * S * f

                elif bs_name == "mouthPucker":
                    if base_y < -0.2 and base_y > -0.5 and abs(base_x) < 0.2 and base_z > 0.5:
                        f = (1 - abs(base_y + 0.35) / 0.15) * (1 - abs(base_x) / 0.2) * smoothstep(0.5, 0.65, base_z)
                        f = max(0, f)
                        dx = -base_x * 0.25 * S * f
                        dz = 0.07 * S * f

                elif bs_name == "mouthFunnel":
                    if base_y < -0.2 and base_y > -0.5 and abs(base_x) < 0.18 and base_z > 0.5:
                        f = (1 - abs(base_y + 0.35) / 0.15) * (1 - abs(base_x) / 0.18) * smoothstep(0.5, 0.65, base_z)
                        f = max(0, f)
                        dx = -base_x * 0.18 * S * f
                        dy = (0.35 + base_y) * 0.12 * S * f
                        dz = 0.06 * S * f

                elif bs_name == "mouthOpen":
                    if base_y < -0.25 and base_y > -0.5 and abs(base_x) < 0.18 and base_z > 0.45:
                        f = (1 - abs(base_y + 0.38) / 0.13) * smoothstep(0.45, 0.6, base_z)
                        f = max(0, f)
                        dy = (-0.09 * S * f) if base_y < -0.35 else (0.04 * S * f)

                elif bs_name == "mouthClose":
                    if base_y < -0.25 and base_y > -0.45 and abs(base_x) < 0.18 and base_z > 0.5:
                        f = (1 - abs(base_y + 0.35) / 0.1) * smoothstep(0.5, 0.6, base_z)
                        f = max(0, f)
                        dy = (0.03 * S * f) if base_y < -0.35 else (-0.025 * S * f)
                        dz = 0.02 * S * f

                elif bs_name == "mouthLeft":
                    if base_y < -0.2 and base_y > -0.5 and abs(base_x) < 0.25 and base_z > 0.4:
                        f = (1 - abs(base_y + 0.35) / 0.15) * smoothstep(0.4, 0.55, base_z)
                        f = max(0, f)
                        dx = -0.07 * S * f

                elif bs_name == "mouthRight":
                    if base_y < -0.2 and base_y > -0.5 and abs(base_x) < 0.25 and base_z > 0.4:
                        f = (1 - abs(base_y + 0.35) / 0.15) * smoothstep(0.4, 0.55, base_z)
                        f = max(0, f)
                        dx = 0.07 * S * f

                elif bs_name == "noseSneerLeft":
                    if base_y > -0.12 and base_y < 0.08 and base_x < 0 and base_z > 0.55:
                        f = (1 - abs(base_y + 0.02) / 0.1) * smoothstep(0, -0.15, base_x) * smoothstep(0.55, 0.7, base_z)
                        f = max(0, f)
                        dy = 0.035 * S * f
                        dx = -0.02 * S * f

                elif bs_name == "noseSneerRight":
                    if base_y > -0.12 and base_y < 0.08 and base_x > 0 and base_z > 0.55:
                        f = (1 - abs(base_y + 0.02) / 0.1) * smoothstep(0, 0.15, base_x) * smoothstep(0.55, 0.7, base_z)
                        f = max(0, f)
                        dy = 0.035 * S * f
                        dx = 0.02 * S * f

                displacements[idx] = dx
                displacements[idx + 1] = dy
                displacements[idx + 2] = dz

        morph_targets.append(displacements)

    return build_glb(positions, normals, indices, morph_targets, blendshape_names, vertex_count)


def build_glb(positions, normals, indices, morph_targets, target_names, vertex_count):
    """构建GLB二进制文件"""

    buffer_data = bytearray()
    buffer_views = []
    accessors = []

    # Position数据
    pos_offset = len(buffer_data)
    for v in positions:
        buffer_data.extend(struct.pack('<f', v))
    pos_length = len(buffer_data) - pos_offset

    min_pos = [float('inf')] * 3
    max_pos = [float('-inf')] * 3
    for i in range(vertex_count):
        for j in range(3):
            v = positions[i * 3 + j]
            min_pos[j] = min(min_pos[j], v)
            max_pos[j] = max(max_pos[j], v)

    buffer_views.append({"buffer": 0, "byteOffset": pos_offset, "byteLength": pos_length, "target": 34962})
    accessors.append({"bufferView": 0, "componentType": 5126, "count": vertex_count, "type": "VEC3", "min": min_pos, "max": max_pos})

    # Normal数据
    norm_offset = len(buffer_data)
    for v in normals:
        buffer_data.extend(struct.pack('<f', v))
    norm_length = len(buffer_data) - norm_offset

    buffer_views.append({"buffer": 0, "byteOffset": norm_offset, "byteLength": norm_length, "target": 34962})
    accessors.append({"bufferView": 1, "componentType": 5126, "count": vertex_count, "type": "VEC3"})

    # Index数据（使用32位索引以支持高面数）
    while len(buffer_data) % 4 != 0:
        buffer_data.append(0)
    idx_offset = len(buffer_data)

    use_32bit = vertex_count > 65535
    for v in indices:
        if use_32bit:
            buffer_data.extend(struct.pack('<I', v))
        else:
            buffer_data.extend(struct.pack('<H', v))
    idx_length = len(buffer_data) - idx_offset
    while len(buffer_data) % 4 != 0:
        buffer_data.append(0)

    buffer_views.append({"buffer": 0, "byteOffset": idx_offset, "byteLength": idx_length, "target": 34963})
    idx_component_type = 5125 if use_32bit else 5123
    accessors.append({"bufferView": 2, "componentType": idx_component_type, "count": len(indices), "type": "SCALAR"})

    # Morph target数据
    targets = []
    for mt_idx, mt_data in enumerate(morph_targets):
        mt_offset = len(buffer_data)
        for v in mt_data:
            buffer_data.extend(struct.pack('<f', v))
        mt_length = len(buffer_data) - mt_offset

        bv_idx = len(buffer_views)
        buffer_views.append({"buffer": 0, "byteOffset": mt_offset, "byteLength": mt_length, "target": 34962})

        mt_min = [float('inf')] * 3
        mt_max = [float('-inf')] * 3
        for i in range(vertex_count):
            for j in range(3):
                v = mt_data[i * 3 + j]
                mt_min[j] = min(mt_min[j], v)
                mt_max[j] = max(mt_max[j], v)

        acc_idx = len(accessors)
        accessors.append({"bufferView": bv_idx, "componentType": 5126, "count": vertex_count, "type": "VEC3", "min": mt_min, "max": mt_max})
        targets.append({"POSITION": acc_idx})

    # 构建JSON
    gltf_json = {
        "asset": {"version": "2.0", "generator": "voice-emotion-head-generator-v2"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "Head"}],
        "meshes": [{
            "name": "HeadMesh",
            "primitives": [{
                "attributes": {"POSITION": 0, "NORMAL": 1},
                "indices": 2,
                "targets": targets,
                "material": 0
            }],
            "extras": {"targetNames": target_names}
        }],
        "materials": [{
            "name": "SkinMaterial",
            "pbrMetallicRoughness": {
                "baseColorFactor": [0.88, 0.72, 0.62, 1.0],
                "metallicFactor": 0.0,
                "roughnessFactor": 0.6
            },
            "doubleSided": False
        }],
        "bufferViews": buffer_views,
        "accessors": accessors,
        "buffers": [{"byteLength": len(buffer_data)}]
    }

    json_str = json.dumps(gltf_json, separators=(',', ':'))
    json_bytes = json_str.encode('utf-8')
    while len(json_bytes) % 4 != 0:
        json_bytes += b' '

    while len(buffer_data) % 4 != 0:
        buffer_data.append(0)

    total_length = 12 + 8 + len(json_bytes) + 8 + len(buffer_data)

    glb = bytearray()
    glb.extend(struct.pack('<III', 0x46546C67, 2, total_length))
    glb.extend(struct.pack('<II', len(json_bytes), 0x4E4F534A))
    glb.extend(json_bytes)
    glb.extend(struct.pack('<II', len(buffer_data), 0x004E4942))
    glb.extend(buffer_data)

    return bytes(glb)


if __name__ == '__main__':
    output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models')
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, 'head.glb')

    print("正在生成高精度头部模型（含五官特征 + 28个ARKit blendshapes）...")
    print("Generating high-precision head model (with facial features + 28 ARKit blendshapes)...")

    glb_data = generate_head_model()

    with open(output_path, 'wb') as f:
        f.write(glb_data)

    size_kb = len(glb_data) / 1024
    print(f"模型已保存到: {output_path}")
    print(f"Model saved to: {output_path}")
    print(f"文件大小 / File size: {size_kb:.1f} KB")
    print(f"网格精度: 80×60 (4880顶点)")
    print(f"包含混合形状 / Blendshapes: 28")
    print(f"五官特征: 眼窝/鼻梁/鼻翼/嘴唇/眉弓/颧骨/耳朵/下巴/人中")
    print()
    print("提示：也可以使用外部高精度模型替换此文件。")
    print("Tip: You can replace this file with an external high-quality model.")
