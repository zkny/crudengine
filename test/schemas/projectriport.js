const mongoose = require("mongoose");
const autopopulate = require("mongoose-autopopulate");


const ProjectriportSchema = new mongoose.Schema({
  date: { type: Date, required: true, alias: "Dátum" },
  worker_number: { type: Number, required: false, alias: "Teljesítés (fő)" },
  worker_request: { type: Number, required: false, alias: "Igény létszám (fő)" },
  project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", autopopulate: true, required: true, alias: "Projekt" },
  comment: { type: String, alias: "megjegyzés"},
  project_manager: { type: mongoose.Schema.Types.ObjectId, ref: "Worker", autopopulate: true, required: true, alias: "Projekt kezelő" }
}, { selectPopulatedPaths: false });


ProjectriportSchema.plugin(autopopulate);
module.exports = mongoose.model('Projectriport', ProjectriportSchema);
