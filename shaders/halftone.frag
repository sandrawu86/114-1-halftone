// Author: CMH
// Title: Learning Shaders

#ifdef GL_ES
precision mediump float;
#endif

uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform float u_time;
uniform float u_texAspect; // 原始圖片 (u_tex0) 長寬比 width/height
uniform sampler2D u_tex0;
uniform sampler2D u_tex1;
uniform sampler2D u_tex2;
uniform sampler2D u_tex3;
uniform sampler2D u_tex4;
uniform sampler2D u_tex5;
uniform sampler2D u_tex6;

// 旋轉座標
vec2 rotate2(vec2 p, float a){
    float c = cos(a), s = sin(a);
    return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

// canvasUV (0..1) -> image UV (0..1) (contain, centered)
vec2 canvasToImageUV(vec2 canvasUV, float canvasAspect, float imgAspect){
    vec2 imgUV;
    if (canvasAspect > imgAspect) {
        float wFrac = imgAspect / canvasAspect;
        vec2 offset = vec2((1.0 - wFrac) * 0.5, 0.0);
        imgUV = (canvasUV - offset) / vec2(wFrac, 1.0);
    } else {
        float hFrac = canvasAspect / imgAspect;
        vec2 offset = vec2(0.0, (1.0 - hFrac) * 0.5);
        imgUV = (canvasUV - offset) / vec2(1.0, hFrac);
    }
    return clamp(imgUV, 0.0, 1.0);
}

// RGB -> CMYK (robust)
vec4 rgb2cmyk(vec3 rgb){
    float r = clamp(rgb.r, 0.0, 1.0);
    float g = clamp(rgb.g, 0.0, 1.0);
    float b = clamp(rgb.b, 0.0, 1.0);
    float k = min(1.0 - r, min(1.0 - g, 1.0 - b));
    float denom = max(1.0 - k, 1e-6);
    float c = (1.0 - r - k) / denom;
    float m = (1.0 - g - k) / denom;
    float y = (1.0 - b - k) / denom;
    if (k >= 0.999) { c = 0.0; m = 0.0; y = 0.0; }
    return vec4(c, m, y, k);
}

// 計算某 channel 在給定格子上的 mask（不在 main 裡定義）
float channelMaskForAngle(
    vec2 p0, vec2 cell_uv, float aa_pixels,
    float canvasAspect, float imgAspect, vec2 center,
    float angle, float channelValue, out vec2 out_sampleUV)
{
    // rotate grid for this channel (square-space)
    vec2 p = rotate2(p0, angle);
    vec2 cell = floor(p / cell_uv);
    vec2 cellCenter = (cell + 0.5) * cell_uv;
    float dist = length(p - cellCenter);

    // map cellCenter back to canvas UV (unrotate and un-stretch)
    vec2 invRot = rotate2(cellCenter, -angle);
    invRot.x /= canvasAspect;
    vec2 canvasSampleUV = clamp(center + invRot, 0.0, 1.0);

    // image UV (preserve image aspect)
    out_sampleUV = canvasToImageUV(canvasSampleUV, canvasAspect, imgAspect);

    float maxR = cell_uv.x * 0.45;
    float radius = channelValue * maxR;
    float aa_uv = aa_pixels / u_resolution.y;
    float mask = 1.0 - smoothstep(radius - aa_uv, radius + aa_uv, dist);
    return clamp(mask, 0.0, 1.0);
}

void main()
{
    vec2 frag = gl_FragCoord.xy;
    vec2 uv = frag / u_resolution;

    // 參數
    float baseCell = 12.0;    // 720p 基準格子大小 (像素)
    float baseAA = 1.0;       // 抗鋸齒基準 (像素)
    vec3 paper = vec3(1.0);

    // 縮放
    float scale = u_resolution.y / 720.0;
    float cellSize = max(1.0, baseCell * scale);
    float aa = max(0.5, baseAA * scale);

    // 用滑鼠控制網點大小（垂直位置）
    vec2 mouseNorm = vec2(0.0);
    if (u_resolution.x > 0.0 && u_resolution.y > 0.0) {
        mouseNorm = clamp(u_mouse / u_resolution, 0.0, 1.0);
    }
    float mouseLen = length(u_mouse);
    if (mouseLen > 0.001) {
        float minF = 0.4;
        float maxF = 3.0;
        float mf = mix(minF, maxF, mouseNorm.y);
        cellSize *= mf;
    }

    // aspects
    float canvasAspect = u_resolution.x / u_resolution.y;
    float imgAspect = (u_texAspect > 0.0) ? u_texAspect : 1.0;

    // 將 uv 轉到 square-space (以高度為基準)
    vec2 center = vec2(0.5);
    vec2 p0 = uv - center;
    p0.x *= canvasAspect;

    // cell_uv (square-space)
    vec2 cell_uv = vec2(cellSize / u_resolution.y);

    // channel angles (degrees): C, M, Y, K
    float angleC = radians(15.0);
    float angleM = radians(75.0);
    float angleY = radians(0.0);
    float angleK = radians(45.0);

    // --- 為每個 channel 取樣 cell 中心以取得 channel value (CMYK) ---
    // Cyan sample
    vec2 sampleUVC;
    {
        vec2 pC = rotate2(p0, angleC);
        vec2 cellC = floor(pC / cell_uv);
        vec2 cellCenterC = (cellC + 0.5) * cell_uv;
        vec2 invC = rotate2(cellCenterC, -angleC); invC.x /= canvasAspect;
        vec2 canvasSampleC = clamp(center + invC, 0.0, 1.0);
        sampleUVC = canvasToImageUV(canvasSampleC, canvasAspect, imgAspect);
    }
    vec3 colC = texture2D(u_tex0, sampleUVC).rgb;
    float c = rgb2cmyk(colC).x;

    // Magenta sample
    vec2 sampleUVM;
    {
        vec2 pM = rotate2(p0, angleM);
        vec2 cellM = floor(pM / cell_uv);
        vec2 cellCenterM = (cellM + 0.5) * cell_uv;
        vec2 invM = rotate2(cellCenterM, -angleM); invM.x /= canvasAspect;
        vec2 canvasSampleM = clamp(center + invM, 0.0, 1.0);
        sampleUVM = canvasToImageUV(canvasSampleM, canvasAspect, imgAspect);
    }
    vec3 colM = texture2D(u_tex0, sampleUVM).rgb;
    float m = rgb2cmyk(colM).y;

    // Yellow sample
    vec2 sampleUVY;
    {
        vec2 pY = rotate2(p0, angleY);
        vec2 cellY = floor(pY / cell_uv);
        vec2 cellCenterY = (cellY + 0.5) * cell_uv;
        vec2 invY = rotate2(cellCenterY, -angleY); invY.x /= canvasAspect;
        vec2 canvasSampleY = clamp(center + invY, 0.0, 1.0);
        sampleUVY = canvasToImageUV(canvasSampleY, canvasAspect, imgAspect);
    }
    vec3 colY = texture2D(u_tex0, sampleUVY).rgb;
    float y = rgb2cmyk(colY).z;

    // Black sample
    vec2 sampleUVK;
    {
        vec2 pK = rotate2(p0, angleK);
        vec2 cellK = floor(pK / cell_uv);
        vec2 cellCenterK = (cellK + 0.5) * cell_uv;
        vec2 invK = rotate2(cellCenterK, -angleK); invK.x /= canvasAspect;
        vec2 canvasSampleK = clamp(center + invK, 0.0, 1.0);
        sampleUVK = canvasToImageUV(canvasSampleK, canvasAspect, imgAspect);
    }
    vec3 colK = texture2D(u_tex0, sampleUVK).rgb;
    float k = rgb2cmyk(colK).w;

    // --- 計算當前片元在每個 channel 的 mask ---
    vec2 dummy;
    float maskC = channelMaskForAngle(p0, cell_uv, aa, canvasAspect, imgAspect, center, angleC, c, dummy);
    float maskM = channelMaskForAngle(p0, cell_uv, aa, canvasAspect, imgAspect, center, angleM, m, dummy);
    float maskY = channelMaskForAngle(p0, cell_uv, aa, canvasAspect, imgAspect, center, angleY, y, dummy);
    float maskK = channelMaskForAngle(p0, cell_uv, aa, canvasAspect, imgAspect, center, angleK, k, dummy);

    // CMYK -> RGB (subtractive mixing)
    float R = (1.0 - maskC) * (1.0 - maskK);
    float G = (1.0 - maskM) * (1.0 - maskK);
    float B = (1.0 - maskY) * (1.0 - maskK);
    vec3 outCol = vec3(R, G, B);

    gl_FragColor = vec4(outCol, 1.0);
}
