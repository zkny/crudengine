const express = require("express");
const path = require("path");
const crud_engine = require("crudengine");

const fs = require('fs');

const Router = express.Router();

const crud = new crud_engine(path.resolve('./schemas'), path.resolve('./services'));

crud.addMiddleware( 'Brand', 'R', 'before', () => console.log('BRAND R: running before') )
crud.addMiddleware( 'Brand', 'R', 'after', () => console.log('BRAND R: running after') )
crud.addMiddleware( 'Brand', 'C', 'before', () => console.log('BRAND C: running before') )
crud.addMiddleware( 'Brand', 'C', 'after', () => console.log('BRAND C: running after') )
crud.addMiddleware( 'Brand', 'U', 'before', () => console.log('BRAND U: running before') )
crud.addMiddleware( 'Brand', 'U', 'after', () => console.log('BRAND U: running after') )
crud.addMiddleware( 'Brand', 'D', 'before', () => console.log('BRAND D: running before') )
crud.addMiddleware( 'Brand', 'D', 'after', () => console.log('BRAND D: running after') )
.then( r => console.log(r) )
.catch( e => console.error(e) )

Router.use('/crud', crud.GenerateRoutes());

module.exports = Router;
