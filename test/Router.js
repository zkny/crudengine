const express = require("express");
const path = require("path");
const crud_engine = require("crudengine");

const fs = require('fs');

const Router = express.Router();

const crud = new crud_engine(path.resolve('./schemas'), path.resolve('./services'));

Router.use('/crud', crud.GenerateRoutes());

module.exports = Router;
