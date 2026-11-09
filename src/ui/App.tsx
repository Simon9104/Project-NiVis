import { useEffect, useRef } from 'preact/hooks';
import { createMap } from '../map/map';
import { viewAll } from '../map/camera';

export function App() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    createMap(ref.current!).then((m) => { if (!alive) return; (window as any).__map = m; viewAll(m); (window as any).__mapReady = true; });
    return () => { alive = false; };
  }, []);
  return <div ref={ref} style={{ position: 'absolute', inset: 0 }} />;
}
