const mongoose = require("mongoose");
const autopopulate = require("mongoose-autopopulate");


const ProjectSchema = new mongoose.Schema({
  name: { type: String, required: true, alias: "Név" },
  office: { type: mongoose.Schema.Types.ObjectId, ref: 'Office', autopopulate: true, required: true, alias: "Kirendeltség"},
  brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', autopopulate: true, required: true, alias: "Üzletág" },
  industry: { type: mongoose.Schema.Types.ObjectId, ref: 'Industry', autopopulate: true, required: true, alias: "Iparág" },
  subindustry: { type: mongoose.Schema.Types.ObjectId, ref: 'Subindustry', autopopulate: true, required: true, alias: "Al iparág" },
  employmenttype: { type: mongoose.Schema.Types.ObjectId, ref: 'Employmenttype', autopopulate: true, required: true, alias: "Foglalkoztatási forma" },
  project_manager: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', autopopulate: true, required: true, alias: "Projekt vezető" },
  status: { type: Boolean, default: true, alias: "Státusz" }
}, { selectPopulatedPaths: false });


ProjectSchema.plugin(autopopulate);
module.exports = mongoose.model('Project', ProjectSchema);
