import { WORKER_CODE } from './llm-worker.js';
import { LANGUAGES, DEFAULT_LANG } from './languages.js';

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
    dtype: "q4",
    params: {
      temperature: 0.7,
      max_new_tokens: 4096,
      repetition_penalty: 1.15,
      top_p: 0.9,
    }
  };

// --- VISUALS: Snowfall Background ---
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
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

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

            // 1. Position Jitter (Teleport) - low chance
            if (Math.random() < 0.005) {
                drawX += (Math.random() - 0.5) * 50;
                drawY += (Math.random() - 0.5) * 20;
            }

            // 2. Shape Artifact (Square or Line) - low chance
            if (Math.random() < 0.01) {
                shape = Math.random() > 0.5 ? 'square' : 'line';
            }

            // 3. Alpha Flicker - medium chance
            if (Math.random() < 0.05) {
                drawAlpha = Math.random();
            }

            this.ctx.fillStyle = `rgba(255, 255, 255, ${drawAlpha})`;
            this.ctx.beginPath();

            if (shape === 'square') {
                this.ctx.fillRect(drawX, drawY, drawSize * 2, drawSize * 2);
            } else if (shape === 'line') {
                this.ctx.fillRect(drawX - 10, drawY, 20, 2);
            } else {
                this.ctx.arc(drawX, drawY, drawSize, 0, Math.PI * 2);
                this.ctx.fill();
            }
        });

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
        this.onError = () => {};

        // Filtering state
        this.isThinking = false;
        this.currentBuffer = "";
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
                     this.onStatus(msg.message);
                } else if (msg.state === 'ready') {
                     this.isReady = true;
                     this.onStatus("Neural core active");
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
                break;
            }
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

        // History avoidance
        const avoid = this.history.slice(-3).map(s => s.slice(0, 50)).join(" | ");

        const systemPrompt = langConfig.system || defaultConfig.system;
        const styleDesc = (langConfig.styles ? langConfig.styles[styleKey] : null) ||
                          (defaultConfig.styles[styleKey]) ||
                          (langConfig.styles ? langConfig.styles.warm : defaultConfig.styles.warm);

        const userPrompt = langConfig.userTemplate ?
            langConfig.userTemplate(year, styleDesc, avoid) :
            defaultConfig.userTemplate(year, styleDesc, avoid).replace(/English/g, langConfig.name);

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
    langSelect: document.getElementById('lang-select')
};

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
        for (let i = 0; i < text.length; i++) {
            // Check for pause
            while (checkPause()) {
                await new Promise(r => setTimeout(r, 100));
            }

            const char = text[i];
            const span = document.createElement('span');
            span.textContent = char;
            container.appendChild(span);

            // Auto-scroll
            window.scrollTo({
                top: document.body.scrollHeight,
                behavior: 'smooth'
            });

            // Human-like delay
            let delay = 30 + Math.random() * 50;
            if ('.!?'.includes(char)) delay = 400 + Math.random() * 200;
            else if (',;:'.includes(char)) delay = 200 + Math.random() * 100;

            await new Promise(r => setTimeout(r, delay));
        }
    }
}

const engine = new LLMEngine();
const queue = new GreetingQueue();
let isTyping = false;
let isPaused = false;

// Background
new SnowfallBackground('bg-canvas');

// Pause Logic
function togglePause() {
    isPaused = !isPaused;

    if (isPaused) {
        ui.pauseOverlay.classList.remove('hidden');
        ui.pauseOverlay.classList.add('visible');
    } else {
        ui.pauseOverlay.classList.remove('visible');
        setTimeout(() => ui.pauseOverlay.classList.add('hidden'), 300);
    }
}

document.body.addEventListener('click', () => {
    // Prevent pause toggle if clicking within the visible greeting area?
    // User requested "click on any part of the browser".
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
    ui.progress.classList.add('visible');

    engine.onStatus = (msg) => {
        if (!ui.greetingDisplay.classList.contains('active')) {
            ui.statusText.textContent = msg;

            if (msg === "Neural core active") {
                // Done loading
                ui.intro.style.display = 'none'; // Hard hide to prevent interaction
                ui.greetingDisplay.classList.add('active'); // Helper class, though we removed it from CSS, helpful for logical state
                engine.generateGreeting();
            }
        }
    };

    engine.onProgress = (pct) => {
        ui.progressFill.style.width = `${pct}%`;
    };

    engine.onToken = (text) => {
        // We now buffer tokens internally in LLMEngine
    };

    engine.onComplete = (text) => {
        queue.push(text);
        processQueue();
    };

    engine.onError = (err) => {
        console.error("LLM Error:", err);
        // Retry if queue is empty
        if (queue.length === 0) {
            setTimeout(() => engine.generateGreeting(), 5000);
        }
    };

    engine.init();
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
    if (blocks.length > 5) {
        ui.greetingContent.removeChild(blocks[0]);
    }
}

// Initial Launch
autoStart();
