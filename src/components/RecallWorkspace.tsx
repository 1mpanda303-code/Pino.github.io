import { Check, ChevronRight, ListChecks, Mic2, PenLine } from 'lucide-react';
import type { RecallCheck, RecallIndependence, StudyAttempt } from '../domain/learning';

type Props = {
  attempt: StudyAttempt;
  onUpdate: (updater: (current: StudyAttempt) => StudyAttempt) => void;
  onComplete: () => void;
  onBack: () => void;
  onNotice: (message: string) => void;
};

const recallChecks: Array<{ id: RecallCheck; label: string }> = [
  { id: 'gist', label: '说清楚视频在讲什么' },
  { id: 'sequence', label: '按顺序讲出内容如何展开' },
  { id: 'detail', label: '讲出至少一个关键例子或细节' },
  { id: 'relationship', label: '说明一个因果、对比或结论' },
];

const independenceOptions: Array<{ id: RecallIndependence; label: string }> = [
  { id: 'not-yet', label: '还说不出来' },
  { id: 'with-outline', label: '看提纲能说' },
  { id: 'independent', label: '可以独立说' },
];

function toggleCheck(items: RecallCheck[], value: RecallCheck) {
  return items.includes(value) ? items.filter((item) => item !== value) : [...items, value];
}

export function RecallWorkspace({ attempt, onUpdate, onComplete, onBack, onNotice }: Props) {
  const recall = attempt.recall;

  function updateRecall(patch: Partial<StudyAttempt['recall']>) {
    onUpdate((current) => ({ ...current, recall: { ...current.recall, ...patch } }));
  }

  function completeRecall() {
    if (!recall.independence) { onNotice('请选择本次复述独立度。'); return; }
    if (recall.mode === 'oral' && !recall.oralCompleted) { onNotice('请确认已经完成口头复述。'); return; }
    if (recall.mode === 'written' && !recall.retelling.trim()) { onNotice('请先用自己的话写下复述。'); return; }
    updateRecall({ completedAt: recall.completedAt ?? new Date().toISOString() });
    onNotice('回忆复述已保存，可以准备 GPT 材料。'); onComplete();
  }

  return (
    <form className="recall-workspace" onSubmit={(event) => { event.preventDefault(); completeRecall(); }}>
      <div className="stage-title"><span className="section-kicker">最终回忆</span><h3>关掉字幕，用自己的话重新组织</h3><p>生词、语法和难句留在 Highlight；这里只记录你能否把内容重新讲出来。</p></div>

      <fieldset className="choice-field mode-field"><legend>复述方式</legend><div className="mode-control">
        <label className={recall.mode === 'oral' ? 'selected' : ''}><input type="radio" name={`${attempt.attemptId}-recall-mode`} checked={recall.mode === 'oral'} onChange={() => updateRecall({ mode: 'oral' })} /><Mic2 size={17} />口头复述</label>
        <label className={recall.mode === 'written' ? 'selected' : ''}><input type="radio" name={`${attempt.attemptId}-recall-mode`} checked={recall.mode === 'written'} onChange={() => updateRecall({ mode: 'written' })} /><PenLine size={17} />写下来</label>
      </div></fieldset>

      {recall.mode === 'oral' ? <label className="oral-confirm"><input type="checkbox" checked={recall.oralCompleted} onChange={(event) => updateRecall({ oralCompleted: event.target.checked })} /><span><Mic2 size={19} /><strong>我已完成口头复述</strong><small>不要求录音，也不要求逐字写下来</small></span></label> : <label className="form-field"><span>用自己的话复述</span><textarea rows={7} value={recall.retelling} onChange={(event) => updateRecall({ retelling: event.target.value })} /></label>}

      <fieldset className="choice-field"><legend>复述时我能做到</legend><div className="recall-checks">
        {recallChecks.map((item) => <label className={recall.checks.includes(item.id) ? 'selected' : ''} key={item.id}><input type="checkbox" checked={recall.checks.includes(item.id)} onChange={() => updateRecall({ checks: toggleCheck(recall.checks, item.id) })} /><Check size={16} />{item.label}</label>)}
      </div></fieldset>

      <fieldset className="choice-field"><legend>复述独立度</legend><div className="independence-options">
        {independenceOptions.map((item) => <label className={recall.independence === item.id ? 'selected' : ''} key={item.id}><input type="radio" name={`${attempt.attemptId}-independence`} checked={recall.independence === item.id} onChange={() => updateRecall({ independence: item.id })} /><ListChecks size={17} />{item.label}</label>)}
      </div></fieldset>

      <div className="recall-notes">
        <label className="form-field"><span>一句话总结（可选）</span><textarea rows={2} value={recall.gist} onChange={(event) => updateRecall({ gist: event.target.value })} /></label>
        <label className="form-field"><span>三点提纲（可选）</span><textarea rows={4} value={recall.outline} onChange={(event) => updateRecall({ outline: event.target.value })} placeholder="每行一点" /></label>
      </div>

      <div className="form-actions"><button className="secondary-button" type="button" onClick={onBack}>返回第三遍</button><button className="primary-button" type="submit">完成回忆，准备 GPT<ChevronRight size={17} /></button></div>
    </form>
  );
}
