const mongoose = require("mongoose");
const autopopulate = require("mongoose-autopopulate");


const EmploymenttypeSchema = new mongoose.Schema({
  name: { type: String, required: true, alias: "Név", minWriteAuth: 200 },
}, { selectPopulatedPaths: false });


EmploymenttypeSchema.plugin(autopopulate);
module.exports = mongoose.model('Employmenttype', EmploymenttypeSchema);
