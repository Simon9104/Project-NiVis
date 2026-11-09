// Top HUD: money, clean energy, population, date + speed + missions, today's chart, weather, CO₂, events, toast
import type { Hud as HudData } from '../sim/report';
import { fmtMoney, fmtNum } from '../sim/constants';
import { HUD_ICONS } from './icons';
import { Toast } from './Toast';

const Svg = ({ html }: { html: string }) => <span style="display: inline-flex" dangerouslySetInnerHTML={{ __html: html }} />;

export interface HudProps {
  h: HudData | null; running: boolean; speed: number; toast: string | null;
  onTogglePlay: () => void; onSpeed: (v: number) => void;
}

export function Hud({ h, running, speed, toast, onTogglePlay, onSpeed }: HudProps) {
  const money = h ? h.money : 0; const mult = h ? h.mult : 1;
  const co2Color = h && h.co2 > 200 ? '#A33A22' : h && h.co2 > 120 ? '#9A6200' : '#1A7A43';
  return (
    <div class="nv-hud">
      <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px">
        <div class="nv-glass" style="padding: 6px 9px; display: flex; flex-direction: column; gap: 1px">
          <div style="display: flex; align-items: center; gap: 5px">
            <Svg html={HUD_ICONS.money} />
            <span style="font-family: 'Fredoka', sans-serif; font-weight: 600; font-size: 14px; white-space: nowrap" data-testid="money">{fmtMoney(money)}</span>
          </div>
          <span style={`font-size: 10.5px; font-weight: 700; color: ${money < 0 ? '#A33A22' : '#4F5F68'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis`}>{money < 0 ? 'Úver' : 'Peniaze'} · {h ? (h.net >= 0 ? '+' : '') + fmtMoney(h.net) + '/deň' : ''}</span>
        </div>
        <div class="nv-glass" style="padding: 6px 9px; display: flex; flex-direction: column; gap: 1px">
          <div style="display: flex; align-items: center; gap: 5px">
            <Svg html={HUD_ICONS.bolt} />
            <span style="font-family: 'Fredoka', sans-serif; font-weight: 600; font-size: 14px">{h ? Math.round(h.clean * 100) + ' %' : '–'}</span>
            <span style={`font-size: 11px; font-weight: 800; color: #FFFFFF; background: ${mult >= 1.1 ? '#1A7A43' : mult >= 1 ? '#6B7A83' : '#A33A22'}; border-radius: 6px; padding: 1px 5px`}>{'×' + mult.toFixed(2).replace('.', ',')}</span>
          </div>
          <span style="font-size: 10.5px; font-weight: 700; color: #4F5F68; white-space: nowrap">Energ. účinnosť</span>
        </div>
        <div class="nv-glass" style="padding: 6px 9px; display: flex; flex-direction: column; gap: 1px">
          <div style="display: flex; align-items: center; gap: 5px">
            <Svg html={HUD_ICONS.people} />
            <span style="font-family: 'Fredoka', sans-serif; font-weight: 600; font-size: 14px; white-space: nowrap">{h ? (h.pop / 1e6).toFixed(3).replace('.', ',') + ' mil.' : '–'}</span>
          </div>
          <span style="font-size: 10.5px; font-weight: 700; color: #4F5F68; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">Populácia · {h ? (h.popDelta >= 0 ? '+' : '') + fmtNum(h.popDelta) + ' tento rok' : ''}</span>
        </div>
      </div>

      <div class="nv-glass" style="padding: 7px 9px; display: flex; flex-direction: column; gap: 6px">
        <div style="display: flex; align-items: center; gap: 8px">
          <button aria-label={running ? 'Pozastaviť' : 'Spustiť'} onClick={onTogglePlay} data-testid="play" style="flex: none; width: 34px; height: 34px; border-radius: 10px; border: none; background: #1A7A43; color: #FFFFFF; display: flex; align-items: center; justify-content: center; cursor: pointer">
            {running
              ? <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"></rect><rect x="14" y="5" width="4" height="14" rx="1"></rect></svg>
              : <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg>}
          </button>
          <div style="flex: 1; min-width: 0; display: flex; flex-direction: column">
            <span style="font-family: 'Fredoka', sans-serif; font-weight: 600; font-size: 15px; white-space: nowrap" data-testid="date">{h ? h.date : ''}</span>
            <span style="font-size: 11px; font-weight: 700; color: #4F5F68">{h ? h.yearText : ''}</span>
          </div>
          <div role="group" aria-label="Rýchlosť" style="display: flex; gap: 3px; background: #EEF2F4; border-radius: 10px; padding: 3px">
            {[1, 2, 4].map((v) => (
              <button aria-pressed={speed === v} onClick={() => onSpeed(v)} style={`border: none; border-radius: 8px; height: 28px; min-width: 34px; font-family: 'Nunito', sans-serif; font-size: 12px; font-weight: 800; cursor: pointer; background: ${speed === v ? '#1E2B33' : 'transparent'}; color: ${speed === v ? '#FFFFFF' : '#33444D'}`}>{v + '×'}</button>
            ))}
          </div>
        </div>
        <div style="height: 5px; border-radius: 3px; background: #E3E9EC; overflow: hidden"><div style={`height: 5px; width: ${h ? h.progress : '0%'}; background: #1A7A43`}></div></div>
        {(h ? h.missions : []).map((ms) => (
          <div style="display: flex; align-items: baseline; gap: 6px; font-size: 11px; font-weight: 700; color: #33444D"><span style={`color: ${ms.color}; font-weight: 800`}>{ms.icon}</span><span style="flex: 1; min-width: 0">{ms.text}</span><span style={`color: ${ms.color}; white-space: nowrap`}>{ms.prog}</span></div>
        ))}
      </div>

      <div class="nv-glass nv-daycard" style="padding: 7px 9px; display: flex; flex-direction: column; gap: 5px">
        <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: 12px; font-weight: 800">
          <span>Výroba <span style={`color: ${h && h.prod >= h.demand ? '#1A7A43' : '#A33A22'}`}>{h ? fmtNum(h.prod) : '–'}</span> / spotreba {h ? fmtNum(h.demand) : '–'} MW</span>
          <span style="white-space: nowrap">{h ? 'Cena ' + Math.round(h.price) : ''} €/MWh <span style={`color: ${h && h.trend > 3 ? '#A33A22' : '#1A7A43'}`}>{h ? (h.trend > 3 ? '▲' : h.trend < -3 ? '▼' : '•') : ''}</span></span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 4px; align-items: end" aria-label="Dnešný deň po štyroch hodinách">
          {(h ? h.slots : []).map((sl) => (
            <div style="display: flex; flex-direction: column; gap: 2px">
              <span style="font-size: 10.5px; font-weight: 700; color: #4F5F68; text-align: center; white-space: nowrap">{sl.top}</span>
              <div style="position: relative; height: 40px; display: flex; flex-direction: column-reverse; border-radius: 3px; overflow: hidden; background: #EEF2F4">
                {sl.segs.map((sg) => <div style={`flex: none; height: ${sg.h}; background: ${sg.c}`}></div>)}
                <div style={`position: absolute; left: 0; right: 0; bottom: ${sl.demB}; height: 2px; background: #1E2B33`}></div>
              </div>
              <span style="font-size: 10.5px; font-weight: 700; color: #4F5F68; text-align: center">{sl.label} h</span>
            </div>
          ))}
        </div>
        <div style="display: flex; gap: 2px 9px; flex-wrap: wrap; font-size: 10.5px; font-weight: 700; color: #3A4A52">
          {(h ? h.mix : []).map((m) => <span style="display: inline-flex; align-items: center; gap: 3px"><span style={`width: 7px; height: 7px; border-radius: 4px; background: ${m.c}`}></span>{m.label} {m.mw}</span>)}
        </div>
        <div style="display: flex; gap: 4px 10px; flex-wrap: wrap; font-size: 11px; font-weight: 700; color: #33444D; border-top: 1px solid #E6ECEF; padding-top: 4px">
          <span>{h ? h.temp : ''}</span><span>oblačnosť {h ? h.cloud : ''}</span><span>vietor {h ? h.wind : ''}</span><span>rieky {h ? h.flow : ''}</span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 10px; font-size: 11px; font-weight: 700; color: #33444D; border-top: 1px solid #E6ECEF; padding-top: 4px">
          <span>CO₂ dnes <b style={`color: ${co2Color}`}>{h ? h.co2Day : ''}</b> · {h ? String(h.co2) : ''} g/kWh</span>
          <span>CO₂ tento rok <b style={`color: ${co2Color}`}>{h ? h.co2Year : ''}</b></span>
          <span>Prisťahovaní tento rok <b style="color: #1A7A43">+{h ? h.arrYear : '0'}</b></span>
          <span>Odsťahovaní tento rok <b style="color: #A33A22">−{h ? h.depYear : '0'}</b></span>
        </div>
      </div>

      {(h ? h.events : []).map((ev) => (
        <div style={`background: ${ev.bg}; color: #FFFFFF; border-radius: 12px; padding: 6px 10px; font-size: 12px; font-weight: 800; display: flex; justify-content: space-between; gap: 8px; box-shadow: 0 4px 14px rgba(20,40,60,0.2)`}><span>{ev.name}</span><span style="opacity: 0.9; white-space: nowrap">{ev.left}</span></div>
      ))}
      <Toast text={toast} />
    </div>
  );
}
