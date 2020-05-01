const mongoose = require("mongoose");
const autopopulate = require("mongoose-autopopulate");


const WorkplaceSchema = new mongoose.Schema({
  name: { type: String, required: true, alias: "Név", minWriteAuth: 200 },
}, { selectPopulatedPaths: false });


WorkplaceSchema.plugin(autopopulate);
module.exports = mongoose.model('Workplace', WorkplaceSchema);
