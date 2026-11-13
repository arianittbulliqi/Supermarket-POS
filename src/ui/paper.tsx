/** On-screen receipt, drawn from the same lines the printer gets. */
import type { Line } from '../print/receipt';

export function Paper({ lines, width = 320 }: { lines: Line[]; width?: number }) {
  return (
    <div className="paper" style={{ width, background: '#fff', color: '#111', fontFamily: '"SF Mono",Menlo,Consolas,"Courier New",monospace', fontSize: 11, lineHeight: '14px', padding: '14px 16px', boxShadow: '0 2px 4px rgba(0,0,0,.06),0 12px 30px rgba(0,0,0,.1)', display: 'flex', flexDirection: 'column', gap: 2 }}>
      {lines.map((x, i) => {
        if (x === 'rule') return <hr key={i} style={{ border: 0, borderTop: '1px dashed #5B665F', margin: '6px 0', width: '100%' }} />;
        if ('qr' in x)
          return (
            <div key={i} title={x.qr} style={{ width: 84, height: 84, margin: '6px auto 4px', border: '2px solid #111', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
              QR
              <br />
              check
            </div>
          );
        const style = { fontWeight: x.bold ? 800 : 400, fontSize: x.big ? 14 : 11, lineHeight: x.big ? '18px' : '14px', textAlign: x.center ? ('center' as const) : undefined };
        return x.r != null ? (
          <div key={i} style={{ ...style, display: 'flex', gap: 6, whiteSpace: 'pre' }}>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>{x.l}</span>
            <span>{x.r}</span>
          </div>
        ) : (
          <div key={i} style={{ ...style, whiteSpace: 'pre-wrap' }}>{x.l}</div>
        );
      })}
    </div>
  );
}
