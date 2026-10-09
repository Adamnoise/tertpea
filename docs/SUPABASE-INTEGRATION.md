# Supabase adatbázis bekötése Vite projektbe

Ez a dokumentum bemutatja, hogyan lehet a `dpmyxypqcsugycqhifaf.supabase.co` Supabase-projektet egy már elkészült Vite + React alkalmazásba bekötni.

## 1. Előfeltételek

- Node.js és npm telepítve
- Működő Vite projekt
- Hozzáférés a Supabase projekthez
- A projekt publikus, frontendből használható kulcsa

A böngészőben kizárólag a publishable/anon kulcs használható. Soha ne kerüljön frontend kódba a `SUPABASE_SERVICE_ROLE_KEY` vagy `SUPABASE_SECRET_KEY`.

## 2. Csomag telepítése

A Vite projekt gyökérkönyvtárában futtasd:

```bash
npm install @supabase/supabase-js
```

Ha pnpmet használsz:

```bash
pnpm add @supabase/supabase-js
```

## 3. Környezeti változók

A projekt gyökerében hozz létre egy `.env.local` fájlt:

```env
VITE_SUPABASE_URL=https://dpmyxypqcsugycqhifaf.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=ide_kerul_a_publishable_key
```

A `VITE_` előtag kötelező, mert a Vite csak az ilyen nevű változókat teszi elérhetővé a kliensoldali kódban.

A `.env.local` fájlt ne commitáld Gitbe. Ellenőrizd, hogy a `.gitignore` tartalmazza:

```gitignore
.env
.env.*
!.env.example
```

Érdemes létrehozni egy `.env.example` fájlt is, valódi kulcs nélkül:

```env
VITE_SUPABASE_URL=https://dpmyxypqcsugycqhifaf.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=
```

## 4. Supabase kliens létrehozása

Hozd létre a `src/utils/supabase.ts` fájlt:

```ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Hiányzó Supabase környezeti változó.')
}

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
)
```

A kliens ezután bárhonnan importálható:

```ts
import { supabase } from './utils/supabase'
```

Az import útvonala a fájl helyétől függően változhat.

## 5. Első adatlekérdezés

A Supabase lekérdezéseket lehetőleg külön adatfüggvényekbe szervezd. Példa a WinMix adatverziók lekérésére:

```ts
import { supabase } from '../utils/supabase'

export type WinmixDataVersion = {
  version_key: string
  status: string | null
  is_current: boolean
  season_count: number | null
  match_count: number | null
  source_description: string | null
  sealed_at: string | null
  updated_at: string
}

export async function getWinmixDataVersions() {
  const { data, error } = await supabase
    .from('winmix_data_versions')
    .select(
      'version_key, status, is_current, season_count, match_count, source_description, sealed_at, updated_at',
    )
    .order('is_current', { ascending: false })
    .order('updated_at', { ascending: false })

  if (error) {
    throw error
  }

  return data as WinmixDataVersion[]
}
```

Ne használj `select('*')` lekérdezést éles alkalmazásban, ha nincs rá szükség. Csak a felülethez szükséges oszlopokat kérd le.

## 6. Lekérdezés React komponensből

Példa egy egyszerű React komponensre:

```tsx
import { useEffect, useState } from 'react'
import {
  getWinmixDataVersions,
  type WinmixDataVersion,
} from './data/winmix'

export default function DataVersions() {
  const [versions, setVersions] = useState<WinmixDataVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadVersions() {
      try {
        const data = await getWinmixDataVersions()
        if (!cancelled) setVersions(data)
      } catch {
        if (!cancelled) setError('Az adatok betöltése sikertelen.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadVersions()

    return () => {
      cancelled = true
    }
  }, [])

  if (loading) return <p>Betöltés...</p>
  if (error) return <p role="alert">{error}</p>

  return (
    <ul>
      {versions.map((version) => (
        <li key={version.version_key}>
          {version.version_key} — {version.status ?? 'ismeretlen állapot'}
        </li>
      ))}
    </ul>
  )
}
```

## 7. Javasolt projektstruktúra

```text
src/
├── data/
│   └── winmix.ts
├── utils/
│   └── supabase.ts
├── components/
│   └── DataVersions.tsx
├── App.tsx
└── main.tsx
```

A Supabase-klienst az `utils` könyvtárban, a táblánkénti lekérdezéseket pedig a `data` könyvtárban érdemes tartani.

## 8. WinMix táblák használata

A frontendben ne találj ki mezőneveket: mindig a Supabase aktuális sémájához igazodj. A WinMix alkalmazás fő adatcsoportjai:

- `winmix_data_versions` — adatverziók és verzióállapotok
- `winmix_seasons` — szezonok
- `winmix_teams` — csapatok
- `winmix_matches` — mérkőzések
- `winmix_predictions` — mérkőzés-előrejelzések
- `winmix_engine_jobs` és `winmix_engine_runs` — motorfeladatok és futások
- `winmix_round_requests`, `winmix_round_fixtures`, `winmix_round_selections` — köralapú előrejelzési folyamat
- `winmix_calibration_bins` és `winmix_calibration_results` — kalibrációs eredmények
- `winmix_pair_penalty` és `winmix_pair_penalty_events` — páros büntetési állapot és eseménynapló

A kapcsolódó rekordokat az adatbázis idegenkulcsai alapján kezeld. Például mérkőzések lekérésénél ellenőrizd a `season_id`, `home_team_id`, `away_team_id` és `data_version_id` kapcsolatokat.

## 9. RLS és jogosultságok

A publishable/anon kulcs nem jelent teljes hozzáférést. A Supabase Row Level Security szabályai döntik el, hogy a frontend mit olvashat és módosíthat.

Éles rendszerben:

- minden publikus sémában lévő üzleti táblán legyen bekapcsolva az RLS;
- csak a szükséges `SELECT`, `INSERT`, `UPDATE` és `DELETE` műveleteket engedélyezd;
- felhasználói adatoknál mindig tulajdonoshoz vagy jogosultsághoz kösd a policy-t;
- a service role és secret kulcs soha ne kerüljön Vite-ba;
- hiba esetén a frontendnek általános hibaüzenetet jeleníts meg, ne a teljes adatbázis-hibát.

Ha a WinMix adatok nyilvános olvasásra készültek, akkor is csak a szükséges oszlopokra és műveletekre adj hozzáférést.

## 10. Fejlesztői ellenőrzés

A fejlesztői szerver indítása:

```bash
npm run dev
```

Ha a környezeti változók módosultak, indítsd újra a Vite szervert. Ellenőrizd a böngésző konzolját, és teszteld, hogy a lekérdezés:

1. nem ad `undefined` Supabase URL hibát;
2. nem ad jogosultsági vagy RLS hibát;
3. adatot vagy üres tömböt ad vissza hibamentesen;
4. hálózati hiba esetén megfelelő állapotot jelenít meg.

## 11. Build és telepítés

Build készítése:

```bash
npm run build
```

A Vercel, Netlify vagy más tárhely beállításaiban ugyanazokat a változókat add meg:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

A Vite ezeket build időben beégeti a kliensbe, ezért csak publikus/publishable kulcs használható.

## 12. Gyakori hibák

### `supabaseUrl is required`

A `.env.local` hiányzik, rossz a változónév, vagy a Vite szerver nem lett újraindítva.

### `Invalid API key`

Ellenőrizd, hogy a publishable/anon kulcsot használod-e, és nincs-e benne felesleges idézőjel vagy szóköz.

### Üres eredmény hiba nélkül

Ez gyakran RLS-policy miatt történik. Ellenőrizd, hogy az adott szerepkörnek van-e `SELECT` hozzáférése.

### `relation does not exist`

A lekérdezett táblanév nem egyezik az aktuális Supabase sémával. Használd a tényleges WinMix táblanevet, például `winmix_data_versions`.

## Rövid összefoglaló

A bekötés lényege:

1. telepítsd az `@supabase/supabase-js` csomagot;
2. add hozzá a `VITE_SUPABASE_URL` és `VITE_SUPABASE_PUBLISHABLE_KEY` változókat;
3. hozd létre az egyetlen közös Supabase-klienst;
4. külön adatfüggvényekből kérdezd le a WinMix táblákat;
5. kezeld a loading, error és empty állapotokat;
6. az adatbázis biztonságát RLS-policykkal biztosítsd.

A csatolt setup-kód jó kiindulási pont, de éles alkalmazásban érdemes a lekérdezéseket típusos, külön adatfájlokba szervezni, és mindig a Supabase aktuális sémáját követni.
