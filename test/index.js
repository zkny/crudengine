const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const cors = require("cors");
const bluebird = require("bluebird");


const routes = require("./Router");

const app = express();

console.clear()
console.log( "[Nodemon]  | O.o" )


app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", '*'); // update to match the domain you will make the request from
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.use(cors());
mongoose.Promise = bluebird;
mongoose.connect('mongodb://localhost:27017/napiriporter', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useFindAndModify: false,
  useCreateIndex: true
}).then( () => console.log("[Mongo]    | Ready to use mongodb") )
.catch(err => {
  process.exit()
})

app.set('port', process.env.PORT || 3001);

app.use(bodyParser.json({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));

app.use(routes);

const server = app.listen(app.get('port'), '0.0.0.0', () => {
  console.log(`[Server]   | API version ${process.env.VERSION} running port: ${app.get('port')}`);
});

module.exports = server;
