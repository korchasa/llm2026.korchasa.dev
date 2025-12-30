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

        // Runtime Settings
        const savedSettings = localStorage.getItem('llmhny-settings');
        this.settings = savedSettings ? JSON.parse(savedSettings) : {
            langMode: "auto",
            style: "random"
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
        if (this.settings.langMode === "auto") {
            const browserLang = navigator.language || navigator.userLanguage || DEFAULT_LANG;
            const code = browserLang.split('-')[0].toLowerCase();
            this.langCode = LANGUAGES[code] ? code : DEFAULT_LANG;
        } else {
            const code = this.settings.langMode.toLowerCase();
            this.langCode = LANGUAGES[code] ? code : DEFAULT_LANG;
        }
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
                     // We don't trigger anything else, just waiting for user command or loop
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

        console.log("LLM Request:", request);
        this.worker.postMessage(request);
    }

    buildPrompt() {
        const year = new Date().getMonth() === 11 ? new Date().getFullYear() + 1 : new Date().getFullYear();
        const code = this.langCode;
        const langConfig = LANGUAGES[code];
        const defaultConfig = LANGUAGES[DEFAULT_LANG];

        // Style Selection
        const styles = ["warm", "poetic", "inspirational", "tech-positive", "cozy", "funny"];
        let styleKey = this.settings.style;
        if (styleKey === "random" || !styles.includes(styleKey)) {
             styleKey = styles[Math.floor(Math.random() * styles.length)];
        }

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
    intro: document.querySelector('.intro-screen'),
    greetingDisplay: document.querySelector('.greeting-display'),
    greetingText: document.querySelector('.greeting-text'),
    statusText: document.getElementById('status-text'),
    progress: document.querySelector('.progress-track'),
    progressFill: document.querySelector('.progress-fill'),
    nextBtn: document.getElementById('btn-next'),
    pauseBtn: document.getElementById('btn-pause'),
    settingsBtn: document.getElementById('btn-settings'),
    timestamp: document.getElementById('timestamp'),
    // Modal
    settingsModal: document.getElementById('settings-modal'),
    closeSettingsBtn: document.getElementById('btn-close-settings'),
    langSelect: document.getElementById('lang-select'),
    styleSelect: document.getElementById('style-select'),
    applyBtn: document.getElementById('btn-apply-settings'),
    resetBtn: document.getElementById('btn-reset-settings')
};

const engine = new LLMEngine();

// Populate Languages
const populateLanguages = () => {
    Object.keys(LANGUAGES).forEach(code => {
        const option = document.createElement('option');
        option.value = code;
        option.textContent = LANGUAGES[code].name;
        ui.langSelect.appendChild(option);
    });
};

populateLanguages();

let loopTimer = null;
let isPaused = false;

// Background
new NeuralBackground('bg-canvas');

// Settings Handlers
const syncUIFromSettings = () => {
    ui.langSelect.value = engine.settings.langMode;
    ui.styleSelect.value = engine.settings.style;
};

ui.settingsBtn.addEventListener('click', () => {
    syncUIFromSettings();
    ui.settingsModal.classList.remove('hidden');
});

ui.closeSettingsBtn.addEventListener('click', () => {
    ui.settingsModal.classList.add('hidden');
});

ui.settingsModal.addEventListener('click', (e) => {
    if (e.target === ui.settingsModal) ui.settingsModal.classList.add('hidden');
});

// Apply Settings
ui.applyBtn.addEventListener('click', () => {
    // Save to settings object
    engine.settings.langMode = ui.langSelect.value;
    engine.settings.style = ui.styleSelect.value;

    // Save to localStorage
    localStorage.setItem('llmhny-settings', JSON.stringify(engine.settings));

    engine.detectLang();
    ui.settingsModal.classList.add('hidden');
});

// Reset Settings
ui.resetBtn.addEventListener('click', () => {
    if (confirm("Reset all settings to defaults?")) {
        localStorage.removeItem('llmhny-settings');
        location.reload();
    }
});

// Settings: Model / DType (requires reload)
const reloadModel = () => {
    // Reset UI to intro/loading
    if (loopTimer) clearTimeout(loopTimer);
    ui.greetingDisplay.classList.remove('active');
    ui.intro.style.display = 'flex';
    ui.intro.classList.remove('hidden');

    // Destroy worker and re-init
    if (engine.worker) {
        engine.worker.terminate();
        engine.worker = null;
    }

    autoStart();
};

// Pause Logic
ui.pauseBtn.addEventListener('click', () => {
    isPaused = !isPaused;
    ui.pauseBtn.textContent = isPaused ? '▶' : '⏸';
    ui.statusText.textContent = isPaused ? "Paused" : "Resuming...";

    if (!isPaused && !engine.isGenerating) {
        nextCycle();
    } else if (isPaused && loopTimer) {
        clearTimeout(loopTimer);
    }
});

// Auto-start sequence
function autoStart() {
    // Show progress immediately
    ui.progress.classList.add('visible');

    // Bind Engine Callbacks
    engine.onStatus = (msg) => {
        // Only show status updates if we are in initial loading phase or it's important
        if (!ui.greetingDisplay.classList.contains('active')) {
            const loadingText = document.getElementById('loading-text');
            if (loadingText) loadingText.textContent = msg;
            ui.statusText.textContent = msg;

            if (msg === "Neural core active") {
                // Transition UI: Hide intro/loading, show display
                ui.intro.classList.add('hidden');
                setTimeout(() => {
                    ui.intro.style.display = 'none';
                    ui.greetingDisplay.classList.add('active');
                    nextCycle();
                }, 800);
            }
        }
    };

    engine.onProgress = (pct) => {
        ui.progressFill.style.width = `${pct}%`;
    };

    engine.onToken = (text) => {
        // Simple state-based filtering for <think> tags during streaming
        if (text.includes('<think>')) {
            engine.isThinking = true;
            // Handle case where <think> and text are in the same chunk
            const parts = text.split('<think>');
            if (parts[0]) {
                const span = document.createElement('span');
                span.textContent = parts[0];
                ui.greetingText.appendChild(span);
            }
            return;
        }

        if (text.includes('</think>')) {
            engine.isThinking = false;
            // Handle case where </think> and text are in the same chunk
            const parts = text.split('</think>');
            if (parts[1]) {
                const span = document.createElement('span');
                span.textContent = parts[1];
                ui.greetingText.appendChild(span);
            }
            return;
        }

        if (engine.isThinking) return;

        const span = document.createElement('span');
        span.textContent = text;
        ui.greetingText.appendChild(span);
        // Ensure visibility
        if (ui.greetingDisplay.style.opacity === '0') {
             ui.greetingDisplay.style.opacity = '1';
        }
    };

    engine.onComplete = () => {
        ui.statusText.textContent = isPaused ? "Paused" : "Waiting for next cycle...";
        ui.statusText.classList.remove('blinking-cursor');

        // Update timestamp
        const now = new Date();
        ui.timestamp.textContent = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

        // Loop
        if (!isPaused) {
            loopTimer = setTimeout(nextCycle, 10000); // 10 seconds reading time
        }
    };

    engine.onError = (err) => {
        console.error("LLM Engine Error Callback:", err);
        ui.statusText.textContent = "Error: " + err;
        ui.statusText.style.color = "var(--accent-error)";
        // If error, try to recover or just wait
        setTimeout(nextCycle, 5000);
    };

    // Start Engine
    engine.init();

    // Update model tag in UI
    const modelTag = document.getElementById('model-tag');
    if (modelTag) {
        modelTag.textContent = engine.currentSpec.name;
    }
}

function nextCycle() {
    if (!engine.isReady) return;
    // Fade out
    ui.greetingDisplay.style.opacity = 0;

    setTimeout(() => {
        ui.greetingText.innerHTML = ""; // Clear
        ui.greetingDisplay.style.opacity = 1;
        ui.statusText.textContent = "Generating...";
        ui.statusText.classList.add('blinking-cursor');

        engine.generateGreeting();
    }, 1000);
}

ui.nextBtn.addEventListener('click', () => {
    if (loopTimer) clearTimeout(loopTimer);
    nextCycle();
});

// Initial Status
ui.statusText.textContent = navigator.gpu ? "System Ready (WebGPU Detected)" : "System Ready (CPU Mode)";

// Sync UI once at start
syncUIFromSettings();

// Launch
autoStart();
