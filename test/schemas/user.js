const mongoose = require("mongoose");
const autopopulate = require("mongoose-autopopulate");


const UserSchema = new mongoose.Schema({
  username   : { type: String, required: true, alias: "Felhasználó név", description: "Felhasználó név, (egyedi, index)", unique : true, dropDups: true },
  name       : { type: String, required: true, alias: "Név", minReadAuth: 300, minWriteAuth: 100, description: "Felhasználó valódi neve"},
  password   : { type: String, required: true, alias: "Jelszó", description: "Felhasználó titkosított jelszava"},
  permissions: { type: mongoose.Schema.Types.Mixed, required: true, minReadAuth: 300, minWriteAuth: 100, alias: "Oldal elérések", description: "Oldal hozzáférés, az oldal neve a kulcs, értéke read ha csak olvashatja write ha szerkeszthet is."},
  accesslevel: { type: Number, default: 300, minReadAuth: 300, minWriteAuth: 100, alias: "Jogosultsági szint", description: "Hozzáférési szint." }
}, { selectPopulatedPaths: false });


UserSchema.plugin(autopopulate);
module.exports = mongoose.model('User', UserSchema);
