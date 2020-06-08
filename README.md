## Crudengine

> Crudengine is a program to help us to get rid of boilerplate programing. The goal of this
is to shorten the time it takes us to get our things done. Define the schema and boom we
can move to the frontend and worry about other things. If you haven't seen the frontend part
of this, check it out [here](https://www.npmjs.com/package/vue-crudengine)!

##### If you find any problems please let us know [here](https://github.com/zkny/crudengine/issues)!


## The basics
First we create an instance of the crudengine by telling it where we will place our
schemas and services. Our schemas are basically the [mongoose models](https://mongoosejs.com/docs/models.html). The services are functions that we would like to run, but we don't want to register them as an independent route. But more about this later.

## Table of contents

* [Prerequisites](#prerequisites)
* [Install](#install)
* [Important notes](#notes)
* [Routes](#routes)
  * [Read](#read)
  * [Create](#create)
  * [Update](#update)
  * [Delete](#delete)
* [Schemas](#schemas)
* [Middleware](#middleware)
* [Services](#services)
* [Working with files](#files)
* [About protobuf](#proto) [BETA]
* [Auth](#auth)
* [Changle log](#change)
* [TODO](#todo)

<a name="prerequisites"></a>
## Prerequisites
* Use express
* Use mongoose
* Use mongoose-autopopulate (required for file handling)

<a name="install"></a>
## Getting started
```javascript
const crudengine = require("crudengine");

const crud = new crudengine({
  SchemaDIR: path.resolve(__dirname, './schemas'),
  ServiceDIR: path.resolve(__dirname, './services'), // [Optional] Services should be in this folder, if needed
  FileDIR: path.resolve(__dirname, './files'), // [Optional] This will become the /static folder for crudengine
  ImageHeightSize: 1500, // [Optional] Image compression to given size, defaults to 800
  Thumbnail: false, // [Optional] Automatically save a thumbnail version for images, defaults to false
  ThumbnailSize: 500 // [Optional] Thumbnail compression to given size, defaults to 250
  MaxHeaderDepth: 3 // [Optional] Table headers will be traced till this depth recursively (default = 3)
}); // create the instance

Router.use(someGenericAuthMiddlware) // no auth, no data

Router.use('/api', crud.GenerateRoutes()); // register as a route
```

<a name="notes"></a>
## Important notes
> Bit of information to keep in mind.
#### Schema limitations
Fields with mixed type can not be traced, due to limitation

```js
// To get subheaders use the following syntax:
field: {
  subfield: String
}

// Instead of:
field: {
  type: {subfield: String}
}

// Using the second example, will not effect functionality, but the tableheaders won't show up for the object.
```

#### Proto limitations
* The problem with this is that you can only use camelCase and no snake_case in the schema keys. Also we have to decode the data in the frontend, but if we use the [vue-crudengine](https://www.npmjs.com/package/vue-crudengine) (which is recommended anyway) package as well, it is done for us.

* Before sending updates with data coming from proto routes, you have to JSON.stringify the data first, otherwise JSON.parse will fail. This is done automatically in [vue-crudengine](https://www.npmjs.com/package/vue-crudengine).

* Custom objects (mixed type) in schemas will not be detected by the proto file generator.
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
  params: {
	  filter: { email: { $existCRUD operation helper class for node.js + mongoose + expresss: true } },
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
  params: {
	  projection: [ 'username', 'email' ]
  }
})
```
Params:

| key | description | type | example |
|:-:|-|:-:|:-:|
| projection | Fields to include in [projection](https://docs.mongodb.com/manual/reference/method/db.collection.find/index.html). | array of strings | ['name'] |

### /proto/:model [BETA]
> The same as /:model/find but uses [protobuf](https://developers.google.com/protocol-buffers).
* Method: GET
* Returns: ArrayBuffer
```javascript
axios.get('/api/proto/User', {
  responseType: 'arraybuffer',
  params: {
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
| projection | Fields to include in [projection](https://docs.mongodb.com/manual/reference/method/db.collection.find/index.html) | array of strings | ['name'] |
| sort | [Mongodb sort](https://docs.mongodb.com/manual/reference/method/cursor.sort/index.html) | object | { age : -1 } |
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
<a name="create"></a>
### /:model
>Creates a new document.
* Method: POST
* Returns: Object (mongodb document)
```javascript
axios.post('/api/Book', MyNewBook)
```
Params: An object that matches the mongoose schema. The whole req.body should be the object

### /fileupload
>Uploads a given file, and generates a unique name for it. We must send the file as multiplart formdata.
Will create thumbnail for images, if Thumbnail is set to true in the options. Thumbnail names will be like IGaveThisFileAName_thumbnail.jpg.
* Method: POST
* Returns: { path: '/static/fileUniqueName.jpg', originalname: 'IGaveThisFileAName.jpg' }
```js

let formData = new FormData()
formData.append('file', MyFile)

axios.post(`/api/fileupload`, formData, {
  headers: { 'Content-Type': 'multipart/form-data' }
})
```

<a name="update"></a>
### /:model
>Updates a document.
* Method: PATCH
* Returns: [WriteResults](https://docs.mongodb.com/manual/reference/method/db.collection.update/#writeresults-update)
```javascript
axios.patch('/api/Book', MyUpdatedBook)
```
Params: A mongodb document that we modified. (ObjectID included)
<a name="delete"></a>
### /:model/:id
>Deletes a document.
* Method: DELETE
* Returns: [WriteResults](https://docs.mongodb.com/manual/reference/method/db.collection.update/#writeresults-update)
```javascript
axios.delete('/api/Book/507f191e810c19729de860ea')
```

### /filedelete
>Deletes a file at a specified path. Crudengine will not allow deleting files outside its static folder. If there is, deletes the thumbnail as well.
* Method: DELETE
* Returns: empty response
```js
axios.delete(`/api/filedelete`, {
  data: {
    path: '/static/myFilesUniqueName.jpg'
  }
})
```

<a name="schemas"></a>
## Schemas
For this to work we need to create valid mongoose schemas, but we should add some extra things.
No snake_case if you want protobuf!

> Note protobuf can't use custom objects, but we can use refs instead.

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
  files: { type: [
		{ type: ObjectId, ref: "CRUDFile", autopopulate: true, alias: "File" } // File refrences will be stored in this special schema.
	], alias: "Files" }
}, { selectPopulatedPaths: false }); // We need to add this, or autopopulated fields will always be there regardless of the projection.

BrandSchema.plugin(autopopulate); // You should always use [autopopulate](https://www.npmjs.com/package/mongoose-autopopulate) because its awesome
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
	  return await this.LogSomething(Data)
  }
}

module.exports = Services
```

<a name="files"></a>
## Working with files
Crudengine creates a CRUDFile schema to store information about the files it handles. This special schema will not show up in schemas if you request the schemas. If we want to store files, crudengine can do that for us via the fileupload route. File are served on /api/static/file.path regardless of what you give as FileDIR.
> vue-crudengine automagically stores files when they are included in a create. In update it will also upload files and handle them, but it will not delete files. If we want to delete a file we need to use the filedelete route.

```js
// CRUDFile schema
{
  name         : { type: String,  alias: "File name",      description: "Name of the saved file",                              required: true },
  path         : { type: String,  alias: "File path",      description: "Path of the saved file",                              required: true },
  size         : { type: Number,  alias: "File size",      description: "Size of the saved file",                              required: true },
  extension    : { type: String,  alias: "File extension", description: "Extension of the saved file",                         required: true },
  isImage      : { type: Boolean, alias: "Is image?",      description: "Indicates whether the saved file is an image or not", default: false },
  thumbnailPath: { type: String,  alias: "Thumbnail path", description: "Path of the saved thumbnail",                         default: null  },
}
```

<a name="proto"></a>
## Proto [BETA]
JSON.stringify is cpu intensive and slow. When querying a large set of data it is beneficial to use
something lighter than JSON. We use protocol buffers to help with that. In order to be able to work with protobuf normally we need to create a .proto file that includes all schemas and a bit more. Crudengine will do that for us automatically.

If we want to decode the data crudengine serves the .proto file at /api/protofile
#### Warnings
* The problem with this is that you can only use camelCase and no snake_case in the schema keys. Also we have to decode the data in the frontend, but if we use the [vue-crudengine](https://www.npmjs.com/package/vue-crudengine) (which is recommended anyway) package as well, it is done for us.

* Before sending updates with data coming from proto routes, you have to JSON.stringify the data first, otherwise JSON.parse will fail. This is done automatically in [vue-crudengine](https://www.npmjs.com/package/vue-crudengine).

* Custom objects (mixed type) in schemas will not be detected by the proto file generator.

> You've been warned
<a name="auth"></a>
## Auth
In this system we expect to have the accesslevel number added by a middleware to the req (as req.accesslevel), for authentication purposes. If we can't find it the accesslevel will be set to 300.

If we do find it, we can modify what the user who issues the request can see based on the access level. So if a field requires minReadAuth of 200 then a user with accesslevel of 300
will get the field removed from the results. In case of update or create the minWriteAuth will rule. If there is a missmatch the request will fail with status 500 and a message saying 'EPERM'.

<a name="change"></a>
## Changelog

* 2020-05-05 Missing variable in .proto file when using Boolean fixed.
* 2020-05-25 File handling added.

<a name="todo"></a>
## TODO
* add prerequisites
* Fix protofile generator for custom objects (mixed type)
* CRUDFile subheaders won't show up in tableheaders
* Fix subdocument auth access


## Authors
* Horváth Bálint
* Zákány Balázs

## Contributing
Email us at <a href="mailto:balzs.zkny9@gmail.com">zkny</a> or <a href="mailto:horvbalint99@gmail.com">horvbalint</a>

or visit the [github page](https://github.com/zkny/crudengine)
CRUD operation helper class for node.js + mongoose + express
