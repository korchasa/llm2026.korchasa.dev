# Project: "Infinite AI New Year" (Neural Winter)

## Overview
"Infinite AI New Year" is a mesmerizing, ambient web experience designed as a "digital fireplace." It generates and displays infinite, unique New Year greetings one by one, accompanied by a meditative "Neural Winter" background.

The project uses browser-based AI (WebGPU/WASM) to run Large Language Models (LLMs) locally, ensuring privacy and offline capability once loaded.

## Architecture
The application is built with vanilla HTML, CSS, and JavaScript using ES Modules. No build steps are required.

-   **Main Thread**: Handles UI, animations, and sound (if any).
-   **Worker Thread**: Dedicated to running the LLM via `transformers.js` to prevent UI lag during generation.
-   **Engine**: `LLMEngine` manages the communication with the worker, prompt building, and state management.
-   **Visuals**: `NeuralBackground` uses HTML5 Canvas to render a particle system connected by "neural wires."

## Key Components

### [app.js](file:///Users/korchasa/www/sandbox/llmhny/js/app.js)
The entry point. Orchestrates the `LLMEngine`, `NeuralBackground`, and UI updates. Contains the main application loop (`nextCycle`).

### [llm-worker.js](file:///Users/korchasa/www/sandbox/llmhny/js/llm-worker.js)
The Web Worker code (exported as a string to avoid CORS issues). Loads the model and runs the inference using `@huggingface/transformers`.

### [languages.js](file:///Users/korchasa/www/sandbox/llmhny/js/languages.js)
Contains system prompts and user templates for all supported languages.

### [index.html](file:///Users/korchasa/www/sandbox/llmhny/index.html)
The single-page entry point with a minimal UI ("Neuromorphic Dark Mode").

## Development Guidelines

### The "Vibe"
-   **Aesthetics**: Deep dark blues (#050510) and neon cyan accents.
-   **Typography**: Large, elegant serif for greetings; monospace for system status.
-   **Animation**: Everything should "breathe." Use slow transitions and avoid sudden jumps.

### Adding a New Language
1.  Open [languages.js](file:///Users/korchasa/www/sandbox/llmhny/js/languages.js).
2.  Add a new entry to the `LANGUAGES` object following the existing structure (name, system prompt, styles, user template).
3.  The UI will automatically populate the language in the Settings modal.

### Updating Models
1.  Open [app.js](file:///Users/korchasa/www/sandbox/llmhny/js/app.js).
2.  Modify the `MODEL_CONFIG` object.
3.  Ensure the `model` ID is compatible with [transformers.js](https://huggingface.co/docs/transformers.js).

> [!IMPORTANT]
> WebGPU requires a compatible browser (e.g., Chrome/Edge/Arc) and hardware. If WebGPU is unavailable, the engine will fallback to WASM (CPU), which is significantly slower.
