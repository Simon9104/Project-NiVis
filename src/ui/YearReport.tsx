// Year report: grade, 4 scores, missions, average day, months, quiz, open question, numbers
import { COLORS, LABELS } from '../sim/constants';
import { stackCols, type Col, type Report } from '../sim/report';
import { BTN_MAIN, Modal } from './Modal';

const H3 = "font-family: 'Fredoka', sans-serif; font-weight: 600; font-size: 17px";

function Bars({ cols, n, gap, size }: { cols: Col[]; n: number; gap: number; size: number }) {
  return (
    <div style={`display: grid; grid-template-columns: repeat(${n}, minmax(0, 1fr)); gap: ${gap}px; align-items: end`}>
      {cols.map((sl) => (
        <div style="display: flex; flex-direction: column; gap: 3px; min-width: 0">
          <span style={`font-size: ${size}px; font-weight: ${n > 6 ? 700 : 800}; color: #33444D; text-align: center; white-space: nowrap`}>{sl.top}</span>
          <div style={`position: relative; height: 90px; display: flex; flex-direction: column-reverse; border-radius: ${n > 6 ? 3 : 4}px; overflow: hidden; background: #EEF2F4`}>
            {sl.segs.map((sg) => <div style={`flex: none; height: ${sg.h}; background: ${sg.c}`}></div>)}
            <div style={`position: absolute; left: 0; right: 0; bottom: ${sl.demB}; height: 2px; background: #1E2B33`}></div>
          </div>
          <span style={`font-size: ${size}px; font-weight: 700; color: #4F5F68; text-align: center`}>{sl.label}{n > 6 ? '' : ' h'}</span>
        </div>
      ))}
    </div>
  );
}

export function YearReport({ rep, picks, onPick, onAction }: { rep: Report; picks: Record<number, number>; onPick: (q: number, o: number) => void; onAction: () => void }) {
  const dayChart = stackCols(rep.dayRows, 90);
  const monChart = stackCols(rep.monRows.map((r) => ({ ...r, top: String(Math.round(r.co2 || 0)) })), 90);
  const legend = ['nuclear', 'hydro', 'wind', 'solar', 'coal', 'gas', 'store', 'imp'].map((k) => ({ c: COLORS[k], label: LABELS[k] }));
  return (
    <Modal kicker={rep.kicker} title={rep.title} text={rep.text}>
      <div style="display: flex; align-items: center; gap: 14px; background: #F3F6F7; border-radius: 16px; padding: 12px">
        <span data-testid="grade" style={`width: 58px; height: 58px; border-radius: 16px; background: ${rep.gradeBg}; color: #FFFFFF; font-family: 'Fredoka', sans-serif; font-weight: 600; font-size: 32px; display: flex; align-items: center; justify-content: center`}>{rep.grade}</span>
        <div style="display: flex; flex-direction: column; gap: 2px"><span style="font-size: 13px; font-weight: 800">Celkové skóre {rep.total} / 100</span><span style="font-size: 12px; font-weight: 700; color: #4F5F68">{rep.gradeText}</span></div>
      </div>
      {rep.scores.map((sc) => (
        <div style="display: flex; flex-direction: column; gap: 4px">
          <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 800"><span>{sc.label}</span><span>{sc.score} / 100</span></div>
          <div style="height: 8px; border-radius: 4px; background: #E3E9EC; overflow: hidden"><div style={`height: 8px; width: ${sc.w}; background: ${sc.c}`}></div></div>
          <span style="font-size: 11.5px; font-weight: 600; color: #4F5F68">{sc.note}</span>
        </div>
      ))}
      <div style="display: flex; flex-direction: column; gap: 6px">
        <span style={H3}>Misie roka</span>
        {rep.missions.map((ms) => (
          <div style="display: flex; align-items: flex-start; gap: 8px; background: #F3F6F7; border-radius: 12px; padding: 8px 10px"><span style={`color: ${ms.color}; font-weight: 800; font-size: 15px`}>{ms.icon}</span><div style="flex: 1; display: flex; flex-direction: column; gap: 1px"><span style="font-size: 13px; font-weight: 800">{ms.text}</span><span style="font-size: 12px; font-weight: 600; color: #4F5F68">{ms.prog}</span></div><span style={`font-size: 12.5px; font-weight: 800; color: ${ms.color}; white-space: nowrap`}>{ms.money}</span></div>
        ))}
      </div>
      <div style="display: flex; flex-direction: column; gap: 6px">
        <span style={H3}>Priemerný deň v tomto roku</span>
        <span style="font-size: 12px; font-weight: 600; color: #4F5F68; line-height: 1.4">Stĺpce = odkiaľ bola elektrina (MW), čierna čiara = spotreba, hore priemerná cena. Večer slnko nevyrába a cena je najvyššia.</span>
        <Bars cols={dayChart} n={6} gap={6} size={11} />
      </div>
      <div style="display: flex; flex-direction: column; gap: 6px">
        <span style={H3}>Rok po mesiacoch</span>
        <span style="font-size: 12px; font-weight: 600; color: #4F5F68; line-height: 1.4">Priemerný výkon zdrojov v každom mesiaci, čiara = spotreba, hore CO₂ v g/kWh.</span>
        <Bars cols={monChart} n={12} gap={3} size={10.5} />
        <div style="display: flex; gap: 3px 10px; flex-wrap: wrap; font-size: 11px; font-weight: 700; color: #3A4A52">
          {legend.map((lg) => <span style="display: inline-flex; align-items: center; gap: 4px"><span style={`width: 9px; height: 9px; border-radius: 2px; background: ${lg.c}`}></span>{lg.label}</span>)}
        </div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 8px">
        <span style={H3}>Otázky na zamyslenie</span>
        {rep.quiz.map((qz, qi) => {
          const pk = picks[qi]; const answered = pk !== undefined; const right = pk === qz.correct;
          return (
            <div style="display: flex; flex-direction: column; gap: 6px; background: #F3F6F7; border-radius: 14px; padding: 10px 12px">
              <span style="font-size: 13.5px; font-weight: 800">{qz.q}</span>
              <div style="display: flex; flex-wrap: wrap; gap: 6px">
                {qz.opts.map((label, oi) => {
                  const bg = answered && oi === qz.correct ? '#E3F3E8' : answered && oi === pk ? '#FBE4DC' : '#FFFFFF';
                  const bd = answered && oi === qz.correct ? '#1A7A43' : answered && oi === pk ? '#A33A22' : '#DCE5E9';
                  return <button onClick={() => { if (!answered) onPick(qi, oi); }} style={`min-height: 40px; padding: 6px 12px; border-radius: 12px; border: 2px solid ${bd}; background: ${bg}; color: #1E2B33; font-family: 'Nunito', sans-serif; font-size: 12.5px; font-weight: 700; cursor: pointer; text-align: left`}>{label}</button>;
                })}
              </div>
              {answered && <span style={`font-size: 12.5px; font-weight: 700; line-height: 1.4; color: ${right ? '#1A7A43' : '#A33A22'}`}>{(right ? 'Správne! ' : 'Nie celkom. ') + qz.expl}</span>}
            </div>
          );
        })}
        <label style="display: flex; flex-direction: column; gap: 6px; font-size: 13.5px; font-weight: 800">{rep.open}
          <textarea rows={3} placeholder="Napíš svoju odpoveď (pre seba alebo do triedy)…" style="font-family: 'Nunito', sans-serif; font-size: 13px; font-weight: 600; border: 2px solid #DCE5E9; border-radius: 12px; padding: 8px 10px; resize: vertical; color: #1E2B33; user-select: text"></textarea>
        </label>
      </div>
      <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px">
        {rep.rows.map((r) => <div style="background: #F3F6F7; border-radius: 10px; padding: 7px 9px; display: flex; flex-direction: column; gap: 1px"><span style="font-size: 11px; font-weight: 700; color: #4F5F68">{r.k}</span><span style="font-size: 13.5px; font-weight: 800">{r.v}</span></div>)}
      </div>
      <div style="display: flex; gap: 8px; flex-wrap: wrap">
        <button onClick={onAction} style={BTN_MAIN} data-testid="modal-action">{rep.btn}</button>
      </div>
    </Modal>
  );
}
