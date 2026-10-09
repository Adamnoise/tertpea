# WinMix — a mentés áttekintése

Forrás: `winmix_pipeline_db_v2_2026-09-15.md` · séma: `3` · export: `2026-09-15T11:48:56.033Z`

**103 szezon · 24,720 mérkőzés · 24,720 pipeline**

| Liga | Szezon | Meccs | Érvényes HT | Hiányzó HT | Dátum/ISO hiányzik |
|---|---:|---:|---:|---:|---:|
| angol | 62 | 14880 | 9360 | 5520 | 14880 |
| spanyol | 41 | 9840 | 9840 | 0 | 9840 |

## Hol mit találsz?

| Mappa | Tartalom |
|---|---|
| `00_attekintes` | Ez az összefoglaló, darabszámok, adatminőségi események, mezőkatalógus. |
| `01_beallitasok` | Beállítások és alapmetaadatok. |
| `02_csapatok` | Csapatsúlyok, aliasok, a meccsekben szereplő tényleges nevek. |
| `03_szezonok` | Szezonlista és szezononkénti adatlefedettség. |
| `04_merkozesek` | Meccsek, FT/HT, forrásmezők, külön jelölt eredményszámítások. |
| `05_pipeline` | Döntések, confidence, context, feature-ök, B0/B1/M1/ensemble/kalibrált becslések, reconciliation. |
| `06_piacok` | A teljes secondary objektum; a topScores külön táblában is. |
| `07_kalibracio` | Liga- és piaci összefoglalók, sávok, illesztési előzmények, kísérletek. |
| `08_eredeti` | Minden eredeti gyökérmező és minden teljes szezon változatlan JSON-adattartalommal. |

## Az adatok értelmezése

- A program adatbontást végez; nem tanít új modellt, nem módosít döntéseket és nem alkalmaz új Core-kapukat.
- Az eredeti mezők a `data` alatt, a kapcsolási azonosítók a `ref` alatt, az új számítások a `derived` alatt találhatók.
- A `ref.match_key` a fájlon belüli szezon- és meccspozícióból képzett technikai kulcs; nem globális meccsazonosító.
- A valószínűségek változatlan 0–1 értékek. A `confidence` ezen mentésben 0–100 skálán tárolt érték; nem osztjuk el automatikusan.
- A hiányzó HT megmarad `null`-nak. A 0–0 érvényes eredmény, ha mindkét gólmező egész szám.
- Az eredeti sorrend megmarad. A puszta HH:mm időpontból és a createdAt importidőből nem készül kitalált mérkőzésdátum.
- A mentett kalibrációs mutatók átvett adatok, nem ebben a futásban ellenőrzött walk-forward teljesítménymérés.
- Nincs automatikus duplikátumtörlés. Az azonosítók ütközéseit az audit jelzi.
- A nyers másolatok JSON-szinten őrzik az adatokat; a behúzás, a számalak és a BOM eltérhet az eredeti bájtoktól.

## Adatminőség

Információs esemény: 5521; figyelmeztetés: 0; hiba: 0.

- `HT_MISSING`: 5520
- `KICKOFF_ISO_MISSING`: 1

## Mentett döntések és ajánlások

```json
{
  "angol": {
    "decision": {
      "volatile": 7550,
      "ignore": 7128,
      "actionable": 202
    },
    "recommendation": {
      "NO_CLEAR_EDGE": 12104,
      "HOME_WIN": 2387,
      "AWAY_WIN": 389
    },
    "dataSufficiency": {
      "cold": 2480,
      "warm": 4960,
      "hot": 7440
    }
  },
  "spanyol": {
    "decision": {
      "volatile": 4842,
      "ignore": 4840,
      "actionable": 158
    },
    "recommendation": {
      "NO_CLEAR_EDGE": 8128,
      "HOME_WIN": 1537,
      "AWAY_WIN": 175
    },
    "dataSufficiency": {
      "cold": 1640,
      "warm": 3280,
      "hot": 4920
    }
  }
}
```

A mezők jelentését és megfigyelt típusait a `mezokatalogus.json` tartalmazza. A teljes fájllista, táblasorszámok és SHA-256 ellenőrzőösszegek a gyökérben lévő `manifest.json` fájlban vannak.
