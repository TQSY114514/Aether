// One-click provider presets — the first-run fast path. Clicking a preset
// prefills the add-provider form (API url + format). Local presets (Ollama,
// LM Studio) need no key; cloud presets only need the user's API key pasted.
export const PROVIDER_PRESETS: { name: string; api_url: string; api_format: string; local?: boolean }[] = [
  { name: 'OpenRouter', api_url: 'https://openrouter.ai/api/v1', api_format: 'openai' },
  { name: 'OpenAI', api_url: 'https://api.openai.com/v1', api_format: 'openai' },
  { name: 'DeepSeek', api_url: 'https://api.deepseek.com', api_format: 'openai' },
  { name: 'Anthropic', api_url: 'https://api.anthropic.com', api_format: 'anthropic' },
  { name: 'SiliconFlow', api_url: 'https://api.siliconflow.cn/v1', api_format: 'openai' },
  { name: 'Ollama', api_url: 'http://127.0.0.1:11434/v1', api_format: 'openai', local: true },
  { name: 'LM Studio', api_url: 'http://127.0.0.1:1234/v1', api_format: 'openai', local: true },
]
