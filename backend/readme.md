## Crudengine

> Crudengine is a program to help you get rid of boilerplate programing. The goal of this
is to shorten the time it takes you to get your things done. Define the schema and boom you
can move to the frontend, to worry about other things. If you haven't seen the frontend part
of this, check it out [here](https://www.npmjs.com/package/vue-crudengine)!


## The basics
First we create an instance of the crudengine by telling it where we will place our
schemas and services. Our schemas are basically the [mongoose models](https://mongoosejs.com/docs/models.html). The services are functions that we would like to run, but we don't want to register them as an independent route. But more about this later.


```javascript
const crudengine = require("crudengine");

const crud = new crudengine.default(path.resolve(__dirname, './schemas'), path.resolve(__dirname, './services')); // create the instance

Router.use(someGenericAuthMiddlware) // no auth, no data

Router.use('/api', crud.GenerateRoutes()); // register as a route
```


## Schemas
For this to work we need to create valid mongoose schemas, but we should add some extra things.

If the accesslevel number system means nothing to you go to the auth section.

| Param    |  Description                                                   | required |
|----------|:--------------------------------------------------------------:|-----:|
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

## Services
These are really just normal routes that we normally create, but the router and registration is done for you.

So instead of writing a function inside router.get etc, and the goint to routes.js and register it with a clever name, you just place a file in services, write your function and be done with it.


All service functions must return a promise, thats just how it works. All service functions will
get whatever you send in the request, if you are using GET then the req.query if POST then the req.body will be in Data.
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
