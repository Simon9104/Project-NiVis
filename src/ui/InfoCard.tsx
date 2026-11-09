import type { PlantInfo } from '../sim/report';

export function InfoCard({ info, onClose }: { info: PlantInfo; onClose: () => void }) {
  return (
    <div class="nv-info nv-glass" data-testid="info" style="padding: 12px; display: flex; flex-direction: column; gap: 6px">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px">
        <span style="font-family: 'Fredoka', sans-serif; font-weight: 600; font-size: 15px; line-height: 1.2">{info.name}</span>
        <button aria-label="Zavrieť" onClick={onClose} style="flex: none; width: 28px; height: 28px; border-radius: 8px; border: none; background: #EEF2F4; color: #1E2B33; cursor: pointer; font-size: 16px; line-height: 1">×</button>
      </div>
      <span style={`font-size: 12px; font-weight: 800; color: ${info.color}`}>{info.status}</span>
      {info.rows.map((r) => <div style="display: flex; justify-content: space-between; gap: 8px; font-size: 12px; font-weight: 700"><span style="color: #4F5F68">{r.k}</span><span style="text-align: right">{r.v}</span></div>)}
    </div>
  );
}
