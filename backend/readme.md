## Crud-Engine
A crud-engine egy objektum alapú express-router-mongoose bővítmény, ami minden sémához létrehozza az alap operációkat. Létrehozást, olvasás, frissítés és törlés. A rendszer tud függvényeket futtatni, amikre servicekként fogunk hivatkozni.

## Schema paraméterek
A megfelelő működéshez a [mongoose](https://mongoosejs.com/docs/guide.html) sémátak kell használni néhány kiegészítéssel. Ezek a kiegészítések nem elengedhetetlenek de erősen javasoltak.

#### alias:
A mongoosban használt virtuális név helyett, ezt a schema táblázatokban megjelenített neveként használjuk, de használható eredeti funciója szerint is.


#### description:
Az adott mező leírása.

#### minReadAuth:
Szám, elemenként megadható minimum jogosultsági szint a séma adott elemének olvasásához. Alapértelmezetben 300.

#### minWriteAuth:
Szám, elemenként megadható minimum jogosultsági szint a séma adott elemének szerkesztéséhez. Alapértelmezetben 300.

## Fejlesztés
A crud-engine coffeescript nyelven íródott, így legkönnyebben az index.coffee filebaj lehet rajta módosítani. A módosítás után a következő parancsot kell futtatni a könyvtárból.
```
coffee -c index.coffee
```
Ezzel a parancsal lefordítjuk normál javascriptre és létrejön az index.js fájl, amit később használunk.

> fontos hogy a sémákba megadju a { selectPopulatedPaths: false } paramétert, különben mindig hozzá teszi a válaszhoz az autopopulated mezőket.

## Olvasási parancsok
Az olvasási parancsok GET metódussal érhetők el. Az api minden ide tartozó parancsát a /crud/:model oldalakon érjük el, ahol a :modelt a séma nevével kell helyettesíteni.
```javascript
  // Összes MyModel lekérése.
  axios.get('/crud/MyModel/find')

  // Egy MyModel lekérése azonosító alapján
  axios.get('/crud/MyModel/mongoId')
```
A lekérésekben nem mindig szeretnénk látni a model összes elemét, hogy csökkentsük a lekérések méretét. Erre az olvasási műveleteknél a következő képpen van lehetőség
```javascript
  // Az összes MyModel neve és mérete
  axios.get('/crud/MyModel/find', {
    {
      params: {
        fields: ['name', 'size'], // lekérni kívánt részei a modelnek
        include: true // csak a fieldsben lévő kulcsokat tartalmazza
      }
    }
  })

  // Az összes MyModel összes tulajdonsága, kivéve a neve és mérete
  axios.get('/crud/MyModel/find', {
    {
      params: {
        fields: ['name', 'size'], // lekérni nem kívánt részei a modelnek
        include: false // csak a fieldsben nem szereplő kulcsokat tartalmazza
      }
    }
  })
```
Ezeknél a lekérdezéseknél a mongodb projectiont használjuk. Ami minden esetben tartalmazza a dokumentum azonosítóját. [MongoDB projection](https://docs.mongodb.com/manual/reference/method/db.collection.find/#find-projection)

## Tábla formátum
```javascript
  // Az összes MyModel neve és mérete
      this.$axios.$get(`/crud/table/${MyModel.capitalize()}`, {
        params: {
          sort: Sort || { _id: 1 },  // Normál mongo sort feltételek
          limit: Limit, // limit ha nincs az összesre szükség. TODO: limiten kívül skipet is kellene implementálni a lapozás könnyítésére
          filter: Filter || {} // Normál mongo filter paraméter
        }
      })
```

## Service-k használata
Minden service-nek promise-t kell vissza adnia. A servicek paraméterben egy Data objectet kapnak, amiben a params tartalmazza frontendről küldött változókat.
Ez a req.query vagy a req.body, attól függően hogy GET vagy POST metódust használunk (/crud/getter/ServiceName/FunctionName)

Példa egy test.js filera
```
const Services = {
  LogSomething: (Data) => {
    return new Promise((resolve, reject) => {
      console.log(Data);
      resolve({msg: "logged something"})
    })
  }
}


module.exports = Services
```


## Middleware
Minden model minden CRUD műveletéhez adhatunk meg "before" és "after" middleware műveleteket. Ezek célja, hogy  az adatbázis művelet lefutása előtt vagy után manipulálhassuk az adatokat, vagy akár meg is akadályozhassuk annak lefutását.

### Függvények
A middlewarekhez kapcsolódóan mindössze egyetlen függvény tartozik. Ezt a Crud-Engine példányunkon érhetjük el ***"addMiddleware"*** néven. Ezen függvény segítségével lehet a kívánt modellek middleware műveleteit beállítani. A függvény az engine életciklusa során bármikor hívható, azonban hívásáig a Middleware funkciók nem érhetőek el, így érdemes a szerver indításakor létrehozni őket.

#### Paraméterek
  * **modelname**: A modell neve, melyhez a middleware-t társítanánk
  * **operation**: A művelet betűjele (a {C, R, U, D} halmazból), melyhez a middlewaret társítanánk
  * **timing**: 'before' vagy 'after' attól függően, hogy az adatbázis hívás előtt, vagy után szükséges-e a lefutás
  * **middlewareFunction**: A függvény melyet az engine lefuttat a megadott időben
    * A függvény paramétert nem kap, közvetlenül éri el a változókat, ennek listája lejebb.
    * A függvény vissza térhet Promise-al is, ekkor a teljes lefutást megvárja az engine.
    * Ha meg szeretnénk szakítani az engine futását, azt megtehetjük úgy, hogy a függvényünk szigorúan "true" értékkel tér vissza. **Ez nem küld választ a kliens gépre automatikusan, arról előtte neked kell gondoskodnod!**

#### Elérhető változók
  * **Közös változók**
    * **req**:Request - A kliens gépről érkező kérés express objektuma
    * **res**:Response - A kliens gép felé küldendő válasz express objektuma
    * **projection**:ArrayOfObjects - A [MongoDB projection](https://docs.mongodb.com/manual/reference/method/db.collection.find/#find-projection) által kért formátumban
  * **Csak "after"-ben elérhető változók**
    * **results**:Any - Az adatbázisból vissza kapott eredmény(ek), típusa a művelettől függhet

#### Kivételek
  Érdemes az ***"addMiddleware"*** függvényeket egy try-catch block-ban lekezelni, mert kivételt dobhatnak, a lehetséges kivételek:

  * **No model found with name: #{modelname}**: Olyan model nevet adtál meg a függvénynek, mely nem létezik.
  * **Operation should be one of: ['C', 'R', 'U', 'D']**: Nem a {C, R, U, D}  halmaz egyik elemét adtad meg "operation" paraméternek
  * **Timing should be one of: ['after', 'before']**:  Nem a {after, before} halmaz egyik elemét adtad meg "timing" paraméternek

#### Példák
```javascript
const crud = new crud_engine.default(path.resolve('utvonal/a/schemakhoz'));

try {

// Egy olvasás előtti middleware, mely jogosultság hiányában, nem engedélyezi az adatbázis elérését.
// await-el:
  crud.addMiddleware( 'Model', 'R', 'before', async () => {
    if( await isNotAdmin( req.query.uId )  ) {
      res.send('YOU SHALL NOT PASS!')
      return true // Szükséges, hogy ne kapjunk 'cannot set headers after they are sent to the client' írás hibát.
    }
  })
  
  // Promise alapúan:
  crud.addMiddleware( 'Model', 'R', 'before', () => {
    return new Promise( (resolve, reject) => {
      isNotAdmin( req.query.uId )
      .then( result => {
        if( result  ) {
          res.send('YOU SHALL NOT PASS!')
          return resolve(true) // Szükséges, hogy ne kapjunk 'cannot set headers after they are sent to the client' írás hibát.
        }
      })
    })
  })
  
  // Egy olvasás utáni middleware ami, módosítja az adatbázisból kapott adatokat.
  // A függvény létre hozható külön is:
  function filterResults() {
    results.filter( result => kellNekunk(result) ? true : false )
    results[0] = "Én vagyok az első adat helyett"
  }
  
  crud.addMiddleware( 'Model', 'R', 'after', filterResults )
  
} catch(e) {
  console.warn("Setting up middleware not succeeded. Error was:", e);
}
```

