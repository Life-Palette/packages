<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { env, pipeline, RawImage, type DepthEstimationPipeline } from "@huggingface/transformers";
import LioraDepthMapViewer from "./LioraDepthMapViewer.vue";

const input = ref<HTMLInputElement | null>(null);
const MODEL_ID = "Xenova/dpt-hybrid-midas";
const LOCAL_MODEL_PATH = "/models/";
const imageUrl = ref("");
const depthUrl = ref("");
const status = ref("选择一张图片开始");
const error = ref("");
const progress = ref(0);
const isRunning = ref(false);
const isRendering = ref(false);
const canvas = ref<HTMLCanvasElement | null>(null);
const depthSize = ref({ width: 0, height: 0 });
const depthBlob = ref<Blob | null>(null);
const viewerRef = ref<{ play: () => void } | null>(null);
let estimator: DepthEstimationPipeline | null = null;
let animationFrame = 0;
let sourceUrl = "";

const openPicker = () => input.value?.click();
const depthSizeText = computed(() =>
  depthSize.value.width ? `${depthSize.value.width} × ${depthSize.value.height}` : "—",
);
const depthData = computed(() => {
  if (!depthBlob.value) return null;
  return {
    model: MODEL_ID,
    modelSource: `本地模型 ${LOCAL_MODEL_PATH}${MODEL_ID}/`,
    width: depthSize.value.width,
    height: depthSize.value.height,
    format: depthBlob.value.type || "image/png",
    bytes: depthBlob.value.size,
    pixels: depthSize.value.width * depthSize.value.height,
    channels: 4,
    storage: "Blob URL（浏览器内存）",
    uploadedToOss: false,
  };
});

function clearUrls() {
  if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value);
  if (depthUrl.value) URL.revokeObjectURL(depthUrl.value);
  sourceUrl = "";
  imageUrl.value = "";
  depthUrl.value = "";
  depthBlob.value = null;
  depthSize.value = { width: 0, height: 0 };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片读取失败"));
    image.src = url;
  });
}

async function getEstimator() {
  if (estimator) return estimator;
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = LOCAL_MODEL_PATH;
  env.useBrowserCache = true;
  status.value = "正在加载本地深度模型…";
  estimator = await pipeline("depth-estimation", MODEL_ID);
  return estimator;
}

async function handleFile(file?: File) {
  if (!file || !file.type.startsWith("image/") || isRunning.value) return;
  cancelAnimationFrame(animationFrame);
  clearUrls();
  error.value = "";
  progress.value = 5;
  isRunning.value = true;
  sourceUrl = URL.createObjectURL(file);
  imageUrl.value = sourceUrl;
  try {
    const image = await RawImage.fromBlob(file);
    const scale = 0.25;
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    await image.resize(width, height);
    image.rgb();
    progress.value = 20;
    status.value = "正在推理深度…（只在浏览器本地运行）";
    const depthEstimator = await getEstimator();
    const output = await depthEstimator(image);
    const depth = Array.isArray(output) ? output[0]?.depth : output.depth;
    if (!depth) throw new Error("模型没有返回深度图");
    const blob = await depth.toBlob("image/png") as Blob;
    depthBlob.value = blob;
    depthUrl.value = URL.createObjectURL(blob);
    depthSize.value = { width: depth.width, height: depth.height };
    progress.value = 70;
    status.value = "深度图已生成，正在播放过渡…";
    progress.value = 100;
    status.value = "完成：已使用 liora 深度渲染管线，未调用后端，也未上传 OSS";
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : "深度图生成失败";
    status.value = "生成失败";
  } finally {
    isRunning.value = false;
  }
}

async function rerender() {
  if (!imageUrl.value || !depthUrl.value || isRunning.value || isRendering.value) return;
  isRendering.value = true;
  status.value = "正在重新渲染过渡…";
  viewerRef.value?.play();
  await new Promise((resolve) => setTimeout(resolve, 1800));
  status.value = "重新渲染完成：已使用 liora 深度渲染管线";
  isRendering.value = false;
}

async function playReveal(source: string, depth: string) {
  const target = canvas.value;
  if (!target) return;
  const [image, depthImage] = await Promise.all([loadImage(source), loadImage(depth)]);
  const width = target.clientWidth || 640;
  const height = Math.round(width * image.naturalHeight / image.naturalWidth);
  const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  target.width = width * pixelRatio;
  target.height = height * pixelRatio;
  target.style.aspectRatio = `${image.naturalWidth} / ${image.naturalHeight}`;
  const gl = target.getContext("webgl", { alpha: false, antialias: true });
  if (!gl) throw new Error("当前浏览器不支持 WebGL");
  const vertexSource = `attribute vec2 position; varying vec2 uv; void main(){ uv=position*.5+.5; gl_Position=vec4(position,0.,1.); }`;
  const fragmentSource = `precision highp float;
    varying vec2 uv;
    uniform sampler2D imageTexture;
    uniform sampler2D depthTexture;
    uniform float progress;
    uniform vec2 texel;
    const float GOLDEN_ANGLE=2.39996323;
    const float TAU=6.28318530718;
    float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    float easeInOutPow(float value,float power){
      float t=clamp(value,0.,1.);
      return t<.5 ? .5*pow(2.*t,power) : 1.-.5*pow(2.*(1.-t),power);
    }
    vec2 vogelDisk(int index,int count){
      float radius=sqrt(float(index)+.5)/sqrt(float(count));
      float angle=float(index)*GOLDEN_ANGLE;
      return vec2(radius*cos(angle),radius*sin(angle));
    }
    vec3 vogelBlur(vec2 p,float radius){
      vec3 color=vec3(0.);
      float total=0.;
      float rotation=hash(gl_FragCoord.xy)*TAU;
      for(int i=0;i<32;i++){
        vec2 offset=vogelDisk(i,32)*radius;
        vec2 rotated=vec2(offset.x*cos(rotation)-offset.y*sin(rotation),offset.x*sin(rotation)+offset.y*cos(rotation));
        rotated.x/=max(texel.y/texel.x,1.);
        float weight=exp(-dot(rotated,rotated)/(radius*radius*.25));
        color+=texture2D(imageTexture,p+rotated).rgb*weight;
        total+=weight;
      }
      return color/max(total,.0001);
    }
    void main(){
      vec2 p=vec2(uv.x,1.-uv.y);
      // MiDaS emits inverse depth: larger values are nearer. liora reveals
      // near pixels first, then blends in the directional sweep.
      float nearness=texture2D(depthTexture,p).r;
      float depthOrder=easeInOutPow(1.-nearness,1.);
      float sweep=p.y;
      float order=clamp((sweep*.5+depthOrder*.2)/.7,0.,1.);
      // Same wide, soft reveal band used by liora's display pass.
      float middle=mix(-.2,1.55,clamp(progress,0.,1.));
      float fade=clamp((middle+.55-order)/(1.1),0.,1.);
      fade=fade*fade*(3.-2.*fade);
      float blurAmount=1.-fade;
      vec3 sharp=texture2D(imageTexture,p).rgb;
      // Match liora's zero-radius fast path. Without it the Vogel kernel
      // evaluates 0/0 on the last frame and turns the finished image black.
      vec3 blurred=blurAmount<.0001
        ? sharp
        : vogelBlur(p,.095*blurAmount)+texture2D(imageTexture,p+texel*vec2(2.,1.)).rgb*.06*blurAmount;
      float shade=mix(1.,.25,smoothstep(.7,1.,blurAmount));
      vec3 color=mix(blurred,sharp,fade)*shade;
      color+=((hash(gl_FragCoord.xy)-.5)*.05*blurAmount);
      gl_FragColor=vec4(clamp(color,0.,1.),1.);
    }`;
  const compile = (type: number, sourceCode: string) => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("WebGL shader 创建失败");
    gl.shaderSource(shader, sourceCode); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || "WebGL shader 编译失败");
    return shader;
  };
  const program = gl.createProgram();
  if (!program) throw new Error("WebGL program 创建失败");
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("WebGL program 链接失败");
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
  const createTexture = (sourceImage: HTMLImageElement) => {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceImage);
    return texture;
  };
  const imageTexture = createTexture(image);
  const depthTexture = createTexture(depthImage);
  gl.useProgram(program);
  const position = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  gl.uniform1i(gl.getUniformLocation(program, "imageTexture"), 0);
  gl.uniform1i(gl.getUniformLocation(program, "depthTexture"), 1);
  gl.uniform2f(gl.getUniformLocation(program, "texel"), 1 / image.naturalWidth, 1 / image.naturalHeight);
  const started = performance.now();
  const duration = 1800;
  const draw = (now: number) => {
    const progressValue = Math.min(1, (now - started) / duration);
    gl.viewport(0, 0, target.width, target.height);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, imageTexture);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, depthTexture);
    gl.uniform1f(gl.getUniformLocation(program, "progress"), progressValue);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (progressValue < 1) animationFrame = requestAnimationFrame(draw);
  };
  animationFrame = requestAnimationFrame(draw);
}

function onInput(event: Event) {
  handleFile((event.target as HTMLInputElement).files?.[0]);
  (event.target as HTMLInputElement).value = "";
}

onBeforeUnmount(() => {
  cancelAnimationFrame(animationFrame);
  clearUrls();
});
</script>

<template>
  <section class="depth-demo panel">
    <div class="depth-demo-head">
      <div>
        <p class="eyebrow">LOCAL EXPERIMENT</p>
        <h2 class="panel-title">深度图过渡 Demo</h2>
        <p class="panel-note">选择图片后，在浏览器本地生成深度图并按深度逐块显现。</p>
      </div>
      <div class="depth-actions">
        <button class="btn btn-primary" type="button" :disabled="isRunning || isRendering" @click="openPicker">
          {{ isRunning ? `${progress}%` : "选择图片" }}
        </button>
        <button class="btn btn-outline" type="button" :disabled="!depthUrl || isRunning || isRendering" @click="rerender">
          {{ isRendering ? "渲染中…" : "重新渲染" }}
        </button>
      </div>
      <input ref="input" type="file" accept="image/*" hidden @change="onInput" />
    </div>
    <div class="depth-stage">
      <LioraDepthMapViewer
        v-if="imageUrl"
        ref="viewerRef"
        :image-url="imageUrl"
        :depth-url="depthUrl"
        :image-width="depthSize.width"
        :image-height="depthSize.height"
        :depth-duration-seconds="1.8"
        :directional-delay="0.5"
        :depth-delay="0.2"
        :max-blur="80"
        auto-play
      />
      <div v-if="!imageUrl" class="depth-empty">等待选择图片</div>
    </div>
    <div v-if="depthUrl" class="depth-result">
      <div class="depth-map"><img :src="depthUrl" alt="生成的深度图" /></div>
      <dl class="kv">
        <div><dt>深度图尺寸</dt><dd>{{ depthSizeText }}</dd></div>
        <div><dt>格式</dt><dd>{{ depthBlob?.type || "image/png" }}</dd></div>
        <div><dt>文件大小</dt><dd>{{ depthBlob ? `${(depthBlob.size / 1024).toFixed(1)} KB` : "—" }}</dd></div>
        <div><dt>像素数量</dt><dd>{{ depthData?.pixels.toLocaleString() }}</dd></div>
        <div><dt>数据去向</dt><dd>未上传 OSS</dd></div>
      </dl>
    </div>
    <pre v-if="depthData" class="json depth-data">{{ JSON.stringify(depthData, null, 2) }}</pre>
    <div class="depth-status">{{ status }}</div>
    <p v-if="error" class="error">{{ error }}</p>
  </section>
</template>
