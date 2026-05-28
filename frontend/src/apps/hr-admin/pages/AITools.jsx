import { useState } from 'react'
import { aiAPI } from '../../../shared/services/api'
import { SectionHeader, Spinner } from '../../../shared/components'
import { Brain, FileText, Calendar, Activity, Zap, ChevronDown, ChevronUp, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'

function ProviderBadge({ provider, fallback }) {
  if (!provider) return null
  const colors = { gemini: 'text-blue-400 bg-blue-500/10', openai: 'text-emerald-400 bg-emerald-500/10', groq: 'text-purple-400 bg-purple-500/10', rule_based_fallback: 'text-amber-400 bg-amber-500/10' }
  return (
    <div className="flex items-center gap-2">
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[provider] || 'badge-gray'}`}>
        via {provider}
      </span>
      {fallback && <span className="text-xs text-amber-400">↳ fallback used</span>}
    </div>
  )
}

// ─── CV Parser Tool ───────────────────────────────────────────────────────────
function CVParserTool() {
  const [text, setText] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const parse = async () => {
    if (!text.trim()) return toast.error('Paste a CV first')
    setLoading(true)
    try {
      const { data } = await aiAPI.parseCV(text)
      setResult(data)
    } catch { toast.error('CV parsing failed') }
    finally { setLoading(false) }
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
          <FileText size={18} className="text-blue-400" />
        </div>
        <div>
          <h3 className="font-display font-semibold text-white">CV Parser</h3>
          <p className="text-xs text-text-secondary">Paste CV text — AI extracts staff profile data</p>
        </div>
      </div>
      <textarea value={text} onChange={e => setText(e.target.value)}
        className="input resize-none" rows={5} placeholder="Paste full CV text here..." />
      <button onClick={parse} disabled={loading} className="btn-primary">
        {loading ? <><Spinner size="sm" /> Parsing...</> : <><Brain size={15} /> Parse CV</>}
      </button>
      {result?.parsed && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
              <CheckCircle size={12} /> Parsed successfully
            </span>
            <ProviderBadge provider={result.provider} fallback={result.fallback_used} />
          </div>
          <div className="bg-surface-700 rounded-xl p-4 grid grid-cols-2 gap-3">
            {Object.entries(result.parsed).filter(([k,v]) => v && !Array.isArray(v) && typeof v !== 'object').map(([k, v]) => (
              <div key={k}>
                <p className="text-xs text-text-muted uppercase tracking-wide">{k.replace(/_/g,' ')}</p>
                <p className="text-sm text-white mt-0.5">{String(v)}</p>
              </div>
            ))}
          </div>
          {result.parsed.credentials?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-text-secondary uppercase mb-2">Credentials Found</p>
              {result.parsed.credentials.map((c, i) => (
                <div key={i} className="flex items-center gap-2 p-2 bg-surface-700 rounded-lg mb-1.5">
                  <CheckCircle size={12} className="text-brand-400 shrink-0" />
                  <p className="text-xs text-white">{c.type} — {c.issuing_body}
                    {c.expiry_date && <span className="text-text-muted ml-1">· expires {c.expiry_date}</span>}
                  </p>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-amber-400">⚠ {result.note}</p>
        </div>
      )}
    </div>
  )
}

// ─── Leave Parser Tool ────────────────────────────────────────────────────────
function LeaveParserTool() {
  const [message, setMessage] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const parse = async () => {
    if (!message.trim()) return
    setLoading(true)
    try {
      const { data } = await aiAPI.parseLeave(message)
      setResult(data)
    } catch { toast.error('Could not parse leave request') }
    finally { setLoading(false) }
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
          <Calendar size={18} className="text-emerald-400" />
        </div>
        <div>
          <h3 className="font-display font-semibold text-white">Natural Language Leave</h3>
          <p className="text-xs text-text-secondary">Convert plain English leave requests to structured data</p>
        </div>
      </div>
      <div className="flex gap-3">
        <input value={message} onChange={e => setMessage(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && parse()}
          placeholder='e.g. "I need next Friday and Monday off for a family event"'
          className="input flex-1" />
        <button onClick={parse} disabled={loading || !message} className="btn-primary">
          {loading ? <Spinner size="sm" /> : <Zap size={15} />}
        </button>
      </div>
      {result?.parsed && !result.parsed.error && (
        <div className="bg-surface-700 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
              <CheckCircle size={12} /> Parsed
            </span>
            <ProviderBadge provider={result.provider} fallback={result.fallback_used} />
          </div>
          {[['Leave Type', result.parsed.leave_type?.replace('_',' ')],
            ['Start Date', result.parsed.start_date],
            ['End Date', result.parsed.end_date],
            ['Reason', result.parsed.reason]].filter(([,v]) => v).map(([k, v]) => (
            <div key={k} className="flex justify-between text-sm">
              <span className="text-text-secondary">{k}</span>
              <span className="text-white capitalize">{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Provider Status Tool ─────────────────────────────────────────────────────
function ProviderStatusTool() {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const check = async () => {
    setLoading(true)
    try {
      const { data } = await aiAPI.providers()
      setResult(data)
    } catch { toast.error('Could not fetch provider status') }
    finally { setLoading(false) }
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
            <Activity size={18} className="text-brand-400" />
          </div>
          <div>
            <h3 className="font-display font-semibold text-white">AI Provider Status</h3>
            <p className="text-xs text-text-secondary">Check which providers are configured and active</p>
          </div>
        </div>
        <button onClick={check} disabled={loading} className="btn-secondary">
          {loading ? <Spinner size="sm" /> : 'Check Status'}
        </button>
      </div>
      {result && (
        <div className="space-y-3">
          <p className="text-xs text-text-secondary">Chain order: <span className="text-brand-400">{result.chain?.join(' → ')}</span></p>
          <div className="grid grid-cols-3 gap-3">
            {Object.entries(result.providers || {}).map(([name, info]) => (
              <div key={name} className={`p-3 rounded-xl border ${info.configured ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-surface-600 bg-surface-700'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-white capitalize">{name}</span>
                  <span className={`text-xs ${info.configured ? 'text-emerald-400' : 'text-red-400'}`}>
                    {info.configured ? '● Active' : '● Not set'}
                  </span>
                </div>
                <p className="text-xs text-text-muted font-mono">{info.model}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function AIToolsPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <SectionHeader
        title="AI Tools"
        subtitle="Gemini → OpenAI → Groq fallback chain · All tasks AI-assisted"
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CVParserTool />
        <LeaveParserTool />
      </div>
      <ProviderStatusTool />
    </div>
  )
}
