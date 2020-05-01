## Crudengine

> Crudengine is a program to help us to get rid of boilerplate programing. The goal of this
is to shorten the time it takes us to get our things done. Define the schema and boom we
can move to the frontend and worry about other things. If you haven't seen the frontend part
of this, check it out [here](https://www.npmjs.com/package/vue-crudengine)!


## The basics
First we create an instance of the crudengine by telling it where we will place our
schemas and services. Our schemas are basically the [mongoose models](https://mongoosejs.com/docs/models.html). The services are functions that we would like to run, but we don't want to register them as an independent route. But more about this later.

## Table of contents

* [Install](#install)
* [Routes](#routes)
  * [Read](#read)
  * [Create](#create)
  * [Update](#update)
  * [Delete](#delete)
* [Schemas](#schemas)
* [Middleware](#middleware)
* [Services](#services)
* [About protobuf](#proto)
* [Auth](#auth)

<a name="install"></a>
```javascript
const crudengine = require("crudengine");

const crud = new crudengine.default(path.resolve(__dirname, './schemas'), path.resolve(__dirname, './services')); // create the instance

Router.use(someGenericAuthMiddlware) // no auth, no data

Router.use('/api', crud.GenerateRoutes()); // register as a route
```
<a name="routes"></a>
## Routes

All off the routes start with whatever we give them when we register then in the routes. So in this example /api

<a name="routes"></a>
###### GET /schema | Returns all there is to know about the registered schemas | Object

Params: none

###### GET /:model/find | Returns documents for the schema. Replace the :model with the schema name. | Array of Objects

Params:

| key | description | type | example |
|:-:|:-:|:-:|:-:|
| projection | Fields to include in [projection](https://docs.mongodb.com/manual/reference/method/db.collection.find/index.html). | array of strings | ['name'] |
| filter | [Mongodb query](https://docs.mongodb.com/manual/reference/method/db.collection.find/index.htmls) | Object | { age: { $exists: true } } |
| sort | [Mongodb sort](https://docs.mongodb.com/manual/reference/method/cursor.sort/index.html) | object | { age : -1, posts: 1 } |
| skip | 	The number of documents to skip in the results set. | number | 10 |
| limit |  	The number of documents to include in the results set. | number | 10 |

###### GET /:model/:id | Returns one document. Replace :model with the schema name and :id withe the desired documents Mongodb id | Object

Params:

| key | description | type | example |
|:-:|:-:|:-:|:-:|
| projection | Fields to include in [projection](https://docs.mongodb.com/manual/reference/method/db.collection.find/index.html). | array of strings | ['name'] |

###### GET /proto/:model | The same as /:model/find but uses [protobuf](https://developers.google.com/protocol-buffers). Replace the :model with the schema name. | ArrayBuffer - Uint8Array

Params:

| key | description | type | example |
|:-:|:-:|:-:|:-:|
| projection | Fields to include in [projection](https://docs.mongodb.com/manual/reference/method/db.collection.find/index.html) | array of strings | ['name'] |
| filter | [Mongodb query](https://docs.mongodb.com/manual/reference/method/db.collection.find/index.htmls) | Object | { age: { $exists: true } } |
| sort | [Mongodb sort](https://docs.mongodb.com/manual/reference/method/cursor.sort/index.html) | object | { age : -1, posts: 1 } |
| skip | 	The number of documents to skip in the results set. | number | 10 |
| limit |  	The number of documents to include in the results set. | number | 10 |


###### GET /tableheaders/:model | Get the keys, aliases and descriptions for the schema and for the subschemas (refs to other schemas). Replace the :model with the schema name. | Array of Objects

Params: none

###### GET /getter/:service/:function | Run a function in services. Replace :service with the name of the service file, replace :function with the service function names that we want to run.

params: whatever we send. See Services section for more info!

###### POST /runner/:service/:function | Run a function in services. Replace :service with the name of the service file, replace :function with the service function names that we want to run.

params: whatever we send. See Services section for more info!

The difference between the two is just the method. With POST you can send data more easily and not get the results cached, with GET you can get the results cached.

###### POST /:model | Creates a new document. Replace the :model with the schema name. | Object

Params: An object that matches the mongoose schema. The whole req.body should be the object
```javascript
axios.post( `/crud/${MyModel.capitalize()}`, MyModelObject )
```
###### PATCH /:model | Updates document. Replace the :model with the schema name. | Object

Params: A mongodb document that we modified. (ObjectID included)

###### DELETE /:model/:id | Deletes a document. Replace the :model with the schema name :id with the documents id. | Object

## Schemas
For this to work we need to create valid mongoose schemas, but we should add some extra things.
No snake_case if you want protobuf!

If the accesslevel number system means nothing to you go to the auth section.

| Param    |  Description                                                   | required |
|:--------:|:--------------------------------------------------------------:|:-----:|
| alias    |  This could be what we display. username: { alias: "Caller" }  | false |
| description | This could be displayed on hover. username: { description: "this is how we call the around here" } |  false |
| minWriteAuth | Number from 100 to 300, the smaller the better, if its 200 you need accesslevel below 200 to update or create this field |  defaults to 300 |
| minReadAuth | same as minWriteAuth but for reading it|  defaults to 300 |




###### The name of the file must be the name of the schema. So brand.js should contain the Brand model

```javascript
// This is the schemas/brand.js file
const mongoose = require("mongoose");
const autopopulate = require("mongoose-autopopulate");

const BrandSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    alias: "Company", // I will display this for the user instead of name
    description: "Unique name of the brand owner comany", // This is silly I know
    minWriteAuth: 200, // You have to be admin to change this
    minReadAuth: 300 // But you don't have to be admin to see it
  },
}, { selectPopulatedPaths: false }); // We need to add this, or autopopulated fields will always be there regardless of the projection.

BrandSchema.plugin(autopopulate); // It's better to use [autopopulate](https://www.npmjs.com/package/mongoose-autopopulate) because its awesome
module.exports = mongoose.model('Brand', BrandSchema); //export the model as usual

```

## Addig custom middleware
If needed we can extend the premade routes almost like we would with normal middleware.

Each route can have a before, and an after middleware. Before will run before the database
operation runs, after will run after.

The middleware is evaluated on the call, so it doesn't get any params but has access to all
of the variables used. In before that would be typically the req, res and projection, in case
 of after we get in addition the results from the database operation (variable name is also results).


Add middleware with the addMiddleware function like.
```javascript
const crud = new crud_engine.default(path.resolve('utvonal/a/schemakhoz'));

// addMiddleware( Modelname, Operatior type [C,R,U,D], Whern to run [Before, After], Function To Run)

try {
  // we can await
  crud.addMiddleware( 'Model', 'R', 'before', async () => {
    if( await isNotAdmin( req.query.uId )  ) {
      res.send('YOU SHALL NOT PASS!')
      return true // we must return something so we stop the execution of other code after it
      // if we don't return something we'll get the 'cannot set headers after they are sent to the client' error
    }
  })

  // we can promise
  crud.addMiddleware( 'Model', 'R', 'before', () => {
    return new Promise( (resolve, reject) => {
      isNotAdmin( req.query.uId )
      .then( result => {
        if( result  ) {
          res.send('YOU SHALL NOT PASS!')
          return resolve(true) // this is needed for the same reason as above
        }
      })
    })
  })

  function filterResults() {
    results.filter( result => DoWeNeedThis(result) ? true : false )
    results[0] = "I replace the first result for some reason"
  }

  crud.addMiddleware( 'Model', 'R', 'after', filterResults )

} catch(e) {
  console.warn("Setting up middleware not succeeded. Error was: ", e);
}
```

#### Exceptions:
* No model found with name: ${modelname}
* Operation should be one of: ['C', 'R', 'U', 'D']
* Timing should be one of: ['after', 'before']


## Services
These are really just normal routes that we normally create, but the router and registration is done for you.

So instead of writing a function inside router.get etc, and the goint to routes.js and register it with a clever name, you just place a file in services, write your function and be done with it.


All service functions must return a promise, thats just how it works. All service functions will
get whatever you send in the request, if you are using GET then the req.query if POST then the req.body will
be in Data.
```javascript
// This is the services/test.js file

const Services = {
  LogSomething: (Data) => {
    return new Promise((resolve, reject) => {
      console.log(Data);
      resolve({ msg: "logged something" })
    })
  }
}

module.exports = Services
```


## Proto
JSON.stringify is cpu intensive and slow. When querying a large set of data it is beneficial to use
something lighter than JSON. We use protocol buffers to help with that. In order to be able to work with that
we need to create a .proto file that includes all schemas and a bit more. Crudengine will do that for us
automatically.

##### The problem with this is that you can only use camelCase and no snake_case in the schema keys. Also we have to decode the data in the frontend, but if we use the [vue-crudengine](https://www.npmjs.com/package/vue-crudengine) (which is recommended anyway) package as well, it is done for us.


## Auth
In this system we expect to have a User object added by a middleware to the req, for authentication purposes. If we can't find it the accesslevel will be set to 300.

If we do find it, we can modify what the user who issues the request can see based on the access level. So if a field requires minReadAuth of 200 then a user with accesslevel of 300
will get the field removed from the results. In case of update or create the minWriteAuth will rule. If there is a missmatch the request will fail with status 500 and a message saying 'EPERM'.
