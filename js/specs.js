export const SPECS = [
  {
    id: "qwen3-0.6b",
    name: "Qwen3 0.6B",
    model: "onnx-community/Qwen3-0.6B-ONNX",
    hardware: "webgpu",
    dtype: "q4f16",
    params: {
      temperature: 0.7,
      max_new_tokens: 300,
      repetition_penalty: 1.15,
      top_p: 0.9,
    }
  }
];

export const DEFAULT_SPEC_ID = "qwen3-0.6b";
