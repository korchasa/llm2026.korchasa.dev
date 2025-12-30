// Exporting the worker code as a string to be blobbed.
// This allows us to have a single "file" experience without CORS issues on file:// for module workers if we did import.

export const WORKER_CODE = `

import { env, AutoTokenizer, AutoModelForCausalLM, TextStreamer } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";

// Configure environment
env.allowLocalModels = false;
env.useBrowserCache = true;

let tokenizer = null;
let model = null;
let loaded = { model: null, device: null, dtype: null };

function post(type, payload = {}) { self.postMessage({ type, ...payload }); }

async function loadModel({ model: modelId, device, dtype }) {
  if (model && loaded.model === modelId && loaded.device === device && loaded.dtype === dtype) {
    post("status", { state: "ready", message: "Model already loaded" });
    return;
  }

  model = null;
  tokenizer = null;
  loaded = { model: modelId, device, dtype };

  post("status", { state: "loading", message: "Initializing neural core..." });

  const progress_callback = (info) => {
    post("progress", { info });
  };

  // transformers.js usually puts dtype in the options object for from_pretrained
  const opts = { device, progress_callback };
  if (dtype) opts.dtype = dtype;

  try {
    tokenizer = await AutoTokenizer.from_pretrained(modelId, { progress_callback });
    model = await AutoModelForCausalLM.from_pretrained(modelId, opts);

    post("status", { state: "ready", message: "Neural core active" });
  } catch (e) {
    console.error("Worker loadModel error:", e);
    post("error", { message: e.message });
  }
}

async function generate({ requestId, messages, prompt, options }) {
  if (!model || !tokenizer) throw new Error("Model not loaded");

  const streamer = new TextStreamer(tokenizer, {
    skip_prompt: true,
    callback_function: (text) => {
      post("token", { requestId, text });
    }
  });

  let text_start = "";
  if (messages) {
    text_start = tokenizer.apply_chat_template(messages, { tokenize: false, add_generation_prompt: true });
  } else {
    text_start = prompt;
  }

  try {
    const inputs = await tokenizer(text_start);

    const out = await model.generate({
      ...inputs,
      ...options,
      streamer
    });

    const decoded = tokenizer.batch_decode(out, { skip_special_tokens: true });
    let final = decoded[0];

    post("done", { requestId, text: final });

  } catch (e) {
    console.error("Worker generate error:", e);
    post("error", { requestId, message: e.message });
  }
}

self.onmessage = async (ev) => {
  const msg = ev.data || {};
  try {
    if (msg.type === "load") {
      await loadModel(msg);
    } else if (msg.type === "generate") {
      await generate(msg);
    }
  } catch (err) {
    console.error("Worker onmessage error:", err);
    post("error", { requestId: msg.requestId ?? null, message: err?.message ?? String(err) });
  }
};

`;

