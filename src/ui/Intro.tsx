import { INTRO_STEPS } from '../sim/constants';
import { BTN_MAIN, BTN_SEC, Modal } from './Modal';

export function Intro({ step, onNext, onBack, onSkip }: { step: number; onNext: () => void; onBack: () => void; onSkip: () => void }) {
  const s = INTRO_STEPS[step]; const last = step >= INTRO_STEPS.length - 1;
  const dots = <div style="display: flex; gap: 6px" aria-hidden="true">{INTRO_STEPS.map((_x, i) => <span style={`height: 6px; border-radius: 3px; width: ${i === step ? '26px' : '10px'}; background: ${i <= step ? '#1A7A43' : '#D5DFE3'}`}></span>)}</div>;
  return (
    <Modal kicker={s.kicker} title={s.title} text={s.text} top={dots}>
      {s.bullets.map((b) => (
        <div style="display: flex; gap: 10px; align-items: flex-start; background: #F3F6F7; border-radius: 12px; padding: 9px 11px">
          <span style={`flex: none; width: 10px; height: 10px; border-radius: 5px; margin-top: 5px; background: ${b.c}`}></span>
          <div style="display: flex; flex-direction: column; gap: 1px"><span style="font-size: 13.5px; font-weight: 800">{b.t}</span><span style="font-size: 12.5px; font-weight: 600; color: #4F5F68; line-height: 1.4">{b.d}</span></div>
        </div>
      ))}
      <div style="display: flex; gap: 8px; flex-wrap: wrap">
        {step > 0 && <button onClick={onBack} style={BTN_SEC}>Späť</button>}
        {!last && <button onClick={onSkip} style={BTN_SEC + '; color: #4F5F68'}>Preskočiť úvod</button>}
        <button onClick={onNext} style={BTN_MAIN} data-testid="modal-action">{last ? 'Začať rok 2027' : 'Ďalej'}</button>
      </div>
    </Modal>
  );
}
