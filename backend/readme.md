
## Crudengine

> Crudengine is a program to help us to get rid of boilerplate programing. The goal of this
is to shorten the time it takes us to get our things done. Define the schema and boom we
can move to the frontend and worry about other things. If you haven't seen the frontend part
of this, check it out [here](https://www.npmjs.com/package/vue-crudengine)!

##### If you find any problems please let us know [here](https://github.com/zkny/crudengine/issues)!

## Disclaimer
This package is very much under development and all functions are subject to change. Also some functionality may not be documented or they might not work at all.

If you find anything that isn't working or not up to the documentation let us know or create a pull request over on github. Thank You in advance!

## Table of contents

* [Prerequisites](#prerequisites)
* [Install](#install)
* [Important notes](#notes)
* [Schemas](#schemas)
* [Routes](#routes)
  * [Read](#read)
  * [Create](#create)
  * [Update](#update)
  * [Delete](#delete)
* [Middleware](#middleware)
* [Services](#services)
* [Working with files](#files)
* [About protobuf](#proto) [BETA]
* [Field Access](#fieldaccess)
* [TODO](#todo)

<a name="prerequisites"></a>
## Prerequisites
* Use express
* Use mongoose
* Use mongoose-autopopulate (required only for file handling)

<a name="install"></a>
## Getting started
```javascript
const crudengine = require("crudengine");

const crud = new crudengine({
  SchemaDIR: path.resolve(__dirname, './schemas'),
  MongooseConnection: mongoose.connection, // [Optional] Only needed if using mongoose.createConnection() not mongoose.connect()
  ServiceDIR: path.resolve(__dirname, './services'), // [Optional] Services should be in this folder, if needed
  FileDIR: path.resolve(__dirname, './files'), // [Optional] This will become the /static or what we set as   ServeStaticPath
  ServeStaticPath: '/static', // [Optional] default /static
  ImageHeightSize: 1500, // [Optional] Image compression to given size, defaults to 800
  Thumbnail: false, // [Optional] Automatically save a thumbnail version for images, defaults to false
  ThumbnailSize: 500, // [Optional] Thumbnail compression to given size, defaults to 250
  MaxHeaderDepth: 2, // [Optional] Table headers will be traced till this depth recursively (default = 2, starts from 0)
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
  type: new Schema({subfield: String}),
  name: ...
}

// Instead of:
field: {
  type: {subfield: String},
  name: ...
}

// Using the second example, will not effect functionality, but the tableheaders won't show up for the object.
```

#### Proto (beta) limitations
* The problem with this is that you can only use camelCase and no snake_case in the schema keys. Also we have to decode the data in the frontend, but if we use the [vue-crudengine](https://www.npmjs.com/package/vue-crudengine) (which is recommended anyway) package as well, it is done for us.

##### Important notes
> Bit of information to keep in mind.

* Before sending updates with data coming from proto routes, you have to JSON.stringify the data first, otherwise JSON.parse will fail. This is done automatically in [vue-crudengine](https://www.npmjs.com/package/vue-crudengine).

* Custom objects (mixed type) in schemas will not be detected by the proto file generator.



<a name="schemas"></a>
## Schemas
No snake_case if you want protobuf!

If the accesslevel number system means nothing to you go to the field access [section](#fieldaccess).

| Param    |  Description                                                   | required |
|:--------:|--------------------------------------------------------------|:-----:|
| name    |  This could be what we display. username: { name: "Caller" }  | false |
| description | This could be displayed on hover. username: { description: "this is how we call the around here" } |  false |
| minWriteAccess | A positive number, the higher the better, if it is 200 you need accesslevel above 200 to create, update or delete this field |  defaults to 0 |
| minReadAccess | same as minWriteAccess but for reading it|  defaults to 0 |
| primary | eg. Show this fields value when this document is needed to be shown in a table cell |  defaults to false |
| hidden | Fields marked as hidden will not be included in table headers |  defaults to false |

> What primary does is up to you.

##### The name of the file must be the name of the schema. So brand.js should contain the Brand model

```javascript
// This is the schemas/brand.js file
const mongoose = require("mongoose");
const autopopulate = require("mongoose-autopopulate"); // only needed because of file handling

const BrandSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    name: "Company", // I will display this for the user instead of name
    description: "Unique name of the brand owner comany", // This is silly I know
    minWriteAccess: 100, // You have to be admin (have an accesslevel of 100 or higher) to change this
    minReadAccess: 0, // But you don't have to be admin to see it
    primary: true
  },
  arrayOfThings: {
    type: [new mongoose.Schema({
      name: { type: String, name: "One thing I don't like" }
    })],
    name: "List of thing I don't like"
  },
  files: {
    type: [{ type: ObjectId, ref: "CRUDFile", autopopulate: true, name: "File" }], // File refrences will be stored in this special schema.
	name: "Files",
	hidden: true
  }
}, { selectPopulatedPaths: false }); // We need to add this, or autopopulated fields will always be there regardless of the projection.

BrandSchema.plugin(autopopulate); // For file handling functionalities https://www.npmjs.com/package/mongoose-autopopulate
module.exports = mongoose.model('Brand', BrandSchema); //export the model as usual

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

###  /schema/:model
>Special route that returns everything there is to know about a schema.
* Method: GET
* Returns: Object

```javascript
axios.get('/api/schema/User')
```

###  /schemakeys/:model
> Returns the key paths to the schema

* Method: GET
* Returns: Array of Strings

```javascript
axios.get('/api/schemakeys/User')

// the following will result in ['name.surname', name.firstname]
User: {
  name: {
    surname: "Doe",
    firstname: "John"
  }
}

```


### /:model/find
>Returns documents for the schema.
* Method: GET
* Returns: Array of Objects
```javascript
axios.get('/api/User/find', {
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
| filter | [Mongodb query](https://docs.mongodb.com/manual/reference/method/db.collection.find/index.htmls) | object | { age: 18 } |
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
>  Get the keys, names, descriptions and other meaningful properties for the schema and for the subschemas (refs to other schemas).
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
>Deletes a file from CRUDFile.
* Method: DELETE
* Returns: empty response
```js
axios.delete(`/api/filedelete/:id`)
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
    -   **projection**: Array of Strings - Fields to be included in the results
-   **Only "after" variables**
    -   **results**: Any - the result(s) from the database query.
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
* Middleware: No model found with name: ${modelname}
* Middleware: Operation should be one of: [ 'C', 'R', 'U', 'D' ]
* Middleware: Timing should be one of: [ 'after', 'before' ]

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
Crudengine creates a CRUDFile schema to store information about the files it handles. This special schema will not show up in schemas if you request the schemas. If we want to store files, crudengine can do that for us via the fileupload route. File are served on /api/${ServeStaticPath}/file.path regardless of what you give as FileDIR.
> [vue-crudengine](https://www.npmjs.com/package/vue-crudengine) automagically stores files when they are included in a create. The update will not delete files. If we want to delete a file we need to use the filedelete route. There is also a route to download files for us. This is needed if you are using authentication middleware for crudengine routes. (what you should)

```js
// CRUDFile schema
{
  name: { type: String,  name: "File name", description: "Name of the saved file", required: true, primary: true },
  path: { type: String,  name: "File path", description: "Path of the saved file", required: true },
  size: { type: Number,  name: "File size", description: "Size of the saved file", required: true },
  extension: { type: String,  name: "File extension", description: "Extension of the saved file", required: true },
  isImage: { type: Boolean, name: "Is image?", description: "Indicates whether the saved file is an image or not", default: false },
  thumbnailPath: { type: String,  name: "Thumbnail path", description: "Path of the saved thumbnail",                         default: null },
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
<a name="fieldaccess"></a>
## Field access
In this system we expect to have an access level number added by a middleware to the req (as req.accesslevel), for authentication purposes. If we can't find it the accesslevel will be set to 0 by default.

If we do find it, we can modify what the user who issues the request can see/modify based on the access level. So if a field requires minReadAccess of 100 then a user with an accesslevel of 50 will get the field removed from the results. In case of update or create the minWriteAccess will rule. If someone is trying to delete a document with a field with greater minWriteAccess then the users accesslevel, then the request will fail and the 'EPERM' message will be sent back.


<a name="todo"></a>
## TODO
* Fix protofile generator for custom objects (mixed type)


## Authors
* Horváth Bálint
* Zákány Balázs

## Contributing
Email us at <a href="mailto:balzs.zkny9@gmail.com">zkny</a> or <a href="mailto:horvbalint99@gmail.com">horvbalint</a>

or visit the [github page](https://github.com/zkny/crudengine)