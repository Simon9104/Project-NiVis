// Building panel: drag a plant from here onto the map; drag a plant back here to demolish it
import type { Ref } from 'preact';
import { CREDIT, ITEMS, fmtMoney, fmtNum, type PlantType } from '../sim/constants';
import { ITEM_ICONS } from './icons';

export interface DockProps { money: number; moving: boolean; dockRef: Ref<HTMLElement>; onStart: (type: PlantType, e: PointerEvent) => void; music?: { on: boolean; toggle: () => void } | null }

export function Dock({ money, moving, dockRef, onStart, music }: DockProps) {
  return (
    <section ref={dockRef} class="nv-dock" aria-label="Stavby" style="background: rgba(255,255,255,0.95); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); box-shadow: 0 -8px 24px rgba(20,40,60,0.16)">
      <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 8px; padding: 0 4px; flex-wrap: wrap">
        <span style="font-family: 'Fredoka', sans-serif; font-weight: 600; font-size: 16px">Postav elektráreň</span>
        <span style="display: flex; align-items: center; gap: 8px; margin-left: auto">
          <span style="font-size: 11.5px; font-weight: 700; color: #4F5F68">Potiahni ju na mapu</span>
          {music && (
            <button data-testid="music" onClick={music.toggle} aria-pressed={music.on} aria-label={music.on ? 'Vypnúť hudbu' : 'Zapnúť hudbu'} title={music.on ? 'Vypnúť hudbu' : 'Zapnúť hudbu'}
              style={`flex: none; width: 30px; height: 30px; border-radius: 9px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; background: ${music.on ? '#1E2B33' : '#EEF2F4'}; color: ${music.on ? '#FFFFFF' : '#4F5F68'}`}>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l11-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="17" cy="16" r="3"></circle>{!music.on && <path d="M3 3l18 18"></path>}</svg>
            </button>
          )}
        </span>
      </div>
      <div class="nv-cards">
        {ITEMS.map((it) => {
          const mwText = fmtNum(it.mw) + ' MW' + (it.hours ? ' / ' + fmtNum(it.mw * it.hours) + ' MWh' : '');
          const buildText = it.build >= 365 ? (it.build / 365).toFixed(1).replace('.', ',').replace(',0', '') + ' r.' : Math.round(it.build / 30) + ' mes.';
          return (
            <button class="nv-card" data-type={it.type} aria-label={it.name + ', ' + fmtMoney(it.price) + ', ' + it.mw + ' MW. ' + it.rule + '. Potiahni na mapu.'}
              onPointerDown={(e) => onStart(it.type, e as PointerEvent)} onDragStart={(e) => e.preventDefault()}
              style={`touch-action: none; cursor: grab; border: 1px solid #DCE5E9; background: #FFFFFF; border-radius: 16px; padding: 7px 6px; font-family: 'Nunito', sans-serif; color: #1E2B33; opacity: ${money - it.price >= -CREDIT ? 1 : 0.45}`}>
              <span class="nv-pic" style={`border-radius: 11px; background: ${it.tint}; display: flex; align-items: flex-end; justify-content: center; overflow: hidden`} dangerouslySetInnerHTML={{ __html: ITEM_ICONS[it.type] }} />
              <span class="nv-cardtxt">
                <span style="font-size: 12px; font-weight: 800; line-height: 1.15">{it.name}</span>
                <span style="font-family: 'Fredoka', sans-serif; font-weight: 600; font-size: 13.5px">{fmtMoney(it.price)}</span>
                <span style="font-size: 10.5px; font-weight: 700; color: #4F5F68">{mwText} · {buildText}</span>
                <span style="font-size: 10.5px; font-weight: 700; color: #2B6CA3">{it.rule}</span>
              </span>
            </button>
          );
        })}
      </div>
      {moving && <div style="position: absolute; left: 8px; right: 8px; top: 8px; bottom: 8px; border-radius: 18px; border: 2px dashed #C0392B; background: rgba(251,228,220,0.95); display: flex; align-items: center; justify-content: center; text-align: center; padding: 12px; font-size: 14px; font-weight: 800; color: #8E2A17; pointer-events: none">Pusti sem a stavba sa zbúra</div>}
    </section>
  );
}
