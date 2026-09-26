import { useState } from 'react'
import { useStore } from '@/store'
import { useUI } from '@/components/ui/feedback'
import { Plus, Trash2, Download, Upload, FileText, Sparkles } from 'lucide-react'
import { t } from '@/utils/i18n'

/** Render persona creation, editing, and selection controls. */
export default function PersonaPage() {
  const personas = useStore((s) => s.personas)
  const workspaceSoul = useStore((s) => s.workspaceSoul)
  const addPersona = useStore((s) => s.addPersona)
  const updatePersona = useStore((s) => s.updatePersona)
  const deletePersona = useStore((s) => s.deletePersona)

  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editPrompt, setEditPrompt] = useState('')
  const [newName, setNewName] = useState('')
  const [newPrompt, setNewPrompt] = useState('')
  const { toast } = useUI()

  const handleAdd = async () => {
    if (!newName.trim() || !newPrompt.trim()) return
    await addPersona({ name: newName.trim(), prompt: newPrompt.trim(), avatar: null })
    setNewName(''); setNewPrompt(''); setShowAdd(false)
  }

  const handleSaveEdit = async (id: number) => {
    if (!editName.trim()) return
    await updatePersona(id, { name: editName.trim(), prompt: editPrompt.trim(), avatar: null })
    setEditingId(null)
  }

  const handleExportJson = (persona: { name: string; prompt: string }) => {
    const blob = new Blob([JSON.stringify({ version: '1.0', type: 'aetherai-persona', name: persona.name, prompt: persona.prompt }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${persona.name}.json`
    a.click(); URL.revokeObjectURL(a.href)
  }

  const handleExportSoulMd = async (persona: { id: number; name: string }) => {
    try {
      const res = await window.electronAPI.persona.exportSoulMd(persona.id)
      if (!res) return
      const blob = new Blob([res.content], { type: 'text/markdown;charset=utf-8' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'SOUL.md'
      a.click(); URL.revokeObjectURL(a.href)
      toast(t('persona.export_soul') + ' OK', { type: 'success' })
    } catch (err: any) {
      toast(err?.message || '导出失败', { type: 'error' })
    }
  }

  const handleApplyToWorkspace = async (persona: { name: string; prompt: string; avatar?: string | null }) => {
    try {
      const { sessionConfigs, currentSessionId } = useStore.getState()
      const ws = currentSessionId ? sessionConfigs[currentSessionId]?.workspace : null
      const res = await window.electronAPI.persona.writeWorkspaceSoul(ws || '', {
        name: persona.name,
        prompt: persona.prompt,
        avatar: persona.avatar ?? undefined,
      })
      if (res.success) {
        await useStore.getState().loadWorkspaceSoul(ws || null)
        toast(t('persona.apply_workspace') + ' OK', { type: 'success' })
      } else {
        toast(res.error || '写入工作区失败', { type: 'error' })
      }
    } catch (err: any) {
      toast(err?.message || '写入工作区失败', { type: 'error' })
    }
  }

  const handleImport = async () => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,.md'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return
      const text = await file.text()
      try {
        let result
        if (file.name.toLowerCase().endsWith('.md')) {
          result = await window.electronAPI.persona.import({ type: 'soul-md', text })
        } else {
          const data = JSON.parse(text)
          result = await window.electronAPI.persona.import(data)
        }
        if (!result.success) { toast(result.error || t('persona.import_failed'), { type: 'error' }); return }
        await useStore.getState().loadPersonas()
        toast(t('persona.imported_success', result.name || file.name), { type: 'success' })
      } catch { toast(t('persona.invalid_file'), { type: 'error' }) }
    }
    input.click()
  }

  return (
    <div className="flex-1 overflow-y-auto bg-transparent page-fade-in">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{t('persona.title')}</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{t('persona.subtitle')}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleImport} className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border hover:bg-[var(--bg-secondary)] transition-colors" style={{ borderColor: 'var(--border)' }}>
              <Upload size={14} />{t('persona.import')}
            </button>
            <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-md border hover:bg-[var(--bg-secondary)] transition-colors" style={{ borderColor: 'var(--border)' }}>
              <Plus size={14} />{t('persona.add')}
            </button>
          </div>
        </div>

        {/* Workspace Active SOUL.md Card */}
        {workspaceSoul && (
          <div className="mb-6 p-4 rounded-lg border" style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--bg-secondary)' }}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Sparkles size={16} style={{ color: 'var(--accent)' }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {t('persona.workspace_soul_title')}: {workspaceSoul.name}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider font-mono font-medium border"
                  style={{ borderColor: 'var(--accent)', color: 'var(--accent)', backgroundColor: 'transparent' }}>
                  {workspaceSoul.fileName}
                </span>
              </div>
              <button
                onClick={() => addPersona({ name: workspaceSoul.name, prompt: workspaceSoul.prompt, avatar: workspaceSoul.avatar || null })}
                className="text-xs px-2.5 py-1 rounded border hover:bg-[var(--content-bg)] transition-colors flex items-center gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 active:opacity-75 motion-reduce:transition-none"
                style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                title={t('persona.save_to_personas')}
              >
                <Plus size={12} /> {t('persona.add')}
              </button>
            </div>
            <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
              {workspaceSoul.description || t('persona.workspace_soul_desc')}
            </p>
            <pre className="text-xs whitespace-pre-wrap font-mono leading-relaxed max-h-24 overflow-y-auto p-2 rounded bg-[var(--content-bg)] border"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
              {workspaceSoul.prompt}
            </pre>
          </div>
        )}

        {showAdd && (
          <div className="mb-6 p-4 rounded-lg space-y-3" style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t('persona.name')}
              className="w-full px-3 py-2 text-sm rounded-md border outline-none focus:border-gray-300 bg-[var(--content-bg)]" style={{ borderColor: 'var(--border)' }} />
            <textarea value={newPrompt} onChange={(e) => setNewPrompt(e.target.value)} placeholder={t('persona.prompt')}
              rows={4} className="w-full px-3 py-2 text-sm rounded-md border outline-none focus:border-gray-300 resize-none font-mono bg-[var(--content-bg)]" style={{ borderColor: 'var(--border)' }} />
            <div className="flex gap-2">
              <button onClick={handleAdd} className="px-4 py-2 bg-[var(--accent)] text-white text-xs font-medium rounded-md hover:opacity-90 transition-opacity">{t('models.save')}</button>
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-xs rounded-md border hover:bg-[var(--bg-secondary)] transition-colors" style={{ borderColor: 'var(--border)' }}>{t('models.cancel')}</button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {personas.length === 0 && (
            <div className="text-center py-12 text-sm" style={{ color: 'var(--text-muted)' }}>{t('persona.no_personas')}</div>
          )}
          {personas.map((persona) => (
            <div key={persona.id} className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              {editingId === persona.id ? (
                <div className="p-4 space-y-3">
                  <input value={editName} onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-md border outline-none focus:border-gray-300 bg-[var(--content-bg)]" style={{ borderColor: 'var(--border)' }} />
                  <textarea value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)}
                    rows={4} className="w-full px-3 py-2 text-sm rounded-md border outline-none focus:border-gray-300 resize-none font-mono bg-[var(--content-bg)]" style={{ borderColor: 'var(--border)' }} />
                  <div className="flex gap-2">
                    <button onClick={() => handleSaveEdit(persona.id)} className="px-4 py-1.5 bg-[var(--accent)] text-white text-xs font-medium rounded-md hover:opacity-90 transition-opacity">{t('models.save')}</button>
                    <button onClick={() => setEditingId(null)} className="px-4 py-1.5 text-xs rounded-md border hover:bg-[var(--bg-secondary)] transition-colors" style={{ borderColor: 'var(--border)' }}>{t('models.cancel')}</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{persona.name}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => { setEditingId(persona.id); setEditName(persona.name); setEditPrompt(persona.prompt) }}
                        title={t('persona.edit')}
                        className="p-1.5 rounded hover:bg-[var(--border)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 active:opacity-75 motion-reduce:transition-none">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button onClick={() => handleApplyToWorkspace(persona)}
                        title={t('persona.apply_workspace')}
                        className="p-1.5 rounded hover:bg-[var(--border)] transition-colors text-gray-400 hover:text-[var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 active:opacity-75 motion-reduce:transition-none">
                        <Sparkles size={14} />
                      </button>
                      <button onClick={() => handleExportSoulMd(persona)}
                        title={t('persona.export_soul')}
                        className="p-1.5 rounded hover:bg-[var(--border)] transition-colors text-gray-400 hover:text-[var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 active:opacity-75 motion-reduce:transition-none">
                        <FileText size={14} />
                      </button>
                      <button onClick={() => handleExportJson(persona)}
                        title={t('persona.export_json')}
                        className="p-1.5 rounded hover:bg-[var(--border)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 active:opacity-75 motion-reduce:transition-none">
                        <Download size={14} className="text-gray-400" />
                      </button>
                      <button onClick={() => deletePersona(persona.id)}
                        title={t('persona.delete')}
                        className="p-1.5 rounded hover:bg-[var(--border)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 active:opacity-75 motion-reduce:transition-none">
                        <Trash2 size={14} className="text-gray-400" />
                      </button>
                    </div>
                  </div>
                  <div className="px-4 py-3">
                    <pre className="text-xs whitespace-pre-wrap font-mono leading-relaxed max-h-32 overflow-y-auto" style={{ color: 'var(--text-secondary)' }}>
                      {persona.prompt || t('persona.no_prompt')}
                    </pre>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
