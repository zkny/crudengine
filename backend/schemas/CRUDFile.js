const mongoose = require("mongoose");

const CRUDFileSchema = new mongoose.Schema({
  name: { type: String, alias: "File name", description: "Name of the saved file", required: true },
  path: { type: String, alias: "File path", description: "Path of the saved file", required: true },
  size: { type: Number, alias: "File size", description: "Sized of the saved file", required: true },
  extension: { type: String, alias: "File extension", description: "Extension of the saved file", required: true },
  isImage: { type: Boolean, alias: "Is image?", description: "Indicates whether the saved file is an image or not", default: false },
  thumbnailPath: { type: String, alias: "Thumbnail path", description: "Path of the saved thumbnail", default: null },
}, { selectPopulatedPaths: false });


// BrandSchema.plugin(autopopulate);
module.exports = mongoose.model('CRUDFile', CRUDFileSchema);
