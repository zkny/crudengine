const mongoose = require("mongoose");
const autopopulate = require("mongoose-autopopulate");


const SubindustrySchema = new mongoose.Schema({
  industry: { type: mongoose.Schema.Types.ObjectId, ref: "Industry", autopopulate: true, required: true, alias: "Iparág", minWriteAuth: 200 },
  name: { type: String, required: true, alias: "Név", minWriteAuth: 200 },
}, { selectPopulatedPaths: false });


SubindustrySchema.plugin(autopopulate);
module.exports = mongoose.model('Subindustry', SubindustrySchema);
