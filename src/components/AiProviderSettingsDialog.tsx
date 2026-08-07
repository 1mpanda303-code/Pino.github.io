import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Gauge, List, LoaderCircle, Plus, Settings, Trash2, X } from 'lucide-react';
import { AiClientError, requestAi, requestAiModels } from '../aiClient';
import {
  AI_PROVIDER_PROTOCOL, capabilityForModel, createAiProviderProfile, DEFAULT_MAX_OUTPUT_TOKENS, knownModelCapability, toProviderOverride,
  type AiModelCapability, type AiProviderProfile,
} from '../domain/aiProvider';

type Props = {
  open: boolean;
  profiles: AiProviderProfile[];
  activeProfileId: string;
  sessionApiKeys: Record<string, string>;
  onClose: () => void;
  onSaveProfile: (profile: AiProviderProfile, apiKey: string) => void;
  onDeleteProfile: (id: string) => void;
  onSelectProfile: (id: string) => void;
};

type TestState = 'idle' | 'testing' | 'ok' | 'error';
type FetchState = 'idle' | 'fetching' | 'ok' | 'error';

export function AiProviderSettingsDialog({ open, profiles, activeProfileId, sessionApiKeys, onClose, onSaveProfile, onDeleteProfile, onSelectProfile }: Props) {
  const [draft, setDraft] = useState<AiProviderProfile | null>(null);
  const [draftKey, setDraftKey] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [testState, setTestState] = useState<TestState>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [fetchState, setFetchState] = useState<FetchState>('idle');
  const [fetchMessage, setFetchMessage] = useState('');

  useEffect(() => {
    if (!open) return;
    const initial = profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0] ?? null;
    setDraft(initial);
    setDraftKey(initial ? sessionApiKeys[initial.id] ?? '' : '');
    setErrors([]);
    setTestState('idle');
    setTestMessage('');
    setFetchState('idle');
    setFetchMessage('');
  }, [open]);

  if (!open) return null;

  function editProfile(profile: AiProviderProfile) {
    setDraft(profile);
    setDraftKey(sessionApiKeys[profile.id] ?? '');
    setErrors([]);
    setTestState('idle');
    setTestMessage('');
    setFetchState('idle');
    setFetchMessage('');
  }

  function newProfile() {
    setDraft({
      id: '',
      label: '',
      protocol: AI_PROVIDER_PROTOCOL,
      baseUrl: '',
      model: '',
      models: [],
      jsonMode: true,
      maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    });
    setDraftKey('');
    setErrors([]);
    setTestState('idle');
    setTestMessage('');
    setFetchState('idle');
    setFetchMessage('');
  }

  function save() {
    if (!draft) return;
    try {
      const profile = createAiProviderProfile({
        ...draft,
        models: [...draft.models, draft.model].filter(Boolean),
      });
      onSaveProfile(profile, draftKey);
      onSelectProfile(profile.id);
      setDraft(profile);
      setErrors([]);
      setTestState('idle');
      setTestMessage('');
      setFetchState('idle');
      setFetchMessage('');
    } catch (cause) {
      setErrors(cause instanceof Error ? cause.message.split('\n') : ['配置保存失败。']);
    }
  }

  async function testConnection() {
    if (!draft) return;
    try {
      const profile = createAiProviderProfile({
        ...draft,
        models: [...draft.models, draft.model].filter(Boolean),
      });
      setTestState('testing');
      setTestMessage('');
      const response = await requestAi({
        action: 'chat',
        language: 'zh',
        question: '请只回复 OK。',
        history: [],
        provider: toProviderOverride(profile, draftKey),
      });
      setTestState('ok');
      setTestMessage(`连接成功：${response.providerId} · ${response.model}`);
    } catch (cause) {
      setTestState('error');
      setTestMessage(cause instanceof AiClientError ? cause.message : '连接失败，请检查配置。');
    }
  }

  async function fetchModels() {
    if (!draft) return;
    try {
      const profile = createAiProviderProfile({
        ...draft,
        models: [...draft.models, draft.model].filter(Boolean),
      });
      setFetchState('fetching');
      setFetchMessage('');
      const models = await requestAiModels({ baseUrl: profile.baseUrl, apiKey: draftKey });
      const modelCapabilities = { ...(draft.modelCapabilities ?? {}) };
      for (const model of models) {
        const known = knownModelCapability(model);
        if (known && !modelCapabilities[model]) modelCapabilities[model] = known;
      }
      setDraft({ ...draft, models: models.slice(0, 50), modelCapabilities });
      setFetchState('ok');
      setFetchMessage(`已获取 ${models.length} 个模型；已自动补齐可识别的能力，保存配置后生效。`);
    } catch (cause) {
      setFetchState('error');
      setFetchMessage(cause instanceof AiClientError ? cause.message : '模型列表获取失败。');
    }
  }

  function useQuickModel(model: string) {
    if (!draft) return;
    setDraft({ ...draft, model });
    setErrors([]);
  }

  function updateCapability(patch: Partial<AiModelCapability>) {
    if (!draft) return;
    const current = capabilityForModel(draft, draft.model);
    setDraft({
      ...draft,
      modelCapabilities: {
        ...(draft.modelCapabilities ?? {}),
        [draft.model]: { ...current, ...patch, source: 'user', probedAt: new Date().toISOString() },
      },
    });
  }

  function fillKnownCapabilities() {
    if (!draft) return;
    const modelCapabilities = { ...(draft.modelCapabilities ?? {}) };
    let added = 0;
    for (const model of [...draft.models, draft.model]) {
      const known = knownModelCapability(model);
      if (known && !modelCapabilities[model]) {
        modelCapabilities[model] = known;
        added += 1;
      }
    }
    setDraft({ ...draft, modelCapabilities });
    setFetchState('ok');
    setFetchMessage(added ? `已用公开默认补齐 ${added} 个模型能力，可继续手动修改。` : '没有新的可识别模型能力；仍可手动填写当前模型。');
  }

  const modelChips = draft && (draft.models.length ? draft.models : ['deepseek-v4-pro', 'deepseek-v4-flash']);
  const currentCapability = draft ? capabilityForModel(draft, draft.model) : null;

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="video-dialog ai-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-settings-title">
        <header className="dialog-header">
          <div><small>AI 助手</small><h2 id="ai-settings-title">API 配置与模型</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭 AI 设置"><X size={19} /></button>
        </header>

        <div className="dialog-body">
          <div className="form-section-title"><Settings size={17} /><span>已保存配置</span></div>
          <div className="ai-provider-list">
            {profiles.map((profile) => (
              <div className={`ai-provider-row${profile.id === activeProfileId ? ' active' : ''}`} key={profile.id}>
                <button className="ai-provider-select" type="button" onClick={() => onSelectProfile(profile.id)}>
                  <strong>{profile.label}</strong>
                  <small>{profile.model} · {profile.baseUrl}</small>
                </button>
                <button className="secondary-button" type="button" onClick={() => editProfile(profile)}>编辑</button>
                <button className="icon-button danger" type="button" onClick={() => { if (window.confirm(`删除配置《${profile.label}》？`)) onDeleteProfile(profile.id); }} aria-label={`删除配置 ${profile.label}`} title="删除配置"><Trash2 size={15} /></button>
              </div>
            ))}
            <button className="secondary-button ai-provider-add" type="button" onClick={newProfile}><Plus size={16} />新增配置</button>
          </div>

          {draft && (
            <>
              <div className="video-field-grid">
                <label className="form-field span-two"><span>配置名称</span><input value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} placeholder="例如 DeepSeek" /></label>
                <label className="form-field span-two"><span>API Base URL</span><input value={draft.baseUrl} onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })} placeholder="https://api.deepseek.com" spellCheck={false} /></label>
                <label className="form-field"><span>模型</span><input value={draft.model} onChange={(event) => setDraft({ ...draft, model: event.target.value })} placeholder="deepseek-v4-pro" spellCheck={false} /></label>
                <label className="form-field"><span>API Key（仅本次会话）</span><input type="password" value={draftKey} onChange={(event) => setDraftKey(event.target.value)} placeholder="sk-..." autoComplete="off" /></label>
              </div>
              {modelChips && modelChips.length > 0 && <div className="ai-model-chips">{modelChips.filter(Boolean).map((model) => <button className="ai-model-chip" type="button" key={model} onClick={() => useQuickModel(model)}>{model}</button>)}</div>}
              <div className="ai-settings-options">
                <label className="ai-settings-check"><input type="checkbox" checked={draft.jsonMode} onChange={(event) => setDraft({ ...draft, jsonMode: event.target.checked })} /><span>支持 JSON 输出模式（生成 AI 报告需要）</span></label>
                <label className="form-field ai-token-field"><span>最大输出 tokens</span><input type="number" min={1} max={1000000} value={draft.maxOutputTokens} onChange={(event) => setDraft({ ...draft, maxOutputTokens: Number(event.target.value) })} /></label>
              </div>
              {currentCapability && (
                <div className="ai-capability-editor">
                  <div className="form-section-title"><Gauge size={17} /><span>当前模型能力</span></div>
                  <div className="ai-capability-grid">
                    <label className="ai-settings-check"><input type="checkbox" checked={currentCapability.jsonOutput} onChange={(event) => updateCapability({ jsonOutput: event.target.checked })} /><span>支持 JSON 输出</span></label>
                    <label className="form-field"><span>上下文长度 tokens</span><input type="number" min={0} step={1000} value={currentCapability.contextTokens ?? ''} placeholder="未知" onChange={(event) => updateCapability({ contextTokens: event.target.value === '' ? null : Math.max(0, Number(event.target.value)) })} /></label>
                    <label className="form-field"><span>最大输出 tokens</span><input type="number" min={1} max={1000000} value={currentCapability.maxOutputTokens ?? ''} placeholder="沿用配置上限" onChange={(event) => updateCapability({ maxOutputTokens: event.target.value === '' ? null : Math.max(1, Number(event.target.value)) })} /></label>
                    <span className="ai-capability-source">来源：{currentCapability.source === 'known' ? '公开默认' : currentCapability.source === 'user' ? '手动/探测' : '未知'}</span>
                  </div>
                  <p className="dialog-hint">生成 AI 报告时，不支持 JSON、输出过低或上下文过低会禁用或降级为紧凑生成；切换模型后能力单独保存。</p>
                </div>
              )}
              {!!errors.length && <div className="validation-errors" role="alert">{errors.map((error) => <p key={error}><AlertTriangle size={15} />{error}</p>)}</div>}
              {testState !== 'idle' && <p className={`ai-provider-test ${testState}`}>{testState === 'testing' ? <LoaderCircle size={15} /> : testState === 'ok' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}{testMessage}</p>}
              {fetchState !== 'idle' && <p className={`ai-provider-test ${fetchState}`}>{fetchState === 'fetching' ? <LoaderCircle size={15} /> : fetchState === 'ok' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}{fetchMessage}</p>}
            </>
          )}
          <p className="dialog-hint">Base URL 填 API 入口，例如 https://api.deepseek.com；不要带上 /chat/completions。API Key 只保存在本次会话，不进入工作区、备份或云同步。</p>
        </div>

        <footer className="dialog-footer">
          <p className="form-error">{errors.length ? '配置未保存，请先修正错误。' : ''}</p>
          <div>
            <button className="secondary-button" type="button" disabled={!draft || fetchState === 'fetching'} onClick={() => void fetchModels()}><List size={16} />获取模型列表</button>
            <button className="secondary-button" type="button" disabled={!draft || fetchState === 'fetching'} onClick={fillKnownCapabilities}><Gauge size={16} />补齐能力</button>
            <button className="secondary-button" type="button" disabled={!draft || testState === 'testing'} onClick={() => void testConnection()}>{testState === 'testing' ? <LoaderCircle size={16} /> : <CheckCircle2 size={16} />}测试连接</button>
            <button className="secondary-button" type="button" onClick={onClose}>关闭</button>
            <button className="primary-button" type="button" disabled={!draft} onClick={save}>保存配置</button>
          </div>
        </footer>
      </section>
    </div>
  );
}
