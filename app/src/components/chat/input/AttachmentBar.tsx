import { X, FileText, ShieldAlert } from 'lucide-react'
import { t } from '@/utils/i18n'

export type PendingAttachment = { name: string; mime: string; kind: 'text' | 'image'; dataUrl: string }
export type Snippet = { id: number; content: string; preview: string }

export const SENSITIVE_FILE_PATTERN = /(\.env(\..+)?|id_rsa|id_ed25519|\.pem|\.key|\.p12|\.pfx|\.pkcs12|credentials\.json|service-account.*\.json)$/i

export interface AttachmentBarProps {
  queuedMessages: { id: number; content: string }[]
  onRemoveQueued: (id: number) => void
  pending: PendingAttachment[]
  onRemovePending: (index: number) => void
  onRemoveSensitive: () => void
  snippets: Snippet[]
  onRemoveSnippet: (index: number) => void
  fileError: string | null
}

export default function AttachmentBar({
  pending,
  onRemovePending,
  onRemoveSensitive,
  snippets,
  onRemoveSnippet,
  fileError,
}: AttachmentBarProps) {
  const hasSensitive = pending.some(a => SENSITIVE_FILE_PATTERN.test(a.name))

  return (
    <>
      {/* Sensitive Credential File Guard (P1-11) */}
      {hasSensitive && (
        <div
          className="flex items-center gap-2 px-3 py-1.5 mb-2 rounded-lg border text-xs animate-blur-fade"
          style={{ backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.35)', color: 'var(--error)' }}
        >
          <ShieldAlert size={14} className="shrink-0 text-red-500" />
          <span className="flex-1 font-medium text-[11px]">
            {t('chat.sensitive_file_warning', '检测到包含私密密钥或配置的文件 (.env / .pem / 密钥)。发送前请确认内容不含明文生产凭据！')}
          </span>
          <button
            onClick={onRemoveSensitive}
            className="text-[10px] px-2 py-0.5 rounded border border-red-300 hover:bg-red-100 dark:hover:bg-red-950 transition-colors font-medium shrink-0"
          >
            {t('chat.remove_sensitive_files', '一键移除敏感文件')}
          </button>
        </div>
      )}

      {pending.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {pending.map((a, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg border"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
            >
              {a.kind === 'image' && a.dataUrl ? (
                <img src={a.dataUrl} alt="" className="w-6 h-6 rounded object-cover border" style={{ borderColor: 'var(--border)' }} />
              ) : (
                <FileText size={12} className="text-gray-400 shrink-0" />
              )}
              <span className="truncate max-w-[160px]">{a.name}</span>
              <button onClick={() => onRemovePending(i)} className="hover:bg-[var(--border)] rounded p-0.5">
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      {fileError && <p className="text-xs mb-2" role="alert" style={{ color: 'var(--error)' }}>⚠ {fileError}</p>}

      {snippets.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {snippets.map((s, i) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
            >
              <FileText size={11} className="text-gray-400" />
              {t('paste.snippet_n', i + 1)} · {s.preview}
              <button onClick={() => onRemoveSnippet(i)} className="hover:bg-[var(--border)] rounded p-0.5">
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
    </>
  )
}
