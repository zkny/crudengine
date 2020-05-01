const mongoose = require("mongoose");
const autopopulate = require("mongoose-autopopulate");


const WorkerriportSchema = new mongoose.Schema({
  date: { type: Date, required: true, alias: "Dátum" },
  worker: { type: mongoose.Schema.Types.ObjectId, ref: "Worker", autopopulate: true, required: true, alias: "Dolgozó" },
  worksfrom: { type: mongoose.Schema.Types.ObjectId, ref: "Workplace", autopopulate: true, required: true, alias: "Innen dolgozik" },
}, { selectPopulatedPaths: false });


WorkerriportSchema.plugin(autopopulate);
module.exports = mongoose.model('Workerriport', WorkerriportSchema);
