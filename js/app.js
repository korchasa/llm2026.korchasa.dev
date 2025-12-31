import { WORKER_CODE } from './llm-worker.js?v=20251231';
import { LANGUAGES, DEFAULT_LANG } from './languages.js?v=20251231';

// const MODEL_CONFIG = {
//     id: "smollm2-135m",
//     name: "SmolLM2 135M",
//     model: "onnx-community/SmolLM2-135M-Instruct-ONNX-MHA",
//     hardware: "webgpu",
//     dtype: "q4",
//     params: {
//         temperature: 0.5,
//         max_new_tokens: 2048,
//         repetition_penalty: 1.2,
//         top_p: 0.9,
//     }
// };

const MODEL_CONFIG = {
    id: "qwen3-0.6b",
    name: "Qwen3 0.6B",
    model: "onnx-community/Qwen3-0.6B-ONNX",
    hardware: "webgpu",
    dtype: "q4f16",
    params: {
      temperature: 0.4,
      max_new_tokens: 2048,
      repetition_penalty: 1.15,
      top_p: 0.9,
    }
  };

class SnowfallBackground {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.initParticles();
        this.animate();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    initParticles() {
        this.particles = [];
        // Density based on screen size
        const count = Math.min(200, (this.canvas.width * this.canvas.height) / 8000);
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                vx: (Math.random() - 0.5) * 0.5, // Wind
                vy: Math.random() * 1.5 + 0.5,   // Fall speed
                size: Math.random() * 2 + 1,
                alpha: Math.random() * 0.5 + 0.2
            });
        }
    }

    animate() {
        const frameStart = performance.now();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const globalGlitch = Math.random() < 0.002;

        this.particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;

            // Simple wind variation
            p.x += Math.sin(p.y * 0.01) * 0.2;

            // Wrap around
            if (p.y > this.canvas.height) {
                p.y = -5;
                p.x = Math.random() * this.canvas.width;
            }
            if (p.x > this.canvas.width) p.x = 0;
            if (p.x < 0) p.x = this.canvas.width;

            // --- GLITCH EFFECTS ---
            let drawX = p.x;
            let drawY = p.y;
            let drawSize = p.size;
            let drawAlpha = p.alpha;
            let shape = 'circle';
            let color = '255, 255, 255'; // Default white

            const glitchChance = globalGlitch ? 0.3 : 0.01;

            // 1. Position Jitter (Teleport)
            if (Math.random() < glitchChance) {
                drawX += (Math.random() - 0.5) * (globalGlitch ? 300 : 100);
                drawY += (Math.random() - 0.5) * (globalGlitch ? 100 : 40);
            }

            // 2. Shape Artifact (Square, Line, or Stretch)
            const shapeRand = Math.random();
            if (shapeRand < (globalGlitch ? 0.15 : 0.03)) {
                if (shapeRand < 0.01) shape = 'square';
                else if (shapeRand < 0.02) shape = 'line';
                else shape = 'stretch';
            }

            // 3. Alpha Flicker
            if (Math.random() < (globalGlitch ? 0.5 : 0.1)) {
                drawAlpha = Math.random();
            }

            // 4. Color Glitch (Cyan/Magenta)
            if (Math.random() < (globalGlitch ? 0.2 : 0.02)) {
                color = Math.random() > 0.5 ? '0, 255, 255' : '255, 0, 255';
            }

            this.ctx.fillStyle = `rgba(${color}, ${drawAlpha})`;

            // 5. Chromatic Aberration (Double drawing with offset)
            if (Math.random() < (globalGlitch ? 0.1 : 0.01)) {
                this.ctx.fillStyle = `rgba(0, 255, 255, ${drawAlpha * 0.5})`;
                this.ctx.fillRect(drawX - 2, drawY, drawSize, drawSize);
                this.ctx.fillStyle = `rgba(255, 0, 255, ${drawAlpha * 0.5})`;
                this.ctx.fillRect(drawX + 2, drawY, drawSize, drawSize);
                this.ctx.fillStyle = `rgba(${color}, ${drawAlpha})`;
            }

            this.ctx.beginPath();
            if (shape === 'square') {
                this.ctx.fillRect(drawX, drawY, drawSize * 3, drawSize * 3);
            } else if (shape === 'line') {
                this.ctx.fillRect(drawX - 20, drawY, 40, 1);
            } else if (shape === 'stretch') {
                this.ctx.fillRect(drawX - drawSize * 2, drawY, drawSize * 4, 1);
            } else {
                this.ctx.arc(drawX, drawY, drawSize, 0, Math.PI * 2);
                this.ctx.fill();
            }
        });

        const frameDuration = performance.now() - frameStart;
        if (window.performanceMonitor) {
            window.performanceMonitor.recordSnow(
                frameDuration,
                (this.canvas.width * this.canvas.height * 4) / (1024 * 1024)
            );
        }

        requestAnimationFrame(() => this.animate());
    }
}

// --- LOGIC: LLM Engine ---
class LLMEngine {
    constructor() {
        this.worker = null;

        // Settings: Simplified, no localStorage for style
        this.settings = {
            langMode: "auto"
        };

        // Resolve spec
        this.resolveSpec();

        this.history = [];
        this.isGenerating = false;
        this.isReady = false;

        // Auto-detect language
        this.detectLang();

        // Callbacks
        this.onStatus = (msg) => console.log(msg);
        this.onProgress = () => {};
        this.onToken = () => {};
        this.onComplete = () => {};
        this.onStart = () => {};
        this.onError = () => {};

        // Filtering state
        this.isThinking = false;
        this.currentBuffer = "";
    }

    async checkCompatibility() {
        const errors = [];

        // 1. Check for WebGPU and WASM fallback
        const hasWebGPU = !!navigator.gpu;
        const hasWasm = typeof WebAssembly !== 'undefined';

        if (!hasWebGPU && !hasWasm) {
            errors.push("Your browser does not support WebGPU or WebAssembly, which are required to run neural models locally.");
        }

        // 2. Check for SharedArrayBuffer (often disabled without proper headers, but Transformers.js might need it for some features)
        // Many browsers require cross-origin isolation for SAB.
        if (typeof SharedArrayBuffer === 'undefined') {
            console.warn("SharedArrayBuffer is not available. Performance may be degraded.");
        }

        // 3. Check Memory (navigator.deviceMemory)
        // Note: navigator.deviceMemory is only available in some browsers (Chrome/Edge/Opera)
        // and usually requires HTTPS.
        if (navigator.deviceMemory && navigator.deviceMemory < 4) {
            errors.push(`Your device has only ${navigator.deviceMemory}GB of RAM. At least 4GB is recommended for smooth operation of the model.`);
        }

        return {
            compatible: errors.length === 0,
            errors: errors
        };
    }

    resolveSpec() {
        this.config = {
            model: MODEL_CONFIG.model,
            device: MODEL_CONFIG.hardware === 'webgpu' && navigator.gpu ? 'webgpu' : 'wasm',
            dtype: MODEL_CONFIG.dtype
        };
        console.log("Model Config:", MODEL_CONFIG);
    }

    detectLang() {
        const storedLang = localStorage.getItem('app-lang');
        const browserLang = navigator.language || navigator.userLanguage || DEFAULT_LANG;
        const code = (storedLang || browserLang.split('-')[0]).toLowerCase();
        this.langCode = LANGUAGES[code] ? code : DEFAULT_LANG;
        this.langName = LANGUAGES[this.langCode].name;
        console.log("Internal prompt language:", this.langName);
    }

    init() {
        if (this.worker) return;

        try {
            const blob = new Blob([WORKER_CODE], { type: "text/javascript" });
            const url = URL.createObjectURL(blob);
            this.worker = new Worker(url, { type: "module" });

            this.worker.onmessage = (ev) => this.handleMessage(ev);
            this.worker.onerror = (err) => {
                console.error("Worker Thread Error:", err);
                this.onError("Worker Thread Error: " + err.message);
            };

            // Start loading
            this.worker.postMessage({
                type: "load",
                model: this.config.model,
                device: this.config.device,
                dtype: this.config.dtype
            });
        } catch (e) {
            console.error("LLMEngine Init Error:", e);
            this.onError("Initialization failed: " + e.message);
        }
    }

    handleMessage(ev) {
        const msg = ev.data;
        if (!msg) return;

        switch (msg.type) {
            case "status":
                if (msg.state === 'loading') {
                     this.isReady = false;
                     this.onStatus(this.slopify(msg.message));
                } else if (msg.state === 'ready') {
                     this.isReady = true;
                     this.onStatus(this.slopify("Neural core active"), true); // true means it's the 'ready' signal
                }
                break;
            case "progress": {
                const info = msg.info;
                const total = info.total ?? 0;
                const loaded = info.loaded ?? 0;
                if (total > 0) this.onProgress((loaded / total) * 100);
                break;
            }
            case "token":
                // Internal accumulation for buffering
                if (msg.text.includes('<think>')) {
                    this.isThinking = true;
                    return;
                }
                if (msg.text.includes('</think>')) {
                    this.isThinking = false;
                    const parts = msg.text.split('</think>');
                    if (parts[1]) this.currentBuffer += parts[1];
                    return;
                }
                if (this.isThinking) return;

                if (this.currentBuffer === "" && msg.text.trim() !== "") {
                    console.log(`[LLM] First token received for ${msg.requestId}`);
                }

                this.currentBuffer += msg.text;
                this.onToken(msg.text);

                if (msg.busyTime && window.performanceMonitor) {
                    window.performanceMonitor.recordLLM(msg.busyTime);
                }
                break;
            case "done": {
                if (this.generationTimeout) clearTimeout(this.generationTimeout);
                this.isGenerating = false;
                const cleanText = this.normalizeText(this.currentBuffer || msg.text);

                console.group(`[LLM Response] ${msg.requestId}`);
                console.log("Raw Response:", this.currentBuffer || msg.text);
                console.log("Cleaned Text:", cleanText);
                console.groupEnd();

                this.currentBuffer = ""; // Reset
                this.history.push(cleanText);
                if (this.history.length > 5) this.history.shift();
                this.onComplete(cleanText);

                if (msg.totalBusyTime && window.performanceMonitor) {
                    // We don't want to double count, but totalBusyTime is for the whole gen.
                    // Actually, tokens already reported their segment busy times.
                    // This is only for the final wrapping.
                }
                break;
            }
            case "stats":
                if (msg.busyTime && window.performanceMonitor) {
                    window.performanceMonitor.recordLLM(msg.busyTime);
                }
                break;
            case "error":
                if (this.generationTimeout) clearTimeout(this.generationTimeout);
                console.error("LLMEngine Message Error:", msg);
                this.isGenerating = false;
                this.onError(msg.message);
                break;
        }
    }

    normalizeText(s) {
        return (s || "")
            .replace(/<think>[\s\S]*?<\/think>/g, "") // Strip think tags and content
            .replace(/\r/g, "")
            .replace(/[ \t]+\n/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
    }

    slopify(text) {
        if (!text) return "";
        const words = text.split(/\s+/);

        const mutations = [
            (w) => w.replace(/m/gi, 'rn'),
            (w) => w.replace(/w/gi, 'vv'),
            (w) => w.replace(/n/gi, 'nn'),
            (w) => w.replace(/l/gi, 'ii'),
            (w) => w.length > 3 ? w.substring(0, 2) + w[2] + w.substring(2) : w + (w[w.length-1] || ""),
            (w) => {
                if (w.length < 4) return w + (w[w.length-1] || "");
                const i = Math.floor(Math.random() * (w.length - 2)) + 1;
                return w.substring(0, i) + w[i+1] + w[i] + w.substring(i+2);
            }
        ];

        return words.map(word => {
            // ~33% chance to slopify each word
            if (Math.random() < 0.33) {
                const mut = mutations[Math.floor(Math.random() * mutations.length)];
                return mut(word);
            }
            return word;
        }).join(' ');
    }

    generateGreeting() {
        if (!this.isReady) {
            console.warn("[LLM] Engine not ready, skipping generation");
            return;
        }
        if (this.isGenerating) {
            console.warn("[LLM] Already generating, skipping overlapping request");
            return;
        }

        this.isGenerating = true;

        const promptData = this.buildPrompt();
        const request = {
            type: "generate",
            requestId: Date.now(),
            messages: promptData.messages,
            prompt: promptData.fallbackPrompt,
            options: {
                max_new_tokens: MODEL_CONFIG.params.max_new_tokens,
                temperature: MODEL_CONFIG.params.temperature,
                top_p: MODEL_CONFIG.params.top_p,
                do_sample: true,
                repetition_penalty: MODEL_CONFIG.params.repetition_penalty
            }
        };

        console.group(`[LLM Request] ${request.requestId}`);
        console.log("System Prompt:", promptData.messages.find(m => m.role === 'system')?.content);
        console.log("User Prompt:", promptData.messages.find(m => m.role === 'user')?.content);
        console.log("Full Request Object:", request);
        console.groupEnd();

        this.onStart();
        this.worker.postMessage(request);

        // Watchdog timeout: if we don't get 'done' or 'error' in 120s, something is wrong
        if (this.generationTimeout) clearTimeout(this.generationTimeout);
        this.generationTimeout = setTimeout(() => {
            if (this.isGenerating) {
                console.error(`[LLM] Generation timeout for ${request.requestId}. Resetting state.`);
                this.isGenerating = false;
                this.onError("Generation timed out");
            }
        }, 120000); // 2 minutes should be plenty even for slow devices
    }

    buildPrompt() {
        const year = new Date().getMonth() === 11 ? new Date().getFullYear() + 1 : new Date().getFullYear();
        const code = this.langCode;
        const langConfig = LANGUAGES[code];
        const defaultConfig = LANGUAGES[DEFAULT_LANG];

        // Random Style Selection
        const styles = ["warm", "poetic", "inspirational", "tech-positive", "cozy", "funny"];
        const styleKey = styles[Math.floor(Math.random() * styles.length)];

        const systemPrompt = langConfig.system || defaultConfig.system;
        const styleDesc = (langConfig.styles ? langConfig.styles[styleKey] : null) ||
                          (defaultConfig.styles[styleKey]) ||
                          (langConfig.styles ? langConfig.styles.warm : defaultConfig.styles.warm);

        const userPrompt = langConfig.userTemplate ?
            langConfig.userTemplate(year, styleDesc) :
            defaultConfig.userTemplate(year, styleDesc).replace(/English/g, langConfig.name);

        return {
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            fallbackPrompt: systemPrompt + "\n\n" + userPrompt
        };
    }
}

// --- CONTROLLER: Main App Logic ---
const ui = {
    intro: document.getElementById('intro-screen'),
    greetingDisplay: document.getElementById('greeting-display'),
    greetingContent: document.getElementById('greeting-content'),
    statusText: document.getElementById('status-text'),
    progress: document.getElementById('progress-track'),
    progressFill: document.querySelector('.progress-fill'),
    pauseOverlay: document.getElementById('pause-overlay'),
    langSelect: document.getElementById('lang-select'),
    thinkingIndicator: document.getElementById('thinking-indicator'),
    startBtn: document.getElementById('start-btn'),
    spinner: document.querySelector('.spinner'),
    errorMessage: document.getElementById('error-message'),
    monitor: {
        llmMem: document.getElementById('llm-mem'),
        llmCount: document.getElementById('llm-count'),
        snowMem: document.getElementById('snow-mem'),
        snowCount: document.getElementById('snow-count')
    }
};

class PerformanceMonitor {
    constructor() {
        this.llmBusyTime = 0;
        this.snowBusyTime = 0;
        this.snowMem = 0;
        this.llmMem = this.estimateLLMMemory();

        this.history = []; // [{llm: ms, snow: ms, delta: ms}]
        this.maxHistory = 10; // 5 seconds at 500ms interval
        this.sampleCount = 0;
        this.lastSampleTime = performance.now();

        setInterval(() => this.sample(), 500);
    }

    estimateLLMMemory() {
        const id = MODEL_CONFIG.id || "";
        if (id.includes('qwen')) return 480;
        if (id.includes('smollm')) return 160;
        return 300;
    }

    recordLLM(ms) {
        this.llmBusyTime += ms;
    }

    recordSnow(ms, memMB) {
        this.snowBusyTime += ms;
        this.snowMem = memMB;
    }

    sample() {
        const now = performance.now();
        const delta = now - this.lastSampleTime;
        if (delta <= 0) return;

        this.history.push({
            llm: this.llmBusyTime,
            snow: this.snowBusyTime,
            delta: delta
        });

        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }

        // Reset current counters for next sample
        this.llmBusyTime = 0;
        this.snowBusyTime = 0;
        this.lastSampleTime = now;

        this.sampleCount++;
        if (this.sampleCount >= this.maxHistory) {
            this.updateUI();
            this.sampleCount = 0;
        }
    }

    updateUI() {
        if (this.history.length === 0) return;

        const totalLlm = this.history.reduce((a, b) => a + b.llm, 0);
        const totalSnow = this.history.reduce((a, b) => a + b.snow, 0);
        const totalDelta = this.history.reduce((a, b) => a + b.delta, 0);

        // Formula: (BusyTime / Delta) * 500 Pentium Pro CPUs
        const llmPPro = Math.round((totalLlm / totalDelta) * 500);
        const snowPPro = Math.round((totalSnow / totalDelta) * 500);

        ui.monitor.llmMem.textContent = `${this.llmMem} MB`;
        ui.monitor.llmCount.textContent = llmPPro.toLocaleString();
        ui.monitor.snowMem.textContent = `${this.snowMem.toFixed(1)} MB`;
        ui.monitor.snowCount.textContent = snowPPro.toLocaleString();
    }
}
window.performanceMonitor = new PerformanceMonitor();

// --- UTILS: Typing & Queue ---
class GreetingQueue {
    constructor() {
        this.queue = [];
        this.onNewItem = null;
    }
    push(item) {
        this.queue.push(item);
        if (this.onNewItem) this.onNewItem();
    }
    pop() {
        return this.queue.shift();
    }
    get length() {
        return this.queue.length;
    }
}

class Typewriter {
    static async type(text, container, checkPause) {
        // Appending text nodes is much cheaper than creating spans
        // We'll group text into chunks if possible, or just append characters to a text node

        // Single text node for standard typing?
        // Or per-word to allow easy wrapping?
        // Let's use spans for words, or just a single text node that we update.
        // Actually, updating a single text node's content repeatedly causes layout too.
        // Best approach for "typing" style without span spam:
        // Use a single container, append characters. But `container.textContent += char` is also heavy.

        // Revised approach:
        // Create <span> for words (good for wrapping), append chars to the current word <span>.
        // Throttle scrolling.

        let currentWordSpan = document.createElement('span');
        container.appendChild(currentWordSpan);

        let lastScrollTime = 0;

        for (let i = 0; i < text.length; i++) {
            // Check for pause
            while (checkPause()) {
                await new Promise(r => setTimeout(r, 100));
            }

            const char = text[i];

            if (char === ' ') {
                // New word
                currentWordSpan = document.createElement('span');
                // Ensure spaces are preserved
                // Actually, if we just put a space in the previous span or the new one...
                // Let's just append the space to the previous span, then make a new one.
                currentWordSpan.textContent = ' ';
                container.appendChild(currentWordSpan);
                // The new span will continue after the space
            } else if (char === '\n') {
                container.appendChild(document.createElement('br'));
                currentWordSpan = document.createElement('span');
                container.appendChild(currentWordSpan);
            } else {
                currentWordSpan.textContent += char;
            }

            // Auto-scroll removed for vertical center layout

            // Human-like delay
            let delay = 30 + Math.random() * 50;
            if ('.!?'.includes(char)) delay = 400 + Math.random() * 200;
            else if (',;:'.includes(char)) delay = 200 + Math.random() * 100;

            await new Promise(r => setTimeout(r, delay));
        }

        // Final scroll removed
    }
}

const engine = new LLMEngine();
const queue = new GreetingQueue();
let isTyping = false;
let isPaused = true; // Start paused to wait for user interaction

// Background Music
const bgMusic = new Audio('assets/song.mp3');
bgMusic.loop = true;
bgMusic.preload = 'auto';
bgMusic.volume = 0.4;

// Robust looping fallback
bgMusic.addEventListener('ended', function() {
    this.currentTime = 0;
    this.play().catch(e => console.error("Audio loop retry failed:", e));
}, false);

let hasStarted = false; // Track if user has pressed 'Start'

// Background
new SnowfallBackground('bg-canvas');

// Pause Logic
function togglePause() {
    isPaused = !isPaused;

    if (isPaused) {
        ui.pauseOverlay.classList.add('visible', 'paused');
        ui.pauseOverlay.classList.remove('hidden');
        bgMusic.pause();
    } else {
        ui.pauseOverlay.classList.remove('visible');
        ui.pauseOverlay.classList.remove('paused');
        setTimeout(() => {
            if (!isPaused) ui.pauseOverlay.classList.add('hidden');
        }, 300);
        bgMusic.play().catch(e => console.error("Audio play failed:", e));
    }
}

document.body.addEventListener('click', (e) => {
    // Prevent pause toggle if clicking on the language selector
    if (e.target.closest('#lang-select')) return;

    togglePause();
});

function initLangSelector() {
    // Populate options
    const langs = Object.keys(LANGUAGES);
    langs.forEach(code => {
        const opt = document.createElement('option');
        opt.value = code;
        opt.textContent = LANGUAGES[code].name;
        ui.langSelect.appendChild(opt);
    });

    // Set initial value
    ui.langSelect.value = engine.langCode;

    // Handle change
    ui.langSelect.addEventListener('change', (e) => {
        const newLang = e.target.value;
        if (LANGUAGES[newLang]) {
            localStorage.setItem('app-lang', newLang);
            location.reload();
        }
    });
}

// Auto-start sequence
function autoStart() {
    initLangSelector();

    // Initialize Start Button immediately
    if (ui.startBtn) {
        ui.startBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // Show loading UI
            ui.startBtn.classList.add('hidden');
            if (ui.spinner) ui.spinner.classList.remove('hidden');
            if (ui.statusText) ui.statusText.classList.remove('hidden');
            if (ui.progress) ui.progress.classList.add('visible');
            
            // Initialize engine on click
            engine.init();
        });
    }

    // Initial Compatibility Check
    engine.checkCompatibility().then(res => {
        if (!res.compatible) {
            ui.errorMessage.innerHTML = res.errors.join('<br><br>');
            ui.errorMessage.classList.remove('hidden');
            ui.statusText.classList.add('hidden');
            ui.progress.classList.add('hidden');
            ui.spinner.classList.add('hidden');
            if (ui.startBtn) {
                ui.startBtn.disabled = true;
                ui.startBtn.textContent = "Incompatible Device";
            }
            return;
        }

        engine.onStatus = (msg, isReadySignal = false) => {
            if (ui.statusText) {
                ui.statusText.textContent = msg;
            }

            if (isReadySignal) {
                if (ui.spinner) ui.spinner.classList.add('hidden');
                if (ui.intro) ui.intro.classList.add('hidden');
                
                // Automatically start the app when engine is ready
                startApp();
            }
        };
    });

    engine.onProgress = (pct) => {
        if (ui.progressFill) ui.progressFill.style.width = `${pct}%`;
    };

    engine.onToken = (text) => {
        // We now buffer tokens internally in LLMEngine
    };

    engine.onComplete = (text) => {
        ui.thinkingIndicator.classList.remove('visible');
        queue.push(text);
        processQueue();
    };

    engine.onStart = () => {
        ui.thinkingIndicator.classList.add('visible');
    };

    engine.onError = (err) => {
        console.error("LLM Error:", err);
        ui.thinkingIndicator.classList.remove('visible');
        // Retry if queue is empty
        if (queue.length === 0) {
            setTimeout(() => engine.generateGreeting(), 5000);
        }
    };
}

function startApp() {
    if (hasStarted) return;
    hasStarted = true;

    // Only hide the button as requested
    if (ui.startBtn) ui.startBtn.classList.add('hidden');

    if (isPaused) {
        togglePause();
    }

    // If model is already ready, start generating
    if (engine.isReady) {
        engine.generateGreeting();
    } else {
        console.log("App started but engine not ready. Waiting for 'Neural core active'...");
    }
}

async function processQueue() {
    if (isTyping || queue.length === 0) return;
    isTyping = true;

    const text = queue.pop();

    // Start generating NEXT message immediately as we start typing this one
    // This satisfies the "1 message in buffer" requirement.
    engine.generateGreeting();

    const block = createGreetingBlock();
    await Typewriter.type(text, block, () => isPaused);

    isTyping = false;
    pruneOldText();

    // Check if we can start the next one from buffer
    processQueue();
}

function createGreetingBlock() {
    const block = document.createElement('div');
    block.className = 'greeting-block';

    const textDiv = document.createElement('div');
    textDiv.className = 'greeting-text';
    block.appendChild(textDiv);

    ui.greetingContent.appendChild(block);
    return textDiv;
}

function pruneOldText() {
    // "Text outside window can be deleted"
    // We check the children of greetingContent
    const blocks = Array.from(ui.greetingContent.children);
    if (blocks.length < 3) return; // Keep at least a few

    // Basic pruning: if more than 10 blocks, remove the oldest
    // Better pruning: check position

    // Let's remove blocks that are completely above the viewport
    // Since we are auto-scrolling down, the top blocks go out of view.

    const reloadThreshold = -window.innerHeight * 2; // Extra buffer

    // We can just remove the first child if we have too many
    // For centered layout, keep only 1-2 blocks to maintain vertical center of the current text
    if (blocks.length > 2) {
        ui.greetingContent.removeChild(blocks[0]);
    }
}

// Initial Launch
autoStart();
