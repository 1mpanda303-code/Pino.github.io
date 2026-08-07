import { useEffect, useState, type ReactNode } from 'react';
import {
  Captions, Check, ChevronDown, ChevronRight, Eye, Headphones, LockKeyhole,
} from 'lucide-react';
import type {
  AudioCapture, ComprehensionScore, Episode, StudyAttempt, TranscriptCoverage,
  VisualConfirmation, VisualHelp,
} from '../domain/learning';

type PassId = 'audio' | 'visual' | 'transcript';

type Props = {
  episode: Episode;
  attempt: StudyAttempt;
  englishTranscript: string;
  onUpdate: (updater: (current: StudyAttempt) => StudyAttempt) => void;
  onTranscriptComplete: () => void;
  onNotice: (message: string) => void;
  transcriptWorkspace: ReactNode;
};

const comprehensionLabels: Array<{ score: ComprehensionScore; label: string }> = [
  { score: 1, label: '几乎没听懂，只感知到声音或个别词' },
  { score: 2, label: '抓到一些词或短语，但不知道整体在讲什么' },
  { score: 3, label: '大概知道话题或主旨，细节多数缺失' },
  { score: 4, label: '主旨清楚，也听懂了一些关键关系和细节' },
  { score: 5, label: '不借助画面也能基本跟上整段内容' },
];

const audioOptions: Array<{ id: AudioCapture; label: string }> = [
  { id: 'almost-nothing', label: '几乎没有' }, { id: 'words', label: '零散单词' },
  { id: 'phrases', label: '短语或句子' }, { id: 'topic', label: '大概话题' },
  { id: 'gist', label: '一句主旨' }, { id: 'details', label: '具体细节' },
];

const visualOptions: Array<{ id: VisualConfirmation; label: string }> = [
  { id: 'actors', label: '人物或对象' }, { id: 'setting', label: '场景' },
  { id: 'topic', label: '话题' }, { id: 'cause', label: '因果关系' },
  { id: 'example', label: '例子' }, { id: 'conclusion', label: '结论' },
];

const visualHelpLabels: Array<{ id: VisualHelp; label: string }> = [
  { id: 'none', label: '几乎没有' }, { id: 'some', label: '有一点' }, { id: 'strong', label: '帮助很大' },
];

function toggleValue<T extends string>(items: T[], value: T) {
  return items.includes(value) ? items.filter((item) => item !== value) : [...items, value];
}

function ScoreChoices({ name, value, onChange }: { name: string; value: ComprehensionScore | null; onChange: (score: ComprehensionScore) => void }) {
  return (
    <fieldset className="choice-field score-field">
      <legend>整体理解自评</legend>
      <div className="score-options">
        {comprehensionLabels.map((item) => (
          <label className={value === item.score ? 'selected' : ''} key={item.score}>
            <input type="radio" name={name} checked={value === item.score} onChange={() => onChange(item.score)} />
            <strong>{item.score}</strong><span>{item.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function PracticeWorkspace({ episode, attempt, englishTranscript, onUpdate, onTranscriptComplete, onNotice, transcriptWorkspace }: Props) {
  const audio = attempt.passes.audioOnly;
  const visual = attempt.passes.visualNoCaptions;
  const transcript = attempt.passes.transcriptStudy;
  const currentPass: PassId = !audio.completedAt ? 'audio' : !visual.completedAt ? 'visual' : 'transcript';
  const [openPass, setOpenPass] = useState<PassId>(currentPass);

  useEffect(() => { setOpenPass(currentPass); }, [attempt.attemptId, currentPass]);

  function updateAudio(patch: Partial<StudyAttempt['passes']['audioOnly']>) {
    onUpdate((current) => ({ ...current, passes: { ...current.passes, audioOnly: { ...current.passes.audioOnly, ...patch } } }));
  }

  function updateVisual(patch: Partial<StudyAttempt['passes']['visualNoCaptions']>) {
    onUpdate((current) => ({ ...current, passes: { ...current.passes, visualNoCaptions: { ...current.passes.visualNoCaptions, ...patch } } }));
  }

  function updateTranscript(patch: Partial<StudyAttempt['passes']['transcriptStudy']>) {
    onUpdate((current) => ({ ...current, passes: { ...current.passes, transcriptStudy: { ...current.passes.transcriptStudy, ...patch } } }));
  }

  function completeAudio() {
    if (!audio.comprehension) { onNotice('请先选择第一遍的整体理解自评。'); return; }
    updateAudio({ completedAt: audio.completedAt ?? new Date().toISOString() });
    setOpenPass('visual'); onNotice('第一遍已保存，可以开始看画面。');
  }

  function completeVisual() {
    if (!visual.comprehension || !visual.visualHelp) { onNotice('请完成第二遍的理解自评和画面帮助程度。'); return; }
    updateVisual({ completedAt: visual.completedAt ?? new Date().toISOString() });
    setOpenPass('transcript'); onNotice('第二遍已保存，英文字幕精听已开放。');
  }

  function completeTranscript() {
    if (!englishTranscript.trim()) { onNotice('请先录入英文字幕，再完成第三遍。'); return; }
    if (episode.source === 'custom' && transcript.transcriptCoverage === 'none') { onNotice('请确认自建视频的字幕覆盖状态。'); return; }
    if (!transcript.reviewConfirmed) { onNotice('请确认已经逐句过完英文字幕。'); return; }
    updateTranscript({ completedAt: transcript.completedAt ?? new Date().toISOString() });
    onNotice('三遍练习已完成，进入最终回忆复述。'); onTranscriptComplete();
  }

  const passHeader = (id: PassId, icon: ReactNode, title: string, goal: string, enabled: boolean, completed: boolean) => (
    <button className="pass-header" type="button" disabled={!enabled} onClick={() => setOpenPass(id)} aria-expanded={openPass === id}>
      <span className={`pass-icon ${completed ? 'done' : ''}`}>{completed ? <Check size={18} /> : icon}</span>
      <span className="pass-heading"><strong>{title}</strong><small>{goal}</small></span>
      <span className={`pass-status ${completed ? 'done' : id === currentPass ? 'current' : ''}`}>{completed ? '已完成' : id === currentPass ? '当前' : enabled ? '可查看' : '未开始'}</span>
      {enabled ? <ChevronDown className={openPass === id ? 'open' : ''} size={18} /> : <LockKeyhole size={16} />}
    </button>
  );

  return (
    <div className="practice-stage">
      <header className="practice-heading"><div><span className="section-kicker">本集练习</span><h3>三遍练习</h3></div><strong>{[audio, visual, transcript].filter((item) => item.completedAt).length}/3</strong></header>

      <section className={`pass-panel audio ${openPass === 'audio' ? 'open' : ''}`} aria-label="第一遍纯听">
        {passHeader('audio', <Headphones size={18} />, '第一遍 · 纯听', '只建立声音理解基线', true, !!audio.completedAt)}
        {openPass === 'audio' && <div className="pass-body">
          <ScoreChoices name={`${attempt.attemptId}-audio-score`} value={audio.comprehension} onChange={(comprehension) => updateAudio({ comprehension })} />
          <fieldset className="choice-field"><legend>我捕捉到</legend><div className="check-grid">
            {audioOptions.map((item) => <label key={item.id}><input type="checkbox" checked={audio.captured.includes(item.id)} onChange={() => updateAudio({ captured: item.id === 'almost-nothing' ? (audio.captured.includes(item.id) ? [] : ['almost-nothing']) : toggleValue(audio.captured.filter((value) => value !== 'almost-nothing'), item.id) })} />{item.label}</label>)}
          </div></fieldset>
          <label className="form-field"><span>听到的词或片段（可选）</span><textarea rows={2} value={audio.fragments} onChange={(event) => updateAudio({ fragments: event.target.value })} placeholder="拼写不确定也可以记下来" /></label>
          <div className="pass-actions"><button className="primary-button" type="button" onClick={completeAudio}>{audio.completedAt ? '保存第一遍' : '完成第一遍'}<ChevronRight size={16} /></button></div>
        </div>}
      </section>

      <section className={`pass-panel visual ${openPass === 'visual' ? 'open' : ''}`} aria-label="第二遍看画面无字幕">
        {passHeader('visual', <Eye size={18} />, '第二遍 · 看画面，不开字幕', '确认画面带来的语境支架', !!audio.completedAt, !!visual.completedAt)}
        {openPass === 'visual' && <div className="pass-body">
          <ScoreChoices name={`${attempt.attemptId}-visual-score`} value={visual.comprehension} onChange={(comprehension) => updateVisual({ comprehension })} />
          <fieldset className="choice-field"><legend>画面帮助程度</legend><div className="choice-row">
            {visualHelpLabels.map((item) => <label className={visual.visualHelp === item.id ? 'selected' : ''} key={item.id}><input type="radio" name={`${attempt.attemptId}-visual-help`} checked={visual.visualHelp === item.id} onChange={() => updateVisual({ visualHelp: item.id })} />{item.label}</label>)}
          </div></fieldset>
          <fieldset className="choice-field"><legend>现在确认了什么（可选）</legend><div className="check-grid">
            {visualOptions.map((item) => <label key={item.id}><input type="checkbox" checked={visual.confirmed.includes(item.id)} onChange={() => updateVisual({ confirmed: toggleValue(visual.confirmed, item.id) })} />{item.label}</label>)}
          </div></fieldset>
          <label className="form-field"><span>一句话猜测主旨（可选）</span><textarea rows={2} value={visual.gistGuess} onChange={(event) => updateVisual({ gistGuess: event.target.value })} /></label>
          <div className="pass-actions"><button className="primary-button" type="button" onClick={completeVisual}>{visual.completedAt ? '保存第二遍' : '完成第二遍'}<ChevronRight size={16} /></button></div>
        </div>}
      </section>

      <section className={`pass-panel transcript ${openPass === 'transcript' ? 'open' : ''}`} aria-label="第三遍英文字幕精听">
        {passHeader('transcript', <Captions size={18} />, '第三遍 · 英文字幕精听', '定位声音与文字没有对上的地方', !!visual.completedAt, !!transcript.completedAt)}
        {openPass === 'transcript' && <div className="pass-body transcript-pass-body">
          {transcriptWorkspace}
          <div className="transcript-finish">
            {episode.source === 'custom' && <fieldset className="choice-field"><legend>本次英文字幕覆盖状态</legend><div className="choice-row">
              {([['none', '没有录入'], ['partial', '本次片段'], ['complete', '完整字幕']] as Array<[TranscriptCoverage, string]>).map(([id, label]) => <label className={transcript.transcriptCoverage === id ? 'selected' : ''} key={id}><input type="radio" name={`${attempt.attemptId}-coverage`} checked={transcript.transcriptCoverage === id} onChange={() => updateTranscript({ transcriptCoverage: id })} />{label}</label>)}
            </div></fieldset>}
            <label className="confirm-row"><input type="checkbox" checked={transcript.reviewConfirmed} onChange={(event) => updateTranscript({ reviewConfirmed: event.target.checked })} />我已经逐句过完英文字幕</label>
            <fieldset className="choice-field"><legend>是否关字幕又完整听了一次</legend><div className="choice-row compact">
              <label className={transcript.replayedWithoutCaptions === true ? 'selected' : ''}><input type="radio" name={`${attempt.attemptId}-replay`} checked={transcript.replayedWithoutCaptions === true} onChange={() => updateTranscript({ replayedWithoutCaptions: true })} />是</label>
              <label className={transcript.replayedWithoutCaptions === false ? 'selected' : ''}><input type="radio" name={`${attempt.attemptId}-replay`} checked={transcript.replayedWithoutCaptions === false} onChange={() => updateTranscript({ replayedWithoutCaptions: false, postReplayComprehension: null })} />否</label>
            </div></fieldset>
            {transcript.replayedWithoutCaptions && <ScoreChoices name={`${attempt.attemptId}-post-replay-score`} value={transcript.postReplayComprehension} onChange={(postReplayComprehension) => updateTranscript({ postReplayComprehension })} />}
            <div className="pass-actions"><button className="primary-button" type="button" onClick={completeTranscript}>完成第三遍，开始回忆<ChevronRight size={16} /></button></div>
          </div>
        </div>}
      </section>
    </div>
  );
}
