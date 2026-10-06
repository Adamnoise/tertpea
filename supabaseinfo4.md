Frissítem a live függvény metaadatait, és csak olvasással ellenőrzöm az adatbázisban a promote RPC definícióját és jogosultságait. A rendelkezésre álló eszközök nem adnak hozzáférést a telepített Edge Function forráskódjához vagy a GitHub-repó fájljaihoz, ezért az általad közölt forrásmegállapításokat nem fogom saját ellenőrzött tényként feltüntetni.
# Frissített audit és backend-javítási terv

Köszönöm a pontosítást. **A forrásmegállapításokat a te read-only vizsgálatod eredményeként kezelem; az Edge Function kódját én továbbra sem tudtam közvetlenül beolvasni.** A live leltárból most is csak azt tudom megerősíteni, hogy a `winmix-ingest` aktív, v2-es és `verify_jwt = true`. A repository hívóit továbbra sem tudom ellenőrizni.

## Ellenőrzött adatbázis-rész

A `winmix_promote_data_version(uuid)` definícióját és jogosultságait újra, csak olvasással ellenőriztem:

- `SECURITY DEFINER`, rögzített `search_path` (`public, pg_temp`).
- Csak a `service_role` jogosult meghívni; `anon` és `authenticated` nem.
- Csak `sealed` adatverziót fogad el, az előző current verziót kikapcsolja, majd a megadott verziót current-re állítja.
- Az adatverziót frissítő triggeregyüttes a `draft → sealed` átmenetnél ellenőrzi a szezonok, hashek és meccsszámok meglétét; a deferred constraint trigger lezárt verzió után pontosan egy current verziót követel meg.

Ezért az általad leírt Edge Function-viselkedés — előbb lezárás, aztán promote RPC — valóban **publikálási folyamat**, nem pusztán import. Ezt a forráskód nélkül nem tudtam önállóan megerősíteni, de a promote RPC feltételei összhangban vannak a leírással.

A korábban kiolvasott két import RPC továbbra sem oldja meg ezt a problémát: egyik sem fogad source kulcsot, az `ingest_season_csv` pedig közvetlenül is végrehajtható az `authenticated` szerep számára, operátor/admin claim-ellenőrzéssel. Ezek ezért külön kezelendő, potenciális kulcs nélküli utak.

## Javított függőségi kép

Az **általad beolvasott live forrás leírása alapján** a jelenlegi út:

`operátori kliens → winmix-ingest Edge Function → közvetlen PostgREST írások (data version / season / matches) → winmix_promote_data_version RPC`

A leírás szerint a függvény `seasons[]` JSON-t vár, szerveroldali service-role titkot és `X-Admin-Token`-t használ, majd meccseket külön, 200-as adagokban ír. A repositoryból származó klienshívókat és azok pontos payloadját **nem vizsgáltuk**; a GitHubon jelenleg csak a `supabaseinfo3.md` elérhetőségét a te közlésed alapján veszem figyelembe.

A külön REST-írások és az automatikus lezárás/promote együtt azt jelentik, hogy a leírás szerinti út jelen formában **nem alkalmas új, éles CSV-import biztonságos futtatására**. Egy részleges írás után a függvény hibázhat úgy, hogy már létrehozott rekordok maradnak; a lezárt verzió pedig a jelenlegi triggerekkel nem kezelhető egyszerűen eldobható draftként.

## Javasolt backend-változtatás — még csak terv

1. **Egyetlen új, verziózott adatbázis-RPC** fogadja a teljes importcsomagot: adatverzió-metaadat, valamint valamennyi liga szezonjai és meccsei. Egy RPC-hívás tranzakciójában validáljon és írjon mindent; a `winmix-ingest` ne végezzen több közvetlen REST-beszúrást.
2. Minden szezon payloadjában legyen kötelező, trimelés után nem üres `source_season_key`. A `(league, trimmed source key)` index maradjon az egyediségi végső védelmi vonal.
3. **Az import RPC csak draft adatverziót hozhat létre vagy tölthet fel.** Ne állítson `sealed` státuszt, ne hívja a promote RPC-t, és ne állítson `is_current` értéket. Lezárás és publikálás külön, későbbi ellenőrzési folyamat legyen.
4. Idempotenciához azonos ligájú source kulcs és azonos kanonikus tartalom esetén az RPC térjen vissza az eredeti import eredményével írás nélkül; azonos kulcs, eltérő tartalom esetén adjon konfliktust, változtatás nélkül. A kulcs másik ligában megengedett.
5. A teljes validáció történjen szerveroldalon, még az első írás előtt: pontos fejléc, 240 sor, 30 egymást követő nyolcas blokk, a nyers `HH:MM` értékek és sorrendjük, 16 ligaazonos csapat, csapatonként 30 szereplés, 15 hazai és 15 vendégszereplés, 240 egyedi irányított párosítás, referencia-pároshalmaz, egész és nemnegatív HT/FT értékek, valamint source-key ellenőrzések. A `date` maradjon szöveg; `kickoffIso` ne legyen a mező alternatívája, ha a forrásban virtuális időcsoportot jelent.
6. A Edge Function ellenőrizze a kérést és az operátori jogosultságot, majd **egyetlen RPC-t** hívjon. A JWT-ellenőrzés és az `X-Admin-Token` használatának pontos, jelenlegi jogosultsági szemantikáját a forrás megtekintése nélkül nem tudom auditálni. A service-role titok szerveroldali maradjon.

### Tervezett fájlszintű munkák

- **Új migráció:** új, tranzakciós import-RPC és annak validációs/idempotencia-logikája.
- **`winmix-ingest` deployed forrása:** a közvetlen REST-írások és az automatikus seal/promote leválasztása; új, egyetlen import-RPC hívás és részletes hibaválasz. A pontos fájl- és kóddiffhez a live forrásra szükségem van.
- **Fixture-tesztcsomag:** izolált környezetben futó payload-validációs és tranzakciós tesztek. A tényleges repository tesztútvonalát és futtatóját nem tudtam megvizsgálni.
- **Régi importutak végrehajtási jogosultságai:** külön változtatás és külön jóváhagyás. Korlátozásukig továbbra is fennállhat source-key nélküli importút; RLS/ACL-t nem módosítottam.

A korábban kért tesztmátrixot — 239/241 sor, rossz időcsoportok, hibás csapat/pontszám, párosítás- és source-key ütközések, idempotens újraküldés és eltérő tartalmú ütközés — a megvalósítás után fixture-ökkel kell lefuttatni. **Most nem futtattam tesztet vagy importot.**

## Jóváhagyás és szükséges forrás

A fenti terv nem pontos végrehajtható diff, ezért az általános „jóváhagyom” nem használható még a kód megváltoztatására. Ehhez szükségem van a live `winmix-ingest` titkoktól megtisztított forrására, valamint — ha elérhető — a payloadot előállító kliens vagy egy érzékeny adat nélküli mintakérés anyagára. Addig nem készítek kész kóddiffet, és nem hajtok végre módosítást.

**Ebben a körben kizárólag read-only vizsgálat történt; séma, adat, Edge Function-kód és jogosultság nem változott.**
