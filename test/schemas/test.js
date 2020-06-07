const mongoose = require("mongoose");
const autopopulate = require("mongoose-autopopulate");


const TestSchema = new mongoose.Schema({
  name: { type: String, required: true, alias: "Név" },
  file: { type: mongoose.Types.ObjectId, ref: 'CRUDFile', required: true, alias: "File link", autopopulate: true },
  deeply: {
    nested: {
      files: [{ type: mongoose.Types.ObjectId, ref: 'CRUDFile', required: true, alias: "File link", autopopulate: true }]
    },
    with: {
      fake: {
        nests: String
      }
    }
  }
}, { selectPopulatedPaths: false });


TestSchema.plugin(autopopulate);
module.exports = mongoose.model('Test', TestSchema);
