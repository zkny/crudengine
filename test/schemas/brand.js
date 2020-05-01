const mongoose = require("mongoose");
const autopopulate = require("mongoose-autopopulate");


const BrandSchema = new mongoose.Schema({
  name: { type: String, required: true, alias: "Név", minWriteAuth: 300},
}, { selectPopulatedPaths: false });


BrandSchema.plugin(autopopulate);
module.exports = mongoose.model('Brand', BrandSchema);
