const mongoose = require("mongoose");
const autopopulate = require("mongoose-autopopulate");


const OfficeSchema = new mongoose.Schema({
  name: { type: String, required: true, alias: "Név", minWriteAuth: 200 },
  region: { type: String, required: true, alias: "Régió", minWriteAuth: 200 }
}, { selectPopulatedPaths: false });


OfficeSchema.plugin(autopopulate);
module.exports = mongoose.model('Office', OfficeSchema);
