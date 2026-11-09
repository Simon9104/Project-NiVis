// Map legend – same items as the original, colours matched to the OpenStreetMap base map
export function Legend() {
  const row = (sw: string, label: string) => <span style="display: flex; align-items: center; gap: 10px"><span style={sw}></span>{label}</span>;
  return (
    <div class="nv-legend nv-glass" role="region" aria-label="Legenda mapy" style="padding: 12px; display: flex; flex-direction: column; gap: 7px; font-size: 12px; font-weight: 700">
      {row('flex: none; width: 26px; height: 6px; border-radius: 3px; background: #2B7BB9; box-shadow: 0 0 0 2px #D8EEFA', 'Rieka (s názvom)')}
      {row('flex: none; width: 26px; height: 14px; border-radius: 4px; background: #8EC3E6; box-shadow: 0 0 0 1px #2B7BB9', 'Jazero / vodná nádrž')}
      {row('flex: none; width: 26px; height: 3px; background: repeating-linear-gradient(90deg, #6B7F8C 0 6px, transparent 6px 9px); box-shadow: 0 0 0 2px #FFFFFF', 'Hranica Slovenska')}
      {row('flex: none; width: 26px; height: 14px; border-radius: 4px; background: rgba(46,125,50,0.18); border: 1.5px dashed #2E7D32; box-sizing: border-box', 'Národný park (bez vetra a uhlia)')}
      {row('flex: none; width: 26px; height: 5px; border-radius: 2px; background: #E892A2', 'Diaľnica')}
      {row('flex: none; width: 26px; height: 3px; border-radius: 2px; background: #FCD6A4', 'Cesta')}
      {row('flex: none; width: 26px; height: 14px; border-radius: 4px; background: #E8DED3', 'Mesto')}
      {row('flex: none; width: 26px; height: 14px; border-radius: 4px; background: #A8C78B', 'Les')}
      {row('flex: none; width: 26px; height: 14px; border-radius: 4px; background: #E8D9B5; opacity: 0.8', 'Stavba vo výstavbe')}
      <span style="font-size: 11px; font-weight: 600; color: #4F5F68; line-height: 1.35">Mapa: © OpenStreetMap contributors, OpenFreeMap, © OpenMapTiles. Výšky terénu: Mapzen / AWS Terrain Tiles (SRTM, EU-DEM).</span>
    </div>
  );
}
