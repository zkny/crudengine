## Vue-crudengine

> Crudengine is a program to help us to get rid of boilerplate programing. This package is a wrapper for crudengine, so we don't have to write http calls, but neet little functions, that are much easier to remember and read. This package is meant to be used in pair with the [crudengine](https://www.npmjs.com/package/crudengine).

## Table of contents

* [Getting started](#install)
* [Features](#features)
* [About protobuf](#proto)

<a name="install"></a>
## Getting started
We intended vue-crudengine to be a plugin for nuxtjs but it can be used some other way. For now we will focus on how to use with nuxtjs.
```javascript
// in plugins/vue-crudengine.js
import vueCrudengine from 'vue-crudengine'

export default async ( ctx, inject ) => {
  // the constructor expects two parameters: axios, backend crudengine prefix
  const API = new vueCrudengine(ctx.$axios, 'api')

  // If we are planning to use protobuf
  await API.initProto('/api.proto') // this should be in the static folder and named api.proto
  // we can get this file by issuing a call to /api/protofile on the backend

  // inject vue-crudengine into nuxt context
  ctx.$API = API
  inject( 'API', API ) // Use in .vue files as this.$API
}
```

```js
// nuxt.config.js
export  default {
  plugins: ['~/plugins/vue-crudengine']
}
```
<a name="features"></a>
## Functions
>Note: All functions return a promise.

###  Schema
>Special function that returns everything there is to know about the schemas we registered. Schema names will be the keys of the object.
* Method: GET
* Resolves into: Object

```javascript
this.$API.Schema()
.then(schema => ... )
.catch( Error => ... )
```

### Read
>Returns documents for the schema.
* Method: GET
* Resolves into: Array of Objects
```javascript
this.$API.Read( ModelName [, OptionsObject ])
.then( Documents => ... )
.catch( Error => ... )
```
Options:

| key | description | type | example |
|:-:|:-:|:-:|:-:|
| filter | [Mongodb query](https://docs.mongodb.com/manual/reference/method/db.collection.find/index.htmls) | Object | { age: 18 } |
| projection | Fields to include in results. Uses mongodb [projection](https://docs.mongodb.com/manual/reference/method/db.collection.find/index.html). | array of strings | ['name'] |
| sort | [Mongodb sort](https://docs.mongodb.com/manual/reference/method/cursor.sort/index.html) | object | { age : -1 } |
| skip | 	The number of documents to skip in the results set. | number | 10 |
| limit |  	The number of documents to include in the results set. | number | 10 |


### Get
> Find one document by id.
* Method: GET
* Resolves into: Object
```javascript
this.$API.Get( ModelName, DocumentId [, OptionsObject ])
.then( Document => ... )
.catch( Error => ... )
```
Options:

| key | description | type | example |
|:-:|:-:|:-:|:-:|
| projection | Fields to include in [projection](https://docs.mongodb.com/manual/reference/method/db.collection.find/index.html). | array of strings | ['name'] |

### ProtoRead
> The same as Read but uses [protobuf](https://developers.google.com/protocol-buffers) for speed. 😎
* Method: GET
* Resolves into: ArrayBuffer
```javascript
this.$API.Get( ModelName [, OptionsObject ])
.then( Documents => ... )
.catch( Error => ... )
```
Params:

| key | description | type | example |
|:-:|:-:|:-:|:-:|
| filter | [Mongodb query](https://docs.mongodb.com/manual/reference/method/db.collection.find/index.htmls) | Object | { age: { $exists: true } } |
| projection | Fields to include in [projection](https://docs.mongodb.com/manual/reference/method/db.collection.find/index.html) | array of strings | ['name'] |
| sort | [Mongodb sort](https://docs.mongodb.com/manual/reference/method/cursor.sort/index.html) | object | { age : -1, posts: 1 } |
| skip | 	The number of documents to skip in the results set. | number | 10 |
| limit |  	The number of documents to include in the results set. | number | 10 |


### TableHeaders
>  Get the keys, aliases and descriptions for the schema and for the subschemas (refs to other schemas). E.g useful for tables.
* Methods: GET
* Resolves into: Array of Objects
```javascript
this.$API.TableHeaders( ModelName )
.then( Headers => ... )
.catch( Error => ... )
```

### GetService
>Runs a function in services.
* Method: GET
* Resolves into: Any
```javascript
this.$API.GetService( ServiceName, FunctionName, Params )
.then( Result => ... )
.catch( Error => ... )
```
Params: whatever we send. See Services [section](#services) for more info!


### RunService
>Runs a function in services.
* Method: POST
* Resolves into: Any
```javascript
this.$API.RunService( ServiceName, FunctionName, Params )
.then( Result => ... )
.catch( Error => ... )
```
Params: whatever we send. See Services [section](#services) for more info!

The difference between the two is just the method. With POST you can send data more easily and not get the results cached, with GET you can get the results cached.
<a name="create"></a>
### Create
>Creates a new document in database. If the DocumentObject contains a file it will be uploaded, then the file will be replaced with the file path.
* Method: POST
* Resolves into: Object (mongodb document)
```javascript
this.$API.Create( ModelName, DocumentObject )
.then( Document => ... )
.catch( Error => ... )
```
DocumentObject: An object that matches the mongoose schema.

### UploadFile
>Uploads a given file.
* Method: POST
* Resolves into: { path: '/static/myFilesUniqueName.pdf', originalname: "IGaveThisFileAName.pdf" }
```javascript
this.$API.UploadFile( MyFile )
.then( Response => ... )
.catch( Error => ... )
```

### GetFileUrl
> Get the file path for the file.
* Method: GET
* Returns: { path, thumbnail }
```javascript
this.$API.GetFileUrl( File )

```

<a name="update"></a>
### Update
>Updates a document in database. If there is a file in the object, crudengine will upload it, but will not delete the previous file.
* Method: PATCH
* Resolves into: [WriteResults](https://docs.mongodb.com/manual/reference/method/db.collection.update/#writeresults-update)
```javascript
this.$API.Update( ModelName, DocumentObject )
.then( Document => ... )
.catch( Error => ... )
```
DocumentObject: A mongodb document that we modified. (ObjectID included)
<a name="delete"></a>
### Delete
>Deletes a document from database. Files will not be deleted, we have to do that manually, to avoid accidental file deletion.
* Method: DELETE
* Resolves into: [WriteResults](https://docs.mongodb.com/manual/reference/method/db.collection.update/#writeresults-update)
```javascript
this.$API.Delete( ModelName, Id )
.then( Document => ... )
.catch( Error => ... )
```

### DeleteFile
>Deletes a file on a given path. Only paths, that are inside the /api/static folder will be accepted. If there is, deletes thumbnail as well.
* Method: DELETE
* Resolves into: Empty response
```javascript
this.$API.DeleteFile( PathToMyFile )
.then( EmptyResponse => ... )
.catch( Error => ... )
```

### Table
> Combines the TableHeaders and the Read function into one function.
* Method: GET
* Resolves into: { Headers, Data }
```javascript
this.$API.Table( ModelName [, OptionsObject ])
.then( Documents => ... )
.catch( Error => ... )
```
Params:

| key | description | type | example |
|:-:|:-:|:-:|:-:|
| filter | [Mongodb query](https://docs.mongodb.com/manual/reference/method/db.collection.find/index.htmls) | Object | { age: { $exists: true } } |
| projection | Fields to include in [projection](https://docs.mongodb.com/manual/reference/method/db.collection.find/index.html) | array of strings | ['name'] |
| sort | [Mongodb sort](https://docs.mongodb.com/manual/reference/method/cursor.sort/index.html) | object | { age : -1, posts: 1 } |
| skip | 	The number of documents to skip in the results set. | number | 10 |
| limit |  	The number of documents to include in the results set. | number | 10 |

### ProtoTable
> Combines the TableHeaders and the ProtoRead function into one function.
* Method: GET
* Resolves into: { Headers, Data }
```javascript
this.$API.ProtoTable( ModelName [, OptionsObject ])
.then( Documents => ... )
.catch( Error => ... )
```
Params:

| key | description | type | example |
|:-:|:-:|:-:|:-:|
| filter | [Mongodb query](https://docs.mongodb.com/manual/reference/method/db.collection.find/index.htmls) | Object | { age: { $exists: true } } |
| projection | Fields to include in [projection](https://docs.mongodb.com/manual/reference/method/db.collection.find/index.html) | array of strings | ['name'] |
| sort | [Mongodb sort](https://docs.mongodb.com/manual/reference/method/cursor.sort/index.html) | object | { age : -1, posts: 1 } |
| skip | 	The number of documents to skip in the results set. | number | 10 |
| limit |  	The number of documents to include in the results set. | number | 10 |


<a name="proto"></a>
## Proto
JSON.stringify is cpu intensive and slow. When querying a large set of data it is beneficial to use
something lighter than JSON. We use protocol buffers to help with that. In order to be able to work with protobuf normally we need to create a .proto file that includes all schemas and a bit more. [Crudengine](https://www.npmjs.com/package/crudengine) will do that for us automatically.

If we want to decode the data crudengine serves the .proto file at /api/protofile

> Currently there is no way using [protobufjs](https://www.npmjs.com/package/protobufjs) to automate getting the generated proto file from the backend, but we'll integrate it as soon as they make it possible.


## Authors
* Horváth Bálint
* Zákány Balázs

## Changelog
* 2020-05-25 File handling added.

## Contributing
Email us at <a href="mailto:balzs.zkny9@gmail.com">zkny</a> or <a href="horvbalint99@gmail.com">horvbalint</a>
or visit the [github page](https://github.com/zkny/crudengine)
