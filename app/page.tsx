import {
  getCurrentWinmixDataVersion,
  getWinmixDataVersions,
} from '@/lib/supabase/server'

export default async function Page() {
  const [{ data: currentVersion, error: currentError }, { data: versions, error }] =
    await Promise.all([getCurrentWinmixDataVersion(), getWinmixDataVersions()])

  const queryError = currentError ?? error

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#f7f8fa',
        color: '#172033',
        fontFamily: 'Arial, sans-serif',
        padding: '48px 24px',
      }}
    >
      <section style={{ maxWidth: 960, margin: '0 auto' }}>
        <p style={{ margin: 0, color: '#667085', fontSize: 14, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase' }}>
          WinMix adatközpont
        </p>
        <h1 style={{ margin: '10px 0 8px', fontSize: 'clamp(32px, 6vw, 52px)', letterSpacing: -1.5 }}>
          Adatverziók
        </h1>
        <p style={{ margin: '0 0 32px', maxWidth: 620, color: '#667085', lineHeight: 1.6 }}>
          A Supabase-ből betöltött historikus szezon- és mérkőzésadatok állapota.
        </p>

        {queryError ? (
          <div style={{ border: '1px solid #f1b8b8', borderRadius: 16, background: '#fff5f5', color: '#9b2c2c', padding: 20 }}>
            Nem sikerült betölteni az adatverziókat. Ellenőrizd a Supabase-hozzáférést és az RLS-szabályokat.
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16, marginBottom: 28 }}>
              <Stat label="Aktuális verzió" value={currentVersion?.version_key ?? 'Nincs kijelölve'} />
              <Stat label="Státusz" value={currentVersion?.status ?? '—'} />
              <Stat label="Szezonok" value={currentVersion?.season_count?.toLocaleString('hu-HU') ?? '—'} />
              <Stat label="Mérkőzések" value={currentVersion?.match_count?.toLocaleString('hu-HU') ?? '—'} />
            </div>

            <div style={{ overflowX: 'auto', border: '1px solid #e4e7ec', borderRadius: 18, background: '#fff' }}>
              <table style={{ width: '100%', minWidth: 700, borderCollapse: 'collapse', textAlign: 'left' }}>
                <caption style={{ padding: '20px 20px 12px', fontSize: 18, fontWeight: 700, textAlign: 'left' }}>
                  Legutóbbi adatverziók
                </caption>
                <thead>
                  <tr style={{ color: '#667085', fontSize: 13 }}>
                    {['Verzió', 'Státusz', 'Szezonok', 'Mérkőzések', 'Frissítve'].map((heading) => (
                      <th key={heading} style={{ borderBottom: '1px solid #e4e7ec', padding: '12px 20px', fontWeight: 600 }}>{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(versions ?? []).map((version) => (
                    <tr key={version.version_key}>
                      <td style={cellStyle}><strong>{version.version_key}</strong>{version.is_current && <span style={badgeStyle}>aktuális</span>}</td>
                      <td style={cellStyle}>{version.status}</td>
                      <td style={cellStyle}>{version.season_count?.toLocaleString('hu-HU') ?? '—'}</td>
                      <td style={cellStyle}>{version.match_count?.toLocaleString('hu-HU') ?? '—'}</td>
                      <td style={cellStyle}>{new Date(version.updated_at).toLocaleString('hu-HU')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div style={{ borderRadius: 16, background: '#172033', color: '#fff', padding: 20 }}><p style={{ margin: '0 0 8px', color: '#aab4c5', fontSize: 13 }}>{label}</p><p style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{value}</p></div>
}

const cellStyle = { borderBottom: '1px solid #f0f2f5', padding: '16px 20px', whiteSpace: 'nowrap' as const }
const badgeStyle = { display: 'inline-block', marginLeft: 8, borderRadius: 999, background: '#e6f4ed', color: '#18794e', padding: '4px 8px', fontSize: 11, fontWeight: 700 }
