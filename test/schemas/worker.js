const mongoose = require("mongoose");
const autopopulate = require("mongoose-autopopulate");


const WorkerSchema = new mongoose.Schema({
  name: { type: String, required: true, alias: "Név" },
  office: { type: mongoose.Schema.Types.ObjectId, ref: 'Office', autopopulate: true, required: true, alias: "Kirendeltség"},
  position: { type: String, required: true, alias: "Pozíció" },
  brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', autopopulate: true, required: true, alias: "Üzletág" },
  comment: { type: String, required: false, alias: "Megjegyzés" },
  status: { type: Boolean, default: true, alias: "Státusz" }
}, { selectPopulatedPaths: false });


WorkerSchema.plugin(autopopulate);
module.exports = mongoose.model('Worker', WorkerSchema);
