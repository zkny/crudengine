const mongoose = require("mongoose");
const autopopulate = require("mongoose-autopopulate");


const IndustrySchema = new mongoose.Schema({
  name: { type: String, required: true, alias: "Név", minWriteAuth: 200 },
}, { selectPopulatedPaths: false });


IndustrySchema.plugin(autopopulate);
module.exports = mongoose.model('Industry', IndustrySchema);
