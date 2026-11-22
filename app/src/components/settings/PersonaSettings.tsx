import { useRef, useState } from 'react'
import { Download, Pencil, Plus, Sparkles, Star, Trash2, Upload, User } from 'lucide-react'
import { useStore } from '@/store'
import { useUI } from '@/components/ui/feedback'
import Tooltip from '@/components/Tooltip'
import { t } from '@/utils/i18n'
import type { Persona } from '@/types'

/** Manage saved AI personas, default session persona, and SOUL.md import/export. */
export default function PersonaSettings() {
  const { toast, confirm } = useUI()
  const personas = useStore((s) => s.personas)
  const workspaceSoul = useStore((s) => s.workspaceSoul)
  const defaultPersonaId = useStore((s) => s.defaultPersonaId)
  const setDefaultPersona = useStore((s) => s.setDefaultPersona)
  const addPersona = useStore((s) => s.addPersona)
  const updatePersona = useStore((s) => s.updatePersona)
  const deletePersona = useStore((s) => s.deletePersona)
  const loadPersonas = useStore((s) => s.loadPersonas)

  const [editingId, setEditingId] = useState<number | 'new' | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftPrompt, setDraftPrompt] = useState('')
  const [saving, setSaving] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  const startCreate = () => {
    setEditingId('new')
    setDraftName('')
    setDraftPrompt('')
  }

  const startEdit = (p: Persona) => {
    setEditingId(p.id)
    setDraftName(p.name)
    setDraftPrompt(p.prompt || '')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setDraftName('')
    setDraftPrompt('')
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = draftName.trim()
    const prompt = draftPrompt.trim()
    if (!name || saving) return
    setSaving(true)
    try {
      if (editingId === 'new') {
        await addPersona({ name, prompt, avatar: null })
      } else if (typeof editingId === 'number') {
        await updatePersona(editingId, { name, prompt })
      }
      cancelEdit()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (p: Persona) => {
    const ok = await confirm({
      title: t('persona.delete'),
      description: t('persona.delete_confirm', p.name),
      confirmText: t('common.delete'),
      danger: true,
    })
    if (!ok) return
    if (defaultPersonaId === p.id) {
      await setDefaultPersona(null)
    }
    await deletePersona(p.id)
    if (editingId === p.id) cancelEdit()
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const MAX_IMPORT_BYTES = 1024 * 1024 // 1 MB
    if (file.size > MAX_IMPORT_BYTES) {
      toast(t('persona.import_failed'), { type: 'error' })
      return
    }
    try {
      const text = await file.text()
      let payload: any = { type: 'soul-md', text }
      if (file.name.toLowerCase().endsWith('.json')) {
        try {
          payload = JSON.parse(text)
        } catch {
          toast(t('persona.invalid_file'), { type: 'error' })
          return
        }
      }
      const res = await window.electronAPI.persona.import(payload)
      if (!res?.success) {
        toast(res?.error || t('persona.import_failed'), { type: 'error' })
        return
      }
      await loadPersonas()
      toast(t('persona.imported_success', res.name || file.name), { type: 'success' })
    } catch {
      toast(t('persona.import_failed'), { type: 'error' })
    }
  }

  const handleExportSoul = async (p: Persona) => {
    const res = await window.electronAPI.persona.exportSoulMd(p.id)
    if (!res?.content) return
    const blob = new Blob([res.content], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = res.fileName || 'SOUL.md'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleSaveWorkspaceSoul = async () => {
    if (!workspaceSoul) return
    await addPersona({
      name: workspaceSoul.name || 'SOUL',
      prompt: workspaceSoul.prompt || '',
      avatar: workspaceSoul.avatar || null,
    })
    toast(t('persona.imported_success', workspaceSoul.name || 'SOUL'), { type: 'success' })
  }

  return (
    <div
      id="settings-personas-card"
      className="rounded-lg p-4 border"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}
    >
      {/* Header + Import / Create Actions */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-2 min-w-0">
          <User size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} />
          <div>
            <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {t('persona.title')}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {t('persona.subtitle')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <input
            ref={importInputRef}
            type="file"
            accept=".json,.md"
            className="hidden"
            onChange={handleImportFile}
          />
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            className="h-7 px-2.5 text-xs rounded-md border flex items-center gap-1.5 transition-colors hover:bg-[var(--bg-secondary)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            <Upload size={12} />
            <span>{t('persona.import')}</span>
          </button>
          <button
            type="button"
            onClick={startCreate}
            className="h-7 px-2.5 text-xs rounded-md font-medium flex items-center gap-1 transition-opacity hover:opacity-90 active:scale-[0.98] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
          >
            <Plus size={12} />
            <span>{t('persona.add')}</span>
          </button>
        </div>
      </div>

      {/* Default Persona for New Sessions */}
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 mb-4 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <div>
          <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
            {t('settings.default_persona')}
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {t('settings.default_persona_desc')}
          </p>
        </div>
        <select
          value={defaultPersonaId ?? ''}
          onChange={(e) => {
            const val = e.target.value ? Number(e.target.value) : null
            setDefaultPersona(val)
          }}
          aria-label={t('settings.default_persona')}
          className="px-2.5 py-1.5 text-xs rounded-md border outline-none hover:border-[var(--accent)] focus-visible:ring-1 focus-visible:ring-[var(--accent)] active:scale-[0.99] disabled:opacity-40 cursor-pointer min-w-[180px]"
          style={{
            borderColor: 'var(--border)',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
          }}
        >
          <option value="">{t('chat.no_persona')}</option>
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Workspace SOUL.md Banner (when present) */}
      {workspaceSoul && (
        <div
          className="mb-3 p-2.5 rounded-md border flex items-center justify-between gap-3"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
        >
          <div className="flex items-start gap-2 min-w-0">
            <Sparkles size={13} className="mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} />
            <div className="min-w-0">
              <div className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                {t('persona.workspace_soul_title')} · {workspaceSoul.name}
              </div>
              <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                {t('persona.workspace_soul_desc')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSaveWorkspaceSoul}
            className="h-7 px-2.5 text-[11px] rounded-md border shrink-0 transition-colors hover:bg-[var(--content-bg)] active:scale-[0.98] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            {t('persona.save_to_personas')}
          </button>
        </div>
      )}

      {/* Inline Create / Edit Editor */}
      {editingId !== null && (
        <form
          onSubmit={handleSave}
          className="inline-card-enter mb-4 p-3 rounded-md border space-y-2.5"
          style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--bg-secondary)' }}
        >
          <input
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder={t('persona.name')}
            autoFocus
            className="w-full h-8 px-2.5 text-xs rounded-md border outline-none focus:border-[var(--accent)]"
            style={{
              borderColor: 'var(--border)',
              backgroundColor: 'var(--content-bg)',
              color: 'var(--text-primary)',
            }}
          />
          <textarea
            value={draftPrompt}
            onChange={(e) => setDraftPrompt(e.target.value)}
            placeholder={t('persona.prompt')}
            rows={4}
            className="w-full px-2.5 py-2 text-xs rounded-md border outline-none resize-y focus:border-[var(--accent)] leading-relaxed"
            style={{
              borderColor: 'var(--border)',
              backgroundColor: 'var(--content-bg)',
              color: 'var(--text-primary)',
            }}
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={cancelEdit}
              className="h-7 px-3 text-xs rounded-md border transition-colors hover:bg-[var(--content-bg)] active:scale-[0.98] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={!draftName.trim() || saving}
              className="h-7 px-3 text-xs rounded-md font-medium transition-opacity hover:opacity-90 active:scale-[0.98] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
            >
              {t('common.save')}
            </button>
          </div>
        </form>
      )}

      {/* Saved Personas List */}
      {personas.length === 0 ? (
        <p className="text-xs py-4 text-center" style={{ color: 'var(--text-muted)' }}>
          {t('persona.no_personas')}
        </p>
      ) : (
        <div className="space-y-2">
          {personas.map((p) => {
            const isDefault = defaultPersonaId === p.id
            return (
              <div
                key={p.id}
                className="p-3 rounded-md border flex items-start justify-between gap-3 transition-colors"
                style={{
                  borderColor: isDefault ? 'var(--accent)' : 'var(--border)',
                  backgroundColor: 'var(--bg-secondary)',
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                      {p.name}
                    </span>
                    {isDefault && (
                      <span
                        className="px-1.5 py-0.5 rounded-[4px] border text-[10px] font-medium shrink-0"
                        style={{
                          borderColor: 'var(--accent)',
                          color: 'var(--accent)',
                          backgroundColor: 'var(--content-bg)',
                        }}
                      >
                        {t('persona.default_badge')}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] mt-1 line-clamp-2 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                    {p.prompt?.trim() ? p.prompt : t('persona.no_prompt')}
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Tooltip text={t('persona.set_default')}>
                    <button
                      type="button"
                      onClick={() => setDefaultPersona(isDefault ? null : p.id)}
                      className="h-7 w-7 rounded-md border flex items-center justify-center transition-colors hover:bg-[var(--content-bg)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer"
                      style={{
                        borderColor: 'var(--border)',
                        color: isDefault ? 'var(--accent)' : 'var(--text-muted)',
                      }}
                      aria-label={t('persona.set_default')}
                    >
                      <Star size={12} fill={isDefault ? 'currentColor' : 'none'} />
                    </button>
                  </Tooltip>
                  <Tooltip text={t('persona.export_soul')}>
                    <button
                      type="button"
                      onClick={() => handleExportSoul(p)}
                      className="h-7 w-7 rounded-md border flex items-center justify-center transition-colors hover:bg-[var(--content-bg)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                      aria-label={t('persona.export_soul')}
                    >
                      <Download size={12} />
                    </button>
                  </Tooltip>
                  <Tooltip text={t('persona.edit')}>
                    <button
                      type="button"
                      onClick={() => startEdit(p)}
                      className="h-7 w-7 rounded-md border flex items-center justify-center transition-colors hover:bg-[var(--content-bg)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                      aria-label={t('persona.edit')}
                    >
                      <Pencil size={12} />
                    </button>
                  </Tooltip>
                  <Tooltip text={t('persona.delete')}>
                    <button
                      type="button"
                      onClick={() => handleDelete(p)}
                      className="h-7 w-7 rounded-md border flex items-center justify-center transition-colors hover:bg-[var(--content-bg)] hover:text-[var(--error)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                      aria-label={t('persona.delete')}
                    >
                      <Trash2 size={12} />
                    </button>
                  </Tooltip>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
