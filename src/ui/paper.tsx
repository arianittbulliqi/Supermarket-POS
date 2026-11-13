/** On-screen receipt, drawn from the same lines the printer gets. */
import { qrSvg } from '../print/qr';
import type { Line } from '../print/receipt';

export function Paper({ lines, width = 320 }: { lines: Line[]; width?: number }) {
  return (
    <div className="paper" style={{ width, background: '#fff', color: '#111', fontFamily: '"SF Mono",Menlo,Consolas,"Courier New",monospace', fontSize: 11, lineHeight: '14px', padding: '14px 16px', boxShadow: '0 2px 4px rgba(0,0,0,.06),0 12px 30px rgba(0,0,0,.1)', display: 'flex', flexDirection: 'column', gap: 2 }}>
      {lines.map((x, i) => {
        if (x === 'rule') return <hr key={i} style={{ border: 0, borderTop: '1px dashed #5B665F', margin: '6px 0', width: '100%' }} />;
        if ('qr' in x)
          return (
            // the SVG is drawn by the QR library from the receipt's own data, never from user HTML
            <div key={i} title="Receipt QR code" style={{ width: 120, margin: '6px auto 4px' }} dangerouslySetInnerHTML={{ __html: qrSvg(x.qr) }} />
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
