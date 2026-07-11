import { useState, useRef, useEffect } from 'react'
import { useStore } from '@/store'
import { cn } from '@/lib/utils'
import { Send, Square, Paperclip, X, FileText, Brain, Cpu } from 'lucide-react'

type PendingAttachment = { name: string; mime: string; kind: 'text' | 'image'; dataUrl: string }
// A long pasted block collapsed into a chip (ChatGPT-style). Kept separate from
// `pending` file attachments because it has no filename and edits inline.
type Snippet = { id: number; content: string; preview: string }

const PASTE_COLLAPSE_LINES = 15   // paste ≥ this many lines → collapse
const PASTE_COLLAPSE_CHARS = 600  // …or ≥ this many chars

const TEXT_EXTS = ['txt', 'md', 'markdown', 'json', 'csv', 'tsv', 'py', 'js', 'ts', 'tsx', 'jsx', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'html', 'css', 'xml', 'yaml', 'yml', 'log', 'sh', 'sql', 'ini', 'toml', 'env']
const MAX_BYTES = 10 * 1024 * 1024 // 10MB

function classifyFile(file: File): 'text' | 'image' {
  if (file.type.startsWith('image/')) return 'image'
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  if (TEXT_EXTS.includes(ext)) return 'text'
  // unknown → treat as text by default (best effort)
  return 'text'
}

const SLASH_COMMANDS = [
  { id: 'summarize', label: '总结', prompt: '请详细总结以上对话的要点，用中文回复。' },
  { id: 'translate', label: '翻译', prompt: '请将以上内容翻译成中文。' },
  { id: 'polish', label: '润色', prompt: '请润色以上文字，使其更加流畅、专业、简洁。' },
  { id: 'explain', label: '解释', prompt: '请用简单的语言解释以上内容，让初学者也能理解。' },
  { id: 'continue', label: '续写', prompt: '请基于以上内容自然地继续写作。' },
  { id: 'code', label: '代码', prompt: '请生成实现以上需求的代码。' },
]

export default function ChatInput() {
  const [input, setInput] = useState('')
  const [showSlash, setShowSlash] = useState(false)
  const [slashQuery, setSlashQuery] = useState('')
  const [pending, setPending] = useState<PendingAttachment[]>([])
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [fileError, setFileError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const sendMessage = useStore((s) => s.sendMessage)
  const stopGeneration = useStore((s) => s.stopGeneration)
  const sending = useStore((s) => s.sending)
  const currentSessionId = useStore((s) => s.currentSessionId)
  const createSession = useStore((s) => s.createSession)
  const chatMode = useStore((s) => s.chatMode)
  const arenaModelIds = useStore((s) => s.arenaModelIds)
  const runArena = useStore((s) => s.runArena)
  const effortLevel = useStore((s) => s.effortLevel)
  const setEffortLevel = useStore((s) => s.setEffortLevel)
  const providers = useStore((s) => s.providers)
  const allModels = useStore((s) => s.allModels)
  const sessionConfigs = useStore((s) => s.sessionConfigs)
  const saveSessionConfig = useStore((s) => s.saveSessionConfig)

  // Active model for the current session.
  const cfg = currentSessionId ? sessionConfigs[currentSessionId] : null
  const activeModelId = cfg?.modelId ?? null

  const slashResults = showSlash ? SLASH_COMMANDS.filter(cmd =>
    cmd.id.includes(slashQuery.toLowerCase()) || cmd.label.includes(slashQuery)
  ) : []

  const handleSubmit = async () => {
    const content = input.trim()
    if ((!content && pending.length === 0 && snippets.length === 0) || sending) return
    setInput('')

    let sessionId = currentSessionId
    if (!sessionId) {
      await createSession()
      sessionId = useStore.getState().currentSessionId
    }

    const atts = pending
    setPending([])
    // Fold collapsed long-paste snippets into the prompt as fenced blocks.
    const snippetBlocks = snippets.map((s, i) => `\n📎 粘贴片段 ${i + 1}:\n\`\`\`\n${s.content}\n\`\`\``).join('\n')
    setSnippets([])
    const finalContent = snippetBlocks ? (content ? content + '\n' + snippetBlocks : snippetBlocks) : content

    if (chatMode === 'arena') {
      await runArena(finalContent)
    } else if (sessionId) {
      sendMessage(finalContent, atts.length > 0 ? atts : undefined)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    setFileError(null)
    for (const file of files) {
      if (file.size > MAX_BYTES) { setFileError(`${file.name} 超过 10MB 限制`); continue }
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        setPending(prev => [...prev, { name: file.name, mime: file.type || (classifyFile(file) === 'image' ? 'image/png' : 'text/plain'), kind: classifyFile(file), dataUrl }])
      }
      reader.onerror = () => setFileError(`读取 ${file.name} 失败`)
      reader.readAsDataURL(file)
    }
    e.target.value = ''
  }

  // Collapse long pastes into a chip instead of flooding the textarea. Short
  // pastes go straight into the input as normal text. (ChatGPT-style.)
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData('text')
    if (!text) return
    const lines = text.split('\n').length
    if (lines < PASTE_COLLAPSE_LINES && text.length < PASTE_COLLAPSE_CHARS) return // short → normal insert
    e.preventDefault()
    const preview = text.replace(/\s+/g, ' ').trim().slice(0, 40)
    setSnippets(prev => [...prev, { id: Date.now() + Math.random(), content: text, preview: preview + (text.length > 40 ? '…' : '') }])
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setInput(val)
    const lastLine = val.split('\n').pop() || ''
    if (lastLine === '/') { setShowSlash(true); setSlashQuery('') }
    else if (lastLine.startsWith('/')) { setShowSlash(true); setSlashQuery(lastLine.slice(1)) }
    else setShowSlash(false)
  }

  const handleSlashSelect = (cmd: typeof SLASH_COMMANDS[0]) => {
    const lines = input.split('\n')
    lines[lines.length - 1] = cmd.prompt
    setInput(lines.join('\n'))
    setShowSlash(false)
    textareaRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
    if (e.key === 'Escape') setShowSlash(false)
  }

  useEffect(() => {
    const el = textareaRef.current
    if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 200) + 'px' }
  }, [input])

  return (
    <div className="border-t border-[var(--border)] bg-white px-4 py-2.5">
      <div className="max-w-3xl mx-auto">
        {pending.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {pending.map((a, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                {a.kind === 'image' && <img src={a.dataUrl} alt="" className="w-4 h-4 rounded object-cover" />}
                📎 {a.name}
                <button onClick={() => setPending(prev => prev.filter((_, j) => j !== i))} className="hover:bg-[var(--border)] rounded p-0.5"><X size={10} /></button>
              </span>
            ))}
          </div>
        )}
        {fileError && <p className="text-xs mb-2" style={{ color: 'var(--error)' }}>⚠ {fileError}</p>}
        {snippets.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {snippets.map((s, i) => (
              <span key={s.id} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                <FileText size={11} className="text-gray-400" />
                粘贴片段 {i + 1} · {s.preview}
                <button onClick={() => setSnippets(prev => prev.filter(x => x.id !== s.id))} className="hover:bg-[var(--border)] rounded p-0.5"><X size={10} /></button>
              </span>
            ))}
          </div>
        )}
        <div className={cn('relative flex items-end gap-2 rounded-2xl border px-4 py-2 transition-all', 'input-ring')}
          style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
          {showSlash && slashResults.length > 0 && (
            <div className="slash-menu">
              {slashResults.map((cmd) => (
                <div key={cmd.id} className="slash-item" onClick={() => handleSlashSelect(cmd)}>
                  <div className="text-sm font-medium">{cmd.label}</div>
                  <div className="text-[11px] text-[var(--text-muted)] truncate">{cmd.prompt}</div>
                </div>
              ))}
            </div>
          )}
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
          <button onClick={() => fileInputRef.current?.click()} disabled={sending} title="上传文件" className="shrink-0 p-1.5 rounded-lg hover:bg-[var(--border)] transition-colors disabled:opacity-30">
            <Paperclip size={16} className="text-gray-400" />
          </button>
          <textarea ref={textareaRef} value={input} onChange={handleInputChange} onKeyDown={handleKeyDown} onPaste={handlePaste}
            placeholder={chatMode === 'arena' ? '输入问题，多模型同时回答...' : '输入消息... (Shift+Enter 换行)'}
            rows={1} className="flex-1 bg-transparent resize-none outline-none text-sm leading-relaxed py-1 max-h-[200px]"
            disabled={sending} />
          {sending ? (
            <button onClick={stopGeneration} className="shrink-0 p-2.5 rounded-xl bg-red-500 text-white hover:bg-red-600 transition-colors" title="停止">
              <Square size={14} />
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={(!input.trim() && pending.length === 0 && snippets.length === 0) || (chatMode === 'arena' && arenaModelIds.length < 2)}
              className={cn('shrink-0 p-2.5 rounded-xl bg-black text-white hover:opacity-80 transition-opacity', 'disabled:opacity-30')} title="发送">
              <Send size={14} />
            </button>
          )}
        </div>

        {!sending && (
          <div className="flex items-center gap-2 px-0.5 mt-1.5 flex-wrap">
            <EffortControl level={effortLevel} onChange={setEffortLevel} />
            <ModelSelector providers={providers} allModels={allModels}
              activeModelId={activeModelId}
              onSelect={(mid, pid) => currentSessionId && saveSessionConfig(currentSessionId, { providerId: pid, modelId: mid })} />
            <div className="flex items-center gap-1.5">
              {SLASH_COMMANDS.slice(0, 3).map((cmd) => (
                <button key={cmd.id} onClick={() => {
                  const prompt = cmd.prompt
                  setInput(prev => prev ? prev + '\n---\n' + prompt : prompt)
                  textareaRef.current?.focus()
                }} className="qaction">{cmd.label}</button>
              ))}
            </div>
            <span className="text-[10px] text-[var(--text-muted)] ml-auto">输入 / 查看全部指令</span>
          </div>
        )}
      </div>
    </div>
  )
}

// Thinking-effort control: a slider (Claude-Code-style) with 4 detents
// (off/low/medium/high). Maps to real reasoning params (reasoning_effort for
// OpenAI o-series, thinking.budget_tokens for Claude) injected in chat.handler.
const EFFORT_LEVELS: { value: 'off' | 'low' | 'medium' | 'high'; label: string }[] = [
  { value: 'off', label: '关闭' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
]
function EffortControl({ level, onChange }: { level: 'off' | 'low' | 'medium' | 'high'; onChange: (v: 'off' | 'low' | 'medium' | 'high') => void }) {
  const idx = EFFORT_LEVELS.findIndex(l => l.value === level)
  return (
    <div className="flex items-center gap-1.5" title="思考等级：控制模型的推理深度（仅推理模型生效）">
      <Brain size={13} className="text-gray-400 shrink-0" />
      <input type="range" min={0} max={3} step={1} value={idx}
        onChange={(e) => onChange(EFFORT_LEVELS[parseInt(e.target.value, 10)].value)}
        className="w-20 h-1 accent-black cursor-pointer" />
      <span className="text-[10px] w-6" style={{ color: 'var(--text-muted)' }}>{EFFORT_LEVELS[idx].label}</span>
    </div>
  )
}

// Inline model selector — lives under the input bar next to the thinking slider
// (Claude-Code-style). A compact <select> grouped by provider.
function ModelSelector({ providers, allModels, activeModelId, onSelect }: {
  providers: { id: number; name: string }[]
  allModels: { id: number; provider_id: number; model_name: string; display_name?: string | null }[]
  activeModelId: number | null
  onSelect: (modelId: number, providerId: number) => void
}) {
  // Build provider→models groups, skipping empty providers.
  const groups = providers.map(p => {
    const ms = allModels.filter(m => m.provider_id === p.id)
    return ms.length ? { providerId: p.id, providerName: p.name, models: ms } : null
  }).filter(Boolean) as { providerId: number; providerName: string; models: typeof allModels }[]

  if (groups.length === 0) return null
  return (
    <div className="flex items-center gap-1.5" title="切换模型">
      <Cpu size={13} className="text-gray-400 shrink-0" />
      <select value={String(activeModelId ?? '')}
        onChange={(e) => {
          const mid = Number(e.target.value)
          const model = allModels.find(m => m.id === mid)
          if (model) onSelect(mid, model.provider_id)
        }}
        className="text-[11px] rounded-lg border px-2 py-1 outline-none max-w-[180px] bg-white"
        style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
        <option value="" disabled>选择模型</option>
        {groups.map(g => (
          <optgroup key={g.providerId} label={g.providerName}>
            {g.models.map(m => (
              <option key={m.id} value={m.id}>{m.display_name || m.model_name}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  )
}
