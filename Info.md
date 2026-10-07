Megvan a két anyag szerepe: az első a végleges tervezési prompt, a második az adat-valóság dokumentáció, amely a prompt kiegészítését javasolja. A kettőt összeolvasztva adom meg a végleges, egyben másolható utasítást — de előbb öt olyan feszültséget jelölnék, amit az egyesítésnél nem szabad simán átugrani, mert mindegyik közvetlenül érinti a mérési alapot.

## Kritikus feszültségek az adatok és a tervezet között

| # | Adat-valóság | Következmény a tervre | Kezelés |
|---|---|---|---|
| 1 | A `date` mező csak óra–perc, nincs naptári dátum és időzóna | Az „időrendhelyes visszamérés" (1. fázis) jelenleg nem igazolható | A sorrend-helyreállítás a 0. fázis **blokkoló** feladata: a `winmix_matches_rows-2.csv` szezonazonosító + mérkőzéssorszám mezőiből kell rekonstruálni, ellenőrzött csoportosítással. Ha ez nem sikerül, a visszamérés hatókörét csökkenteni kell |
| 2 | Nincs következő forduló párosításlistája az adatokban | A Core alapfunkciója (16 mérkőzés elemzése) bemenet nélkül marad | A párosítás-bevitel (import vagy kézi rögzítés) **külön, kötelező követelmény** — ez nem oldódik meg az elemzési logikával |
| 3 | Nincsenek előre rögzített modellpredikciók | A Prediction Ledger üresen indul | Két dolgot külön kell választani: *replay* (rekonstruált jellemzőkkel visszaszámolt múlt — „utólagos rekonstrukció" címkével) és *valódi elszámolás* (csak előre, élőben keletkező ledger). A kettőt soha nem szabad együtt jelenteni |
| 4 | A súlyok/ratingek export-pillanatképek | Szivárgásveszély: a visszamérésben „jövőbeli" információ kerülhet a jellemzőkbe | As-of szabály: minden rating/súly csak akkor használható egy múltbeli meccshez, ha a pillanatkép időbélyege bizonyíthatóan megelőzi azt. Ellenkező esetben a jellemző „nem elérhető" |
| 5 | Nincs odds, xG, gólperc, játékosadat, generátorbelső | Az EV/Kelly, gólpercelemzés adathiányból is kizárt; a drift csak statisztikai jelzés | Már a halasztási listán van — most már nem preferencia, hanem adati tény. A fordulóstruktúra-hipotézis (3–5 BTTS stb.) az adatokon tesztelhető, de generátorszinten nem magyarázható |

Két pozitívum, amit érdemes explicit beépíteni: (a) az egyszerű referencia modell **kiszámítható** a meglévő CSV-kből (ligaszezonos BTTS-bázisarány + empirikus H2H-arány) — ez szilárd alapot ad a 3. fázis összevetéséhez; (b) a `date` HH:MM értékei nagy valószínűséggel generátor-ütemezési jelölések, nem valós kezdési idők — erre nem szabad fáradtság/időnapi jellemzőt építeni ellenőrzés nélkül.

## Végleges, egyesített tervezési prompt

```text
FELADAT: WinMix Master Specification és fejlesztési tervezet készítése

A meglévő WinMix rendszert kell feltérképezned, majd annak
továbbfejlesztésére bizonyítékokra épülő, fázisokra bontott
tervezetet készítened.

MOST NEM IMPLEMENTÁCIÓT KÉREK.
Ne kezdj kódolásba vagy a rendszer átalakításába.
A feladat olvasási célú audit, követelménypontosítás és tervezés.

ANYAGOK KEZELÉSE:
- A korábbi AI-javaslatok háttéranyagok. Nem automatikusan
  elfogadott követelmények. A bennük lévő választervezési
  jegyzetek nem fejlesztési utasítások.
- A feltöltött CSV-k és adatbázis-exportok adatai a kizárólagos
  adatforrás-jegyzéket képezik. Ami nincs bennük, az nem létezik
  a tervezés szempontjából.

1. A WINMIX KÖZPONTI CÉLJA

A rendszer a virtuális angol és spanyol bajnokságok historikus
és az előrejelzéskor már ismert friss eredményeiből elemezze
a következő forduló 16 mérkőzését: 8 angol és 8 spanyol találkozót.

Elsődleges cél:
legfeljebb három külön mérkőzéshez a legjobban alátámasztott
BTTS Igen ajánlás kiválasztása.

A Core kimenete lehet 0, 1, 2 vagy 3 ajánlás.
Nem követelmény minden fordulóban három hely kitöltése.

A Core helyeit nem töltheti ki BTTS Nem, Over 2,5 vagy más
piacra történő automatikus átváltással.
Más piacok külön, kiegészítő elemzésként szerepelhetnek.

A rendszer ne ígérjen biztos eredményt.
Mutassa meg az ajánlás alapját, bizonytalanságát és kockázatait.

2. ADAT-VALÓSÁG ÉS ADATKORLÁTOK

Kizárólagosan elérhető adatok:
- Szezon CSV-k (pl. 1.csv, 1-2.csv): date (CSAK óra–perc!),
  home_team, away_team, ht_home_score, ht_away_score,
  home_score, away_score.
- winmix_matches_rows-2.csv: mérkőzés- és szezonazonosító,
  liga, mérkőzéssorszám, csapatazonosítók, HT/FT eredmények,
  összgól, BTTS és kimenetel mezők.
- winmix_seasons_rows-4.csv: szezonazonosító, liga, szezonindex,
  név, fájlnév, tartalomhash, meccsszám, rendezési mód,
  létrehozási idő.
- winmix_teams_rows-3.csv: csapatazonosító, liga, kanonikus kulcs,
  megjelenített név, súlyindex, súlyforrás, frissítési idő.
- view_team_ratings_rows-5.csv: lejátszott meccsszám, net_home,
  net_away, ppg, automatikus súlyindex.

Számítható származtatott mutatók (nem forrásadatok):
BTTS Igen/Nem, összgól, Over/Under, hazai/döntetlen/vendég,
HT/FT kategória, második félidő gólszáma; ellenőrzött sorrend
és csoportosítás mellett csapatforma, H2H-arányok,
fordulónkénti BTTS-szám.

NINCS és ne feltételezz:
odds és oddsmozgás, xG, lövések, labdabirtoklás, helyzetadatok,
gólok percei, eseménynapló, játékosok, kezdőcsapatok,
sérülések, eltiltások, a véletlengenerátor algoritmusa/seedje/
igazolt motorverziója, előre rögzített modellpredikciók
teljes verziótörténettel, automatikusan elérhető következő
fordulós párosításlista.

Következmények, amiket tartani kell:
- EV, tétezési javaslat, gólpercalapú elemzés, a generátor
  működésének bizonyított leírása nem tervezhető meglévő
  adatból elérhető funkcióként.
- A csapatnevek (pl. „London Ágyúk”, „Manchester Kék”,
  „Madrid Fehér”) virtuálisak. Illeszteni kell a törzsadatokhoz
  (kanonikus kulcs, megjelenített név), nem valódi klubazonosság.
- A date mező óra–perc értékei nem biztosítanak naptári
  sorrendet vagy időzónát. Időbeli jellemzőt, napszaki vagy
  fáradtságközeli hatást ne építs rájuk ellenőrzés nélkül.
  Feltételezhetően generátor-ütemezési jelölés.
- A súlyok, ratingek és összesítések export-pillanatképek.
  Historikus előrejelzésben csak bizonyítható as-of
  időbélyeggel használhatók. Ellenkező esetben a jellemző
  „nem elérhető” — ne pótold becsléssel.
- A modell által számolt értékeket mindig BECSLÉSKÉNT jelöld,
  soha nem forrásadatként.
- A fordulóazonosítás tényleges helyességét ellenőrizd.
  Ne feltételezd, hogy nyolc egymás utáni sor mindig egy
  forduló, és ne feltételezd, hogy a két szezonfájl és a
  winmix_matches export ugyanazokat a meccseket tartalmazza
  duplikáció nélkül. A források ütközését dokumentáld.

3. NEM MÓDOSÍTHATÓ KERETEK

A meglévő Supabase-adatbázist és annak adatait meg kell őrizni.

Tilos:
- Új vagy helyettesítő adatbázis létrehozása.
- A meglévő adatréteg localStorage-adatbázissal való kiváltása.
- Migráció, DDL vagy adatváltoztató SQL végrehajtása.
- Séma, RLS, RPC, jogosultság vagy Storage-konfiguráció
  módosítása.
- Éles modell, rangsor, küszöb vagy ajánlás megváltoztatása.
- Második, önálló éles predikciós út kialakítása.
- Hiányzó táblák, függvények, integrációk vagy adatforrások
  létezésének feltételezése.

Ha változtatás szükséges, dokumentáld külön javaslatként.
Ne hajtsd végre.

Kutatási Challenger-modellek később a közös adat- és
előrejelzési szerződésekhez illeszkedő árnyéküzemben
működhetnek. Ez nem jelenthet második, önálló éles rendszert.

4. A MEGLÉVŐ RENDSZER FELTÉRKÉPEZÉSE

Vizsgáld meg a ténylegesen elérhető repositoryt és
adatbázis-metaadatokat.

Dokumentáld:
- CSV-import és adatvalidáció.
- Csapat-, szezon-, forduló- és mérkőzésazonosítás.
- Adattárolás és adatverziók.
- Pipeline és annak állapotkezelése.
- Csapat- és egyéb súlyok, H2H és formaadatok.
- Predikciós és kalibrációs logika.
- Core-kapuk és rangsorolás.
- Prediction Ledger és eredményelszámolás.
- Publikus és adminfelületek.
- Jogosultságok és meglévő tesztek.
- Esetleges duplikált számítások és elavult adatkapcsolatok.

Minden megállapítást jelölj:
ELLENŐRZÖTT / ELLENŐRIZENDŐ / TERVEZETT.

Az ELLENŐRZÖTT állításhoz adj konkrét bizonyítékot:
repository-verziót, fájlútvonalat és szimbólumot,
adatbázis-objektumot vagy teszteredményt.

Különítsd el:
- Kódban megtalált működés.
- Teszttel ellenőrzött működés.
- Futó környezetben ellenőrzött működés.

Ha valami nem hozzáférhető, írd le a hiányt.
Ne helyettesítsd feltételezéssel.

5. IDŐRENDESSÉG — BLOKKOLÓ ELLENŐRZÉS

A visszamérés alapja a megbízható időrend. Mielőtt bármilyen
mérési tervet véglegesítesz:
- Vizsgáld meg, hogy a szezonazonosító + mérkőzéssorszám
  vagy a roundsorrend rekonstruálható-e a date mező nélkül.
- Ellenőrizd a fordulóbesorolást, a duplikációkat, az
  esetleges hiányzó sorszámokat, a két liga keveredését.
- Ítéld meg, hogy a szezonok közötti sorrend igazolható-e.

Ha a sorrend nem állítható helyre, ezt jelezd, és a visszamérés
hatókörét ennek megfelelően korlátozd (pl. csak szezonon belül).
Ne tervezz olyan mérést, amely a bizonytalan sorrendre épül.

6. BTTS CORE-KIVÁLASZTÁSI SZERZŐDÉS

Készíts pontos szerződést az alábbiakra:
- Bemeneti adatok és azonosítók.
- Felhasznált adatok időbeli határa (as-of).
- Modellből származó BTTS-valószínűség.
- Nyers és korrigált historikus H2H-arány.
- Mintaminőség és bizonytalanság.
- Alkalmazott kapuk és azok sorrendje.
- Rangsorolási szabály és holtversenykezelés.
- Legfeljebb három külön mérkőzés kiválasztása.
- Skip döntés.
- Jelöltenkénti indoklás.
- Előrejelzési pillanatkép és elszámolás.

Ne mosd össze a modellvalószínűséget a historikus találati
aránygal. Az előbbi becslés, az utóbbi származtatott statisztika.

Külön állapotként kezeld:
BETÖLTÉS / ADATHIBA / ELÉGTELEN BIZONYÍTÉK /
MODELLHIBA / SZABÁLYOS SKIP / AJÁNLOTT /
ALKALMAS, DE RANGSOR MIATT KIMARADT.

A meglévő küszöböket először dokumentáld.
Új küszöböt csak indokolt, tesztelhető javaslatként adj meg.

7. IDŐBELISÉG ÉS PREDICTION LEDGER

Minden historikus előrejelzés kizárólag az adott pillanatban
már ismert adatokat használhatja. Ez vonatkozik a jellemzőkre,
a csapatsúlyokra, a modellillesztésre, a kalibrációra, a küszöb-
és rangsorválasztásra.

Tervezd meg az eredeti előrejelzés megőrzését:
adatverzió, adatlezárási pont, modellverzió,
kalibrációs verzió, szabályverzió és döntési indokok.

A ledger üresen indul: jelenleg nincsenek előre rögzített
predikciók. Ezért különítsd el:
- REPLAY: utólag, rekonstruált jellemzőkkel visszaszámolt
  történeti „előrejelzés”. Minden ilyen eredményt jelölj
  „utólagos rekonstrukció” címkével.
- VALÓDI ELSZÁMOLÁS: csak éles, előre rögzített ajánlás
  eredménye. Ez kizárólag a jövőben keletkezik.

A kettőt soha ne jelentsd együtt, és a replayt ne nevezd
valódi visszamérésnek.

Az újraszámítás ne írja felül az eredeti ajánlást.
Az eredményjavítások és újraelszámolások legyenek
visszakövethetők.

Ezeket először a meglévő adatmodellhez rendeld hozzá.
Ne tervezz automatikusan új táblát minden követelményhez.

8. MÉRÉSI ÉS VALIDÁCIÓS TERV

Készíts időrendhelyes visszamérési tervet, előre rögzített
fejlesztési és elkülönített tesztidőszakkal.

Kötelező mutatók:
- Egyedi ajánlások találati aránya.
- Mindhárom ajánlás teljesülése a három ajánlást adó,
  teljesen elszámolt fordulókban.
- A 0, 1, 2 és 3 ajánlást adó fordulók aránya.
- Brier score és log loss.
- Kalibrációs értékelés (ECE + reliability diagram,
  blokk-bootstrap bizonytalansággal, fordulószintű blokkokkal).
- Az előre rögzített referenciához viszonyított különbség,
  párosított összevetésben, blokk-bootstrap intervallummal.
- Elemszámok és megfelelő bizonytalansági jelzések.

A „mindhárom teljesülése” nagyon zajos, kis mintaszámú
mutató. Jelenjen meg, de bizonytalansági intervallummal,
csak leíró jelleggel. Ne ez legyen a fő döntési mutató.

Külön mérd:
- A teljes 16 mérkőzés valószínűségi előrejelzésének minőségét.
- A kiválasztott Core-ajánlások minőségét.

Referenciamodell: első körben számítható, egyszerű
bázisarány-modell (ligaszezonos BTTS-gyakoriság + empirikus
H2H-arány) a meglévő CSV-kből. Ez legyen az előre rögzített
összehasonlítási alap.

Ne minősítsd automatikusan javulásnak, ha a rendszer
kevesebb ajánlást ad. A kevesebb ajánlás önmagában nem
modelljavulás.

Rögzítsd előre:
- A fő döntési mutatót.
- A másodlagos mutatókat.
- A gyakorlati javulás feltételét.
- A modellváltás feltételeit.
- Az elégtelen bizonyíték kezelését.

A küszöbértékeket (pl. ajánlási határ, ECE-tolerancia,
hibromlási küszöb) nevezd konfigurálható vizsgálati
értéknek. Kiválasztásuk a fejlesztési időszakon történik,
ellenőrzésük az érintetlen tesztidőszakon.

9. VIZSGÁLANDÓ FEJLESZTÉSEK

Az alábbiakat értékeld, ne implementáld automatikusan:

A. Kalibráció és becslési bizonytalanság
Definiáld, milyen bizonytalanságot mérünk (mérkőzés
véletlen kimenetele vs. modell/paraméter bizonytalanság).
Ne írj elő Monte Carlo-módszert önmagában azért, mert
szerepel a háttéranyagban. Minden bizonytalansági sávhoz
tartozzon módszernév, lefedettségi szint, bemeneti
adatverzió és rövid értelmezés. A P5–P95 sáv 90%-os
központi becslési sáv — nevezd és értelmezd ennek megfelelően.

B. Champion–Challenger értékelés
Azonos fordulók, azonos adatlezárási pont, elkülönített
modellverziók, először árnyéküzem. Párosított statisztikai
összevetés, nem klasszikus A/B teszt.

C. Fordulószerkezet
Vizsgáld a ligánkénti BTTS-számot, a meglepetések előre
definiált gyakoriságát és a H2H-minták megszakadását.
A 3–5 BTTS, az 1–2 meglepetés és a rezsimváltás nem
elfogadott generátorszabály, hanem hipotézis: teszteld az
adatokon, és a generátorbelső ismeretlensége miatt ne
magyarázd mechanizmussal.

Fordulón belüli frissítés csak a célmérkőzés előrejelzésekor
már ismert eredményt használhat. Ha az eredmények egyszerre
válnak ismertté, ne tervezz utólagos információra épülő
frissítést.

D. Drift és monitorozás
Jelzés és vizsgálat, nem automatikus modellváltás.
Külső generátor- vagy motorverziót csak akkor tárolj, ha az
adatforrás ténylegesen közli. Ennek hiányában az érték
„ismeretlen”; a megfigyelt eltérés nem bizonyít motorváltást.

E. Magyarázhatóság és kommunikáció
Jelöltenkénti indoklás, fordulójelentés, adatminőségi és
modellállapot-értesítések. A szöveges jelentés kizárólag
ellenőrzött adatokból dolgozzon.
Terminológia: a modell döntését magyarázó tényezők (nem
„kauzális térkép”); paraméterérzékenységi vizsgálat (nem
„oksági ellenpélda”); fordulók közötti időbeli mintázat (nem
„fáradtsági minta”).

10. UI ÉS MUNKAFOLYAMATOK

Rendeld hozzá a funkciókat a következő kilenc oldalhoz:

Publikus:
- Forduló Tervező.
- H2H Elemző Lab.
- Klub Profilok.
- Adat Stúdió.

WebAdmin:
- Vezérlőpult.
- CSV Import és verziókezelés.
- Csapatok és AI-javaslatok.
- Páros Büntetők.
- Eredmény Elszámolás.

Minden oldalnál add meg:
cél, adatforrás, műveletek, jogosultságok,
betöltési, üres és hibaállapotok,
valamint a kapcsolódó oldalakra vezető útvonalak.

Külön követelmény: a következő forduló párosításainak
beviteli útja (import vagy kézi rögzítés) a Forduló Tervezőben.
Ez jelenleg nem elérhető adatforrás — tervezd meg a bevitelt,
ne feltételezd automatikus elérhetőségét.

11. ELVÁRT DOKUMENTUM

Készíts egy egységes, magyar nyelvű
„WinMix Master Specification és fejlesztési tervezet”
dokumentumot.

Fejezetei:
1. Vezetői összefoglaló és cél.
2. Ellenőrzött jelenlegi állapot.
3. Adat-forrástérkép: forrásadatok, származtatott mutatók,
   hiányzó adatok, és ezek következményei.
4. Domainmodell és adat-/API-szerződések.
5. Kanonikus pipeline és BTTS Core-szerződés.
6. Ledger és időbeliségi szabályok (replay vs. valódi
   elszámolás megkülönböztetésével).
7. Mérési és tesztstratégia.
8. UI és adminmunkafolyamatok.
9. Hiányosságok, kockázatok és függőségek.
10. Prioritásos fejlesztési fázisok.
11. Nyitott döntések és szükséges hozzáférések.

Minden fejlesztési fázishoz add meg:
- Célt és várható hasznot.
- Függőségeket.
- Érintett meglévő modulokat.
- Módosítható és tiltott területeket.
- Teszteket és elfogadási feltételeket.
- Visszaállítási vagy kikapcsolási lehetőséget.
- Külön jóváhagyást igénylő változtatásokat.

Ne adj bizonyíték nélküli hatásígéreteket.
Különítsd el a nélkülözhetetlen javításokat,
a tesztelendő kutatási ötleteket
és a későbbre halasztott kényelmi funkciókat.

A tervezet elkészítése után állj meg.
A megvalósítás külön jóváhagyást igényel.
```

## Amit az egyesítés megváltoztatott az eredetihez képest

1. **Új 2. fejezet (Adat-valóság):** a hiányzó adatok listája nem lábjegyzet, hanem követelmény-szintű korlát lett, konkrét következményekkel (nincs EV, nincs gólperc, nincs generátormagyarázat).
2. **Új 5. fejezet (Időrendesség – blokkoló ellenőrzés):** a `date`-probléma a mérési alap előfeltételeként jelenik meg, nem utólagos megjegyzésként.
3. **Ledger-kettéválasztás:** a replay és a valódi elszámolás megkülönböztetése bekerült a 7. és a 11. fejezetbe is — ez védi meg a későbbi jelentéseket a „visszamérési" eredmények túlértékelésétől.
4. **Referenciamodell konkrétizálása:** az egyszerű bázisarány + H2H referencia most már a meglévő adatokból származik, így a 8. fejezet összevetése azonnal megtervezhető.
5. **Párosítás-bevitel** külön követelményként a 10. fejezetben — ez az egyetlen funkcionális lyuk, ami nélkül a Core ki sem tud termelni.

Egy megjegyzés a prompt hosszához: a végleges szöveg már közel áll ahhoz, ahol egy fejlesztő AI a részletekben kezdhet veszni. Ha a Lovable először csak a 3–5. fejezetekre (adattérkép, feltérképezés, időrendesség) kérne részjelentést, az csökkenti a félreértés kockázatát — ezt akár a prompt elejére is tehetjük lépcsőzetes kimeneti utasításként.

Szeretnéd, hogy ezt lépcsőzetesre alakítsam (első kör: adat- és rendszertérkép + időrendességi ítélet, második kör: szerződések és mérési terv), vagy maradjon az egykörös, teljes Master Specification kérése?
