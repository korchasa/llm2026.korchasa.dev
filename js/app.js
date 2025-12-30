import { WORKER_CODE } from './llm-worker.js';
import { LANGUAGES, DEFAULT_LANG } from './languages.js';
import { SPECS, DEFAULT_SPEC_ID } from './specs.js';

// --- VISUALS: Neural Winter Background ---
class NeuralBackground {
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
        const count = Math.min(150, (this.canvas.width * this.canvas.height) / 12000);
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                vx: (Math.random() - 0.5) * 0.4,
                vy: (Math.random() - 0.5) * 0.4 + 0.1, // Slight downward drift
                size: Math.random() * 2 + 0.5,
                alpha: Math.random() * 0.6 + 0.1,
                pulse: Math.random() * Math.PI
            });
        }
    }

    animate() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw Particles
        this.particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.pulse += 0.03;

            // Wrap around
            if (p.y > this.canvas.height) p.y = 0;
            if (p.x > this.canvas.width) p.x = 0;
            if (p.x < 0) p.x = this.canvas.width;
            if (p.y < 0) p.y = this.canvas.height;

            const alpha = p.alpha + Math.sin(p.pulse) * 0.15;
            this.ctx.fillStyle = `rgba(0, 243, 255, ${Math.max(0, Math.min(1, alpha))})`;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();
        });

        // Draw Connections
        this.ctx.strokeStyle = 'rgba(165, 180, 252, 0.08)';
        this.ctx.lineWidth = 0.5;
        for (let i = 0; i < this.particles.length; i++) {
            for (let j = i + 1; j < this.particles.length; j++) {
                const dx = this.particles[i].x - this.particles[j].x;
                const dy = this.particles[i].y - this.particles[j].y;
                const dist = Math.sqrt(dx*dx + dy*dy);

                if (dist < 120) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(this.particles[i].x, this.particles[i].y);
                    this.ctx.lineTo(this.particles[j].x, this.particles[j].y);
                    this.ctx.stroke();
                }
            }
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
        this.onError = () => {};

        // Filtering state
        this.isThinking = false;
    }

    resolveSpec() {
        this.currentSpec = SPECS[0];

        this.config = {
            model: this.currentSpec.model,
            device: this.currentSpec.hardware === 'webgpu' && navigator.gpu ? 'webgpu' : 'wasm',
            dtype: this.currentSpec.dtype
        };
        console.log("Resolved Spec:", this.currentSpec);
    }

    detectLang() {
        const browserLang = navigator.language || navigator.userLanguage || DEFAULT_LANG;
        const code = browserLang.split('-')[0].toLowerCase();
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
                this.onToken(msg.text);
                break;
            case "done": {
                this.isGenerating = false;
                const cleanText = this.normalizeText(msg.text);
                this.history.push(cleanText);
                if (this.history.length > 5) this.history.shift();
                this.onComplete(cleanText);
                break;
            }
            case "error":
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
        if (!this.isReady || this.isGenerating) return;
        this.isGenerating = true;

        const promptData = this.buildPrompt();
        const specParams = this.currentSpec.params;

        const request = {
            type: "generate",
            requestId: Date.now(),
            messages: promptData.messages,
            prompt: promptData.fallbackPrompt,
            options: {
                max_new_tokens: specParams.max_new_tokens,
                temperature: specParams.temperature,
                top_p: specParams.top_p,
                do_sample: true,
                repetition_penalty: specParams.repetition_penalty
            }
        };

        // console.log("LLM Request:", request);
        this.worker.postMessage(request);
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
    loadingText: document.getElementById('loading-text')
};

const engine = new LLMEngine();
let loopTimer = null;
let isPaused = false;
let currentBlock = null;

// Background
new NeuralBackground('bg-canvas');

// Pause Logic
function togglePause() {
    isPaused = !isPaused;

    if (isPaused) {
        ui.pauseOverlay.classList.remove('hidden');
        ui.pauseOverlay.classList.add('visible');
        if (loopTimer) clearTimeout(loopTimer);
    } else {
        ui.pauseOverlay.classList.remove('visible');
        setTimeout(() => ui.pauseOverlay.classList.add('hidden'), 300);
        // Resume if not generating
        if (!engine.isGenerating) {
            nextCycle();
        }
    }
}

document.body.addEventListener('click', () => {
    // Prevent pause toggle if clicking within the visible greeting area?
    // User requested "click on any part of the browser".
    togglePause();
});

// Auto-start sequence
function autoStart() {
    ui.progress.classList.add('visible');

    engine.onStatus = (msg) => {
        if (!ui.greetingDisplay.classList.contains('active')) {
            if (ui.loadingText) ui.loadingText.textContent = msg;
            ui.statusText.textContent = msg;

            if (msg === "Neural core active") {
                // Done loading
                ui.intro.style.display = 'none'; // Hard hide to prevent interaction
                ui.greetingDisplay.classList.add('active'); // Helper class, though we removed it from CSS, helpful for logical state
                nextCycle();
            }
        }
    };

    engine.onProgress = (pct) => {
        ui.progressFill.style.width = `${pct}%`;
    };

    engine.onToken = (text) => {
        // Strip think tags
        if (text.includes('<think>')) {
            engine.isThinking = true;
            return;
        }
        if (text.includes('</think>')) {
            engine.isThinking = false;
            // potential trail content
            const parts = text.split('</think>');
            if(parts[1]) appendText(parts[1]);
            return;
        }
        if (engine.isThinking) return;

        appendText(text);
    };

    engine.onComplete = () => {
        // Prune old text after each generation
        pruneOldText();

        if (!isPaused) {
            loopTimer = setTimeout(nextCycle, 2000); // 2 seconds between greetings for flow
        }
    };

    engine.onError = (err) => {
        console.error("LLM Error:", err);
        // Retry
        setTimeout(nextCycle, 5000);
    };

    engine.init();
}

function appendText(text) {
    if (!currentBlock) return;

    const span = document.createElement('span');
    span.textContent = text;
    currentBlock.appendChild(span);

    // Auto-scroll logic
    // We want to scroll to the bottom of the page
    window.scrollTo(0, document.body.scrollHeight);
}

function nextCycle() {
    if (!engine.isReady || isPaused) return;

    // Create new block
    currentBlock = document.createElement('div');
    currentBlock.className = 'greeting-block';

    // Create text container
    const textDiv = document.createElement('div');
    textDiv.className = 'greeting-text';
    currentBlock.appendChild(textDiv);

    ui.greetingContent.appendChild(currentBlock);

    // Update reference to where we append text
    currentBlock = textDiv; // Dirty hack: reuse currentBlock to point to the inner div

    engine.generateGreeting();
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
