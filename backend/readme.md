
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
## Getting started
```javascript
const crudengine = require("crudengine");

const crud = new crudengine(path.resolve(__dirname, './schemas'), path.resolve(__dirname, './services')); // create the instance

Router.use(someGenericAuthMiddlware) // no auth, no data

Router.use('/api', crud.GenerateRoutes()); // register as a route
```
<a name="routes"></a>
## Routes

All off the routes start with whatever we give them when we register them in the routes. So in this example /api

<a name="read"></a>
###  /schema
>Special route that returns everything there is to know about the schemas we registered.
* Method: GET
* Returns: Object

```javascript
axios.get('/api/schema')
```

### /:model/find
>Returns documents for the schema.
* Method: GET
* Returns: Array of Objects
```javascript
axios.get('/api/User/find', {
  Params: {
	  filter: { email: { $exists: true } },
	  projection: [ 'username', 'email' ],
	  sort: { username: 1 },
	  skip: 0,
	  limit: 100
  }
})
```
Params:

| key | description | type | example |
|:-:|-|:-:|:-:|
| filter | [Mongodb query](https://docs.mongodb.com/manual/reference/method/db.collection.find/index.htmls) | Object | { age: 18 } |
| projection | Fields to include in results. Uses mongodb [projection](https://docs.mongodb.com/manual/reference/method/db.collection.find/index.html). | array of strings | ['name'] |
| sort | [Mongodb sort](https://docs.mongodb.com/manual/reference/method/cursor.sort/index.html) | object | { age : -1 } |
| skip | 	The number of documents to skip in the results set. | number | 10 |
| limit |  	The number of documents to include in the results set. | number | 10 |


### /:model/:id
> Find one document by id
* Method: GET
* Returns: Object
```javascript
axios.get('/api/User/507f191e810c19729de860ea', {
  Params: {
	  projection: [ 'username', 'email' ]
  }
})
```
Params:

| key | description | type | example |
|:-:|-|:-:|:-:|
| projection | Fields to include in [projection](https://docs.mongodb.com/manual/reference/method/db.collection.find/index.html). | array of strings | ['name'] |

### /proto/:model
> The same as /:model/find but uses [protobuf](https://developers.google.com/protocol-buffers).
* Method: GET
* Returns: ArrayBuffer
```javascript
axios.get('/api/proto/User', {
  responseType: 'arraybuffer',
  Params: {
	  filter: { email: { $exists: true } },
	  projection: [ 'username', 'email' ],
	  sort: { username: 1 },
	  skip: 0,
	  limit: 100
  }
})
```
Params:

| key | description | type | example |
|:-:|-|:-:|:-:|
| filter | [Mongodb query](https://docs.mongodb.com/manual/reference/method/db.collection.find/index.htmls) | Object | { age: { $exists: true } } |
| projection | Fields to include in [projection](https://docs.mongodb.com/manual/reference/method/db.collection.find/index.html) | array of strings | ['name'] |
| sort | [Mongodb sort](https://docs.mongodb.com/manual/reference/method/cursor.sort/index.html) | object | { age : -1, posts: 1 } |
| skip | 	The number of documents to skip in the results set. | number | 10 |
| limit |  	The number of documents to include in the results set. | number | 10 |


### /tableheaders/:model
>  Get the keys, aliases and descriptions for the schema and for the subschemas (refs to other schemas).
* Methods: GET
* Returns: Array of Objects
```javascript
axios.get('/api/tableheaders/User')
```

### /getter/:service/:function
>Run a function in services.
* Method: GET
* Returns: Any
```javascript
axios.get('/api/getter/userservice/getallinactive')
```
params: whatever we send. See Services [section](#services) for more info!

### /runner/:service/:function
>Run a function in services.
* Method: POST
* Returns: Any
```javascript
axios.get('/api/runner/userservice/deleteinactiveusers')
```
params: whatever we send. See Services [section](#services) for more info!

The difference between the two is just the method. With POST you can send data more easily and not get the results cached, with GET you can get the results cached.
<a name="create"></a>read
### /:model
>Creates a new document.
* Method: POST
* Returns: Object (mongodb document)
```javascript
axios.post('/api/Book', MyNewBook)
```
Params: An object that matches the mongoose schema. The whole req.body should be the object

<a name="update"></a>
### /:model
>Updates a document.
* Method: PATCH
* Returns: Object (mongodb document)
```javascript
axios.patch('/api/Book', MyUpdatedBook)
```
Params: A mongodb document that we modified. (ObjectID included)
<a name="delete"></a>
### /:model/:id
>Deletes a document.
* Method: DELETE
* Returns: Object (mongodb document)
```javascript
axios.delete('/api/Book/507f191e810c19729de860ea')
```
<a name="schemas"></a>
## Schemas
For this to work we need to create valid mongoose schemas, but we should add some extra things.
No snake_case if you want protobuf!

If the accesslevel number system means nothing to you go to the auth [section](#auth).

| Param    |  Description                                                   | required |
|:--------:|--------------------------------------------------------------|:-----:|
| alias    |  This could be what we display. username: { alias: "Caller" }  | false |
| description | This could be displayed on hover. username: { description: "this is how we call the around here" } |  false |
| minWriteAuth | Number from 100 to 300, the smaller the better, if its 200 you need accesslevel below 200 to update or create this field |  defaults to 300 |
| minReadAuth | same as minWriteAuth but for reading it|  defaults to 300 |




##### The name of the file must be the name of the schema. So brand.js should contain the Brand model

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
<a name="middleware"></a>
## Addig custom middleware
If needed we can extend the premade routes almost like we would with normal middleware.

Each route can have a before, and an after middleware. Before will run before the database
operation runs, after will run after.

The middleware is evaluated on the call, so it doesn't get any params but has access to all
of the variables used. In before that would be typically the req, res and projection, in case
 of after we get in addition the results from the database operation (variable name is also results).
#### Variables
-   **shared variables**
    -   **req**: Request
    -   **res**: Response
    -   **projection**: Array of Objects - [MongoDB projection](https://docs.mongodb.com/manual/reference/method/db.collection.find/#find-projection)
-   **Only "after" variables**
    -   **results**: Any - the results from the database query.
  > Do not overwrite these variables!

Add middleware with the addMiddleware function like.
```javascript
const crud = new crudengine(path.resolve(__dirname, './schemas'), path.resolve(__dirname, './services')); // create the instance

// addMiddleware( Modelname, Operatior type [C,R,U,D], When to run [Before, After], Function To Run)

try {
  // we can use await
  crud.addMiddleware( 'Model', 'R', 'before', async () => {
    if( await isNotAdmin( req.query.uId )  ) {
      res.send('YOU SHALL NOT PASS!')
      return true // we must return something so we stop the execution of other code after it
      // if we don't return something we'll get the 'cannot set headers after they are sent to the client' error
    }
  })

  // we can use promise
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

  // we can use predefined functions
  function filterResults() {
    // we shouldn't try to create the results, that is already declared.
    results = results.filter( result => DoWeNeedThis(result) ? true : false )
    results[0] = "I replace the first result for some reason"
  }
  crud.addMiddleware( 'Model', 'R', 'after', filterResults )

} catch(e) {
  console.warn("Setting up middleware not succeeded. Error was: ", e);
}
```

#### Exceptions:
* No model found with name: ${modelname}
* Operation should be one of: [ 'C', 'R', 'U', 'D' ]
* Timing should be one of: [ 'after', 'before' ]

<a name="services"></a>
## Services
These are really just normal routes that we normally create, but the router and registration is done for you.

So instead of writing a function inside router.get etc, and then going to routes.js and register it with a clever name, you just place a file in services, write your function and be done with it.

All service functions must return a promise, that's just how it works. All service functions will
get whatever you send in the request, if you are using GET then the req.query if POST then the req.body will be in Data.
```javascript
// This is the services/test.js file

const Services = {
  LogSomething: (Data) => {
    return new Promise((resolve, reject) => {
      console.log(Data);
      resolve({ msg: "logged something" })
    })
  },
  LogSomethingElse: async (Data) => {
	  await this.LogSomething(Data)
  }
}

module.exports = Services
```

<a name="proto"></a>
## Proto
JSON.stringify is cpu intensive and slow. When querying a large set of data it is beneficial to use
something lighter than JSON. We use protocol buffers to help with that. In order to be able to work with protobuf normally we need to create a .proto file that includes all schemas and a bit more. Crudengine will do that for us automatically.

If we want to decode the data crudengine serves the .proto file at /api/protofile

##### The problem with this is that you can only use camelCase and no snake_case in the schema keys. Also we have to decode the data in the frontend, but if we use the [vue-crudengine](https://www.npmjs.com/package/vue-crudengine) (which is recommended anyway) package as well, it is done for us.

<a name="auth"></a>
## Auth
In this system we expect to have a user object added by a middleware to the req (as req.user), for authentication purposes. If we can't find it the accesslevel will be set to 300.

If we do find it, we can modify what the user who issues the request can see based on the access level. So if a field requires minReadAuth of 200 then a user with accesslevel of 300
will get the field removed from the results. In case of update or create the minWriteAuth will rule. If there is a missmatch the request will fail with status 500 and a message saying 'EPERM'.

## Authors
* Horváth Bálint
* Zákány Balázs

## Contributing
Email us at <a href="mailto:balzs.zkny9@gmail.com">zkny</a> or <a href="mailto:horvbalint99@gmail.com">horvbalint</a>

## Licence
[MIT](https://opensource.org/licenses/MIT)
