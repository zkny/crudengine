# PLUGINS

## API
Az API a főkönyvtára az elérhető függvényeknek, amiket a frontenden definiálunk.
Promise alapú frontend könyvtár, backend kommunikációra és gyakran használt függvények gyűjtésére.
Elérése:
```javascript
this.$API
```

Az API-t különböző csoportokra bontva használjuk, kivéve a globálisan működő crud engine kommunikációkat.
## Globális (csoport nélküli) funkciók
#### this.$API.Read
Ez a funkció a CrudEngine /crud/Model/find elérését használja. Ezzel lehet egy modelhez tartozó összes adatbázis bejegyzést lekérni. /GET
```
this.$API.read(ModelName, Options)
/* 
 * ModelName = Bármely az adatbázisban definiált model neve. Pl.: User.
 * Options = {fields, include}
 * fields = Array, amiben a model kulcsait sorohatjuk fel. Az include paraméter határozza meg mit teszünk ezekkel a kulcsokkal.
 * include = Bollean, alapértelmezetben true, ha false-t adunk meg, akkor a fieldsben megadott kulcsokat kiveszi a lekérésből, egyébként csak azokat a kulscokat tartalmazza, amiket megadunk a filedsben.
 */

```
#### this.$API.Get
Ez a funkció a CrudEngine /crud/Model/Id elérését használja. Ezzel lehet lekérni azonosító alapján egy elemét. /GET
```
this.$API.Get(ModelName, Id, Options)
/* 
 * ModelName = Bármely az adatbázisban definiált model neve. Pl.: User.
 * Id = Az elem azonosítója.
 * Options = {fields, include}
 * fields = Array, amiben a model kulcsait sorohatjuk fel. Az include paraméter határozza meg mit teszünk ezekkel a kulcsokkal.
 * include = Bollean, alapértelmezetben true, ha false-t adunk meg, akkor a fieldsben megadott kulcsokat kiveszi a lekérésből, egyébként csak azokat a kulscokat tartalmazza, amiket megadunk a filedsben.
*/
```

#### this.$API.Table
Ez a funkció a CrudEngine /crud/table/Model elérését használja. Ezzel a séma táblázathoz igazított modelljét és a tartalmazó adatokat lehet lekérni. /GET
```
this.$API.Table(ModelName, Limit, Sort)
/* 
 * ModelName = Bármely az adatbázisban definiált model neve. Pl.: User.
 * Limit = Az első n darab találat, alapértelmezetbe az összes találat.
 * Sort = A [mongodb](https://docs.mongodb.com/manual/reference/operator/aggregation/sort/) sort alapján sorba rendezés.
 * 
*/
```
Válaszként mindig egy Headers és egy Data arrayt kapunk. A Data array tartalmazza az adatbázisból a
dokumentumokat, figyelembe véve, hogy melyek azok a mezők, amiket a felhasználó nem láthat.
A Headers listába elemeinek 4 eleme lehet
```
Headers = [{
  name: schema.item.alias, // A táblázatban megjelenítendő név
  key: schema.item.name, // kulcs amivel hivatkozhatunk rá például egy v-forban
  description: schema.item.description // az elem leírása amit pl hovernél lehet megmutatni a felhasználónak
  subheaders: OPTIONAL // ugyan ebben a felépítésben az elemhez tartozó kulcsok nevek leírások
}]
```
> subheaders akkor van a Headers között, ha a mező egy listát tartalmaz, egy olyan mező, ami hivatkozás egy másik collectionre, vagy egy lista ami hivatkozásokat tartalmaz.


#### this.$API.Create
Ez a funkció a CrudEngine /crud/Model elérését használja. Ezzel lehet létrehozni egy elemet az adatbázisban. /POST
```
this.$API.Post(ModelName, MenteniKívántObjecktum)
/* 
 * ModelName = Bármely az adatbázisban definiált model neve. Pl.: User.
 * MenteniKívántObjecktum = A modelnek megfelelő objektum.
*/
```

#### this.$API.Update
Ez a funkció a CrudEngine /crud/Model elérését használja. Frissíteni egy elemet az adatbázisban. /PATCH
```
this.$API.Update(ModelName, MenteniKívántObjecktum)
/* 
 * ModelName = Bármely az adatbázisban definiált model neve. Pl.: User.
 * MenteniKívántObjecktum = A modelnek megfelelő objektum.
*/
```

#### this.$API.Delete
Ez a funkció a CrudEngine /crud/Model elérését használja. Egy elem törlése az adatbáziból. /DELETE
```
this.$API.Delete(ModelName, Id)
/* 
 * ModelName = Bármely az adatbázisban definiált model neve. Pl.: User.
 * Törölni kívánt elem azonosítója.
*/
```
